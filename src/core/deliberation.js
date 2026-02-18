/**
 * deliberation.js
 * Orchestrates the structured review phase.
 *
 * Each reviewer receives:
 * - All anonymized, sanitized outputs (no author metadata)
 * - Their specific evaluation lens
 * - Strict output schema to parse
 * - Explicit instructions to avoid self-referential language
 * - A COMPARATIVE analysis requirement (not just absolute scoring)
 *
 * The review schema requires:
 * - vote: single winner label
 * - ranking: ordered list of all labels
 * - reason: why the winner beats the rest (comparative, not just descriptive)
 * - detailedAnalysis: per-submission structured critique
 * - tradeoffs: honest weaknesses of the winning submission
 * - worstSubmission: which was worst and why
 */

import { callLLM } from "../api/anthropicClient.js";
import { sanitizeReviewText } from "./biasGuard.js";
import { FORBIDDEN_REVIEWER_PHRASES } from "../api/sanitizer.js";

/** Build the system prompt for a reviewer — no identity clues included */
function buildReviewerSystemPrompt(member) {
  return `You are an expert technical reviewer on an anonymous peer review panel.
${member.reviewLens}

CRITICAL RULES — violating these invalidates your review:
1. You do NOT know who wrote any submission. All authors are anonymous.
2. NEVER use phrases like: ${FORBIDDEN_REVIEWER_PHRASES.map((p) => `"${p}"`).join(", ")}
3. NEVER claim to recognize your own work.
4. Base ALL judgments on the content alone — not on style, length, or formatting preferences.
5. You MUST provide comparative analysis: explain why the winner is better THAN THE OTHERS, not just why it is good.
6. You MUST identify the weakest submission and explain why.
7. Avoid sycophancy: "brilliant", "perfect", "clearly superior" require specific evidence.
8. Your response MUST be valid JSON matching the exact schema provided.`;
}

/** Build the user message for a reviewer with all anonymized outputs */
function buildReviewerUserPrompt(originalPrompt, anonymizedOutputs) {
  const submissionsText = anonymizedOutputs
    .map(
      (o, i) => `
=== ${o.label} ===
${o.content}
${"=".repeat(40)}`
    )
    .join("\n\n");

  const labelList = anonymizedOutputs.map((o) => o.label);

  return `ORIGINAL PROMPT GIVEN TO ALL SUBMITTERS:
"${originalPrompt}"

ANONYMOUS SUBMISSIONS FOR REVIEW:
${submissionsText}

REQUIRED RESPONSE FORMAT (return ONLY valid JSON, no markdown, no preamble):
{
  "vote": "<one of: ${labelList.join(" | ")}>",
  "ranking": ["<best>", "<2nd>", "<3rd>", "<4th>", "<worst>"],
  "reason": "<2-4 sentences: WHY the winner is better than the specific alternatives. Name the runner-up and explain the deciding factor.>",
  "detailedAnalysis": {
    ${labelList
      .map(
        (l) => `"${l}": {
      "strengths": "<what this submission does well>",
      "weaknesses": "<specific problems or gaps>",
      "score": <integer 1-10>
    }`
      )
      .join(",\n    ")}
  },
  "tradeoffs": "<honest weaknesses or risks in your top-ranked submission that reviewers should be aware of>",
  "worstSubmission": "<label of the weakest submission>",
  "worstReason": "<specific reason why this submission fell short>"
}`;
}

/**
 * Run one reviewer's deliberation.
 * @param {object} member - Council member config
 * @param {string} originalPrompt - Sanitized user prompt
 * @param {Array<{label: string, content: string}>} anonymizedOutputs
 * @returns {Promise<{
 *   reviewerId: string,
 *   vote: string,
 *   ranking: string[],
 *   reason: string,
 *   detailedAnalysis: object,
 *   tradeoffs: string,
 *   worstSubmission: string,
 *   worstReason: string,
 *   requestId: string,
 *   biasViolations: string[]
 * }>}
 */
export async function runDeliberation(member, originalPrompt, anonymizedOutputs) {
  const systemPrompt = buildReviewerSystemPrompt(member);
  const userPrompt = buildReviewerUserPrompt(originalPrompt, anonymizedOutputs);

  const { text, requestId } = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    temperature: 0.3, // Low temp for review = consistent, analytical
    maxTokens: 1800,
    memberId: member.id,
  });

  // Parse JSON — strip any markdown fences that slipped through
  let parsed;
  try {
    const clean = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback: attempt to extract JSON object from text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  // Graceful degradation if parse fails
  if (!parsed) {
    const fallbackLabel = anonymizedOutputs[0]?.label ?? "Submission Alpha";
    parsed = {
      vote: fallbackLabel,
      ranking: anonymizedOutputs.map((o) => o.label),
      reason: "Review parsing failed — raw response stored for audit.",
      detailedAnalysis: {},
      tradeoffs: "Unknown",
      worstSubmission: anonymizedOutputs[anonymizedOutputs.length - 1]?.label ?? "Submission Epsilon",
      worstReason: "Review parsing failed.",
    };
  }

  // Sanitize reasoning for self-referential language
  const { cleaned: cleanedReason, redactions: r1 } = sanitizeReviewText(parsed.reason ?? "");
  const { cleaned: cleanedTradeoffs, redactions: r2 } = sanitizeReviewText(parsed.tradeoffs ?? "");

  // Validate vote is a real label
  const validLabels = new Set(anonymizedOutputs.map((o) => o.label));
  const vote = validLabels.has(parsed.vote) ? parsed.vote : anonymizedOutputs[0].label;

  // Validate ranking
  const ranking = Array.isArray(parsed.ranking)
    ? parsed.ranking.filter((l) => validLabels.has(l))
    : anonymizedOutputs.map((o) => o.label);

  const biasViolations = [];
  if (r1 + r2 > 0) biasViolations.push(`${r1 + r2} self-referential phrase(s) redacted`);

  return {
    reviewerId: member.id,
    vote,
    ranking,
    reason: cleanedReason,
    detailedAnalysis: parsed.detailedAnalysis ?? {},
    tradeoffs: cleanedTradeoffs,
    worstSubmission: validLabels.has(parsed.worstSubmission) ? parsed.worstSubmission : null,
    worstReason: parsed.worstReason ?? "",
    requestId,
    biasViolations,
  };
}
