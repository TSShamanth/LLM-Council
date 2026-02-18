/**
 * anthropic.js
 * Anthropic Claude API client for Council of LLMs.
 * Requires VITE_ANTHROPIC_API_KEY in .env (or backend proxy).
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;
function newRequestId() {
  return `anthropic_${Date.now()}_${++_reqCounter}`;
}

function backoffMs(attempt) {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.min(base + jitter, 30_000);
}

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
 * @param {object} params
 * @param {string} params.system
 * @param {string} params.user
 * @param {number} params.temperature
 * @param {number} params.maxTokens
 * @param {string} params.providerId
 * @returns {Promise<{text: string, requestId: string, tokensUsed: number}>}
 */
export async function callAnthropic({ system, user, temperature = 0.7, maxTokens = 1200, providerId = "anthropic" }) {
  const apiKey = import.meta.env?.VITE_ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Anthropic API key not configured. Add VITE_ANTHROPIC_API_KEY to .env");
  }

  const requestId = newRequestId();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
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
        console.warn(`[${requestId}] Rate limited for ${providerId}. Retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((b) => b.type === "text");

      if (!textBlock || typeof textBlock.text !== "string") {
        throw new Error("Malformed Anthropic response: no text block found");
      }

      const tokensUsed = data.usage?.output_tokens ?? 0;

      return {
        text: textBlock.text.trim(),
        requestId,
        tokensUsed,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Anthropic request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All ${MAX_RETRIES} attempts failed for Anthropic`);
}
