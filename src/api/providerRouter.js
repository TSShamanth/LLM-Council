/**
 * providerRouter.js
 * All LLM calls are routed through the Spring Boot backend.
 *
 * Architecture:
 *   Frontend (React/Vite) → Spring Boot Backend (/api/generate) → LLM APIs
 *
 * No API keys are exposed in the browser.
 */

const API_BASE = "/api";

/**
 * Get the auth token from localStorage.
 */
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Call a single provider through the backend.
 * @param {string} providerId - e.g. "gemini", "groq", "qwen"
 * @param {object} params - { system, user, temperature, maxTokens }
 * @returns {Promise<{ text: string, requestId: string, tokensUsed: number }>}
 */
export async function callProvider(providerId, params) {
  const result = await generateFromProviders({
    ...params,
    prompt: params.user,
    providers: [providerId],
  });

  if (result.outputs.length === 0) {
    const failure = result.failures[0];
    throw new Error(failure?.error || `Provider ${providerId} failed`);
  }

  return {
    text: result.outputs[0].text,
    requestId: result.outputs[0].requestId,
    tokensUsed: result.outputs[0].tokensUsed || 0,
  };
}

/**
 * Generate from providers via the backend /api/generate endpoint.
 */
export async function generateFromProviders({
  prompt,
  user,
  system,
  providers,
  temperature = 0.7,
  maxTokens = 2000,
  images,
}) {
  const actualPrompt = prompt || user;
  if (!actualPrompt) {
    throw new Error("No prompt provided");
  }

  try {
    const response = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt: actualPrompt,
        systemPrompt: system || undefined,
        providers: providers || undefined,
        temperature,
        maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Backend error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    return {
      outputs: (data.outputs || []).map((o) => ({
        text: o.text,
        requestId: o.requestId,
        tokensUsed: o.tokensUsed || 0,
        providerId: o.providerId,
      })),
      failures: data.failures || [],
      metadata: data.metadata || { elapsedMs: 0, providersQueried: 0 },
    };
  } catch (err) {
    if (err.message.startsWith("Backend error")) throw err;
    throw new Error(`Network error calling backend: ${err.message}`);
  }
}

/**
 * Get list of enabled providers from the backend health endpoint.
 */
export async function getEnabledProviders() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      console.warn("Health endpoint failed, returning all providers as fallback");
      return ["qwen", "gemini", "groq", "minimax", "deepseek", "moonshot"];
    }

    const data = await response.json();
    const providers = data.providers || {};

    // Return only provider IDs where value is true (enabled)
    return Object.entries(providers)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
  } catch (err) {
    console.warn("Failed to fetch enabled providers:", err);
    return ["qwen", "gemini", "groq", "minimax", "deepseek", "moonshot"];
  }
}
