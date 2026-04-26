/**
 * Rate Limiting Middleware
 *
 * Implements a sliding window rate limiter.
 * Checks per API key (authenticated) or per IP (unauthenticated).
 */

const store = require('../db/store');
const { v4: uuidv4 } = require('../utils/uuid');

/**
 * Create a rate limiter middleware with configurable options
 *
 * @param {Object} options
 * @param {number} options.defaultLimit - Default requests per window (default: 100)
 * @param {number} options.windowSeconds - Window size in seconds (default: 60)
 * @param {boolean} options.useKeyLimit - Use per-key limit if available (default: true)
 */
function createRateLimiter(options = {}) {
  const {
    defaultLimit = 100,
    windowSeconds = 60,
    useKeyLimit = true,
  } = options;

  return function rateLimiter(req, res, next) {
    // Determine identifier and limit
    let identifier;
    let limit = defaultLimit;
    let window = windowSeconds;

    if (req.apiKey && useKeyLimit) {
      // Authenticated: rate limit per API key
      identifier = `key:${req.apiKey.id}`;
      limit = req.apiKey.rate_limit || defaultLimit;
      window = req.apiKey.rate_window || windowSeconds;
    } else {
      // Unauthenticated: rate limit per IP
      const ip = getClientIp(req);
      identifier = `ip:${ip}`;
      limit = Math.floor(defaultLimit / 2); // Stricter for unauthenticated
    }

    const result = store.checkRateLimit(identifier, limit, window);

    // Set rate limit headers (standard headers)
    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': Math.ceil(Date.now() / 1000) + window,
      'X-RateLimit-Policy': `${limit};w=${window}`,
    });

    if (!result.allowed) {
      // Log violation
      store.logViolation({
        id: simpleId(),
        api_key_id: req.apiKey?.id || null,
        ip_address: getClientIp(req),
        endpoint: req.path,
        timestamp: Date.now(),
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `You have exceeded ${limit} requests per ${window} seconds.`,
        retryAfter: window,
        limit,
        current: result.current,
      });
    }

    next();
  };
}

/**
 * Strict rate limiter for auth endpoints (prevent brute force)
 */
function authRateLimiter() {
  return createRateLimiter({
    defaultLimit: 10,
    windowSeconds: 300, // 10 attempts per 5 minutes
    useKeyLimit: false,
  });
}

/**
 * Admin rate limiter
 */
function adminRateLimiter() {
  return createRateLimiter({
    defaultLimit: 60,
    windowSeconds: 60,
    useKeyLimit: false,
  });
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

function simpleId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

module.exports = { createRateLimiter, authRateLimiter, adminRateLimiter, getClientIp };
