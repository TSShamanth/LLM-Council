/**
 * openai.js
 * OpenAI API client for Council of LLMs.
 * Uses GPT-4o for generation.
 * Requires VITE_OPENAI_API_KEY in .env (or backend proxy).
 */

const API_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;
function newRequestId() {
  return `openai_${Date.now()}_${++_reqCounter}`;
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
export async function callOpenAI({ system, user, temperature = 0.7, maxTokens = 1200, providerId = "openai" }) {
  const apiKey = import.meta.env?.VITE_OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Add VITE_OPENAI_API_KEY to .env");
  }

  const requestId = newRequestId();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const messages = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];

      const response = await fetchWithTimeout(
        API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: maxTokens,
            temperature,
            messages,
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
        throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const content = choice?.message?.content;

      if (!content || typeof content !== "string") {
        throw new Error("Malformed OpenAI response: missing content");
      }

      const tokensUsed = data.usage?.total_tokens ?? 0;

      return {
        text: content.trim(),
        requestId,
        tokensUsed,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All ${MAX_RETRIES} attempts failed for OpenAI`);
}
