/**
 * openrouter.js
 * OpenRouter API — matches https://openrouter.ai/docs/quickstart
 * Supports multimodal inputs (text + images via data URLs).
 * Default: Qwen3 Coder 480B. Override with OPENROUTER_MODEL.
 */

const isServer = typeof process !== 'undefined' && process.env && !process.browser;
const API_URL = (isServer ? "https://openrouter.ai" : "/api/openrouter-proxy") + "/api/v1/chat/completions";

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;
function newRequestId() {
  return `openrouter_${Date.now()}_${++_reqCounter}`;
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
 * Build user message content with optional images (OpenAI vision format).
 * @param {string} text
 * @param {Array<{base64: string, mimeType: string}>} [images]
 * @returns {string|Array<object>}
 */
function buildUserContent(text, images) {
  if (!images || images.length === 0) return text;

  const contentParts = [];
  for (const img of images) {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }
  contentParts.push({ type: "text", text });
  return contentParts;
}

export async function callOpenRouter({
  system,
  user,
  temperature = 0.7,
  maxTokens = 1200,
  providerId = "openrouter",
  images,
}) {
  let apiKey = (typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY : import.meta.env?.VITE_OPENROUTER_API_KEY) ?? "";

  // Clean key
  apiKey = apiKey ? apiKey.trim().replace(/^["'](.+)["']$/, '$1') : "";

  if (!apiKey) {
    throw new Error("OpenRouter API key not configured. Add OPENROUTER_API_KEY to .env");
  }

  const requestId = newRequestId();

  // Log first/last 3 chars for debugging (safely masked)
  if (typeof process !== 'undefined' && apiKey.length >= 6) {
    console.log(`[${requestId}] Using key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
  }

  const model = (typeof process !== 'undefined' ? process.env.OPENROUTER_MODEL || process.env.VITE_OPENROUTER_MODEL : import.meta.env?.VITE_OPENROUTER_MODEL) ?? "qwen/qwen-2.5-72b-instruct";
  const siteUrl = typeof window !== "undefined" ? window.location.origin : (typeof process !== 'undefined' ? (process.env.FRONTEND_URL || "http://localhost:5173") : "https://localhost:5173");

  let lastErr = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const userContent = buildUserContent(user, images);
      const messages = [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ];

      const response = await fetchWithTimeout(
        API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": siteUrl,
            "X-Title": "Council of LLMs",
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (response.status === 429) {
        lastErr = new Error("Rate limited (429). Free tier: 20/min. Try again shortly.");
        if (attempt === MAX_RETRIES - 1) throw lastErr;
        const wait = backoffMs(attempt);
        console.warn(`[${requestId}] Rate limited. Retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = `OpenRouter API error ${response.status}: ${errBody}`;
        if (response.status === 401) errMsg = "OpenRouter: Invalid API key (401). Check OPENROUTER_API_KEY.";
        if (response.status === 402) errMsg = "OpenRouter: Credits exhausted (402). Check openrouter.ai/credits.";
        if (response.status === 404) errMsg = `OpenRouter: Model "${model}" not found (404). Try meta-llama/llama-3.2-3b-instruct:free`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string") {
        throw new Error("Malformed OpenRouter response: missing content");
      }

      return {
        text: content.trim(),
        requestId,
        tokensUsed: data.usage?.total_tokens ?? 0,
      };
    } catch (err) {
      lastErr = err;
      const msg = err.message || String(err);
      if (err.name === "AbortError") {
        throw new Error(`OpenRouter timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`OpenRouter failed: ${msg}`);
      }
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${msg}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  const lastMsg = lastErr?.message || "Unknown error";
  throw new Error(`OpenRouter failed: ${lastMsg}`);
}
