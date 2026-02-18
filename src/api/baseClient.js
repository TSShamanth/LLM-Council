/**
 * baseClient.js
 * Shared HTTP client logic for all API providers.
 * Eliminates duplication across gemini.js, groq.js, openrouter.js.
 */

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

let _reqCounter = 0;

/**
 * Generate unique request ID for logging/debugging.
 * @param {string} provider - 'gemini', 'groq', 'openrouter'
 * @returns {string}
 */
export function newRequestId(provider) {
  return `${provider}_${Date.now()}_${++_reqCounter}`;
}

/**
 * Exponential backoff with jitter.
 * @param {number} attempt - Retry attempt number (0-indexed)
 * @returns {number} Milliseconds to wait
 */
export function backoffMs(attempt) {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.min(base + jitter, 30_000);
}

/**
 * Fetch with timeout using AbortController.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
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
 * Retry wrapper with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Max retry attempts (default: 3)
 * @param {string} requestId - For logging
 * @returns {Promise<any>}
 */
export async function withRetry(fn, maxRetries = MAX_RETRIES, requestId = 'unknown') {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      
      // Don't retry on timeout or client errors
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      
      // Don't retry on auth errors (401, 403)
      if (err.message?.includes('401') || err.message?.includes('403')) {
        throw err;
      }
      
      // Last attempt — give up
      if (attempt === maxRetries - 1) {
        throw err;
      }
      
      // Retry with backoff
      const wait = backoffMs(attempt);
      console.warn(`[${requestId}] Attempt ${attempt + 1}/${maxRetries} failed: ${err.message}. Retrying in ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  
  throw lastError;
}

/**
 * Parse JSON response with graceful fallback.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function parseJSON(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Attempt to extract JSON from markdown code blocks
    const match = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        throw new Error('Malformed JSON in response');
      }
    }
    throw new Error('Response is not valid JSON');
  }
}

/**
 * Standard error messages for common HTTP status codes.
 * @param {number} status
 * @param {string} provider
 * @param {string} body
 * @returns {string}
 */
export function getErrorMessage(status, provider, body) {
  switch (status) {
    case 401:
      return `${provider}: Invalid API key (401). Check environment variable.`;
    case 402:
      return `${provider}: Payment required (402). Check your credits/billing.`;
    case 403:
      return `${provider}: Forbidden (403). API key may lack permissions.`;
    case 404:
      return `${provider}: Model not found (404). Check model name in config.`;
    case 429:
      return `${provider}: Rate limited (429). Too many requests.`;
    case 500:
    case 502:
    case 503:
      return `${provider}: Server error (${status}). Try again later.`;
    default:
      return `${provider}: HTTP ${status} - ${body.substring(0, 200)}`;
  }
}

export { REQUEST_TIMEOUT_MS, MAX_RETRIES };
