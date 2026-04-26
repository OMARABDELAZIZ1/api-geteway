/**
 * Analytics Routes
 * Provides analytics data for the dashboard and API consumers
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const { adminAuth } = require('../middleware/auth');
const { adminRateLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/analytics/overview
 * High-level analytics summary
 */
router.get('/overview', adminAuth, adminRateLimiter(), (req, res) => {
  const range = parseInt(req.query.range) || 7; // days
  const analytics = store.getAnalytics(range * 24 * 3600 * 1000);

  res.json({
    timeRange: `${range}d`,
    ...analytics,
  });
});

/**
 * GET /api/analytics/requests
 * Raw request logs with pagination
 */
router.get('/requests', adminAuth, adminRateLimiter(), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const logs = store.getRecentLogs(limit, offset);
  const safeLog = (log) => ({
    ...log,
    // Mask partial IP for privacy
    ip_address: maskIp(log.ip_address),
  });

  res.json({
    logs: logs.map(safeLog),
    total: store.requestLogs.length,
    limit,
    offset,
  });
});

/**
 * GET /api/analytics/endpoints
 * Most-used endpoints summary
 */
router.get('/endpoints', adminAuth, adminRateLimiter(), (req, res) => {
  const range = parseInt(req.query.range) || 7;
  const analytics = store.getAnalytics(range * 24 * 3600 * 1000);

  res.json({
    timeRange: `${range}d`,
    endpoints: analytics.topEndpoints,
  });
});

/**
 * GET /api/analytics/users
 * Per-user activity breakdown
 */
router.get('/users', adminAuth, adminRateLimiter(), (req, res) => {
  const range = parseInt(req.query.range) || 7;
  const analytics = store.getAnalytics(range * 24 * 3600 * 1000);

  res.json({
    timeRange: `${range}d`,
    userActivity: analytics.userActivity,
  });
});

/**
 * GET /api/analytics/timeseries
 * Requests over time (hourly)
 */
router.get('/timeseries', adminAuth, adminRateLimiter(), (req, res) => {
  const range = parseInt(req.query.range) || 1;
  const analytics = store.getAnalytics(range * 24 * 3600 * 1000);

  res.json({
    timeRange: `${range}d`,
    series: analytics.requestsPerHour,
  });
});

/**
 * GET /api/analytics/errors
 * Error rate and status code distribution
 */
router.get('/errors', adminAuth, adminRateLimiter(), (req, res) => {
  const range = parseInt(req.query.range) || 7;
  const analytics = store.getAnalytics(range * 24 * 3600 * 1000);

  res.json({
    timeRange: `${range}d`,
    errorRate: analytics.errorRate,
    statusDistribution: analytics.statusDistribution,
    violationsCount: analytics.violationsCount,
  });
});

function maskIp(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.* `;
  }
  return ip.slice(0, ip.length / 2) + '***';
}

module.exports = router;
