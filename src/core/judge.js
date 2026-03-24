/**
 * judge.js
 * Single-judge evaluation of anonymized outputs with comprehensive metrics.
 *
 * Produces:
 * - 5-dimension per-submission scoring (accuracy, completeness, clarity, relevance, usefulness)
 * - Detailed per-submission strengths, weaknesses, and accept/reject verdict with reasoning
 * - Overall comparative analysis explaining the council's decision
 * - Minority opinions: what each rejected submission uniquely did well
 *
 * CRITICAL: The judge never knows which provider produced which output.
 *           All outputs are labeled anonymously (e.g., "Submission Alpha").
 */

import { callProvider, getEnabledProviders } from "../api/providerRouter.js";

/** Judge tries these providers in order (first available) */
const JUDGE_PRIORITY = ["groq", "gemini", "qwen", "moonshot", "deepseek"];

/** The 5 scoring dimensions used for radar charts */
export const SCORE_DIMENSIONS = [
  "accuracy",
  "completeness",
  "clarity",
  "relevance",
  "usefulness",
];

function buildJudgeSystemPrompt() {
  return `You are an impartial expert judge evaluating multiple anonymous responses to the same prompt.
Your task is to perform a DETAILED multi-dimensional analysis and select the SINGLE BEST response.

CRITICAL RULES:
1. You do NOT know which system produced any response. All are anonymous.
2. You MUST score EACH submission on 5 dimensions (1-10 scale): accuracy, completeness, clarity, relevance, usefulness.
3. For EACH submission, provide:
   - 3-5 specific strengths with concrete examples from the text
   - 3-5 specific weaknesses or gaps with concrete examples
   - A clear ACCEPT or REJECT verdict with a multi-sentence justification
4. Your overall reasoning must explain the quality spectrum and decisive differentiators.
5. Identify what each submission did UNIQUELY well that others did not.
6. Be specific and cite parts of each response. No vague praise.
7. Your response MUST be valid JSON matching the exact schema provided.`;
}

function buildJudgeUserPrompt(originalPrompt, anonymizedOutputs) {
  const submissionsText = anonymizedOutputs
    .map(
      (o) => `
=== ${o.label} ===
${o.content}
${"=".repeat(40)}`
    )
    .join("\n\n");

  const labelList = anonymizedOutputs.map((o) => o.label).join(" | ");

  const scoresSchema = anonymizedOutputs
    .map(
      (o) => `    "${o.label}": {
      "accuracy": <1-10>,
      "completeness": <1-10>,
      "clarity": <1-10>,
      "relevance": <1-10>,
      "usefulness": <1-10>,
      "strengths": ["<strength 1>", "<strength 2>"],
      "weaknesses": ["<weakness 1>", "<weakness 2>"],
      "verdict": "ACCEPTED" or "REJECTED",
      "verdictReason": "<2-3 sentences explaining why this was accepted/rejected.>"
    }`
    )
    .join(",\n");

  const minoritySchema = anonymizedOutputs
    .map(
      (o) =>
        `{ "label": "${o.label}", "uniqueMerit": "<What this submission did uniquely well that NO other submission did. Be specific.>" }`
    )
    .join(",\n      ");

  return `ORIGINAL PROMPT GIVEN TO ALL RESPONDENTS:
"${originalPrompt}"

ANONYMOUS RESPONSES TO EVALUATE:
${submissionsText}

REQUIRED RESPONSE FORMAT (return ONLY valid JSON, no markdown, no preamble):
{
  "winner": "<one of: ${labelList}>",
  "overallAnalysis": "<3-5 sentences: Compare all submissions. Why did the winner stand out? Be specific.>",
  "scores": {
${scoresSchema}
  },
  "minorityOpinions": [
      ${minoritySchema}
  ]
}

IMPORTANT RULES:
- Exactly ONE submission should have verdict "ACCEPTED" (the winner).
- All other submissions MUST have verdict "REJECTED".
- The "winner" field must match the label of the ACCEPTED submission.
- Each strengths array should have 2-3 items.
- Each weaknesses array should have 2-3 items.
- Each verdictReason should be 2-3 concise sentences.
- Each uniqueMerit should identify something genuinely unique, not generic praise.`;
}

/**
 * Robustly parse JSON from LLM text, handling common formatting issues.
 */
export function robustParseJSON(text) {
  if (!text) return null;

  // 1. Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // 2. Strip markdown code fences (handles leading whitespace, newlines)
    let clean = text.trim();
    // Remove leading ```json or ``` with any whitespace/newlines
    clean = clean.replace(/^\s*```(?:json)?\s*\n?/i, "");
    // Remove trailing ``` with any whitespace/newlines  
    clean = clean.replace(/\n?\s*```\s*$/i, "");
    clean = clean.trim();

    try {
      return JSON.parse(clean);
    } catch {
      // 3. Extract the outermost {...} block using brace counting
      const startIdx = clean.indexOf("{");
      if (startIdx === -1) {
        console.error("No JSON object found in judge response", {
          preview: text.substring(0, 300),
        });
        return null;
      }

      let depth = 0;
      let endIdx = -1;
      for (let i = startIdx; i < clean.length; i++) {
        if (clean[i] === "{") depth++;
        else if (clean[i] === "}") {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }

      if (endIdx === -1) {
        // Truncated JSON — try adding closing braces
        let jsonStr = clean.substring(startIdx);
        while (depth > 0) {
          jsonStr += "}";
          depth--;
        }
        try {
          return JSON.parse(jsonStr);
        } catch {
          // Fall through
        }
      }

      let jsonStr = clean.substring(startIdx, endIdx + 1);

      try {
        return JSON.parse(jsonStr);
      } catch {
        // Remove trailing commas before ] or }
        jsonStr = jsonStr.replace(/,\s*([\]\}])/g, "$1");
        try {
          return JSON.parse(jsonStr);
        } catch (finalErr) {
          console.error("Failed to parse Judge JSON after all attempts", {
            preview: text.substring(0, 500),
            extractedPreview: jsonStr.substring(0, 300),
            parseError: finalErr.message,
          });
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Validate and normalize dimension scores for a single submission.
 * @param {object} rawScores - Raw scores object from judge
 * @returns {object} Normalized scores with all 5 dimensions clamped to 1-10
 */
function normalizeScores(rawScores) {
  const normalized = {};
  for (const dim of SCORE_DIMENSIONS) {
    const val = typeof rawScores?.[dim] === "number" ? rawScores[dim] : 5;
    normalized[dim] = Math.max(1, Math.min(10, Math.round(val)));
  }
  // Normalize strengths/weaknesses to arrays
  normalized.strengths = Array.isArray(rawScores?.strengths)
    ? rawScores.strengths
    : typeof rawScores?.strengths === "string"
      ? [rawScores.strengths]
      : [];
  normalized.weaknesses = Array.isArray(rawScores?.weaknesses)
    ? rawScores.weaknesses
    : typeof rawScores?.weaknesses === "string"
      ? [rawScores.weaknesses]
      : [];
  normalized.verdict = rawScores?.verdict ?? "REJECTED";
  normalized.verdictReason = rawScores?.verdictReason ?? "";
  return normalized;
}

/**
 * Run the judge evaluation.
 * @param {string} originalPrompt - Sanitized user prompt
 * @param {Array<{label: string, content: string}>} anonymizedOutputs
 * @param {string} [judgeProvider] - Provider to use for judging (default: first available)
 * @returns {Promise<{
 *   winner: string,
 *   overallAnalysis: string,
 *   scores: Object<string, {accuracy, completeness, clarity, relevance, usefulness, strengths[], weaknesses[], verdict, verdictReason}>,
 *   minorityOpinions: Array<{label: string, uniqueMerit: string}>,
 *   tokensUsed: number
 * }>}
 */
export async function runJudge(
  originalPrompt,
  anonymizedOutputs,
  judgeProvider = null
) {
  const systemPrompt = buildJudgeSystemPrompt();
  const userPrompt = buildJudgeUserPrompt(originalPrompt, anonymizedOutputs);

  const enabledIds = await getEnabledProviders();
  const candidates = judgeProvider
    ? [judgeProvider]
    : JUDGE_PRIORITY.filter((p) => enabledIds.includes(p));

  let result;
  let lastErr;
  for (const provider of candidates) {
    try {
      result = await callProvider(provider, {
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.2,
        maxTokens: 8000,
        skipSanitize: true, // Judge needs raw JSON output, no sanitization
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!result) {
    throw new Error(
      `Judge failed (all providers): ${lastErr?.message ?? "no providers enabled"}`
    );
  }

  let parsed = robustParseJSON(result.text);

  const validLabels = new Set(anonymizedOutputs.map((o) => o.label));

  if (!parsed || !validLabels.has(parsed.winner)) {
    // Fallback for parse errors
    parsed = {
      winner: anonymizedOutputs[0]?.label ?? "Submission Alpha",
      overallAnalysis: "Judgment parsing failed. Raw response stored for audit.",
      scores: {},
      minorityOpinions: [],
    };
  }

  // Ensure winner is valid
  if (!validLabels.has(parsed.winner)) {
    parsed.winner = anonymizedOutputs[0].label;
  }

  // Normalize all scores
  const scores = {};
  for (const output of anonymizedOutputs) {
    scores[output.label] = normalizeScores(parsed.scores?.[output.label]);
  }

  // Ensure winner has ACCEPTED verdict and others have REJECTED
  scores[parsed.winner].verdict = "ACCEPTED";
  for (const output of anonymizedOutputs) {
    if (output.label !== parsed.winner) {
      scores[output.label].verdict = "REJECTED";
    }
  }

  // Filter minority opinions to valid labels
  const minorityOpinions = (parsed.minorityOpinions ?? [])
    .filter((m) => m && validLabels.has(m.label))
    .map((m) => ({
      label: m.label,
      uniqueMerit: m.uniqueMerit ?? "No specific merit noted.",
    }));

  return {
    winner: parsed.winner,
    overallAnalysis: parsed.overallAnalysis ?? "",
    scores,
    minorityOpinions,
    tokensUsed: result.tokensUsed ?? 0,
  };
}

/**
 * Generate a combined "best-of-all" output using the winning LLM.
 * Takes the best features from ALL submissions and synthesizes an improved answer.
 *
 * @param {string} originalPrompt - The user's original prompt
 * @param {Array<{label: string, content: string}>} anonymizedOutputs - All outputs
 * @param {Object} scores - Per-submission scores from the judge
 * @param {string} winnerLabel - Label of the winning submission
 * @param {string} [provider] - Provider to use (default: first available)
 * @returns {Promise<{combinedOutput: string, tokensUsed: number}>}
 */
export async function generateCombinedOutput(
  originalPrompt,
  anonymizedOutputs,
  scores,
  winnerLabel,
  provider = null
) {
  const enabledIds = await getEnabledProviders();
  const candidates = provider
    ? [provider]
    : JUDGE_PRIORITY.filter((p) => enabledIds.includes(p));

  const submissionsWithScores = anonymizedOutputs
    .map((o) => {
      const s = scores[o.label] ?? {};
      const avgScore =
        SCORE_DIMENSIONS.reduce((sum, dim) => sum + (s[dim] ?? 5), 0) /
        SCORE_DIMENSIONS.length;
      return `=== ${o.label} (Avg Score: ${avgScore.toFixed(1)}/10, ${o.label === winnerLabel ? "WINNER" : "REJECTED"}) ===
STRENGTHS: ${(s.strengths || []).join("; ")}
WEAKNESSES: ${(s.weaknesses || []).join("; ")}

CONTENT:
${o.content}
${"=".repeat(40)}`;
    })
    .join("\n\n");

  const systemPrompt = `You are an expert synthesizer. Your task is to create the BEST POSSIBLE response by combining the strongest elements from multiple AI-generated responses. Extract the best features, fix weaknesses, and produce a superior output.`;

  const userPrompt = `ORIGINAL PROMPT:
"${originalPrompt}"

I have ${anonymizedOutputs.length} responses to this prompt, each evaluated by a judge. Here they are with their scores:

${submissionsWithScores}

YOUR TASK:
Create a SUPERIOR combined response that:
1. Takes the BEST elements from EACH submission (reference which parts come from where)
2. Fixes the weaknesses identified in each submission
3. Adds any missing information that none of the submissions covered
4. Maintains a clear, well-structured format
5. Is directly usable as the final answer to the original prompt

Write ONLY the combined response. Do NOT include meta-commentary about the combination process.`;

  let combinedResult;
  let lastErr;
  for (const p of candidates) {
    try {
      combinedResult = await callProvider(p, {
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.3,
        maxTokens: 3000,
        skipSanitize: true, // Combination output needs raw text
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!combinedResult) {
    throw new Error(
      `Combined output generation failed: ${lastErr?.message ?? "no providers available"}`
    );
  }

  return {
    combinedOutput: combinedResult.text.trim(),
    tokensUsed: combinedResult.tokensUsed ?? 0,
  };
}
