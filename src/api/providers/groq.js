/**
 * groq.js
 * Groq API client - fast free inference.
 * Supports multimodal inputs (text + images via data URLs).
 * Default: Llama 3.3 70B Versatile. Override with GROQ_MODEL.
 */

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;
function newRequestId() {
  return `groq_${Date.now()}_${++_reqCounter}`;
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

/**
 * @param {object} params
 * @param {string} params.system
 * @param {string} params.user
 * @param {number} params.temperature
 * @param {number} params.maxTokens
 * @param {string} params.providerId
 * @param {Array<{base64: string, mimeType: string}>} [params.images]
 * @returns {Promise<{text: string, requestId: string, tokensUsed: number}>}
 */
export async function callGroq({ system, user, temperature = 0.7, maxTokens = 1200, providerId = "groq", images }) {
  const apiKey = (typeof process !== 'undefined' ? process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY : import.meta.env?.VITE_GROQ_API_KEY) ?? "";
  if (!apiKey) {
    throw new Error("Groq API key not configured. Add GROQ_API_KEY to .env");
  }

  const requestId = newRequestId();
  let model = (typeof process !== 'undefined' ? process.env.GROQ_MODEL || process.env.VITE_GROQ_MODEL : import.meta.env?.VITE_GROQ_MODEL) ?? "llama-3.3-70b-versatile";

  // Use vision-capable model if images are provided and current model doesn't support vision
  if (images && images.length > 0 && !model.includes('vision')) {
    model = "llama-3.2-90b-vision-preview";
    console.log(`[${requestId}] Switching to vision model: ${model}`);
  }

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
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages,
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (response.status === 429) {
        const wait = backoffMs(attempt);
        console.warn(`[${requestId}] Rate limited. Retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content || typeof content !== "string") {
        throw new Error("Malformed Groq response: missing content");
      }

      const tokensUsed = data.usage?.total_tokens ?? 0;

      return { text: content.trim(), requestId, tokensUsed };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Groq request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      if (attempt === MAX_RETRIES - 1) throw err;
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All ${MAX_RETRIES} attempts failed for Groq`);
}
