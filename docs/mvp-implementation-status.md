# MVP Implementation Status

Pay-per-request API gateway with x402 and custodial aggregation.

## What's Built

### Phase 0: Schema & Types

| File | Purpose |
|------|---------|
| `packages/db/src/schema/user-balance.ts` | `user_balance` table — available, pending, withdrawn balances per user |
| `packages/db/src/schema/ledger-entry.ts` | `ledger_entry` table — append-only financial log (credit/debit/withdrawal/refund) |
| `packages/db/src/schema/payment-receipt.ts` | `payment_receipt` table — settlement tracking with unique payment IDs |
| `packages/db/src/schema/withdrawal.ts` | `withdrawal_request` table — payout requests with status workflow |
| `packages/db/src/migrations/0002_wise_namorita.sql` | Migration for all Phase 0 tables |

### Phase 1: Payment Verification & Ledger

| File | Purpose |
|------|---------|
| `apps/server/src/services/payment-verification.ts` | x402 resource server factory, `getPayTo()`, `getPlatformFeePercent()` |
| `apps/server/src/services/ledger.ts` | `creditProvider()`, `debitWithdrawal()`, `completeWithdrawal()`, `refundWithdrawal()` |
| `packages/env/src/index.ts` | Added `FACILITATOR_URL`, `PAY_TO`, `PLATFORM_FEE_PERCENT` env vars |

**Installed packages:** `@x402/express`, `@x402/core`, `@x402/evm`

### Phase 2: x402 Gateway

| File | Purpose |
|------|---------|
| `apps/server/src/routes/gateway/index.ts` | Gateway at `/gateway/:apiId/{*path}` — the core product |

**Request flow:**
1. Resolve `apiId` → `provider_api` record (with 1-minute cache)
2. Match `method + path` → `provider_endpoint` with `priceUsdc`
3. No payment → return HTTP 402 with x402 payment requirements
4. Payment header present → verify via facilitator
5. Proxy request to upstream `provider_api.base_url`
6. Settle payment via facilitator
7. Credit provider via `ledger.creditProvider()`
8. Record `payment_receipt`
9. Return upstream response + `PAYMENT-RESPONSE` header

### Phase 3: Balance & Analytics

| File | Procedures |
|------|-----------|
| `packages/api/src/routers/balance.ts` | `balance.get` — user balance; `balance.getLedger` — paginated ledger with filters |
| `packages/api/src/routers/analytics.ts` | `analytics.getSummary` — totals; `analytics.getUsageByApi` — per-API breakdown; `analytics.getRevenueByPeriod` — time series |

### Phase 4: Withdrawals

| File | Procedures |
|------|-----------|
| `packages/api/src/routers/withdrawal.ts` | `withdrawal.request` — create withdrawal (validates balance, moves to pending); `withdrawal.list` — user history |
| `packages/api/src/routers/admin.ts` | `admin.listWithdrawals` — all requests; `admin.approveWithdrawal` — approve + complete; `admin.rejectWithdrawal` — reject + refund |

### Integration

| File | Change |
|------|--------|
| `packages/api/src/routers/index.ts` | Registered `analytics`, `balance`, `withdrawal` routers in `appRouter` |
| `apps/server/src/app.ts` | Mounted `/gateway` route; added x402 headers to CORS |

## What's Not Built

- **Dashboard UI** — Balance cards, revenue charts, transaction list, withdrawal form (backend APIs are ready)
- **API Discovery** — Public API directory/search (Phase 5, post-MVP)
- **Client SDK** — `@zapx/client` with automatic x402 payment handling (Phase 6, post-MVP)
- **End-to-end test** — Full flow: client → 402 → pay → gateway → proxy → response → ledger credit
- **Redis idempotency cache** — Payment-identifier extension for production replay protection
- **API slug routing** — Currently uses API `id`; slug-based routing can be added

## Server Routes

| Path | Handler | Purpose |
|------|---------|---------|
| `/api/auth/*` | Better Auth | Login, OAuth, sessions |
| `/api/v1/*` | REST routes | Custom REST endpoints |
| `/trpc/*` | tRPC | Control plane (projects, APIs, balances, withdrawals, admin) |
| `/gateway/:apiId/*` | x402 Gateway | Data plane (payment, proxy, ledger) |
| `/docs` | Swagger UI | API documentation |
| `/health` | Health check | `{ status: "ok" }` |

## tRPC Router Map

```
appRouter
├── system.healthCheck
├── system.privateData
├── admin.listUsers / banUser / unbanUser / removeUser / impersonateUser / stopImpersonating
├── admin.listWithdrawals / approveWithdrawal / rejectWithdrawal
├── analytics.getSummary / getUsageByApi / getRevenueByPeriod
├── api.listByProject / create / updateEndpointPricing
├── balance.get / getLedger
├── organization.list / create / setActive / getFull / update / delete / ...
├── project.list / getById / create / update / delete
└── withdrawal.request / list
```
