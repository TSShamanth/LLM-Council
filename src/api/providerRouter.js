/**
 * providerRouter.js
 * Client-side API wrapper that calls the secure backend proxy.
 * 
 * CRITICAL: Never import gemini.js, groq.js, or openrouter.js directly in the client.
 * All API calls MUST go through the backend at /api/generate to protect API keys.
 */

const API_BASE = '/api'; // Proxied to localhost:3001 in dev (see vite.config.js)

/**
 * Call the backend /api/generate endpoint.
 * @param {object} params
 * @param {string} params.prompt - User prompt
 * @param {string[]} [params.providers] - Which providers to call (default: all)
 * @param {number} [params.temperature] - LLM temperature 0-2 (default: 0.7)
 * @param {Array<{base64: string, mimeType: string}>} [params.images] - Images to send
 * @returns {Promise<{
 *   outputs: Array<{text: string, requestId: string, tokensUsed: number, providerId: string}>,
 *   failures: Array<{provider: string, error: string}>,
 *   metadata: {elapsedMs: number, providersQueried: number}
 * }>}
 */
export async function generateFromProviders({
  prompt,
  user,
  system,
  providers = ['gemini', 'groq', 'openrouter'],
  temperature = 0.7,
  maxTokens,
  images,
  skipSanitize,
}) {
  const actualPrompt = prompt || user;
  if (!actualPrompt) {
    console.error('generateFromProviders: No prompt/user provided', { prompt, user });
    throw new Error('No prompt provided');
  }

  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      prompt: actualPrompt,
      providers,
      temperature,
      images,          // Forward images to backend
      system,          // Forward custom system prompt (judge uses this)
      maxTokens,       // Forward custom max tokens (judge needs 5000+)
      skipSanitize,    // Skip sanitization for internal calls (judge/combo)
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get list of enabled providers (those with API keys on the server).
 * @returns {Promise<string[]>}
 */
export async function getEnabledProviders() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    return Object.keys(data.providers).filter(p => data.providers[p]);
  } catch {
    return ['gemini', 'groq', 'openrouter']; // Assume all enabled if health check fails
  }
}

/**
 * Call a specific provider (used by judge/deliberation for targeted calls).
 * Reusable: passes arbitrary params through to generateFromProviders.
 * @param {string} providerId - 'gemini', 'groq', or 'openrouter'
 * @param {object} params - Same as generateFromProviders
 * @returns {Promise<{text: string, requestId: string, tokensUsed: number}>}
 */
export async function callProvider(providerId, params) {
  const result = await generateFromProviders({
    ...params,
    providers: [providerId]
  });

  if (result.outputs.length === 0) {
    const failure = result.failures[0];
    throw new Error(failure?.error || 'Provider failed');
  }

  return result.outputs[0];
}
