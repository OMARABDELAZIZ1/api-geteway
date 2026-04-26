/**
 * API Key Utilities
 * Handles generation, hashing, and validation of API keys
 */

const crypto = require('crypto');

const KEY_PREFIX = 'gw_live_';
const KEY_LENGTH = 32; // bytes → 64 hex chars

/**
 * Generate a new API key
 * Format: gw_live_<random_hex>
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(KEY_LENGTH);
  const keyBody = randomBytes.toString('hex');
  return `${KEY_PREFIX}${keyBody}`;
}

/**
 * Hash an API key for storage (one-way)
 * We store the hash, never the raw key
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Extract a safe display prefix from the key (for UI display)
 * e.g., "gw_live_ab12..." → "gw_live_ab12"
 */
function getKeyPrefix(key) {
  return key.substring(0, 16) + '...';
}

/**
 * Validate API key format
 */
function isValidKeyFormat(key) {
  return typeof key === 'string' &&
    key.startsWith(KEY_PREFIX) &&
    key.length === KEY_PREFIX.length + KEY_LENGTH * 2;
}

/**
 * Extract API key from request
 * Supports: Bearer token, X-API-Key header, ?api_key query param
 */
function extractApiKey(req) {
  // Authorization: Bearer <key>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // X-API-Key: <key>
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    return apiKeyHeader.trim();
  }

  // ?api_key=<key>
  if (req.query && req.query.api_key) {
    return req.query.api_key.trim();
  }

  return null;
}

/**
 * Generate a secure random token (for session tokens, etc.)
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Simple password hashing (in production use bcrypt)
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.createHash('sha256').update(salt + password).digest('hex');
  return check === hash;
}

module.exports = {
  generateApiKey,
  hashApiKey,
  getKeyPrefix,
  isValidKeyFormat,
  extractApiKey,
  generateToken,
  hashPassword,
  verifyPassword,
};
