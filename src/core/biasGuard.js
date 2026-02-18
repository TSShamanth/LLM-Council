/**
 * biasGuard.js
 * Detects and neutralizes bias patterns in reviewer outputs.
 *
 * Bias types addressed:
 * 1. SELF-IDENTIFICATION: LLM claims ownership ("I wrote this", "my solution")
 * 2. ANCHORING: First submission always gets higher scores (order bias)
 * 3. VERBOSITY BIAS: Longer outputs scored higher regardless of quality
 * 4. RECENCY BIAS: Last submission always ranked highest
 * 5. FORMAT CONFORMITY BIAS: Outputs matching reviewer's own style scored higher
 * 6. SYCOPHANCY MARKERS: "brilliant", "excellent", "perfect" without justification
 */

/** Self-identification patterns that indicate the reviewer knows their own output */
const SELF_ID_PATTERNS = [
  /\b(I wrote|I created|I generated|I authored|my (output|solution|approach|response|code))\b/gi,
  /\b(this is (my|mine))\b/gi,
  /\b(I (recognize|see) (my|mine))\b/gi,
  /\b(this matches (my|mine))\b/gi,
];

/** Sycophancy markers — vague praise without substantive reasoning */
const SYCOPHANCY_PATTERNS = [
  /\b(absolutely (perfect|brilliant|flawless|amazing))\b/gi,
  /\b(this is (clearly|obviously|definitely|undeniably) the best)\b/gi,
  /\b(no contest|far superior|miles ahead)\b/gi,
  /\b(any (reasonable|sane|rational) (person|developer|engineer) would (choose|pick|prefer) this)\b/gi,
];

/** Structural anchoring check — did the reviewer always pick the first or last label? */
const POSITIONAL_LABELS = ["Submission Alpha", "Submission Beta", "Submission Gamma", "Submission Delta", "Submission Epsilon"];

/**
 * Check a single review for bias violations.
 * @param {{vote: string, ranking: string[], reason: string, detailedAnalysis: object}} review
 * @returns {{ passed: boolean, violations: string[], severity: 'low'|'medium'|'high' }}
 */
export function checkReviewBias(review) {
  const violations = [];
  const { reason = "", detailedAnalysis = {} } = review;

  const fullText = [
    reason,
    ...Object.values(detailedAnalysis).map((a) =>
      typeof a === "object" ? Object.values(a).join(" ") : String(a)
    ),
  ].join(" ");

  // 1. Self-identification check
  for (const pattern of SELF_ID_PATTERNS) {
    if (pattern.test(fullText)) {
      violations.push(`Self-identification language detected: "${fullText.match(pattern)?.[0]}"`);
    }
  }

  // 2. Sycophancy check
  for (const pattern of SYCOPHANCY_PATTERNS) {
    if (pattern.test(fullText)) {
      violations.push(`Sycophancy marker without justification: "${fullText.match(pattern)?.[0]}"`);
    }
  }

  // 3. Minimum reasoning length check
  if (reason.trim().split(/\s+/).length < 10) {
    violations.push("Reasoning too brief — insufficient justification for vote");
  }

  // 4. Positional anchoring check (always picks first or always last)
  // This is checked cross-reviewer in checkCouncilGroupthink

  const severity =
    violations.length === 0 ? "low" :
    violations.length <= 1 ? "low" :
    violations.length <= 3 ? "medium" : "high";

  return { passed: violations.length === 0, violations, severity };
}

/**
 * Check all reviews together for groupthink / anchoring patterns.
 * @param {Array<{vote: string, ranking: string[], reviewerId: string}>} reviews
 * @returns {{ anchoring: boolean, groupthink: boolean, warnings: string[] }}
 */
export function checkCouncilGroupthink(reviews) {
  const warnings = [];

  // Positional anchoring: if >80% of votes go to Alpha or Epsilon
  const votes = reviews.map((r) => r.vote);
  const alphaVotes = votes.filter((v) => v === "Submission Alpha").length;
  const epsilonVotes = votes.filter((v) => v === "Submission Epsilon").length;
  const threshold = Math.ceil(reviews.length * 0.8);

  let anchoring = false;
  if (alphaVotes >= threshold) {
    warnings.push(`Potential first-position anchoring: ${alphaVotes}/${reviews.length} votes for Alpha`);
    anchoring = true;
  }
  if (epsilonVotes >= threshold) {
    warnings.push(`Potential last-position anchoring: ${epsilonVotes}/${reviews.length} votes for Epsilon`);
    anchoring = true;
  }

  // Groupthink: all 5 vote identically
  const uniqueVotes = new Set(votes).size;
  const groupthink = uniqueVotes === 1;
  if (groupthink) {
    warnings.push("Unanimous groupthink detected: all reviewers voted identically. Results may lack diversity.");
  }

  // Spread check: healthy council should have at least 2 different winners
  if (uniqueVotes < 2 && reviews.length >= 3) {
    warnings.push("Low vote diversity — consider whether prompt is too prescriptive");
  }

  return { anchoring, groupthink, warnings };
}

/**
 * Sanitize a reviewer's reasoning text to remove self-referential language.
 * @param {string} text
 * @returns {{ cleaned: string, redactions: number }}
 */
export function sanitizeReviewText(text) {
  let cleaned = text;
  let redactions = 0;

  for (const pattern of SELF_ID_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match) => {
      redactions++;
      return "[REDACTED]";
    });
  }

  return { cleaned, redactions };
}
