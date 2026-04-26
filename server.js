/**
 * API Gateway Server
 * Entry point — configures Express, middleware, and routes
 *
 * Usage:
 *   node server.js
 *   PORT=4000 node server.js
 *
 * Production considerations:
 *   - Replace InMemoryStore with PostgreSQL/MySQL/SQLite file
 *   - Add TLS termination (or use a reverse proxy like nginx)
 *   - Configure CORS origins explicitly
 *   - Use PM2 or similar for process management
 */

'use strict';

const express = require('express');
const path = require('path');

const store = require('./src/db/store');
const { requestLogger } = require('./src/middleware/auth');
const { createRateLimiter } = require('./src/middleware/rateLimiter');

// Routes
const userRoutes = require('./src/routes/users');
const keyRoutes = require('./src/routes/keys');
const analyticsRoutes = require('./src/routes/analytics');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Headers (simplified helmet) ────────────────────────────────────
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Powered-By': 'API Gateway',
  });
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // In production: restrict to your domain
  res.set('Access-Control-Allow-Origin', origin || '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Admin-Token');
  res.set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Global Rate Limiter (IP-based, loose) ────────────────────────────────────
app.use(createRateLimiter({ defaultLimit: 300, windowSeconds: 60, useKeyLimit: false }));

// ─── Serve Static Dashboard ──────────────────────────────────────────────────
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/users', userRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/analytics', analyticsRoutes);

// ─── Demo Protected API (simulated downstream API) ───────────────────────────
const { authenticate } = require('./src/middleware/auth');
const { createRateLimiter: rl } = require('./src/middleware/rateLimiter');

// Simulate real endpoints that consumers would call
const demoRouter = express.Router();
demoRouter.use(authenticate);
demoRouter.use(rl());

demoRouter.get('/users', (req, res) => {
  res.json({ data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], page: 1, total: 2 });
});
demoRouter.get('/products', (req, res) => {
  res.json({ data: [{ id: 'p1', name: 'Widget', price: 9.99 }], page: 1, total: 1 });
});
demoRouter.get('/orders', (req, res) => {
  res.json({ data: [], page: 1, total: 0 });
});
demoRouter.post('/orders', (req, res) => {
  res.status(201).json({ id: 'ord_' + Date.now(), status: 'created', ...req.body });
});
demoRouter.get('/search', (req, res) => {
  res.json({ query: req.query.q || '', results: [], total: 0 });
});
demoRouter.get('/payments', (req, res) => {
  res.json({ payments: [], total: 0 });
});
demoRouter.get('/reports', (req, res) => {
  res.json({ report: 'monthly_summary', generated: new Date().toISOString() });
});

app.use('/api/v1', demoRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         API Gateway Server               ║
╠══════════════════════════════════════════╣
║  Status  : Running                       ║
║  Port    : ${PORT}                           ║
║  Health  : http://localhost:${PORT}/health   ║
║  Docs    : http://localhost:${PORT}/dashboard ║
╚══════════════════════════════════════════╝

Demo Credentials:
  alice@example.com / anypassword (pro tier)
  bob@example.com   / anypassword (free tier)

Demo API Keys (raw — for testing):
  Alice: gw_live_alice_key_001_demo
  Bob:   gw_live_bob_key_002_demo
`);
});

module.exports = app;
