/**
 * councilConfig.js
 * Defines LLM providers: Gemini, Groq, OpenRouter, DeepSeek (free/open models).
 *
 * Your prompt is sent to ALL enabled providers. Outputs are anonymized,
 * then judged by a separate evaluation to pick the best response.
 *
 * Security notes:
 * - providerId is NEVER sent to any LLM (used only client-side)
 * - Identity redaction applied before judge sees outputs
 */

export const PROVIDERS = [
  {
    id: "gemini",
    name: "Gemini",
    icon: "◇",
    color: "#4285F4",
    accentDark: "rgba(66,133,244,0.12)",
  },
  {
    id: "groq",
    name: "Groq",
    icon: "◈",
    color: "#FF6B35",
    accentDark: "rgba(255,107,53,0.12)",
  },
  { id: "openrouter", name: "OpenRouter", icon: "⬡", color: "#00D9FF", accentDark: "rgba(0,217,255,0.12)" },
  // { id: "deepseek", name: "DeepSeek", icon: "◆", color: "#10B981", accentDark: "rgba(16,185,129,0.12)" },
];

/** Map for O(1) lookup by id */
export const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Labels used for anonymization — must be >= number of providers */
export const ANONYMOUS_LABELS = [
  "Submission Alpha",
  "Submission Beta",
  "Submission Gamma",
  "Submission Delta",
  "Submission Epsilon",
];

/** Neutral system prompt for generation — same for all providers (ensures comparable outputs) */
export const GENERATION_SYSTEM_PROMPT = `You are a helpful assistant. Respond to the user's query clearly and thoroughly.
Do NOT mention your identity, model name, or that you are an AI.
Focus on providing the best possible answer to the user's question.`;
