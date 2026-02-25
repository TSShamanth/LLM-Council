/**
 * server.js
 * Secure backend proxy for Council of LLMs
 * 
 * CRITICAL: All API keys MUST stay server-side only.
 * 
 * Endpoints:
 * - POST /api/auth/register, /api/auth/login, GET /api/auth/me
 * - POST /api/generate (multi-provider LLM calls)
 * - POST /api/deliberations/record
 * - GET /api/admin/stats
 * - GET/POST/DELETE /api/sessions (chat history CRUD)
 * - POST /api/upload (file upload with multer)
 * - GET /api/uploads/:filename (serve uploaded files)
 * - GET /api/health
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 30,
  message: { error: 'Too many requests. Please wait 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ── JWT SECRET (MANDATORY) ────────────────────────────────────────
// §3.1 #1 / §3.2: Never use a hardcoded fallback. Auto-generate if missing.
if (!process.env.JWT_SECRET) {
  const generated = crypto.randomBytes(64).toString('hex');
  const envPath = path.resolve(__dirname, '.env');
  try {
    fs.appendFileSync(envPath, `\nJWT_SECRET=${generated}\n`);
    console.warn('⚠️  JWT_SECRET was missing — generated and saved to .env');
  } catch {
    console.warn('⚠️  JWT_SECRET was missing — generated for this session (could not write to .env)');
  }
  process.env.JWT_SECRET = generated;
}
const JWT_SECRET = process.env.JWT_SECRET;

// ── ACCOUNT LOCKOUT (§3.3 #5) ─────────────────────────────────────
// In-memory tracker: 5 failed attempts = 15 minute lockout
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map(); // email → { count, lockedUntil }

function checkLoginLockout(email) {
  const record = loginAttempts.get(email);
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    return { locked: true, remainingMs };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(email); // Reset after lockout expires
    return { locked: false };
  }
  return { locked: false };
}

function recordFailedLogin(email) {
  const record = loginAttempts.get(email) || { count: 0, lockedUntil: null };
  record.count++;
  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    log('warn', 'Account locked due to failed login attempts', { email, lockoutMinutes: 15 });
  }
  loginAttempts.set(email, record);
}

function clearLoginAttempts(email) {
  loginAttempts.delete(email);
}

// ── PASSWORD POLICY (§3.3 #6) ─────────────────────────────────────
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null; // Valid
}

// ── API KEY LOG SANITIZATION (§3.3 #8) ────────────────────────────
function maskSecret(value) {
  if (!value || typeof value !== 'string' || value.length < 8) return '***';
  return value.substring(0, 4) + '...' + value.substring(value.length - 3);
}

// ── UPLOADS DIRECTORY ─────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed file types for upload
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'application/pdf',
  'text/javascript', 'text/typescript', 'text/html', 'text/css',
  'application/x-python', 'text/x-python',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_SESSION = 5;

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

// ── ENV VALIDATION (Phase 1: comprehensive startup check) ─────────
const ALL_PROVIDER_KEYS = [
  { key: 'GOOGLE_AI_API_KEY', name: 'Gemini' },
  { key: 'GROQ_API_KEY', name: 'Groq' },
  { key: 'OPENROUTER_API_KEY', name: 'OpenRouter' },
  { key: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
  { key: 'OPENAI_API_KEY', name: 'OpenAI' },
  { key: 'DEEPSEEK_API_KEY', name: 'DeepSeek' },
  { key: 'AZURE_OPENAI_API_KEY', name: 'Azure OpenAI' },
];

const enabledProviders = ALL_PROVIDER_KEYS.filter(p => !!process.env[p.key]);
const disabledProviders = ALL_PROVIDER_KEYS.filter(p => !process.env[p.key]);

console.log('\n┌──────────────────────────────────────────────┐');
console.log('│         COUNCIL OF LLMs — STARTUP            │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  JWT Secret:    ✅ Configured                 │`);
console.log(`│  Node Env:      ${(process.env.NODE_ENV || 'development').padEnd(29)}│`);
console.log(`│  Providers:     ${enabledProviders.length} enabled / ${disabledProviders.length} disabled${' '.repeat(Math.max(0, 13 - String(enabledProviders.length).length - String(disabledProviders.length).length))}│`);
for (const p of enabledProviders) {
  console.log(`│    ✅ ${p.name.padEnd(20)} ${maskSecret(process.env[p.key]).padEnd(16)}│`);
}
for (const p of disabledProviders) {
  console.log(`│    ⬚  ${p.name.padEnd(20)} not configured   │`);
}
console.log('└──────────────────────────────────────────────┘\n');

if (enabledProviders.length === 0) {
  console.error('❌ FATAL: No API keys configured. At least one provider must be enabled.');
  process.exit(1);
}

// ── LOGGING (§3.3 #8: sanitize secrets from logs) ─────────────────
const SENSITIVE_ENV_KEYS = [
  'GOOGLE_AI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY',
  'AZURE_OPENAI_API_KEY', 'JWT_SECRET',
];

function sanitizeLogMeta(meta) {
  const sanitized = { ...meta };
  // Remove stack traces in production
  if (process.env.NODE_ENV === 'production') {
    delete sanitized.stack;
  }
  // Mask any values that look like API keys
  const json = JSON.stringify(sanitized);
  let result = json;
  for (const envKey of SENSITIVE_ENV_KEYS) {
    const val = process.env[envKey];
    if (val && val.length > 8) {
      result = result.replaceAll(val, maskSecret(val));
    }
  }
  return JSON.parse(result);
}

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const safeMeta = sanitizeLogMeta(meta);
  const logEntry = { timestamp, level, message, ...safeMeta };
  console.log(JSON.stringify(logEntry));

  // Also log errors/warnings to DB
  if (level === 'error' || level === 'warn') {
    try {
      db.prepare('INSERT INTO system_logs (level, message, meta) VALUES (?, ?, ?)')
        .run(level, message, JSON.stringify(safeMeta));
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

// ═══════════════════════════════════════════════════════════════════
// ── AUTH ROUTES ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

app.post('/api/auth/register', [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').exists().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { email, password } = req.body;

  // §3.3 #6: Strong password policy
  const pwError = validatePasswordStrength(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    // §3.1 #4: Admin role via ADMIN_EMAIL env or first-user fallback
    let role = 'user';
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      // Explicit admin assignment via env var
      role = email.toLowerCase() === adminEmail.toLowerCase() ? 'admin' : 'user';
    } else {
      // Legacy fallback: first registered user becomes admin
      const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
      if (userCount === 0) {
        role = 'admin';
        log('warn', 'First user auto-admin — set ADMIN_EMAIL env var for explicit control', { email });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12); // Increased from 10 to 12 rounds
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
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { email, password } = req.body;

  // §3.3 #5: Account lockout check
  const lockout = checkLoginLockout(email);
  if (lockout.locked) {
    // Return same generic error to avoid revealing lockout status to attacker
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Success — clear any lockout tracking
    clearLoginAttempts(email);

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

// ═══════════════════════════════════════════════════════════════════
// ── ADMIN ROUTES ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// ── DELIBERATION ROUTES ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// ── CHAT SESSION ROUTES (DB-backed history) ───────────────────────
// ═══════════════════════════════════════════════════════════════════

/** GET /api/sessions — List all sessions for the authenticated user */
app.get('/api/sessions', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const offset = (page - 1) * limit;

  try {
    const total = db.prepare(
      'SELECT count(*) as count FROM chat_sessions WHERE user_id = ?'
    ).get(req.user.id).count;

    const sessions = db.prepare(`
      SELECT id, title, prompt, purpose, verdict_data, created_at
      FROM chat_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);

    res.json({ sessions, total, page, limit });
  } catch (err) {
    log('error', 'List sessions error', { error: err.message });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/** GET /api/sessions/:id — Get a full session with verdict + outputs */
app.get('/api/sessions/:id', authenticateToken, [
  param('id').isInt().toInt(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  try {
    const session = db.prepare(`
      SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Fetch attachments
    const attachments = db.prepare(
      'SELECT id, filename, original_name, mime_type, size_bytes, created_at FROM chat_attachments WHERE session_id = ?'
    ).all(session.id);

    res.json({ ...session, attachments });
  } catch (err) {
    log('error', 'Get session error', { error: err.message });
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/** POST /api/sessions — Save a new completed session */
app.post('/api/sessions', authenticateToken, [
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Title required (max 200 chars)'),
  body('prompt').isString().trim().isLength({ min: 1, max: 15000 }).withMessage('Prompt required'),
  body('purpose').optional().isIn(['code', 'content', 'logical']),
  body('verdictData').optional().isObject(),
  body('outputsData').optional().isArray(),
  body('attachments').optional().isArray(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { title, prompt, purpose, verdictData, outputsData, attachments } = req.body;

  try {
    // Serialize verdict and outputs, stripping the Map (revealMap) since it can't be serialized
    const verdictForStorage = verdictData ? { ...verdictData } : null;
    if (verdictForStorage) {
      delete verdictForStorage.revealMap; // Maps can't be JSON-serialized
    }

    const result = db.prepare(`
      INSERT INTO chat_sessions (user_id, title, prompt, purpose, verdict_data, outputs_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      title,
      prompt,
      purpose ?? 'content',
      verdictForStorage ? JSON.stringify(verdictForStorage) : null,
      outputsData ? JSON.stringify(outputsData) : null
    );

    const sessionId = result.lastInsertRowid;

    // Link attachments if provided
    if (attachments && attachments.length > 0) {
      const insertAttachment = db.prepare(`
        INSERT INTO chat_attachments (session_id, filename, original_name, mime_type, size_bytes)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const filename of attachments) {
        // Look up file info from uploads directory
        const filePath = path.join(UPLOADS_DIR, filename);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          insertAttachment.run(sessionId, filename, filename, null, stats.size);
        }
      }
    }

    log('info', 'Session saved', { user: req.user.email, sessionId });
    res.status(201).json({ id: sessionId, status: 'saved' });
  } catch (err) {
    log('error', 'Save session error', { error: err.message });
    res.status(500).json({ error: 'Failed to save session' });
  }
});

/** DELETE /api/sessions/:id — Delete a session and its attachments */
app.delete('/api/sessions/:id', authenticateToken, [
  param('id').isInt().toInt(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  try {
    // Verify ownership
    const session = db.prepare(
      'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Delete attachments files
    const attachments = db.prepare(
      'SELECT filename FROM chat_attachments WHERE session_id = ?'
    ).all(session.id);

    for (const att of attachments) {
      const filePath = path.join(UPLOADS_DIR, att.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from DB (cascades to chat_attachments)
    db.prepare('DELETE FROM chat_attachments WHERE session_id = ?').run(session.id);
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);

    log('info', 'Session deleted', { user: req.user.email, sessionId: session.id });
    res.json({ status: 'deleted' });
  } catch (err) {
    log('error', 'Delete session error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── FILE UPLOAD ROUTES ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/** POST /api/upload — Upload a file (manual multipart handling to avoid multer dep) */
app.post('/api/upload', authenticateToken, async (req, res) => {
  const contentType = req.headers['content-type'] || '';

  // Handle base64-encoded JSON upload (simpler alternative to multipart)
  if (contentType.includes('application/json')) {
    const { fileName, fileData, mimeType } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'fileName and fileData (base64) are required' });
    }

    // Validate mime type
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: `File type not allowed: ${mimeType}` });
    }

    // Validate file name (prevent path traversal)
    const sanitizedName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      const buffer = Buffer.from(fileData, 'base64');

      // Check file size
      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      // Generate unique filename
      const ext = path.extname(sanitizedName);
      const uniqueName = `${crypto.randomUUID()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, uniqueName);

      fs.writeFileSync(filePath, buffer);

      log('info', 'File uploaded', { user: req.user.email, filename: uniqueName, size: buffer.length });

      res.status(201).json({
        filename: uniqueName,
        originalName: sanitizedName,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
      });
    } catch (err) {
      log('error', 'File upload error', { error: err.message });
      res.status(500).json({ error: 'Failed to upload file' });
    }
  } else {
    res.status(400).json({ error: 'Send file as JSON with base64-encoded fileData' });
  }
});

/** GET /api/uploads/:filename — Serve uploaded files */
app.get('/api/uploads/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename); // Prevent path traversal
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

// ═══════════════════════════════════════════════════════════════════
// ── GENERATE ROUTE ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

app.post('/api/generate', authenticateToken, validateGenerate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, providers = ['gemini', 'groq', 'openrouter'], temperature = 0.7, images, system, maxTokens, skipSanitize } = req.body;

  // Use provided system prompt or default
  const systemPrompt = typeof system === 'string' && system.length > 0 ? system : 'You are a helpful assistant.';
  const effectiveMaxTokens = typeof maxTokens === 'number' ? Math.min(maxTokens, 8000) : 2000;

  // skipSanitize: used by internal judge/combination calls that need raw output
  const shouldSanitize = !skipSanitize;

  let cleanedPrompt = prompt;
  if (shouldSanitize) {
    const sanitized = sanitizeInput(prompt);
    if (!sanitized.safe) {
      console.warn(`[SECURITY] Sanitizer blocked input. Reason: ${sanitized.reason}`);
      return res.status(400).json({ error: `Unsafe input detected: ${sanitized.reason}` });
    }
    cleanedPrompt = sanitized.cleaned;
  }

  // Validate images if present (security: limit count and size)
  const validatedImages = [];
  if (images && Array.isArray(images)) {
    for (const img of images.slice(0, 5)) { // Max 5 images
      if (img.base64 && img.mimeType && img.mimeType.startsWith('image/')) {
        // Ensure base64 isn't absurdly large (max ~15MB decoded)
        if (img.base64.length <= 20_000_000) {
          validatedImages.push({ base64: img.base64, mimeType: img.mimeType });
        }
      }
    }
  }

  const hasImages = validatedImages.length > 0;
  const startTime = Date.now();
  log('info', 'Generation started', { providers, promptLength: prompt.length, imageCount: validatedImages.length });

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
        system: systemPrompt,
        user: cleanedPrompt,
        temperature,
        maxTokens: effectiveMaxTokens,
        providerId: 'gemini',
        images: hasImages ? validatedImages : undefined,
      })));
    }
    if (providers.includes('groq') && process.env.GROQ_API_KEY) {
      calls.push(wrappedCall('groq', () => callGroq({
        system: systemPrompt,
        user: cleanedPrompt,
        temperature,
        maxTokens: effectiveMaxTokens,
        providerId: 'groq',
        images: hasImages ? validatedImages : undefined,
      })));
    }
    if (providers.includes('openrouter') && process.env.OPENROUTER_API_KEY) {
      calls.push(wrappedCall('openrouter', () => callOpenRouter({
        system: systemPrompt,
        user: cleanedPrompt,
        temperature,
        maxTokens: effectiveMaxTokens,
        providerId: 'openrouter',
        images: hasImages ? validatedImages : undefined,
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

    const outputList = successes.map(r => ({
      ...r,
      text: shouldSanitize ? sanitizeOutput(r.text).cleaned : r.text,
    }));

    const elapsed = Date.now() - startTime;
    res.json({
      outputs: outputList,
      failures: failures.map(f => ({ provider: f.providerId, error: f.error })),
      metadata: { elapsedMs: elapsed, providersQueried: providers.length },
    });
  } catch (err) {
    log('error', 'Generation error', { error: err.message, stack: err.stack });
    // §3.1 #3: Never expose internal details to client
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── HEALTH & STATIC SERVING ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

const serverStartTime = Date.now();

app.get('/api/health', (req, res) => {
  // Phase 1: Enhanced health endpoint with DB, uptime, memory
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch { /* DB unreachable */ }

  const mem = process.memoryUsage();
  const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSec,
      human: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
    },
    database: dbOk ? 'connected' : 'unreachable',
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    providers: Object.fromEntries(
      ALL_PROVIDER_KEYS.map(p => [p.name.toLowerCase().replace(/\s+/g, '_'), !!process.env[p.key]])
    ),
    enabledCount: enabledProviders.length,
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
  // §3.1 #3: Never expose stack traces or internal paths to clients
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { detail: err.message }), // Only in development
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
