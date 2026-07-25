# Deployment Guide

## Architecture

Zapx is a monorepo with two deployable apps:

- **Server** (`apps/server`) — Express API, tRPC, x402 gateway
- **Web** (`apps/web`) — React SPA (Vite build, static files)

## Prerequisites

- Node.js v24+
- PostgreSQL (Neon recommended)
- Redis (optional, for rate limiting)
- A wallet address for `PAY_TO` (receives USDC payments)

## Environment Variables

### Required

```env
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Auth
BETTER_AUTH_SECRET=<random-64-char-hex>
BETTER_AUTH_URL=https://api.yourdomain.com
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>

# AI
GOOGLE_GENERATIVE_AI_API_KEY=<gemini-api-key>

# Server
NODE_ENV=production
PORT=8000
BASE_URL=https://api.yourdomain.com
CORS_ORIGIN=https://yourdomain.com
ALLOW_OPENAPI=false
```

### x402 Payment Gateway

```env
# Testnet
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO=0xYourPlatformWalletAddress
PLATFORM_FEE_PERCENT=10
X402_NETWORK=eip155:84532   # Base Sepolia (default)

# Mainnet (when ready)
# FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
# X402_NETWORK=eip155:8453  # Base Mainnet
# Requires CDP API keys
```

### Optional

```env
REDIS_URL=redis://host:6379
RATE_LIMIT_MODE=redis          # "memory" or "redis"
ENABLE_FILE_LOGGING=true
LOG_FILE_PATH=./logs/server.log
```

## Build & Deploy

### Server

```bash
pnpm install
pnpm -F server build           # Builds with tsdown → dist/
node apps/server/dist/index.js  # Start production server
```

Or with Bun:

```bash
pnpm -F server compile          # Compiles to single binary
./apps/server/server             # Run compiled binary
```

### Web

```bash
pnpm -F web build               # Vite build → dist/
```

Serve `apps/web/dist/` with any static file host (Vercel, Cloudflare Pages, Nginx, etc.).

### Docker

```bash
pnpm docker:prod:build
pnpm docker:prod:up
pnpm docker:prod:logs    # Monitor
pnpm docker:prod:down    # Stop
```

## Database Migrations

Run migrations before deploying new schema changes:

```bash
DATABASE_URL=<production-url> pnpm db:sync
```

Or run `drizzle-kit migrate` directly:

```bash
cd packages/db
DATABASE_URL=<production-url> npx drizzle-kit migrate
```

## Mainnet Checklist

1. **Switch facilitator URL** to CDP mainnet: `https://api.cdp.coinbase.com/platform/v2/x402`
2. **Configure CDP API keys** (required for mainnet facilitator)
3. **Set `X402_NETWORK=eip155:8453`** (Base Mainnet) — was hardcoded, now an env var
4. **Set `PAY_TO`** to your production USDC receiving wallet
5. **USDC contract addresses:**
   - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
6. **Enable Redis** for rate limiting and idempotency cache in production
7. **Set `ALLOW_OPENAPI=false`** to hide Swagger in production
8. **Review `PLATFORM_FEE_PERCENT`** — default is 10%

## Monitoring

- **Health check:** `GET /health` returns `{ status: "ok", timestamp }`
- **Logs:** Pino JSON output in production; configure `ENABLE_FILE_LOGGING` for file rotation
- **Rate limits:** Response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Security Notes

- All payments flow through the platform wallet (`PAY_TO`) — custodial model
- Withdrawals require admin approval (manual USDC transfer for MVP)
- Rate limiting: 10 req/sec per IP by default
- Helmet security headers enabled
- CORS restricted to configured `CORS_ORIGIN`
- Payment headers (`PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`) are allowed through CORS
