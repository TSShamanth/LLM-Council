/**
 * server.js
 * Secure backend proxy for Council of LLMs
 * 
 * CRITICAL: All API keys MUST stay server-side only.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

// Import providers (using correct paths)
import { callGemini } from './src/api/providers/gemini.js';
import { callGroq } from './src/api/providers/groq.js';
import { callOpenRouter } from './src/api/providers/openrouter.js';
import { sanitizeInput, sanitizeOutput } from './src/core/sanitizer.js';

const app = express();

// ── SECURITY MIDDLEWARE ────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please wait 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ── ENV VALIDATION ─────────────────────────────────────────────────
const REQUIRED_ENV = ['GOOGLE_AI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'];
const missingKeys = REQUIRED_ENV.filter(key => !process.env[key]);

if (missingKeys.length === REQUIRED_ENV.length) {
  console.error(`❌ FATAL: Missing ALL API keys in .env file. At least one of ${REQUIRED_ENV.join(', ')} is required.`);
  // We don't exit here to allow the dev to see the error in the console and fix it
} else if (missingKeys.length > 0) {
  console.warn(`⚠️ Warning: Missing API keys: ${missingKeys.join(', ')}. Some providers will be disabled.`);
}

// ── LOGGING ────────────────────────────────────────────────────────
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, message, ...meta }));
}

// ── VALIDATION MIDDLEWARE ──────────────────────────────────────────
const validateGenerate = [
  body('prompt')
    .isString()
    .trim()
    .isLength({ min: 1, max: 15000 })
    .withMessage('Prompt must be 1-15000 characters'),
  body('providers')
    .optional()
    .isArray()
    .custom((arr) => arr.every(p => ['gemini', 'groq', 'openrouter'].includes(p)))
    .withMessage('Invalid provider list'),
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be 0-2'),
];

// ── ROUTES ─────────────────────────────────────────────────────────

app.post('/api/generate', validateGenerate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, providers = ['gemini', 'groq', 'openrouter'], temperature = 0.7 } = req.body;
  
  const sanitized = sanitizeInput(prompt);
  if (!sanitized.safe) {
    return res.status(400).json({ error: `Unsafe input detected: ${sanitized.reason}` });
  }

  const startTime = Date.now();
  log('info', 'Generation started', { providers, promptLength: prompt.length });

  try {
    const calls = [];
    if (providers.includes('gemini') && process.env.GOOGLE_AI_API_KEY) {
      calls.push(
        callGemini({
          system: 'You are a helpful assistant.',
          user: sanitized.cleaned,
          temperature,
          maxTokens: 2000,
          providerId: 'gemini',
        }).catch(err => ({ error: err.message, providerId: 'gemini' }))
      );
    }
    if (providers.includes('groq') && process.env.GROQ_API_KEY) {
      calls.push(
        callGroq({
          system: 'You are a helpful assistant.',
          user: sanitized.cleaned,
          temperature,
          maxTokens: 2000,
          providerId: 'groq',
        }).catch(err => ({ error: err.message, providerId: 'groq' }))
      );
    }
    if (providers.includes('openrouter') && process.env.OPENROUTER_API_KEY) {
      calls.push(
        callOpenRouter({
          system: 'You are a helpful assistant.',
          user: sanitized.cleaned,
          temperature,
          maxTokens: 1200,
          providerId: 'openrouter',
        }).catch(err => ({ error: err.message, providerId: 'openrouter' }))
      );
    }

    const results = await Promise.all(calls);
    const successes = results.filter(r => !r.error);
    const failures = results.filter(r => r.error);

    if (successes.length === 0 && providers.length > 0) {
      return res.status(503).json({
        error: 'All requested providers failed or are not configured',
        details: failures.map(f => ({ provider: f.providerId, error: f.error }))
      });
    }

    const sanitizedOutputs = successes.map(r => ({
      ...r,
      text: sanitizeOutput(r.text).cleaned,
    }));

    const elapsed = Date.now() - startTime;
    res.json({
      outputs: sanitizedOutputs,
      failures: failures.map(f => ({ provider: f.providerId, error: f.error })),
      metadata: { elapsedMs: elapsed, providersQueried: providers.length },
    });
  } catch (err) {
    log('error', 'Generation error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    providers: {
      gemini: !!process.env.GOOGLE_AI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server running on http://127.0.0.1:${PORT}`);
});
