/**
 * scorer.js
 * Computes the final verdict using a weighted composite score.
 *
 * Simple majority vote has a flaw: a submission with 3 votes from reviewers
 * who gave it a score of 5/10 could beat one with 2 votes from reviewers
 * who scored it 9/10. We fix this with a composite score.
 *
 * Score formula per submission:
 *   composite = (votes × WEIGHT_VOTE)
 *             + (topRankings × WEIGHT_TOP_RANK)
 *             + (avgNormalizedScore × WEIGHT_AVG_SCORE)
 *             - (worstVotes × WEIGHT_WORST_PENALTY)
 */

import { SCORING_WEIGHTS, ANONYMOUS_LABELS } from "./councilConfig.js";

const WEIGHT_VOTE = 4;
const WEIGHT_TOP_RANK = 1.5;
const WEIGHT_AVG_SCORE = 2;
const WEIGHT_WORST_PENALTY = 1;

/**
 * @typedef {object} SubmissionScore
 * @property {string} label
 * @property {number} votes
 * @property {number} topRankings
 * @property {number} avgScore
 * @property {number} worstVotes
 * @property {number} composite
 * @property {string[]} voterIds
 * @property {string[]} worstVoterIds
 */

/**
 * Compute final scores for all submissions.
 * @param {Array<{vote: string, ranking: string[], reviewerId: string, detailedAnalysis: object, worstSubmission: string}>} reviews
 * @param {Array<{label: string}>} anonymizedOutputs
 * @returns {{ scores: SubmissionScore[], winner: SubmissionScore, tiebroken: boolean }}
 */
export function computeScores(reviews, anonymizedOutputs) {
  const labels = anonymizedOutputs.map((o) => o.label);

  /** Initialize score buckets */
  const buckets = Object.fromEntries(
    labels.map((l) => [
      l,
      {
        label: l,
        votes: 0,
        topRankings: 0,
        avgScore: 0,
        worstVotes: 0,
        composite: 0,
        voterIds: [],
        worstVoterIds: [],
        rawScores: [],
      },
    ])
  );

  for (const review of reviews) {
    // Count primary votes
    if (buckets[review.vote]) {
      buckets[review.vote].votes++;
      buckets[review.vote].voterIds.push(review.reviewerId);
    }

    // Count top-ranking (position 0 in the ranking array)
    const topRanked = review.ranking?.[0];
    if (topRanked && buckets[topRanked]) {
      buckets[topRanked].topRankings++;
    }

    // Collect numeric scores from detailedAnalysis
    for (const label of labels) {
      const analysis = review.detailedAnalysis?.[label];
      const score = typeof analysis?.score === "number" ? analysis.score : null;
      if (score !== null && buckets[label]) {
        buckets[label].rawScores.push(Math.max(1, Math.min(10, score))); // clamp 1-10
      }
    }

    // Count worst-submission penalties
    if (review.worstSubmission && buckets[review.worstSubmission]) {
      buckets[review.worstSubmission].worstVotes++;
      buckets[review.worstSubmission].worstVoterIds.push(review.reviewerId);
    }
  }

  // Compute avgScore and composite for each label
  const scores = labels.map((l) => {
    const b = buckets[l];
    b.avgScore =
      b.rawScores.length > 0
        ? b.rawScores.reduce((a, c) => a + c, 0) / b.rawScores.length
        : 5; // neutral default

    b.composite =
      b.votes * WEIGHT_VOTE +
      b.topRankings * WEIGHT_TOP_RANK +
      (b.avgScore / 10) * WEIGHT_AVG_SCORE -
      b.worstVotes * WEIGHT_WORST_PENALTY;

    return b;
  });

  // Sort descending by composite
  scores.sort((a, b) => b.composite - a.composite);

  const winner = scores[0];
  const tiebroken = scores.length >= 2 && scores[0].composite === scores[1].composite;

  return { scores, winner, tiebroken };
}

/**
 * Build a human-readable verdict explanation.
 * Explains WHY the winner won vs. specific competitors.
 * @param {SubmissionScore} winner
 * @param {SubmissionScore[]} allScores
 * @param {Array<{reviewerId: string, vote: string, reason: string, tradeoffs: string, detailedAnalysis: object}>} reviews
 * @param {Map<string, string>} revealMap - label → memberId
 * @param {object} memberMap - memberId → member config
 * @returns {object} verdictBreakdown
 */
export function buildVerdictBreakdown(winner, allScores, reviews, revealMap, memberMap) {
  const runnerUp = allScores[1];
  const last = allScores[allScores.length - 1];

  // Collect all reasoning given for the winner
  const winnerReasons = reviews
    .filter((r) => r.vote === winner.label)
    .map((r) => ({ reviewerId: r.reviewerId, reason: r.reason }));

  // Collect all critiques OF the winner (its weaknesses per reviewer)
  const winnerCritiques = reviews
    .map((r) => ({
      reviewerId: r.reviewerId,
      critique: r.detailedAnalysis?.[winner.label]?.weaknesses ?? null,
      score: r.detailedAnalysis?.[winner.label]?.score ?? null,
    }))
    .filter((r) => r.critique);

  // Collect tradeoffs from winner's voters
  const tradeoffs = reviews
    .filter((r) => r.vote === winner.label)
    .map((r) => r.tradeoffs)
    .filter(Boolean);

  // Per-submission breakdown with revealed identities
  const submissionBreakdowns = allScores.map((s) => {
    const memberId = revealMap?.get(s.label);
    const member = memberId ? memberMap[memberId] : null;
    const submissionReviews = reviews.map((r) => ({
      reviewerId: r.reviewerId,
      score: r.detailedAnalysis?.[s.label]?.score ?? null,
      strengths: r.detailedAnalysis?.[s.label]?.strengths ?? "",
      weaknesses: r.detailedAnalysis?.[s.label]?.weaknesses ?? "",
    }));

    return {
      label: s.label,
      memberId,
      memberName: member?.name ?? "Unknown",
      memberIcon: member?.icon ?? "?",
      memberColor: member?.color ?? "#888",
      votes: s.votes,
      composite: Math.round(s.composite * 100) / 100,
      avgScore: Math.round(s.avgScore * 10) / 10,
      worstVotes: s.worstVotes,
      reviews: submissionReviews,
    };
  });

  return {
    winner: {
      label: winner.label,
      memberId: revealMap?.get(winner.label),
      composite: Math.round(winner.composite * 100) / 100,
      votes: winner.votes,
      avgScore: Math.round(winner.avgScore * 10) / 10,
      reasons: winnerReasons,
      critiques: winnerCritiques,
      tradeoffs,
    },
    runnerUp: runnerUp ? {
      label: runnerUp.label,
      memberId: revealMap?.get(runnerUp.label),
      composite: Math.round(runnerUp.composite * 100) / 100,
      votes: runnerUp.votes,
      avgScore: Math.round(runnerUp.avgScore * 10) / 10,
    } : null,
    weakest: {
      label: last.label,
      memberId: revealMap?.get(last.label),
      worstVotes: last.worstVotes,
      avgScore: Math.round(last.avgScore * 10) / 10,
    },
    submissionBreakdowns,
    scoringMethod: `Composite = (votes × ${WEIGHT_VOTE}) + (top-rankings × ${WEIGHT_TOP_RANK}) + (avg-score/10 × ${WEIGHT_AVG_SCORE}) - (worst-votes × ${WEIGHT_WORST_PENALTY})`,
  };
}
