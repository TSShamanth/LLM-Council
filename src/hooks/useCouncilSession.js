/**
 * useCouncilSession.js
 * Central state machine for the Council of LLMs session.
 *
 * Flow:
 *   1. User prompt (with optional images) → sent to ALL enabled providers
 *   2. Outputs anonymized (crypto shuffle)
 *   3. Judge evaluates all → selects best with multi-dimensional scoring
 *   4. (Optional) Winning LLM generates combined best-of output
 *   5. Reveal: winner + per-output metrics + combined output
 *   6. Session auto-saved to chat history
 *
 * Security: revealMap is never exposed until phase === RESULTS
 * Reusability: saveSession, loadSession are decoupled and reusable
 */

import { useState, useCallback, useRef } from "react";
import { callProvider, getEnabledProviders } from "../api/providerRouter.js";
import { sanitizeOutput, sanitizePrompt } from "../core/sanitizer.js";
import { PROVIDERS, PROVIDER_MAP, GENERATION_SYSTEM_PROMPT } from "../core/councilConfig.js";
import { anonymizeOutputs } from "../core/anonymizer.js";
import { runJudge, generateCombinedOutput, runCombineJudge, runComponentCombiner } from "../core/judge.js";

export const PHASES = {
  IDLE: "idle",
  GENERATING: "generating",
  JUDGING: "judging",
  COMBINING: "combining",   // NEW: generating combined best-of output
  RESULTS: "results",
};

const INITIAL_STATE = {
  phase: PHASES.IDLE,
  prompt: "",
  sanitizedPrompt: "",
  promptWarnings: [],
  outputs: [],           // { providerId, content, requestId, flaggedPatterns }
  anonymizedOutputs: [], // { label, content }
  verdictBreakdown: null,
  combinedOutput: null,   // NEW: the synthesized best-of output
  activityLog: [],
  generatingFor: null,
  error: null,
  totalTokensUsed: 0,
  sessionId: null,
  attachments: [],        // { filename, originalName, mimeType, base64 }
};

/**
 * Save a completed session to the backend.
 * Reusable: decoupled from the hook so it can be called independently.
 * @returns {Promise<number|null>} session ID or null on failure
 */
async function saveSession({ prompt, purpose, verdictBreakdown, anonymizedOutputs, combinedOutput, attachments }) {
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        title: prompt.substring(0, 100).trim(),
        prompt,
        purpose,
        verdictData: verdictBreakdown,
        outputsData: anonymizedOutputs,
        combinedOutput,
        attachments: attachments.map(a => a.filename),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.id;
    }
    console.warn('⚠️ Failed to save session');
    return null;
  } catch (err) {
    console.warn('Failed to save session:', err);
    return null;
  }
}

export function useCouncilSession() {
  const [state, setState] = useState(INITIAL_STATE);
  const revealMapRef = useRef(null);

  const log = useCallback((message, level = "info") => {
    setState((s) => ({
      ...s,
      activityLog: [
        ...s.activityLog,
        { message, level, timestamp: Date.now() },
      ],
    }));
  }, []);

  const setError = useCallback((err) => {
    setState((s) => ({ ...s, error: err, phase: PHASES.IDLE }));
  }, []);

  const setAttachments = useCallback((attachments) => {
    setState((s) => ({ ...s, attachments }));
  }, []);

  /**
   * Run a full council session.
   * @param {string} rawPrompt - User's raw prompt
   * @param {string} purpose - 'code' | 'content' | 'logical'
   * @param {string} mode - 'compare' | 'combine'
   */
  const runSession = useCallback(async (rawPrompt, purpose = 'content', mode = 'compare') => {
    revealMapRef.current = null;

    const enabledIds = await getEnabledProviders();
    if (enabledIds.length === 0) {
      setError("No API keys configured. Add at least one to .env");
      return;
    }

    const enabledProviders = PROVIDERS.filter((p) => enabledIds.includes(p.id));
    const currentAttachments = state.attachments;

    // 1. Prepare images for multimodal: extract base64 data from image attachments
    const imageAttachments = currentAttachments
      .filter((a) => a.mimeType?.startsWith("image/") && a.base64)
      .map((a) => ({ base64: a.base64, mimeType: a.mimeType }));

    // 2. Prepare text from other files (code, txt, md, etc.)
    let contextFromFiles = "";
    const textAttachments = currentAttachments.filter(a => !a.mimeType?.startsWith("image/"));
    
    for (const file of textAttachments) {
      if (file.textContent) {
        contextFromFiles += `\n\n--- FILE: ${file.originalName} ---\n${file.textContent}\n--- END FILE ---`;
      }
    }

    const finalUserPrompt = contextFromFiles 
      ? `${rawPrompt}\n\n[CONTEXT FROM ATTACHED FILES]:${contextFromFiles}`
      : rawPrompt;

    setState({ ...INITIAL_STATE, phase: PHASES.GENERATING, attachments: currentAttachments });

    // ── Phase 0: Sanitize input ──────────────────────────────────────────
    const { sanitized: sanitizedPrompt, warnings: promptWarnings } = sanitizePrompt(finalUserPrompt);
    setState((s) => ({ ...s, sanitizedPrompt, promptWarnings, prompt: rawPrompt }));

    if (promptWarnings.length > 0) {
      promptWarnings.forEach((w) => log(`⚠️ Prompt warning: ${w}`, "warn"));
    }

    const imgMsg = imageAttachments.length > 0 ? ` with ${imageAttachments.length} image(s)` : "";
    log(`🏛️ Council convening (${mode.toUpperCase()} mode) — sending prompt${imgMsg} to ${enabledProviders.length} providers...`, "info");

    // ── Phase 1: Generate outputs (sequential per provider for UI feedback) ──
    const outputs = [];

    for (const provider of enabledProviders) {
      setState((s) => ({ ...s, generatingFor: provider.id }));
      log(`${provider.icon} ${provider.name} generating...`);

      try {
        const result = await callProvider(provider.id, {
          system: GENERATION_SYSTEM_PROMPT,
          user: sanitizedPrompt,
          temperature: 0.7,
          maxTokens: 2000,
          images: imageAttachments.length > 0 ? imageAttachments : undefined,
        });

        const { sanitized, flaggedPatterns } = sanitizeOutput(result.text);
        if (flaggedPatterns.length > 0) {
          log(`🛡️ ${provider.name}: ${flaggedPatterns.length} identity pattern(s) redacted`, "warn");
        }

        outputs.push({
          providerId: provider.id,
          content: sanitized,
          requestId: result.requestId,
          flaggedPatterns,
        });
        setState((s) => ({
          ...s,
          outputs: [...s.outputs, { providerId: provider.id, content: sanitized, requestId: result.requestId, flaggedPatterns }],
          totalTokensUsed: s.totalTokensUsed + (result.tokensUsed ?? 0),
        }));
      } catch (err) {
        log(`❌ ${provider.name} failed: ${err.message}`, "error");
        // Continue with remaining providers instead of failing entirely
        continue;
      }
    }

    if (outputs.length === 0) {
      setError("All providers failed to generate a response.");
      return;
    }

    setState((s) => ({ ...s, generatingFor: null }));
    log(`✅ ${outputs.length} response(s) generated. Anonymizing...`);

    // ── Phase 2: Anonymize ───────────────────────────────────────────────
    let anonymizedOutputsResult, revealMap;
    try {
      const withMemberId = outputs.map((o) => ({ memberId: o.providerId, content: o.content, requestId: o.requestId }));
      ({ anonymized: anonymizedOutputsResult, revealMap } = anonymizeOutputs(withMemberId));
      revealMapRef.current = revealMap;
    } catch (err) {
      setError(`Anonymization failed: ${err.message}`);
      return;
    }

    log("🔀 Outputs anonymized. Identities sealed.");
    setState((s) => ({
      ...s,
      anonymizedOutputs: anonymizedOutputsResult,
      phase: PHASES.JUDGING,
    }));

    // ── Phase 3: Judge (with detailed per-output metrics) ────────────────
    log(`⚖️ Judge evaluating all submissions for ${mode} mode...`);

    let verdictBreakdown = { mode, revealMap: revealMapRef.current };
    let finalCombinedOutput = null;

    try {
      if (mode === 'combine') {
        const combineJudgeResult = await runCombineJudge(sanitizedPrompt, anonymizedOutputsResult);
        log(`🧩 Judge identified ${combineJudgeResult.components.length} components. Synthesizing...`, "success");

        verdictBreakdown.combineJudge = combineJudgeResult;
        verdictBreakdown.components = combineJudgeResult.components.map(c => ({
          ...c,
          providerId: revealMapRef.current.get(c.winner)
        }));

        setState((s) => ({
          ...s,
          verdictBreakdown,
          totalTokensUsed: s.totalTokensUsed + (combineJudgeResult.tokensUsed ?? 0),
          phase: PHASES.COMBINING
        }));

        const integrationResult = await runComponentCombiner(sanitizedPrompt, anonymizedOutputsResult, combineJudgeResult);
        finalCombinedOutput = integrationResult.combinedOutput;
        log("✅ Integrated solution synthesized successfully.", "success");

        setState((s) => ({
          ...s,
          totalTokensUsed: s.totalTokensUsed + (integrationResult.tokensUsed ?? 0),
        }));
      } else {
        // Standard 'compare' mode
        const judgeResult = await runJudge(sanitizedPrompt, anonymizedOutputsResult);
        const winnerProviderId = revealMapRef.current.get(judgeResult.winner);
        const winnerProvider = PROVIDER_MAP[winnerProviderId];

        verdictBreakdown = {
          ...verdictBreakdown,
          winner: {
            label: judgeResult.winner,
            providerId: winnerProviderId,
          },
          overallAnalysis: judgeResult.overallAnalysis,
          scores: judgeResult.scores,
          minorityOpinions: judgeResult.minorityOpinions.map((m) => ({
            ...m,
            providerId: revealMapRef.current.get(m.label),
          })),
        };

        log(`🏆 Verdict: ${judgeResult.winner} wins`, "success");
        log(`🎭 Identity revealed: ${winnerProvider?.icon} ${winnerProvider?.name}`, "success");

        setState((s) => ({
          ...s,
          verdictBreakdown,
          totalTokensUsed: s.totalTokensUsed + (judgeResult.tokensUsed ?? 0),
          phase: PHASES.COMBINING
        }));

        // Optional best-of synthesis for compare mode
        const combineResult = await generateCombinedOutput(
          sanitizedPrompt,
          anonymizedOutputsResult,
          judgeResult.scores,
          judgeResult.winner
        );
        finalCombinedOutput = combineResult.combinedOutput;
        setState((s) => ({
          ...s,
          totalTokensUsed: s.totalTokensUsed + (combineResult.tokensUsed ?? 0),
        }));
      }
    } catch (err) {
      setError(`Evaluation failed: ${err.message}`);
      return;
    }

    // ── Record deliberation for Admin Stats ─────────────────────────────
    try {
      const winnerId = mode === 'combine' 
        ? verdictBreakdown.components[0]?.providerId // Use first component winner for stats
        : verdictBreakdown.winner?.providerId;

      await fetch('/api/deliberations/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          purpose,
          winnerId,
          providers: enabledIds,
          mode
        })
      });
    } catch (err) {
      console.warn('Failed to record deliberation statistics:', err);
    }

    // ── Auto-save session to chat history ────────────────────────────────
    const sessionId = await saveSession({
      prompt: rawPrompt,
      purpose,
      verdictBreakdown,
      anonymizedOutputs: anonymizedOutputsResult,
      combinedOutput: finalCombinedOutput,
      attachments: currentAttachments,
    });

    setState((s) => ({
      ...s,
      phase: PHASES.RESULTS,
      combinedOutput: finalCombinedOutput,
      sessionId,
      verdictBreakdown // Ensure final state has it
    }));
  }, [log, setError, state.attachments]);

  /**
   * Load a saved session from chat history. Reusable.
   * @param {object} session - DB session row
   */
  const loadSession = useCallback((session) => {
    revealMapRef.current = null;

    const verdictData = typeof session.verdict_data === 'string'
      ? JSON.parse(session.verdict_data)
      : session.verdict_data;
    const outputsData = typeof session.outputs_data === 'string'
      ? JSON.parse(session.outputs_data)
      : session.outputs_data;

    // Rebuild revealMap from verdictBreakdown
    const revealMap = new Map();
    if (verdictData?.winner?.providerId) {
      revealMap.set(verdictData.winner.label, verdictData.winner.providerId);
    }
    if (verdictData?.scores) {
      // Reconstruct from scores if minorityOpinions have provider IDs
      for (const mo of (verdictData.minorityOpinions ?? [])) {
        if (mo.providerId) revealMap.set(mo.label, mo.providerId);
      }
    }
    revealMapRef.current = revealMap;

    const verdictBreakdown = {
      ...verdictData,
      revealMap,
    };

    setState({
      ...INITIAL_STATE,
      phase: PHASES.RESULTS,
      prompt: session.prompt,
      anonymizedOutputs: outputsData ?? [],
      verdictBreakdown,
      combinedOutput: session.combined_output ?? verdictData?.combinedOutput ?? null,
      sessionId: session.id,
    });
  }, []);

  const reset = useCallback(() => {
    revealMapRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, runSession, reset, loadSession, setAttachments };
}
