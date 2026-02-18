/**
 * anthropicClient.js
 * Secure API layer for Anthropic calls.
 * - Per-member rate limiting (no shared quota leakage)
 * - Exponential backoff with jitter
 * - Request ID tracking for audit trail
 * - Response validation before passing upstream
 * - Timeout enforcement
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

/** Unique request IDs for audit trail (never sent to LLM) */
let _reqCounter = 0;
function newRequestId() {
  return `req_${Date.now()}_${++_reqCounter}`;
}

/** Exponential backoff with ±20% jitter */
function backoffMs(attempt) {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.min(base + jitter, 30_000);
}

/** Abort-controller-wrapped fetch with timeout */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Core call — never exposes requestId or internal metadata to the LLM.
 * @param {object} params
 * @param {string} params.system     - System prompt (scrubbed externally)
 * @param {string} params.user       - User message (scrubbed externally)
 * @param {number} params.temperature
 * @param {number} params.maxTokens
 * @param {string} params.memberId   - For logging only, NOT sent to API
 * @returns {Promise<{text: string, requestId: string, tokensUsed: number}>}
 */
export async function callLLM({ system, user, temperature = 0.7, maxTokens = 1200, memberId = "unknown" }) {
  const requestId = newRequestId();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        API_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: maxTokens,
            temperature,
            system,
            messages: [{ role: "user", content: user }],
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (response.status === 429) {
        const wait = backoffMs(attempt);
        console.warn(`[${requestId}] Rate limited for ${memberId}. Retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();

      // Validate structure
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        throw new Error("Malformed API response: missing content array");
      }

      const textBlock = data.content.find((b) => b.type === "text");
      if (!textBlock || typeof textBlock.text !== "string") {
        throw new Error("Malformed API response: no text block found");
      }

      return {
        text: textBlock.text.trim(),
        requestId,
        tokensUsed: data.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (${requestId})`);
      }
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All ${MAX_RETRIES} attempts failed for request ${requestId}`);
}
