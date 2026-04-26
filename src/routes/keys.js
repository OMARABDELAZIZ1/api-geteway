/**
 * API Keys Routes
 * CRUD for API key management
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const { generateApiKey, hashApiKey, getKeyPrefix } = require('../utils/keyUtils');
const { authenticate } = require('../middleware/auth');
const { v4 } = require('../utils/uuid');

/**
 * GET /api/keys
 * List all API keys for the authenticated user
 */
router.get('/', authenticate, (req, res) => {
  const keys = store.getApiKeysByUser(req.user.id).map(safeKey);
  res.json({ keys, total: keys.length });
});

/**
 * POST /api/keys
 * Create a new API key
 */
router.post('/', authenticate, (req, res) => {
  const { name, rate_limit, rate_window } = req.body;

  // Enforce key limits per tier
  const existingKeys = store.getApiKeysByUser(req.user.id).filter(k => k.is_active);
  const maxKeys = req.user.tier === 'pro' ? 20 : 5;

  if (existingKeys.length >= maxKeys) {
    return res.status(403).json({
      error: 'Key limit reached',
      message: `Your ${req.user.tier} plan allows up to ${maxKeys} active API keys`,
    });
  }

  // Validate rate limit
  const maxRateLimit = req.user.tier === 'pro' ? 1000 : 100;
  const parsedLimit = rate_limit ? parseInt(rate_limit) : (req.user.tier === 'pro' ? 500 : 100);
  const parsedWindow = rate_window ? parseInt(rate_window) : 60;

  if (parsedLimit > maxRateLimit) {
    return res.status(400).json({
      error: 'Rate limit too high',
      message: `Your plan allows a maximum of ${maxRateLimit} requests per window`,
    });
  }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const prefix = getKeyPrefix(rawKey);

  const record = store.createApiKey({
    id: `apikey_${v4().replace(/-/g, '').slice(0, 12)}`,
    user_id: req.user.id,
    key_hash: keyHash,
    key_prefix: prefix,
    name: name || `API Key ${new Date().toISOString().slice(0, 10)}`,
    rate_limit: parsedLimit,
    rate_window: parsedWindow,
    is_active: true,
    last_used: null,
    created_at: Date.now(),
  });

  res.status(201).json({
    message: 'API key created. Store it securely — it will not be shown again.',
    key: rawKey,        // Only shown ONCE on creation
    details: safeKey(record),
  });
});

/**
 * DELETE /api/keys/:keyId
 * Revoke an API key
 */
router.delete('/:keyId', authenticate, (req, res) => {
  const success = store.deactivateApiKey(req.params.keyId, req.user.id);

  if (!success) {
    return res.status(404).json({
      error: 'Key not found',
      message: 'API key not found or does not belong to your account',
    });
  }

  res.json({ message: 'API key revoked successfully', keyId: req.params.keyId });
});

/**
 * GET /api/keys/:keyId/stats
 * Get usage stats for a specific key
 */
router.get('/:keyId/stats', authenticate, (req, res) => {
  const keys = store.getApiKeysByUser(req.user.id);
  const key = keys.find(k => k.id === req.params.keyId);

  if (!key) {
    return res.status(404).json({ error: 'Key not found' });
  }

  const logs = store.getRecentLogs(1000).filter(l => l.api_key_id === key.id);
  const total = logs.length;
  const errors = logs.filter(l => l.status_code >= 400).length;
  const avgTime = total ? Math.round(logs.reduce((s, l) => s + (l.response_time || 0), 0) / total) : 0;

  res.json({
    key: safeKey(key),
    stats: {
      totalRequests: total,
      errorCount: errors,
      errorRate: total ? ((errors / total) * 100).toFixed(1) + '%' : '0%',
      avgResponseTime: avgTime + 'ms',
    },
  });
});

function safeKey(key) {
  const { key_hash, ...safe } = key;
  return safe;
}

module.exports = router;
