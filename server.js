/**
 * server.js
 * Secure backend proxy for Council of LLMs
 * 
 * CRITICAL: All API keys MUST stay server-side only.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key-change-this';

// ── AUTH MIDDLEWARE ────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required.' });
  }
};

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
  const logEntry = { timestamp, level, message, ...meta };
  console.log(JSON.stringify(logEntry));

  // Also log errors to DB
  if (level === 'error') {
    try {
      db.prepare('INSERT INTO system_logs (level, message, meta) VALUES (?, ?, ?)')
        .run(level, message, JSON.stringify(meta));
    } catch (err) {
      console.error('Failed to log to DB:', err.message);
    }
  }
}

function recordMetric({ providerId, latencyMs, tokensUsed, status, errorMessage = null }) {
  try {
    db.prepare(`
      INSERT INTO performance_metrics (provider_id, latency_ms, tokens_used, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(providerId, latencyMs, tokensUsed, status, errorMessage);
  } catch (err) {
    console.error('Failed to record metric:', err.message);
  }
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

app.post('/api/auth/register', [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { email, password } = req.body;

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    const role = userCount === 0 ? 'admin' : 'user';

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(email, hashedPassword, role);

    const token = jwt.sign({ id: result.lastInsertRowid, email, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user: { id: result.lastInsertRowid, email, role } });
  } catch (err) {
    log('error', 'Registration error', { error: err.message });
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').exists().withMessage('Password is required'),
], async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    log('error', 'Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
  try {
    const totalSessions = db.prepare('SELECT count(*) as count FROM deliberations').get().count;
    
    const acceptanceRates = db.prepare(`
      SELECT winner_id, count(*) as wins, 
      (count(*) * 100.0 / (SELECT count(*) FROM deliberations)) as rate
      FROM deliberations 
      GROUP BY winner_id
    `).all();

    const performanceByPurpose = db.prepare(`
      SELECT prompt_purpose, winner_id, count(*) as count
      FROM deliberations
      GROUP BY prompt_purpose, winner_id
    `).all();

    const providerMetrics = db.prepare(`
      SELECT provider_id, 
      AVG(latency_ms) as avgLatency, 
      AVG(tokens_used) as avgTokens,
      COUNT(CASE WHEN status = 'failure' THEN 1 END) as failureCount,
      COUNT(*) as totalCalls
      FROM performance_metrics
      GROUP BY provider_id
    `).all();

    const topUsers = db.prepare(`
      SELECT u.email, COUNT(d.id) as sessions
      FROM users u
      JOIN deliberations d ON u.id = d.user_id
      GROUP BY u.id
      ORDER BY sessions DESC
      LIMIT 5
    `).all();

    const recentFailures = db.prepare(`
      SELECT provider_id, error_message, created_at
      FROM performance_metrics
      WHERE status = 'failure'
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    res.json({
      totalSessions,
      acceptanceRates,
      performanceByPurpose,
      providerMetrics,
      topUsers,
      recentFailures
    });
  } catch (err) {
    log('error', 'Admin stats error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

app.post('/api/deliberations/record', authenticateToken, [
  body('purpose').isIn(['code', 'content', 'logical']).withMessage('Invalid purpose'),
  body('winnerId').isString().notEmpty(),
  body('providers').isArray(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { purpose, winnerId, providers } = req.body;
  try {
    db.prepare(`
      INSERT INTO deliberations (user_id, prompt_purpose, winner_id, all_providers)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, purpose, winnerId, JSON.stringify(providers));
    log('info', 'Deliberation recorded', { user: req.user.email, purpose, winner: winnerId });
    res.status(201).json({ status: 'recorded' });
  } catch (err) {
    log('error', 'Record deliberation error', { error: err.message });
    res.status(500).json({ error: 'Failed to record deliberation' });
  }
});

app.post('/api/generate', authenticateToken, validateGenerate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, providers = ['gemini', 'groq', 'openrouter'], temperature = 0.7 } = req.body;
  
  const sanitized = sanitizeInput(prompt);
  if (!sanitized.safe) {
    console.warn(`[SECURITY] Sanitizer blocked input. Reason: ${sanitized.reason}`);
    return res.status(400).json({ error: `Unsafe input detected: ${sanitized.reason}` });
  }

  const startTime = Date.now();
  log('info', 'Generation started', { providers, promptLength: prompt.length });

  try {
    const wrappedCall = async (providerId, fn) => {
      const callStart = Date.now();
      try {
        const result = await fn();
        recordMetric({
          providerId,
          latencyMs: Date.now() - callStart,
          tokensUsed: result.tokensUsed || 0,
          status: 'success'
        });
        return result;
      } catch (err) {
        recordMetric({
          providerId,
          latencyMs: Date.now() - callStart,
          tokensUsed: 0,
          status: 'failure',
          errorMessage: err.message
        });
        return { error: err.message, providerId };
      }
    };

    const calls = [];
    if (providers.includes('gemini') && process.env.GOOGLE_AI_API_KEY) {
      calls.push(wrappedCall('gemini', () => callGemini({
        system: 'You are a helpful assistant.',
        user: sanitized.cleaned,
        temperature,
        maxTokens: 2000,
        providerId: 'gemini',
      })));
    }
    if (providers.includes('groq') && process.env.GROQ_API_KEY) {
      calls.push(wrappedCall('groq', () => callGroq({
        system: 'You are a helpful assistant.',
        user: sanitized.cleaned,
        temperature,
        maxTokens: 2000,
        providerId: 'groq',
      })));
    }
    if (providers.includes('openrouter') && process.env.OPENROUTER_API_KEY) {
      calls.push(wrappedCall('openrouter', () => callOpenRouter({
        system: 'You are a helpful assistant.',
        user: sanitized.cleaned,
        temperature,
        maxTokens: 1200,
        providerId: 'openrouter',
      })));
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

// ── PRODUCTION STATIC SERVING ──────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD) {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));

  // Catch-all route to serve the React index.html for any frontend route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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
