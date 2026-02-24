/**
 * sanitizer.js
 * Input/output sanitization to prevent XSS, injection, and malicious prompts.
 * 
 * Sanitization layers:
 * 1. Input: User prompts before sending to LLMs
 * 2. Output: LLM responses before displaying to users
 * 3. Prompt injection detection
 */

// Forbidden phrases that indicate self-identification in reviews
export const FORBIDDEN_REVIEWER_PHRASES = [
  'I wrote',
  'I created',
  'I generated',
  'my output',
  'my solution',
  'my response',
  'this is mine',
  'I recognize',
];

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore (all )?previous (instructions|prompts)/i,
  /forget (all )?previous (instructions|context)/i,
  /you are now/i,
  /new (instruction|directive|system prompt)/i,
  /disregard (all )?(previous|above)/i,
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /<iframe/gi,
];

// HTML/script patterns that indicate XSS attempts
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe/gi,
  /javascript:/gi,
  /<embed/gi,
  /<object/gi,
];

// Patterns that indicate the LLM is revealing its identity
const IDENTITY_LEAK_PATTERNS = [
  /\b(as an? (AI|language model|LLM|assistant|claude|gpt|gemini))\b/gi,
  /\b(I('m| am) (claude|gpt|an AI|an artificial intelligence))\b/gi,
  /\b(my (approach|solution|answer) (is|provides?|offers?))\b/gi,
  /\b(I (believe|think) (my|this) (solution|approach))\b/gi,
  /\bclaude[\s-]*(sonnet|opus|haiku)/gi,
  /\bgpt-?[0-4]/gi,
  /\bgemini-?[0-2]/gi,
];

/**
 * Sanitize user input before sending to LLMs.
 * @param {string} input - Raw user prompt
 * @returns {{ sanitized: string, warnings: string[] }}
 */
export function sanitizePrompt(input) {
  const result = sanitizeInput(input);
  return {
    sanitized: result.cleaned,
    warnings: result.safe ? [] : [result.reason]
  };
}

/**
 * Sanitize user input before sending to LLMs.
 * @param {string} input - Raw user prompt
 * @returns {{ safe: boolean, cleaned: string, reason?: string }}
 */
export function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return { safe: false, reason: 'Input must be a non-empty string' };
  }

  // Length check (increased for Judge comparisons)
  if (input.length > 15000) {
    return { safe: false, reason: 'Input exceeds 15,000 character limit' };
  }

  // Check for prompt injection attempts
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { 
        safe: false, 
        reason: `Potential prompt injection detected: "${input.match(pattern)?.[0]}"` 
      };
    }
  }

  // Strip HTML tags (but allow markdown-like formatting)
  let cleaned = input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '');

  // Normalize whitespace
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  return { safe: true, cleaned };
}

/**
 * Sanitize LLM output before displaying to users.
 * @param {string} output - Raw LLM response
 * @returns {{ cleaned: string, sanitized: string, flaggedPatterns: string[], hadXSS: boolean }}
 */
export function sanitizeOutput(output) {
  if (!output || typeof output !== 'string') {
    return { cleaned: '', sanitized: '', flaggedPatterns: [], hadXSS: false };
  }

  let cleaned = output;
  let hadXSS = false;
  const flaggedPatterns = [];

  // 1. Remove XSS patterns
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(cleaned)) {
      hadXSS = true;
      flaggedPatterns.push('XSS_DETECTED');
      cleaned = cleaned.replace(pattern, '[REMOVED]');
    }
  }

  // 2. Redact identity leaks
  for (const pattern of IDENTITY_LEAK_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches) {
      flaggedPatterns.push(...matches);
      cleaned = cleaned.replace(pattern, '[REDACTED]');
    }
  }

  return { 
    cleaned: cleaned.trim(), 
    sanitized: cleaned.trim(), // Alias for frontend
    flaggedPatterns, 
    hadXSS 
  };
}

/**
 * Sanitize reviewer reasoning to remove self-referential language.
 * @param {string} text - Reviewer's reason/analysis
 * @returns {{ cleaned: string, redactions: number }}
 */
export function sanitizeReviewerText(text) {
  if (!text) return { cleaned: '', redactions: 0 };

  let cleaned = text;
  let redactions = 0;

  for (const phrase of FORBIDDEN_REVIEWER_PHRASES) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    if (regex.test(cleaned)) {
      redactions++;
      cleaned = cleaned.replace(regex, '[REDACTED]');
    }
  }

  return { cleaned, redactions };
}

/**
 * Validate that an object matches expected schema.
 * Used for validating LLM JSON responses.
 * @param {object} obj - Object to validate
 * @param {string[]} requiredFields - Required field names
 * @returns {{ valid: boolean, missing?: string[] }}
 */
export function validateSchema(obj, requiredFields) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, missing: requiredFields };
  }

  const missing = requiredFields.filter(f => !(f in obj));
  return { valid: missing.length === 0, missing };
}
