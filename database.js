/**
 * database.js
 * Local SQLite database for user authentication
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, 'council.db');

const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deliberations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    prompt_purpose TEXT, -- 'code', 'content', 'logical'
    winner_id TEXT,
    all_providers TEXT, -- JSON array of provider IDs
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT, -- 'error', 'warn', 'info'
    message TEXT,
    meta TEXT, -- JSON string for additional context (e.g., stack trace, provider ID)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT,
    latency_ms INTEGER,
    tokens_used INTEGER,
    status TEXT, -- 'success', 'failure'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
