# API Gateway — Rate Limiting & Analytics Backend

A production-ready API gateway with per-key rate limiting, API key management, request logging, and analytics.

## Architecture

```
api-gateway/
├── server.js                    # Express entry point
├── src/
│   ├── db/
│   │   ├── store.js             # In-memory data store (swap for DB)
│   │   └── database.js          # SQLite schema (optional)
│   ├── middleware/
│   │   ├── auth.js              # API key auth + request logging
│   │   └── rateLimiter.js       # Fixed-window rate limiter
│   ├── routes/
│   │   ├── users.js             # Registration, login
│   │   ├── keys.js              # API key CRUD
│   │   └── analytics.js         # Analytics endpoints
│   └── utils/
│       ├── keyUtils.js          # Key generation, hashing
│       └── uuid.js              # UUID v4 (no deps)
└── README.md
```

## Quick Start

```bash
# Install dependencies (only Express needed)
npm install

# Start the server
node server.js

# With file watching (Node 18+)
node --watch server.js
```

Server starts at http://localhost:4000

## Demo Credentials

| Email | Password | Tier |
|-------|----------|------|
| alice@example.com | any | Pro |
| bob@example.com | any | Free |

**Demo API Keys (raw, for testing):**
- Alice: `gw_live_alice_key_001_demo`
- Bob: `gw_live_bob_key_002_demo`

---

## API Reference

### Authentication

All `/api/v1/*` endpoints and key management require an API key.
All `/api/analytics/*` endpoints require an admin token (from login).

**API key methods:**
```
Authorization: Bearer gw_live_<key>
X-API-Key: gw_live_<key>
?api_key=gw_live_<key>
```

**Admin token:**
```
X-Admin-Token: <token_from_login>
```

---

### User Endpoints

#### POST /api/users/register
Register a new user account.

**Body:**
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "message": "Account created successfully",
  "user": { "id": "user_abc", "username": "alice", "email": "...", "tier": "free" }
}
```

---

#### POST /api/users/login
Login and receive an admin session token.

**Body:**
```json
{
  "email": "alice@example.com",
  "password": "anypassword"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "hex_session_token",
  "user": { ... }
}
```

---

#### GET /api/users/me
Get the authenticated user's profile (requires API key).

---

### API Key Endpoints

#### GET /api/keys
List all active API keys for the authenticated user.

**Response:**
```json
{
  "keys": [
    {
      "id": "apikey_001",
      "name": "Production Key",
      "key_prefix": "gw_live_alic...",
      "rate_limit": 200,
      "rate_window": 60,
      "is_active": true,
      "last_used": 1714000000000,
      "created_at": 1711000000000
    }
  ],
  "total": 1
}
```

---

#### POST /api/keys
Create a new API key.

**Body:**
```json
{
  "name": "My Production Key",
  "rate_limit": 100,
  "rate_window": 60
}
```

**Response (201):**
```json
{
  "message": "API key created. Store it securely — it will not be shown again.",
  "key": "gw_live_<full_raw_key>",
  "details": { ... }
}
```

> ⚠️ The raw key is only returned once. Store it immediately.

---

#### DELETE /api/keys/:keyId
Revoke an API key.

**Response:**
```json
{ "message": "API key revoked successfully", "keyId": "apikey_001" }
```

---

#### GET /api/keys/:keyId/stats
Get usage stats for a specific key.

---

### Analytics Endpoints
All require `X-Admin-Token` header.

#### GET /api/analytics/overview?range=7
High-level summary (default: last 7 days).

**Response:**
```json
{
  "timeRange": "7d",
  "total": 500,
  "avgResponseTime": 147,
  "errorRate": 18.4,
  "violationsCount": 0,
  "requestsPerHour": [...],
  "topEndpoints": [
    { "endpoint": "/api/v1/users", "count": 87 }
  ],
  "statusDistribution": { "2xx": 408, "4xx": 80, "5xx": 12 },
  "userActivity": [...]
}
```

---

#### GET /api/analytics/timeseries?range=1
Hourly request counts.

#### GET /api/analytics/endpoints?range=7
Most-used endpoints.

#### GET /api/analytics/users?range=7
Per-user activity breakdown.

#### GET /api/analytics/errors?range=7
Error rate and status code distribution.

#### GET /api/analytics/requests?limit=50&offset=0
Paginated raw request logs.

---

### Protected API (Demo)
These endpoints simulate a real downstream API (require API key + rate limiting).

```
GET  /api/v1/users
GET  /api/v1/products
GET  /api/v1/orders
POST /api/v1/orders
GET  /api/v1/search?q=term
GET  /api/v1/payments
GET  /api/v1/reports
```

---

## Rate Limiting

The gateway implements fixed-window rate limiting.

### How it works

1. Each request is identified by API key (authenticated) or IP (unauthenticated)
2. A counter is incremented for the current time window
3. When the counter exceeds the limit, a `429 Too Many Requests` is returned
4. The window resets at the next interval

### Rate limit tiers

| Tier | Default limit | Window | Max keys |
|------|---------------|--------|----------|
| Pro | 1000 req | 60s | 20 |
| Free | 100 req | 60s | 5 |
| Unauthenticated | 50 req | 60s | — |

### Rate limit headers

Every response includes:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1714000060
X-RateLimit-Policy: 100;w=60
```

### 429 Response
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "You have exceeded 100 requests per 60 seconds.",
  "retryAfter": 60,
  "limit": 100,
  "current": 101
}
```

---

## Security Features

1. **API key hashing** — Keys are SHA-256 hashed before storage. Raw keys are never stored.
2. **One-time display** — Raw keys are shown only once on creation.
3. **Auth rate limiting** — Login/register endpoints: 10 req/5min per IP (brute force protection).
4. **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy.
5. **Global rate limiter** — 300 req/min IP-level limit applied before routing.
6. **Input validation** — Username/email format validation, password length enforcement.

---

## Production Deployment

### 1. Replace the in-memory store with a real database

`src/db/store.js` is the only file that needs to change. Replace it with:

**PostgreSQL:**
```bash
npm install pg
```

**SQLite (persistent file):**
```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./gateway.db');
```

### 2. Environment variables
```bash
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost/gateway
SESSION_SECRET=your_256_bit_secret
NODE_ENV=production
```

### 3. Add HTTPS
Use a reverse proxy (nginx/caddy) or Node.js `https.createServer()`.

### 4. Process management
```bash
npm install -g pm2
pm2 start server.js --name api-gateway
pm2 save
```

### 5. Sliding window rate limiting
For production, replace the fixed-window limiter with a Redis-backed sliding window:
```bash
npm install ioredis
```

---

## Example Usage

### Register and create an API key

```bash
# 1. Register
curl -X POST http://localhost:4000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'

# 2. Login
curl -X POST http://localhost:4000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'
# → Save the "token" from response

# 3. Create API key (use your login token)
curl -X POST http://localhost:4000/api/keys \
  -H "X-Admin-Token: <your_login_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Key","rate_limit":100}'
# → Save the "key" from response

# 4. Use the API key
curl http://localhost:4000/api/v1/users \
  -H "Authorization: Bearer gw_live_<your_key>"

# 5. View analytics
curl http://localhost:4000/api/analytics/overview \
  -H "X-Admin-Token: <your_login_token>"
```

---

## Health Check

```bash
curl http://localhost:4000/health
# → {"status":"ok","timestamp":"...","uptime":42.3,"version":"1.0.0"}
```
