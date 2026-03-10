# Zapx Implementation Plan

Implementation plan for Zapx — pay-per-request API gateway with x402 and custodial aggregation. Build order ensures fundamentals first, then top layers, with clear context for each phase.

---

## Current State

- **Auth**: Better Auth with `user`, `session`, `organization`, `member`
- **Server**: Express + tRPC + REST, rate limiting, CORS
- **Web**: React + TanStack Router + shadcn
- **DB**: Drizzle + Neon Postgres, auth schema only
- **Missing**: Projects, APIs, x402 gateway, ledger, balances, withdrawals

---

## Phase 0: Foundation & Data Model

**Goal:** Establish data model and shared types so all subsequent phases have a stable foundation.

### 0.1 Database Schema (packages/db)

Add Zapx-specific tables:

| Table | Purpose |
|-------|---------|
| `project` | `user_id`, `name`, `slug`, `created_at` |
| `provider_api` | `project_id`, `name`, `slug`, `base_url`, `openapi_spec`, `status` |
| `provider_endpoint` | `api_id`, `method`, `path`, `price_usdc`, `description` |
| `user_balance` | `user_id`, `available_balance`, `pending_balance`, `total_withdrawn` |
| `ledger_entry` | `user_id`, `api_id`, `amount`, `type`, `request_id`, `payment_tx_hash`, `created_at` |
| `payment_receipt` | `payment_id`, `request_id`, `tx_hash`, `amount`, `status` (idempotency) |
| `withdrawal_request` | `user_id`, `amount`, `status`, `created_at` |

**Context for AI:** `docs/spec.md` §6.0 Entity Model, §6.4 Ledger Database, §8 Data Model.

### 0.2 Shared Types (packages/api or packages/types)

- `Project`, `ProviderApi`, `ProviderEndpoint`, `LedgerEntry`, `UserBalance`
- x402 route config types (e.g. `accepts`, `scheme`, `network`, `payTo`)

**Context for AI:** `docs/spec.md` §5.1 API Monetization (route config example).

---

## Phase 1: API Registry & Monetization

**Goal:** Enable developers to create projects and register APIs with endpoint pricing.

### 1.1 Project CRUD

- tRPC: `project.create`, `project.list`, `project.getBySlug`, `project.update`, `project.delete`
- Auth: user must be authenticated; owner = `user_id`
- Web: project list, create project form, project detail page

**Context for AI:** `docs/spec.md` §6.0 Entity Model (User → Project → API).

### 1.2 OpenAPI Ingestion

- tRPC: `api.create` (accepts OpenAPI spec + base URL)
- Parse OpenAPI to extract endpoints (method + path)
- Store in `provider_api` and `provider_endpoint`
- Optional: `packages/openapi-parser` for parsing logic

**Context for AI:** `docs/spec.md` §6.1 API Registry, §8 MVP Build Order #1.

### 1.3 Endpoint Pricing Config

- tRPC: `api.updateEndpointPricing` (per-endpoint price in USDC)
- Store `price_usdc` in `provider_endpoint`
- Validate price format (e.g. `"$0.001"`)

**Context for AI:** `docs/spec.md` §5.1 API Monetization, §11 Token Strategy.

---

## Phase 2: Payment Verification & Ledger

**Goal:** Verify x402 payments and record them in the ledger.

### 2.1 Facilitator Integration

- New package or module: `packages/x402-server` or `services/payment-verification.ts`
- Use `@x402/core`, `@x402/evm`, `HTTPFacilitatorClient`
- Functions: `verifyPayment(payload, requirements)`, `settlePayment(payload, requirements)`
- Config: `FACILITATOR_URL` (testnet: `https://x402.org/facilitator`)

**Context for AI:** x402 skill, `docs/spec.md` §6.3 Payment Verification, §4 Step 5.

### 2.2 Idempotency (payment-identifier)

- Redis: cache `payment_id` → response for idempotent retries
- Reject duplicate `nonce` / `tx_hash`
- Use `payment_receipt` table for persistence if needed

**Context for AI:** `docs/spec.md` §9 Replay Attack Protection, `docs/extra-recommendations-for-zapx.md` §6.1.

### 2.3 Ledger Service

- `packages/ledger` or `services/ledger.ts`
- `creditProvider(userId, apiId, amount, platformFee, requestId, txHash)`
- Append-only `ledger_entry`, update `user_balance.available_balance`
- Platform fee config (e.g. 10%)

**Context for AI:** `docs/spec.md` §6.4 Ledger Database, §8 Request Flow step 10.

---

## Phase 3: x402 Gateway

**Goal:** Handle paid API requests end-to-end.

### 3.1 Gateway Route Structure

- Mount gateway at `/gateway/:project_slug/*` or `/gateway/:api_slug/*`
- Resolve `project_slug` / `api_slug` → `provider_api` → `provider_endpoint`
- Load pricing from `provider_endpoint` for the matched route

**Context for AI:** `docs/spec.md` §6.2 API Gateway, §8 Request Flow steps 4–9.

### 3.2 x402 Middleware Integration

- Use `@x402/express` `paymentMiddleware` with dynamic route config
- Build config from DB: `{ "GET /weather": { accepts: [...], ... } }`
- `payTo` = platform wallet address
- Network: `eip155:84532` (Base Sepolia), USDC asset address per spec

**Context for AI:** x402 skill Quick-Start, `docs/spec.md` §4 Payment requirement format.

### 3.3 Proxy to Provider API

- After verify + settle: forward request to `provider_api.base_url + path`
- Preserve method, headers (minus payment headers), body
- Return provider response + `PAYMENT-RESPONSE` header

**Context for AI:** `docs/spec.md` §4 Steps 6–7, §6.2 API Gateway.

### 3.4 onAfterSettle Lifecycle Hook

- On successful settle: call ledger service to credit provider
- `provider_credit = price - platform_fee`

**Context for AI:** `docs/spec.md` §4 Step 8, §8 Lifecycle Hooks.

---

## Phase 4: Developer Dashboard & Balances

**Goal:** Show usage, revenue, and balances.

### 4.1 Balance Queries

- tRPC: `balance.get`, `ledger.list` (paginated)
- Compute `available_balance`, `pending_balance` from `user_balance` and `ledger_entry`

**Context for AI:** `docs/spec.md` §3 Payment Model (dashboard example).

### 4.2 Usage & Revenue Dashboard

- Web: dashboard with API usage, revenue, platform fee, available balance
- tRPC: `analytics.getUsageByApi`, `analytics.getRevenueByPeriod`
- Aggregate from `ledger_entry` and `gateway_requests` (if you add request logging)

**Context for AI:** `docs/spec.md` §8 MVP Build Order #5.

---

## Phase 5: Withdrawals

**Goal:** Manual withdrawal workflow.

### 5.1 Withdrawal Request

- tRPC: `withdrawal.request(amount)`
- Validate `amount <= available_balance`
- Insert `withdrawal_request` with status `pending`

**Context for AI:** `docs/spec.md` §6.6 Withdrawal Service, §8 MVP Build Order #6.

### 5.2 Manual Payout (Admin)

- Admin tRPC: `withdrawal.approve`, `withdrawal.reject`
- On approve: execute payout (MVP: manual or simple crypto transfer)
- Update `user_balance`, `withdrawal_request`, append `ledger_entry`

**Context for AI:** `docs/spec.md` §6.5 Treasury Service, §6.6 Withdrawal process.

---

## Phase 6: API Discovery (Post-MVP)

**Goal:** Public API directory and search.

### 6.1 Public API Endpoints

- REST: `GET /apis`, `GET /apis/search`, `GET /apis/:slug`
- Search by price, category, rating (if you add ratings)

**Context for AI:** `docs/spec.md` §12 API Discovery System.

### 6.2 Discovery UI

- Web: public API directory, search, API detail pages

---

## Phase 7: Client & Ecosystem (Post-MVP)

**Goal:** Make it easy for clients and agents to pay and call APIs.

### 7.1 Client SDK

- `@zapx/client` or `zapx-js`: `zapx.fetch(url)`, `zapx.get(projectSlug, path)`
- Document gateway URL: `https://gateway.zapx.com/{project_slug}/{path}`

**Context for AI:** `docs/extra-recommendations-for-zapx.md` §1.

### 7.2 Preflight / Cost Discovery

- Document `HEAD` → 402 + `PAYMENT-REQUIRED`
- Optional: `GET /apis/:slug/pricing` for endpoint prices

**Context for AI:** `docs/extra-recommendations-for-zapx.md` §2.

### 7.3 Agent Support

- Docs for MCP, tool-use, `wrapFetchWithPayment`
- Sample MCP config for Claude Desktop

**Context for AI:** `docs/extra-recommendations-for-zapx.md` §3.

---

## Dependency Graph (Simplified)

```
Phase 0 (Schema + Types)
    ↓
Phase 1 (Projects, APIs, Pricing)
    ↓
Phase 2 (Facilitator, Ledger, Idempotency)
    ↓
Phase 3 (Gateway + x402 + Proxy + onAfterSettle)
    ↓
Phase 4 (Dashboard)
    ↓
Phase 5 (Withdrawals)
    ↓
Phase 6 (Discovery) — optional
    ↓
Phase 7 (Client SDK, Docs) — optional
```

---

## Architecture Choices for Your Repo

**Spec vs current setup**

- Spec: separate `control-api`, `gateway`, `worker`
- Current: single `server` app

**Recommendation for MVP:** Keep one `server` app and separate concerns by path:

- `/api`, `/trpc` → control plane (auth, projects, APIs, balances, withdrawals)
- `/gateway/:project_slug/*` → data plane (x402, proxy, ledger)

Later you can split into separate apps if needed.

---

## Suggested File Layout (Incremental)

```
packages/
  db/src/schema/
    auth.ts          # existing
    zapx.ts          # project, provider_api, provider_endpoint, user_balance, ledger_entry, etc.
  api/src/routers/
    project.ts       # Phase 1
    api.ts           # Phase 1
    balance.ts       # Phase 4
    withdrawal.ts    # Phase 5
  services/
    payment-verification.ts   # Phase 2
    ledger.ts                 # Phase 2

apps/
  server/src/
    routes/
      gateway/       # Phase 3 — mount at /gateway
      v1/
    middleware/
      x402-gateway.ts
```

---

## Environment Variables for Each Phase

| Phase | Variables |
|-------|-----------|
| 2 | `FACILITATOR_URL`, `PAY_TO` (platform wallet) |
| 2 | `REDIS_URL` (idempotency) |
| 3 | `PLATFORM_FEE_PERCENT` (e.g. 10) |
| 5 | Payout wallet config (for MVP) |

---

## Recommended Order for AI Tasks

1. **Phase 0** — Schema + types; run `pnpm db:sync` to apply migrations.
2. **Phase 1** — Project CRUD + OpenAPI ingestion + pricing config.
3. **Phase 2** — Facilitator + idempotency + ledger.
4. **Phase 3** — Gateway routes + x402 middleware + proxy + `onAfterSettle`.
5. **Phase 4** — Dashboard + balance/usage queries.
6. **Phase 5** — Withdrawal request + admin approval flow.

Each phase builds on the previous one, and the spec and extra recommendations provide the context for implementation.
