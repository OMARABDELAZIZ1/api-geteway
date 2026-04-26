/**
 * Authentication Middleware
 * Validates API keys and attaches user/key context to request
 */

const store = require('../db/store');
const { extractApiKey, hashApiKey } = require('../utils/keyUtils');
const { getClientIp } = require('./rateLimiter');
const { v4: uuidv4 } = require('../utils/uuid');

/**
 * Authenticate request using API key
 * Attaches req.apiKey and req.user if valid
 */
function authenticate(req, res, next) {
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'MISSING_API_KEY',
      message: 'Provide your API key via Authorization: Bearer <key>, X-API-Key header, or ?api_key query param',
    });
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = store.getApiKeyByHash(keyHash);

  if (!apiKey) {
    return res.status(401).json({
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
      message: 'The provided API key does not exist or has been revoked',
    });
  }

  if (!apiKey.is_active) {
    return res.status(401).json({
      error: 'API key disabled',
      code: 'KEY_DISABLED',
      message: 'This API key has been deactivated',
    });
  }

  const user = store.getUserById(apiKey.user_id);
  if (!user) {
    return res.status(401).json({
      error: 'User not found',
      code: 'USER_NOT_FOUND',
    });
  }

  // Attach to request
  req.apiKey = apiKey;
  req.user = user;
  req.keyHash = keyHash;

  // Update last used (async-ish)
  store.updateApiKeyLastUsed(keyHash);

  next();
}

/**
 * Optional authentication — attaches user context if key present but doesn't block
 */
function optionalAuth(req, res, next) {
  const rawKey = extractApiKey(req);
  if (rawKey) {
    const keyHash = hashApiKey(rawKey);
    const apiKey = store.getApiKeyByHash(keyHash);
    if (apiKey && apiKey.is_active) {
      req.apiKey = apiKey;
      req.user = store.getUserById(apiKey.user_id);
    }
  }
  next();
}

/**
 * Request logging middleware — logs every request to the store
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const ip = getClientIp(req);

  // Capture response status after it's sent
  const originalEnd = res.end.bind(res);
  res.end = function (chunk, encoding, callback) {
    const responseTime = Date.now() - startTime;

    // Don't log health checks or static assets
    if (!req.path.startsWith('/health') && !req.path.startsWith('/public')) {
      store.logRequest({
        id: simpleId(),
        api_key_id: req.apiKey?.id || null,
        user_id: req.user?.id || null,
        ip_address: ip,
        method: req.method,
        endpoint: req.path,
        status_code: res.statusCode,
        response_time: responseTime,
        user_agent: req.headers['user-agent'] || null,
        timestamp: Date.now(),
      });
    }

    return originalEnd(chunk, encoding, callback);
  };

  next();
}

/**
 * Simple session-based admin auth (for dashboard)
 */
const adminSessions = new Map();

function createAdminSession(userId) {
  const token = require('crypto').randomBytes(32).toString('hex');
  adminSessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const session = adminSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }

  // Sessions expire after 2 hours
  if (Date.now() - session.createdAt > 2 * 3600 * 1000) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.adminUserId = session.userId;
  next();
}

function simpleId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

module.exports = {
  authenticate,
  optionalAuth,
  requestLogger,
  adminAuth,
  createAdminSession,
};
