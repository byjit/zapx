# Local Development Guide

## Prerequisites

- **Node.js** v24+ (required by x402 SDK)
- **pnpm** v10.32+
- **PostgreSQL** — Neon serverless (or local Postgres)
- **Redis** (optional) — for rate limiting; falls back to in-memory

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp apps/server/.env.example apps/server/.env
```

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://...@ep-xxx.us-east-2.aws.neon.tech/neondb` |
| `BETTER_AUTH_SECRET` | Random secret for session signing | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Server base URL | `http://localhost:8000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Cloud Console |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key | From Google AI Studio |

**x402 Payment Gateway variables** (needed for gateway features):

| Variable | Description | Default |
|----------|-------------|---------|
| `FACILITATOR_URL` | x402 facilitator endpoint | `https://x402.org/facilitator` |
| `PAY_TO` | Platform wallet address (receives all payments) | Required for gateway |
| `PLATFORM_FEE_PERCENT` | Platform fee percentage | `10` |
| `X402_NETWORK` | CAIP-2 network identifier for payments | `eip155:84532` (Base Sepolia) |

#### Where to get env from
1. FACILITATOR_URL
- Testnet: Use https://x402.org/facilitator — it's free, no auth required. Works with Base Sepolia + Solana Devnet.
- Mainnet: Use https://api.cdp.coinbase.com/platform/v2/x402 — requires CDP (Coinbase Developer Platform) API keys.
Sign up at https://cdp.coinbase.com.

2. PAY_TO
- This is any Ethereum wallet address (0x...) that you control. It's where all USDC payments from API consumers land.
- For testnet, you can use any wallet address — create one with MetaMask, Coinbase Wallet, or any EVM wallet.
- For mainnet, use a secure wallet you control (hardware wallet recommended).
- To get testnet USDC on Base Sepolia, use the https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet or the
https://faucet.circle.com/.

3. PLATFORM_FEE_PERCENT
- This is just a number you choose — it's your platform's cut from each API request payment. Default is 10 (meaning
10%). Set it to whatever fee you want to charge providers.

For local development, you really only need:
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO=0xYourMetaMaskAddress
PLATFORM_FEE_PERCENT=10

### 3. Run database migrations

```bash
pnpm db:sync
```

This generates and applies Drizzle migrations against your Neon database.

### 4. Start development servers

**Both web + server:**

```bash
pnpm dev
```

**Server only:**

```bash
pnpm dev:server   # Express API on port 8000
```

**Web only:**

```bash
pnpm dev:web      # Vite dev server on port 3001
```

## Available Endpoints

| Path | Purpose |
|------|---------|
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/api/auth/*` | Better Auth (login, OAuth) |
| `http://localhost:8000/api/v1/*` | REST API |
| `http://localhost:8000/trpc/*` | tRPC control plane |
| `http://localhost:8000/gateway/:apiId/*` | x402 payment gateway (data plane) |
| `http://localhost:8000/docs` | Swagger UI (when `ALLOW_OPENAPI=true`) |
| `http://localhost:8000/openapi.json` | OpenAPI spec |
| `http://localhost:3001` | Web dashboard |

## Database Management

```bash
pnpm db:generate   # Generate migration from schema changes
pnpm db:sync       # Generate + apply migrations
pnpm db:studio     # Open Drizzle Studio (DB browser)
```

Schema files live in `packages/db/src/schema/`. After editing a schema file, run `pnpm db:sync` to apply changes.

## Type Checking

```bash
pnpm check-types              # All packages
pnpm -F server check-types    # Server only
```

## Testing the Payment Gateway

1. Set `PAY_TO` to a wallet address (can be any valid Ethereum address for testnet)
2. Create a project and upload an OpenAPI spec via the web UI or tRPC
3. Set endpoint prices (e.g., `$0.001`)
4. Send a request to `/gateway/<apiId>/<endpoint-path>`:
   - Without payment → returns HTTP 402 with payment requirements
   - With `PAYMENT-SIGNATURE` header → verifies, proxies, settles, credits ledger

**Testnet facilitator:** `https://x402.org/facilitator` (Base Sepolia, free, no auth)

## Project Structure

```
apps/
  server/         Express API server
  web/            React 19 + Vite dashboard

packages/
  api/            tRPC routers & procedures
  auth/           Better Auth configuration
  cache/          Rate limiting (Redis/memory)
  db/             Drizzle ORM schemas & migrations
  env/            Zod-validated environment variables
  services/       Email, notifications
```
