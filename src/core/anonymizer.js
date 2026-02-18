/**
 * anonymizer.js
 * Provides cryptographically-seeded anonymization of LLM outputs.
 *
 * Why this matters:
 * - Predictable shuffle order (Math.random) could be gamed if someone
 *   knows the seed. We use crypto.getRandomValues for true entropy.
 * - Output labels are content-neutral (no "fastest", "best", etc.)
 * - The mapping is stored in memory ONLY — never serialized or logged.
 * - Mapping is ONE-WAY until the reveal phase is explicitly triggered.
 */

import { ANONYMOUS_LABELS } from "./councilConfig.js";

/**
 * Cryptographically random integer in [0, max)
 * Uses Uint32Array to avoid modulo bias on small ranges.
 */
function cryptoRandInt(max) {
  if (max <= 0) throw new Error("max must be positive");
  const limit = Math.floor(0x100000000 / max) * max;
  let r;
  do {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    r = arr[0];
  } while (r >= limit);
  return r % max;
}

/**
 * Fisher-Yates shuffle using cryptographic entropy.
 * @template T
 * @param {T[]} arr
 * @returns {T[]} New shuffled array (original untouched)
 */
function cryptoShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Anonymize a set of outputs.
 * @param {Array<{memberId: string, content: string, requestId: string}>} outputs
 * @returns {{
 *   anonymized: Array<{label: string, content: string}>,
 *   revealMap: Map<string, string>   // label → memberId (kept secret until reveal)
 * }}
 */
export function anonymizeOutputs(outputs) {
  if (outputs.length > ANONYMOUS_LABELS.length) {
    throw new Error(`Cannot anonymize more than ${ANONYMOUS_LABELS.length} outputs`);
  }

  const shuffled = cryptoShuffle(outputs);
  const revealMap = new Map(); // label → memberId

  const anonymized = shuffled.map((output, idx) => {
    const label = ANONYMOUS_LABELS[idx];
    revealMap.set(label, output.memberId);
    return {
      label,
      content: output.content,          // Already sanitized upstream
      // memberId is intentionally OMITTED here
    };
  });

  return { anonymized, revealMap };
}

/**
 * Reveal the true identity behind each label.
 * Only called after all votes are cast.
 * @param {Map<string, string>} revealMap - label → memberId
 * @param {string} label
 * @returns {string} memberId
 */
export function revealIdentity(revealMap, label) {
  const memberId = revealMap.get(label);
  if (!memberId) throw new Error(`Unknown label: ${label}`);
  return memberId;
}

/**
 * Reveal all at once for the results screen.
 * @param {Map<string, string>} revealMap
 * @returns {Array<{label: string, memberId: string}>}
 */
export function revealAll(revealMap) {
  return Array.from(revealMap.entries()).map(([label, memberId]) => ({ label, memberId }));
}
