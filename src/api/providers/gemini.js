/**
 * gemini.js
 * Google Gemini API client for Council of LLMs.
 * Requires VITE_GOOGLE_AI_API_KEY in .env (or backend proxy).
 * Uses Gemini 2.5 Flash by default.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;
function newRequestId() {
  return `gemini_${Date.now()}_${++_reqCounter}`;
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
export async function callGemini({ system, user, temperature = 0.7, maxTokens = 1200, providerId = "gemini" }) {
  let apiKey = (typeof process !== 'undefined' ? process.env.GOOGLE_AI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY : import.meta.env?.VITE_GOOGLE_AI_API_KEY) ?? "";
  
  // Clean key: trim whitespace and remove potential quotes
  apiKey = apiKey ? apiKey.trim().replace(/^["'](.+)["']$/, '$1') : "";

  if (!apiKey) {
    throw new Error("Google AI API key not configured. Add GOOGLE_AI_API_KEY to .env");
  }

  const requestId = newRequestId();
  
  // Log first/last 3 chars for debugging (safely masked)
  if (typeof process !== 'undefined' && apiKey.length >= 6) {
    console.log(`[${requestId}] Using key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
  } else if (typeof process !== 'undefined' && apiKey) {
    console.log(`[${requestId}] Using key: (short key detected)`);
  }

  const model = (typeof process !== 'undefined' ? process.env.GOOGLE_AI_MODEL || process.env.VITE_GOOGLE_AI_MODEL : import.meta.env?.VITE_GOOGLE_AI_MODEL) ?? "gemini-2.0-flash";
  const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const contents = [
        { role: "user", parts: [{ text: `${system}\n\n${user}` }] },
      ];

      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        let errMsg = `Gemini API error ${response.status}`;
        try {
          const errData = await response.json();
          errMsg += `: ${errData.error?.message || JSON.stringify(errData)}`;
        } catch {
          const errText = await response.text();
          errMsg += `: ${errText}`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || typeof text !== "string") {
        throw new Error("Malformed Gemini response: missing text");
      }

      const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;

      return {
        text: text.trim(),
        requestId,
        tokensUsed,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All ${MAX_RETRIES} attempts failed for Gemini`);
}
