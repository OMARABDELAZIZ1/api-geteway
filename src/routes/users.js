/**
 * User Routes
 * Registration, login, profile management
 */

const express = require('express');
const router = express.Router();
const store = require('../db/store');
const { hashPassword, verifyPassword, generateToken } = require('../utils/keyUtils');
const { createAdminSession } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { v4 } = require('../utils/uuid');

/**
 * POST /api/users/register
 * Register a new user account
 */
router.post('/register', authRateLimiter(), (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'username, email, and password are required',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Password must be at least 8 characters',
    });
  }

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Username must be 3-32 chars, alphanumeric and underscores only',
    });
  }

  if (store.getUserByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  if (store.getUserByUsername(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const user = store.createUser({
    id: `user_${v4().replace(/-/g, '').slice(0, 16)}`,
    username,
    email,
    password_hash: hashPassword(password),
    tier: 'free',
  });

  res.status(201).json({
    message: 'Account created successfully',
    user: safeUser(user),
  });
});

/**
 * POST /api/users/login
 * Login and get admin session token
 */
router.post('/login', authRateLimiter(), (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = store.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Demo mode: accept any password for seeded demo users
  const isDemoUser = user.password_hash.startsWith('$demo$');
  const valid = isDemoUser || verifyPassword(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createAdminSession(user.id);

  res.json({
    message: 'Login successful',
    token,
    user: safeUser(user),
  });
});

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  res.json({
    user: safeUser(req.user),
    apiKeyCount: store.getApiKeysByUser(req.user.id).length,
  });
});

/**
 * GET /api/users (admin only - simplified)
 */
router.get('/', require('../middleware/auth').adminAuth, (req, res) => {
  const users = store.getAllUsers().map(safeUser);
  res.json({ users, total: users.length });
});

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = router;
