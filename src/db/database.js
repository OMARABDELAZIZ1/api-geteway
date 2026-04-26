/**
 * Database Module - Uses Node.js built-in SQLite (available since Node 22.5)
 * Falls back to in-memory store if SQLite not available
 */

let db;

function initDB() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(':memory:'); // Use file path like 'gateway.db' for persistence
    setupSchema(db);
    console.log('✓ SQLite database initialized');
    return db;
  } catch (e) {
    console.log('⚠ SQLite not available, using in-memory store:', e.message);
    return null;
  }
}

function setupSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      tier TEXT DEFAULT 'free',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT,
      rate_limit INTEGER DEFAULT 100,
      rate_window INTEGER DEFAULT 60,
      is_active INTEGER DEFAULT 1,
      last_used INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      api_key_id TEXT,
      user_id TEXT,
      ip_address TEXT NOT NULL,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status_code INTEGER,
      response_time INTEGER,
      user_agent TEXT,
      timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS rate_limit_violations (
      id TEXT PRIMARY KEY,
      api_key_id TEXT,
      ip_address TEXT,
      endpoint TEXT,
      timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_user ON request_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON request_logs(endpoint);
    CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash);
  `);
}

module.exports = { initDB };
