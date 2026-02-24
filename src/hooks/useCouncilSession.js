/**
 * useCouncilSession.js
 * Central state machine for the Council of LLMs session.
 *
 * Flow:
 *   1. User prompt → sent to ALL enabled providers (OpenAI, Anthropic, Gemini, Copilot)
 *   2. Outputs anonymized (crypto shuffle)
 *   3. Judge evaluates all → selects best with in-depth reasoning
 *   4. Reveal: winner + rejection reasons
 *
 * Security: revealMap is never exposed until phase === RESULTS
 */

import { useState, useCallback, useRef } from "react";
import { callProvider, getEnabledProviders } from "../api/providerRouter.js";
import { sanitizeOutput, sanitizePrompt } from "../core/sanitizer.js";
import { PROVIDERS, PROVIDER_MAP, GENERATION_SYSTEM_PROMPT } from "../core/councilConfig.js";
import { anonymizeOutputs } from "../core/anonymizer.js";
import { runJudge } from "../core/judge.js";

export const PHASES = {
  IDLE: "idle",
  GENERATING: "generating",
  JUDGING: "judging",
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
  activityLog: [],
  generatingFor: null,
  error: null,
  totalTokensUsed: 0,
};

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

  const runSession = useCallback(async (rawPrompt, purpose = 'content') => {
    revealMapRef.current = null;

    const enabledIds = await getEnabledProviders();
    if (enabledIds.length === 0) {
      setError("No API keys configured. Add at least one to .env: VITE_GOOGLE_AI_API_KEY, VITE_GROQ_API_KEY, VITE_OPENROUTER_API_KEY, or VITE_DEEPSEEK_API_KEY");
      return;
    }

    const enabledProviders = PROVIDERS.filter((p) => enabledIds.includes(p.id));
    setState({ ...INITIAL_STATE, phase: PHASES.GENERATING });

    // ── Phase 0: Sanitize input ──────────────────────────────────────────
    const { sanitized: sanitizedPrompt, warnings: promptWarnings } = sanitizePrompt(rawPrompt);
    setState((s) => ({ ...s, sanitizedPrompt, promptWarnings }));

    if (promptWarnings.length > 0) {
      promptWarnings.forEach((w) => log(`⚠️ Prompt warning: ${w}`, "warn"));
    }

    log(`🏛️ Council convening — sending prompt to ${enabledProviders.length} providers...`, "info");

    // ── Phase 1: Generate outputs (parallel) ──────────────────────────────
    const outputs = [];
    let totalTokens = 0;

    for (const provider of enabledProviders) {
      setState((s) => ({ ...s, generatingFor: provider.id }));
      log(`${provider.icon} ${provider.name} generating...`);

      try {
        const result = await callProvider(provider.id, {
          system: GENERATION_SYSTEM_PROMPT,
          user: sanitizedPrompt,
          temperature: 0.7,
          maxTokens: 2000,
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
        totalTokens += result.tokensUsed;
        setState((s) => ({
          ...s,
          outputs: [...s.outputs, { providerId: provider.id, content: sanitized, requestId: result.requestId, flaggedPatterns }],
          totalTokensUsed: s.totalTokensUsed + result.tokensUsed,
        }));
      } catch (err) {
        setError(`Generation failed for ${provider.name}: ${err.message}`);
        return;
      }
    }

    setState((s) => ({ ...s, generatingFor: null }));
    log(`✅ All ${outputs.length} responses generated. Anonymizing...`);

    // ── Phase 2: Anonymize ───────────────────────────────────────────────
    let anonymizedOutputs, revealMap;
    try {
      const withMemberId = outputs.map((o) => ({ memberId: o.providerId, content: o.content, requestId: o.requestId }));
      ({ anonymized: anonymizedOutputs, revealMap } = anonymizeOutputs(withMemberId));
      revealMapRef.current = revealMap;
    } catch (err) {
      setError(`Anonymization failed: ${err.message}`);
      return;
    }

    log("🔀 Outputs anonymized. Identities sealed.");
    setState((s) => ({
      ...s,
      anonymizedOutputs,
      phase: PHASES.JUDGING,
    }));

    // ── Phase 3: Judge ───────────────────────────────────────────────────
    log("⚖️ Judge evaluating all submissions...");

    let judgeResult;
    try {
      judgeResult = await runJudge(sanitizedPrompt, anonymizedOutputs);
    } catch (err) {
      setError(`Judge failed: ${err.message}`);
      return;
    }

    totalTokens += judgeResult.tokensUsed;
    const winnerProviderId = revealMapRef.current.get(judgeResult.winner);
    const winnerProvider = PROVIDER_MAP[winnerProviderId];

    const verdictBreakdown = {
      winner: {
        label: judgeResult.winner,
        providerId: winnerProviderId,
        selectionReason: judgeResult.selectionReason,
        inDepthReasoning: judgeResult.inDepthReasoning,
      },
      rejections: judgeResult.rejections.map((r) => ({
        label: r.label,
        providerId: revealMapRef.current.get(r.label),
        reason: r.reason,
      })),
      revealMap: revealMapRef.current,
    };

    log(`🏆 Verdict: ${judgeResult.winner} wins`, "success");
    log(`🎭 Identity revealed: ${winnerProvider?.icon} ${winnerProvider?.name}`, "success");

    // ── Record deliberation for Admin Stats ─────────────────────────────
    try {
      const recordRes = await fetch('/api/deliberations/record', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          purpose,
          winnerId: winnerProviderId,
          providers: enabledIds
        })
      });
      if (recordRes.ok) {
        console.log(`✅ Deliberation recorded successfully for purpose: ${purpose}`);
      } else {
        console.warn('⚠️ Server rejected deliberation record');
      }
    } catch (err) {
      console.warn('Failed to record deliberation statistics:', err);
    }

    setState((s) => ({
      ...s,
      phase: PHASES.RESULTS,
      verdictBreakdown,
      totalTokensUsed: s.totalTokensUsed + judgeResult.tokensUsed,
    }));
  }, [log, setError]);

  const reset = useCallback(() => {
    revealMapRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, runSession, reset };
}
