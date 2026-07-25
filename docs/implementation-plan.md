# Zapx MVP Implementation Plan

Pay-per-request API gateway with x402 and custodial aggregation. Phases are ordered by dependency — each builds on the previous.

---

## Current State (as of 2026-03-22)

### Done

- **Auth**: Better Auth with `user`, `session`, `organization`, `member`, `invitation`, `account`, `verification`. OAuth (Google), impersonation, org management.
- **Server**: Express + tRPC + REST + OpenAPI docs (Swagger). Helmet, rate limiting (Redis/memory), CORS, pino logging, error handling with correlation IDs.
- **Web**: React 19 + Vite + TanStack Router + shadcn/Radix. Routes: landing, login, dashboard, projects, projects/$projectId, settings, admin, billing, AI chat.
- **DB**: Drizzle + Neon Postgres. Schemas: `auth.ts` (users, sessions, orgs), `project.ts`, `provider-api.ts`, `provider-endpoint.ts`. Migrations applied.
- **Project CRUD**: tRPC `project.list`, `project.getById`, `project.create`, `project.update`, `project.delete`.
- **API Registry**: tRPC `api.create` (parses OpenAPI JSON/YAML, extracts endpoints), `api.listByProject`, `api.updateEndpointPricing`. Stores `priceUsdc` per endpoint.
- **Admin**: `admin.listUsers`, `admin.banUser`, `admin.unbanUser`, `admin.removeUser`, `admin.impersonateUser`.
- **Organization**: Full CRUD + member/invitation management.

### Not Built

- Ledger tables (`user_balance`, `ledger_entry`, `payment_receipt`, `withdrawal_request`)
- x402 packages not installed (`@x402/express`, `@x402/core`, `@x402/evm`)
- Gateway routes (`/gateway/:slug/*`)
- Payment verification & settlement (facilitator integration)
- Idempotency / replay protection
- Ledger service
- Balance & withdrawal endpoints
- Dashboard analytics (usage, revenue)
- API discovery (public directory)

---

## Phase 0: Remaining Schema & Types _(partially complete)_

**Goal:** Add financial tables to support ledger, payments, and withdrawals.

### 0.1 Ledger & Payment Schema

Add to `packages/db/src/schema/`:

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `user_balance` | `user_id` (FK), `available_balance`, `pending_balance`, `total_withdrawn` | Provider earnings tracker |
| `ledger_entry` | `id`, `user_id`, `api_id`, `endpoint_id`, `amount`, `platform_fee`, `provider_credit`, `type` (credit/debit/withdrawal/refund), `request_id`, `payment_tx_hash`, `created_at` | Append-only financial log |
| `payment_receipt` | `id`, `payment_id`, `request_id`, `tx_hash`, `amount`, `status` (pending/settled/failed), `created_at` | Idempotency & settlement tracking |
| `withdrawal_request` | `id`, `user_id`, `amount`, `wallet_address`, `status` (pending/approved/rejected/completed), `created_at`, `processed_at` | Payout requests |

Design rules:
- `ledger_entry` is append-only — never update or delete rows
- `user_balance` is the materialized view of ledger entries for fast reads
- `payment_receipt` stores the unique `payment_id` for x402 idempotency

Run `pnpm db:generate && pnpm db:migrate` after adding.

**Context:** `docs/spec.md` §6.4 Ledger Database, §8 Data Model.

### 0.2 Shared Types

Add to `packages/api/src/` or a new `packages/types/`:

- `LedgerEntry`, `UserBalance`, `PaymentReceipt`, `WithdrawalRequest` (inferred from Drizzle schema)
- x402 route config types: `X402RouteConfig`, `X402Accepts` (scheme, network, maxAmountRequired, payTo, resource, asset)

**Context:** `docs/spec.md` §5.1 API Monetization (route config example).

---

## Phase 1: Payment Verification & Ledger

**Goal:** Install x402 packages, integrate with facilitator, build ledger service.

### 1.1 Install x402 Dependencies

```bash
pnpm add @x402/express @x402/core @x402/evm --filter server
```

### 1.2 Facilitator Integration

Create `apps/server/src/services/payment-verification.ts`:

- Use `@x402/core` and `@x402/evm`
- Functions: `verifyPayment(payload, requirements)`, `settlePayment(payload, requirements)`
- Config: `FACILITATOR_URL` env var
  - Testnet: `https://x402.org/facilitator`
  - Mainnet: `https://api.cdp.coinbase.com/platform/v2/x402` (requires CDP API keys)

Add env vars to `packages/env/`:
- `FACILITATOR_URL` (required)
- `PAY_TO` — platform wallet address (required)
- `PLATFORM_FEE_PERCENT` — default `10`

**Context:** x402 skill, `docs/spec.md` §6.3, §6.0 Facilitator.

### 1.3 Idempotency (payment-identifier)

- On payment receipt: store `payment_id` → response in `payment_receipt` table
- Redis cache for hot lookups (if `REDIS_URL` set), fall back to DB
- Reject duplicate `nonce` / `tx_hash`

**Context:** `docs/spec.md` §9 Replay Attack Protection.

### 1.4 Ledger Service

Create `apps/server/src/services/ledger.ts`:

```typescript
creditProvider(userId, apiId, endpointId, amount, platformFeePercent, requestId, txHash)
```

- Insert append-only `ledger_entry` row
- Upsert `user_balance.available_balance += provider_credit`
- `provider_credit = amount - (amount * platformFeePercent / 100)`
- All writes in a single DB transaction

**Context:** `docs/spec.md` §6.4 Ledger Database, §8 Request Flow step 10.

---

## Phase 2: x402 Gateway

**Goal:** Handle paid API requests end-to-end — the core product.

### 2.1 Gateway Route Structure

Mount at `apps/server/src/routes/gateway/`:

```
/gateway/:apiSlug/*
```

Request flow:
1. Resolve `apiSlug` → `provider_api` record
2. Match `method + path` → `provider_endpoint` with `priceUsdc`
3. If no payment header → return 402 with payment requirements
4. If payment header → verify → settle → proxy → credit ledger

Cache API/endpoint lookups (in-memory or Redis) to hit <50ms gateway processing target.

**Context:** `docs/spec.md` §6.2 API Gateway, §8 Request Flow steps 4–9.

### 2.2 x402 Middleware Integration

Use `@x402/express` `paymentMiddleware` with dynamic route config built from DB:

```typescript
{
  "GET /weather": {
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",        // Base Sepolia
      maxAmountRequired: "1000",       // atomic USDC units
      payTo: process.env.PAY_TO,
      resource: "/weather",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"  // USDC on Base Sepolia
    }],
    description: "Weather data",
    mimeType: "application/json",
  }
}
```

- `payTo` = platform wallet address (all payments go to platform)
- Network: `eip155:84532` (Base Sepolia) for testnet, `eip155:8453` for mainnet
- USDC asset addresses per `docs/spec.md` §11

**Context:** x402 skill Quick-Start, `docs/spec.md` §4 Payment requirement format.

### 2.3 Proxy to Provider API

After successful verify + settle:
- Forward request to `provider_api.base_url + matched_path`
- Preserve: HTTP method, query params, body, non-payment headers
- Strip: `PAYMENT-SIGNATURE`, `PAYMENT-REQUIRED` headers
- Return: provider response body + `PAYMENT-RESPONSE` header

**Context:** `docs/spec.md` §4 Steps 6–7, §6.2 API Gateway.

### 2.4 onAfterSettle Lifecycle Hook

On successful settlement:
1. Call `ledger.creditProvider(userId, apiId, endpointId, amount, fee, requestId, txHash)`
2. Insert `payment_receipt` with status `settled`
3. Log the gateway request for analytics

**Context:** `docs/spec.md` §4 Step 8, §8 Lifecycle Hooks.

---

## Phase 3: Balance & Revenue Dashboard

**Goal:** Show providers their earnings, usage, and balance.

### 3.1 Balance & Ledger tRPC Routes

Add `packages/api/src/routers/balance.ts`:

- `balance.get` — returns `user_balance` for authenticated user
- `balance.getLedger` — paginated `ledger_entry` list with filters (api, date range, type)

### 3.2 Analytics tRPC Routes

Add `packages/api/src/routers/analytics.ts`:

- `analytics.getUsageByApi` — request counts per API, grouped by day/week/month
- `analytics.getRevenueByPeriod` — revenue over time (total, per-API)
- `analytics.getSummary` — total requests, total revenue, platform fees, available balance

Aggregate from `ledger_entry`. Add `gateway_request` table if detailed request logging is needed.

### 3.3 Dashboard UI

Update `apps/web/src/routes/_auth/dashboard.tsx`:

- Revenue summary cards (total revenue, available balance, pending, withdrawn)
- Usage chart (requests over time via recharts — already installed)
- Per-API breakdown table
- Recent transactions list

**Context:** `docs/spec.md` §3 Payment Model (dashboard example), §8 MVP Build Order #5.

---

## Phase 4: Withdrawals

**Goal:** Let providers withdraw their earnings.

### 4.1 Withdrawal Request

Add `packages/api/src/routers/withdrawal.ts`:

- `withdrawal.request({ amount, walletAddress })` — provider-facing
  - Validate `amount <= user_balance.available_balance`
  - Insert `withdrawal_request` with status `pending`
  - Deduct from `available_balance`, add to `pending_balance`
  - Append `ledger_entry` with type `withdrawal`

- `withdrawal.list` — provider's withdrawal history

### 4.2 Admin Payout

Add to existing `admin` router:

- `admin.listWithdrawals` — all pending/approved/rejected requests
- `admin.approveWithdrawal(id)` — mark approved, execute payout (MVP: manual USDC transfer)
- `admin.rejectWithdrawal(id)` — refund to `available_balance`

On approval: update `withdrawal_request.status`, update `user_balance.total_withdrawn`, append `ledger_entry`.

### 4.3 Withdrawal UI

- Provider: withdrawal form + history on dashboard or dedicated `/withdrawals` route
- Admin: withdrawal queue on `/admin` with approve/reject actions

**Context:** `docs/spec.md` §6.5 Treasury, §6.6 Withdrawal Service.

---

## Post-MVP Phases

### Phase 5: API Discovery

- Public REST endpoints: `GET /apis`, `GET /apis/search`, `GET /apis/:slug`
- Search by price, category, rating
- Public discovery UI pages
- Optional: Bazaar integration (`docs/spec.md` §12)

### Phase 6: Client SDK & Agent Support

- `@zapx/client` — `zapx.fetch(url)` with automatic x402 payment handling
- Preflight cost discovery via `HEAD` → 402
- MCP tool definitions for Claude Desktop / AI agents
- `wrapFetchWithPayment` helper for agent integrations

---

## Dependency Graph

```
Phase 0 (Ledger schema + types)
    ↓
Phase 1 (Facilitator + idempotency + ledger service)
    ↓
Phase 2 (Gateway + x402 middleware + proxy + onAfterSettle)  ← CORE
    ↓
Phase 3 (Dashboard + balance + analytics)
    ↓
Phase 4 (Withdrawals)
    ↓
Phase 5 (API Discovery) — post-MVP
    ↓
Phase 6 (Client SDK + Agents) — post-MVP
```

---

## Architecture

**Single server app** with path-based separation:

- `/api/auth/*` → Better Auth (existing)
- `/api/v1/*` → REST API (existing)
- `/trpc/*` → control plane: projects, APIs, balances, withdrawals (existing + new)
- `/gateway/:apiSlug/*` → data plane: x402 payment, proxy, ledger (new)

Split into separate apps later if scaling requires it.

---

## File Layout (what to add)

```
packages/
  db/src/schema/
    auth.ts              # existing
    project.ts           # existing
    provider-api.ts      # existing
    provider-endpoint.ts # existing
    user-balance.ts      # Phase 0 — NEW
    ledger-entry.ts      # Phase 0 — NEW
    payment-receipt.ts   # Phase 0 — NEW
    withdrawal.ts        # Phase 0 — NEW
  api/src/routers/
    project.ts           # existing
    api.ts               # existing
    balance.ts           # Phase 3 — NEW
    analytics.ts         # Phase 3 — NEW
    withdrawal.ts        # Phase 4 — NEW

apps/
  server/src/
    services/
      payment-verification.ts   # Phase 1 — NEW
      ledger.ts                 # Phase 1 — NEW
    routes/
      gateway/
        index.ts         # Phase 2 — NEW (mount at /gateway)
        middleware.ts     # Phase 2 — NEW (x402 + proxy logic)
      v1/
        index.ts         # existing
    middleware/
      x402-gateway.ts    # Phase 2 — NEW
```

---

## Environment Variables

| Phase | Variable | Example |
|-------|----------|---------|
| 1 | `FACILITATOR_URL` | `https://x402.org/facilitator` |
| 1 | `PAY_TO` | `0x...` (platform wallet) |
| 1 | `PLATFORM_FEE_PERCENT` | `10` |
| 1 | `REDIS_URL` | `redis://...` (optional, for idempotency cache) |
| 4 | Payout wallet config | For admin manual payouts |

---

## MVP Completion Checklist

- [x] Phase 0: Ledger/payment schema + migration
- [x] Phase 1: x402 packages installed, facilitator integration, idempotency, ledger service
- [x] Phase 2: Gateway routes, x402 middleware, proxy, onAfterSettle hook
- [x] Phase 3: Balance queries, analytics (backend only — dashboard UI pending)
- [x] Phase 4: Withdrawal request + admin approval flow
- [ ] End-to-end test: client → 402 → pay → gateway → proxy → response → ledger credit
