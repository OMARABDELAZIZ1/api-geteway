/**
 * In-Memory Store
 * Production replacement: swap this with a real DB (PostgreSQL, MySQL, SQLite file)
 */

const crypto = require('crypto');

class InMemoryStore {
  constructor() {
    this.users = new Map();
    this.apiKeys = new Map();       // key_hash -> apiKeyRecord
    this.requestLogs = [];
    this.violations = [];
    this.rateLimitWindows = new Map(); // "key:window" -> count

    // Seed demo data
    this._seed();
  }

  _seed() {
    const userId1 = 'user_demo_001';
    const userId2 = 'user_demo_002';

    this.users.set(userId1, {
      id: userId1,
      username: 'alice',
      email: 'alice@example.com',
      password_hash: '$demo$hash$alice',
      tier: 'pro',
      created_at: Date.now() - 30 * 24 * 3600 * 1000
    });

    this.users.set(userId2, {
      id: userId2,
      username: 'bob',
      email: 'bob@example.com',
      password_hash: '$demo$hash$bob',
      tier: 'free',
      created_at: Date.now() - 15 * 24 * 3600 * 1000
    });

    // Seed API keys
    const key1 = 'gw_live_alice_key_001_demo';
    const key2 = 'gw_live_bob_key_002_demo';

    const hash1 = crypto.createHash('sha256').update(key1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(key2).digest('hex');

    this.apiKeys.set(hash1, {
      id: 'apikey_001',
      user_id: userId1,
      key_hash: hash1,
      key_prefix: 'gw_live_alic',
      name: "Alice's Production Key",
      rate_limit: 200,
      rate_window: 60,
      is_active: true,
      last_used: Date.now() - 5 * 60 * 1000,
      created_at: Date.now() - 25 * 24 * 3600 * 1000
    });

    this.apiKeys.set(hash2, {
      id: 'apikey_002',
      user_id: userId2,
      key_hash: hash2,
      key_prefix: 'gw_live_bob_',
      name: "Bob's Dev Key",
      rate_limit: 100,
      rate_window: 60,
      is_active: true,
      last_used: Date.now() - 30 * 60 * 1000,
      created_at: Date.now() - 10 * 24 * 3600 * 1000
    });

    // Seed realistic request logs (last 7 days)
    const endpoints = [
      '/api/v1/users', '/api/v1/products', '/api/v1/orders',
      '/api/v1/payments', '/api/v1/search', '/api/v1/reports',
      '/api/v1/webhooks', '/api/v1/auth/token'
    ];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    const statuses = [200, 200, 200, 201, 400, 401, 404, 429, 500];
    const ips = ['192.168.1.10', '10.0.0.5', '172.16.0.3', '203.45.67.89'];
    const keys = ['apikey_001', 'apikey_002'];
    const users = [userId1, userId2];

    const now = Date.now();
    for (let i = 0; i < 500; i++) {
      const daysAgo = Math.random() * 7;
      const timestamp = now - daysAgo * 24 * 3600 * 1000;
      const keyIdx = Math.floor(Math.random() * 2);
      this.requestLogs.push({
        id: `log_${i.toString().padStart(4, '0')}`,
        api_key_id: keys[keyIdx],
        user_id: users[keyIdx],
        ip_address: ips[Math.floor(Math.random() * ips.length)],
        method: methods[Math.floor(Math.random() * methods.length)],
        endpoint: endpoints[Math.floor(Math.random() * endpoints.length)],
        status_code: statuses[Math.floor(Math.random() * statuses.length)],
        response_time: Math.floor(Math.random() * 300) + 10,
        user_agent: 'Mozilla/5.0 (compatible; APIClient/1.0)',
        timestamp
      });
    }

    // Sort by timestamp desc
    this.requestLogs.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`✓ Seeded ${this.requestLogs.length} demo request logs`);
  }

  // ─── Users ──────────────────────────────────────────────
  createUser({ id, username, email, password_hash, tier = 'free' }) {
    const user = { id, username, email, password_hash, tier, created_at: Date.now() };
    this.users.set(id, user);
    return user;
  }

  getUserById(id) { return this.users.get(id) || null; }
  getUserByEmail(email) {
    for (const u of this.users.values()) if (u.email === email) return u;
    return null;
  }
  getUserByUsername(username) {
    for (const u of this.users.values()) if (u.username === username) return u;
    return null;
  }
  getAllUsers() { return [...this.users.values()]; }

  // ─── API Keys ────────────────────────────────────────────
  createApiKey(record) {
    this.apiKeys.set(record.key_hash, record);
    return record;
  }

  getApiKeyByHash(hash) { return this.apiKeys.get(hash) || null; }

  getApiKeysByUser(userId) {
    return [...this.apiKeys.values()].filter(k => k.user_id === userId);
  }

  updateApiKeyLastUsed(keyHash) {
    const k = this.apiKeys.get(keyHash);
    if (k) k.last_used = Date.now();
  }

  deactivateApiKey(keyId, userId) {
    for (const [hash, k] of this.apiKeys.entries()) {
      if (k.id === keyId && k.user_id === userId) {
        k.is_active = false;
        return true;
      }
    }
    return false;
  }

  // ─── Rate Limiting ───────────────────────────────────────
  checkRateLimit(identifier, limit, windowSeconds) {
    const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `${identifier}:${windowKey}`;
    const current = this.rateLimitWindows.get(key) || 0;

    if (current >= limit) {
      return { allowed: false, current, limit, remaining: 0 };
    }

    this.rateLimitWindows.set(key, current + 1);

    // Cleanup old windows (simple GC)
    if (this.rateLimitWindows.size > 10000) {
      const cutoff = windowKey - 2;
      for (const [k] of this.rateLimitWindows) {
        const parts = k.split(':');
        if (parseInt(parts[parts.length - 1]) < cutoff) {
          this.rateLimitWindows.delete(k);
        }
      }
    }

    return { allowed: true, current: current + 1, limit, remaining: limit - current - 1 };
  }

  // ─── Request Logs ────────────────────────────────────────
  logRequest(entry) {
    this.requestLogs.unshift(entry);
    // Keep max 10000 logs in memory
    if (this.requestLogs.length > 10000) this.requestLogs.splice(10000);
  }

  logViolation(entry) {
    this.violations.unshift(entry);
    if (this.violations.length > 1000) this.violations.splice(1000);
  }

  // ─── Analytics ──────────────────────────────────────────
  getAnalytics(timeRangeMs = 7 * 24 * 3600 * 1000) {
    const cutoff = Date.now() - timeRangeMs;
    const logs = this.requestLogs.filter(l => l.timestamp >= cutoff);

    // Total requests
    const total = logs.length;

    // Requests per hour (last 24h)
    const last24h = logs.filter(l => l.timestamp >= Date.now() - 24 * 3600 * 1000);
    const byHour = {};
    for (const log of last24h) {
      const h = new Date(log.timestamp).toISOString().slice(0, 13);
      byHour[h] = (byHour[h] || 0) + 1;
    }
    const requestsPerHour = Object.entries(byHour)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Most used endpoints
    const endpointCounts = {};
    for (const log of logs) {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1;
    }
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Status code distribution
    const statusCounts = {};
    for (const log of logs) {
      const cat = `${Math.floor(log.status_code / 100)}xx`;
      statusCounts[cat] = (statusCounts[cat] || 0) + 1;
    }

    // Average response time
    const avgResponseTime = logs.length
      ? Math.round(logs.reduce((s, l) => s + (l.response_time || 0), 0) / logs.length)
      : 0;

    // User activity
    const userCounts = {};
    for (const log of logs) {
      if (log.user_id) userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
    }
    const userActivity = Object.entries(userCounts)
      .map(([userId, count]) => {
        const user = this.users.get(userId);
        return { userId, username: user?.username || 'unknown', count };
      })
      .sort((a, b) => b.count - a.count);

    // Error rate
    const errors = logs.filter(l => l.status_code >= 400).length;
    const errorRate = total ? ((errors / total) * 100).toFixed(1) : '0.0';

    // Rate limit violations in window
    const violationsCount = this.violations.filter(v => v.timestamp >= cutoff).length;

    return {
      total,
      avgResponseTime,
      errorRate: parseFloat(errorRate),
      violationsCount,
      requestsPerHour,
      topEndpoints,
      statusDistribution: statusCounts,
      userActivity,
    };
  }

  getRecentLogs(limit = 50, offset = 0) {
    return this.requestLogs.slice(offset, offset + limit);
  }
}

module.exports = new InMemoryStore();
