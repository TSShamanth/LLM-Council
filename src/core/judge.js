/**
 * judge.js
 * Single-judge evaluation of anonymized outputs.
 * Produces the best output with in-depth reasoning for selection and rejections.
 *
 * The judge receives all anonymized outputs and selects the most viable response,
 * providing:
 * - Why each rejected output was rejected
 * - Why the selected output was chosen
 * - In-depth comparative reasoning
 */

import { callProvider, getEnabledProviders } from "../api/providerRouter.js";

/** Judge tries these providers in order (first available) */
const JUDGE_PRIORITY = ["gemini", "groq", "openrouter"]; // deepseek commented out

function buildJudgeSystemPrompt() {
  return `You are an impartial expert judge evaluating multiple anonymous responses to the same prompt.
Your task is to select the SINGLE BEST response and provide in-depth reasoning.

CRITICAL RULES:
1. You do NOT know which system produced any response. All are anonymous.
2. Base your judgment purely on: accuracy, completeness, clarity, relevance, and usefulness.
3. You MUST provide specific reasons for rejecting EACH non-winning submission.
4. You MUST provide detailed reasoning for WHY the winner is superior.
5. Be objective. Avoid vague praise. Point to concrete strengths and weaknesses.
6. Your response MUST be valid JSON matching the exact schema provided.`;
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

  return `ORIGINAL PROMPT GIVEN TO ALL RESPONDENTS:
"${originalPrompt}"

ANONYMOUS RESPONSES TO EVALUATE:
${submissionsText}

REQUIRED RESPONSE FORMAT (return ONLY valid JSON, no markdown, no preamble):
{
  "winner": "<one of: ${labelList}>",
  "selectionReason": "<3-6 sentences: In-depth explanation of WHY this response is the best. Be specific about what makes it superior to the alternatives.>",
  "inDepthReasoning": "<4-8 sentences: Overall comparative analysis. Discuss the quality spectrum across all submissions, key differentiators, and the decisive factors in your choice.>",
  "rejections": [
    {
      "label": "<label of a NON-winning submission>",
      "reason": "<2-4 sentences: Specific reasons why this response was NOT selected.>"
    }
  ]
}

NOTE: The "rejections" list must ONLY contain the other ${anonymizedOutputs.length - 1} submissions that were NOT chosen as the winner.`;
}

/**
 * Robustly parse JSON from LLM text, handling common formatting issues.
 */
function robustParseJSON(text) {
  if (!text) return null;
  
  // 1. Try direct parse
  try {
    return JSON.parse(text);
  } catch (e) {
    // 2. Clean markdown and extra text
    let clean = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    
    try {
      return JSON.parse(clean);
    } catch (e2) {
      // 3. Extract the first {...} block
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        let jsonStr = match[0];
        
        // 4. Final attempt: fix common "dirty" JSON issues
        // Replace unescaped newlines in values with \n
        // This is tricky but can help with multiline reasons
        try {
          return JSON.parse(jsonStr);
        } catch (e3) {
          // Attempt to remove trailing commas before ] or }
          jsonStr = jsonStr.replace(/,\s*([\]\}])/g, '$1');
          try {
            return JSON.parse(jsonStr);
          } catch (e4) {
            console.error("Failed to parse Judge JSON after all attempts", { text: text.substring(0, 100) });
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Run the judge evaluation.
 * @param {string} originalPrompt - Sanitized user prompt
 * @param {Array<{label: string, content: string}>} anonymizedOutputs
 * @param {string} [judgeProvider] - Provider to use for judging (default: anthropic, with fallback)
 * @returns {Promise<{
 *   winner: string,
 *   selectionReason: string,
 *   inDepthReasoning: string,
 *   rejections: Array<{label: string, reason: string}>,
 *   tokensUsed: number
 * }>}
 */
export async function runJudge(originalPrompt, anonymizedOutputs, judgeProvider = null) {
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
        maxTokens: 3500, // Increased for long comparisons
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!result) {
    throw new Error(`Judge failed (all providers): ${lastErr?.message ?? "no providers enabled"}`);
  }

  let parsed = robustParseJSON(result.text);

  const validLabels = new Set(anonymizedOutputs.map((o) => o.label));

  if (!parsed || !validLabels.has(parsed.winner)) {
    parsed = {
      winner: anonymizedOutputs[0]?.label ?? "Submission Alpha",
      selectionReason: "Judgment parsing failed. Raw response stored for audit.",
      inDepthReasoning: "Automatic fallback due to parse error.",
      rejections: anonymizedOutputs
        .filter((o) => o.label !== (parsed?.winner ?? anonymizedOutputs[0]?.label))
        .map((o) => ({ label: o.label, reason: "Parse error — no structured rejection available." })),
    };
  }

  // Ensure winner is valid
  if (!validLabels.has(parsed.winner)) {
    parsed.winner = anonymizedOutputs[0].label;
  }

  // Filter rejections to valid labels
  const rejections = (parsed.rejections ?? [])
    .filter((r) => r && validLabels.has(r.label) && r.label !== parsed.winner)
    .map((r) => ({ label: r.label, reason: r.reason ?? "No specific reason provided." }));

  return {
    winner: parsed.winner,
    selectionReason: parsed.selectionReason ?? "",
    inDepthReasoning: parsed.inDepthReasoning ?? "",
    rejections,
    tokensUsed: result.tokensUsed ?? 0,
  };
}
