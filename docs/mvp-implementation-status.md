# MVP Implementation Status

Pay-per-request API gateway with x402 and custodial aggregation.

> Last updated after implementing `docs/implementation-review.md` (all P0, P1, P2
> and actionable P3 findings). The gateway now serves a paid request end to end;
> before this pass it could not.

## Build order (spec §8)

| Step | State |
|---|---|
| 1. Onboarding + projects + OpenAPI ingestion | Done |
| 2. Endpoint pricing config | Done |
| 3. x402-enabled gateway | Done |
| 4. Internal ledger + balances | Done |
| 5. Dashboard for usage/revenue | Done |
| 6. Manual withdrawal workflow | Done (payout is executed by hand, then recorded) |
| 7. Public API directory | Deferred (post-MVP, per spec) |

## What's Built

### Phase 0: Schema & Types

| File | Purpose |
|------|---------|
| `packages/db/src/schema/user-balance.ts` | `user_balance` — available/pending/withdrawn per user, with `CHECK … >= 0` on all three |
| `packages/db/src/schema/ledger-entry.ts` | `ledger_entry` — append-only financial log; all FKs `ON DELETE RESTRICT`, unique `request_id` per credit, and a `CHECK` that `platform_fee + provider_credit = amount` |
| `packages/db/src/schema/payment-receipt.ts` | `payment_receipt` — the payment reservation and settlement trail; `pending` rows are the reconciliation queue |
| `packages/db/src/schema/withdrawal.ts` | `withdrawal_request` — payout requests, now with `payout_tx_hash` and `completed_at` |
| `packages/db/src/migrations/0002_wise_namorita.sql` | Phase 0 tables |
| `packages/db/src/migrations/0003_glossy_nightmare.sql` | Money-integrity hardening. **Read the preconditions comment at the top before applying to a database with existing rows.** |

### Phase 1: Payment Verification & Ledger

| File | Purpose |
|------|---------|
| `apps/server/src/services/payment-verification.ts` | x402 resource server singleton with memoized `initialize()`, `getPayTo()`, `getNetwork()`, `getPlatformFeePercent()`, startup config check |
| `apps/server/src/services/ledger.ts` | `creditProvider()` — the single writer of credits; idempotent, exact fee split |
| `packages/env/src/index.ts` | `FACILITATOR_URL`, `PAY_TO` (address-validated), `PLATFORM_FEE_PERCENT`, `X402_NETWORK` (CAIP-2 validated) + a startup assert that the testnet-only public facilitator is not paired with another chain |

The withdrawal state machine lives in `packages/api/src/routers/{withdrawal,admin}.ts`,
which is the only layer that uses it — `services/ledger.ts` no longer carries
unreferenced duplicates of it.

**Installed packages:** `@x402/express`, `@x402/core`, `@x402/evm`

### Phase 2: x402 Gateway

| File | Purpose |
|------|---------|
| `apps/server/src/routes/gateway/index.ts` | The handler at `/gateway/:apiId/{*path}` |
| `apps/server/src/routes/gateway/routing.ts` | Path normalization (origin-escape safe), endpoint matching, x402 route config |
| `apps/server/src/routes/gateway/reservation.ts` | Atomic single-use claim on a payment payload |
| `apps/server/src/routes/gateway/payment-key.ts` | Server-derived replay key (EIP-3009 / Permit2 nonce) |
| `apps/server/src/routes/gateway/proxy.ts` | Upstream URL/header/response handling |
| `apps/server/src/routes/gateway/api-cache.ts` | Version-keyed endpoint cache (never serves a stale price) |
| `apps/server/src/routes/gateway/money.ts` | Atomic ↔ decimal amount conversion |

**Request flow:**
1. Resolve `apiId` → owner, base URL, ban status (one query; endpoints cached against `provider_api.updated_at`)
2. Match `method + path` → `provider_endpoint`, literal paths preferred over templated ones
3. No payment → HTTP 402 with x402 payment requirements
4. Payment present → verify via facilitator. x402 gets a wildcard route config, since the gateway has already matched and priced the request — there is no second matcher to disagree with it. A priced endpoint that x402 still reports as free fails closed with a 500 rather than being served
5. **Reserve the payment payload** (atomic insert keyed on the on-chain nonce) — replays get 409 before any upstream work
6. Proxy to `provider_api.base_url`; redirects are refused
7. Settle via facilitator, only on a 2xx upstream
8. Credit the provider for the amount actually settled — the ledger write and the receipt claim share one transaction
9. Return the upstream response + `PAYMENT-RESPONSE` header

### Phase 3: Balance & Analytics

| File | Procedures |
|------|-----------|
| `packages/api/src/routers/balance.ts` | `balance.get`; `balance.getLedger` — paginated with filters and `totalCount` |
| `packages/api/src/routers/analytics.ts` | `analytics.getSummary` / `getUsageByApi` / `getRevenueByPeriod`. `totalGrossVolume` is what callers paid; `totalProviderCredits` is the provider's revenue (spec §14) |

### Phase 4: Withdrawals

| File | Procedures |
|------|-----------|
| `packages/api/src/routers/withdrawal.ts` | `withdrawal.request` (locks the balance row, enforces the $1 minimum); `withdrawal.list` |
| `packages/api/src/routers/admin.ts` | `admin.listWithdrawals`; `approveWithdrawal` (clears for payout, funds stay pending); `completeWithdrawal` (records the transfer that happened, moves pending → withdrawn); `rejectWithdrawal` (refunds) |

### Phase 5: Dashboard UI

| File | Purpose |
|------|---------|
| `apps/web/src/routes/_auth/dashboard.tsx` | Earnings, balances, request count, per-API usage |
| `apps/web/src/routes/_auth/transactions.tsx` | Paginated ledger with type filter |
| `apps/web/src/routes/_auth/withdrawals.tsx` | Withdrawal request form + history |
| `apps/web/src/components/admin/withdrawal-queue.tsx` | Admin payout queue (approve / complete / reject) |
| `apps/web/src/components/projects/api-endpoints-table.tsx` | Gateway URL with copy button; "Unpriced" badges |

### Integration

| File | Change |
|------|--------|
| `packages/api/src/routers/index.ts` | Registers `analytics`, `balance`, `withdrawal`; `organization` deliberately unregistered (spec §6.0: one balance per user) |
| `packages/auth/src/index.ts` | Better Auth's `organization` plugin is unregistered too — unregistering only the tRPC router left its REST invite surface live |
| `apps/server/src/app.ts` | `/gateway` mounted with its own wildcard, credential-free CORS so browser x402 clients can read the payment headers; dashboard CORS stays pinned to `CORS_ORIGIN` |

## What's Not Built

- **API Discovery** — public API directory/search (Phase 5, post-MVP)
- **Client SDK** — `@zapx/client` with automatic x402 payment handling (Phase 6, post-MVP)
- **Streaming responses** — the proxy fully buffers, so SSE and chunked LLM
  endpoints are out of scope: streaming would require settling before the first
  byte, inverting the "only settle on a 2xx" rule
- **Automated payout execution** — an operator sends the USDC by hand and then
  calls `admin.completeWithdrawal`; nothing signs transfers automatically
- **Per-wallet / per-endpoint rate limiting** — rate limiting is per-IP only;
  spec §9 also asks for the payer and endpoint dimensions
- **DNS-resolving SSRF protection** — registration-time validation is literal;
  request time is covered by refusing redirects, not by re-resolving hosts
- **API slug routing** — routing uses the API `id`
- **The `payment-identifier` x402 extension** — replay protection is keyed on the
  on-chain nonce instead, which needs no client cooperation and cannot be spoofed

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
├── admin.listWithdrawals / approveWithdrawal / completeWithdrawal / rejectWithdrawal
├── analytics.getSummary / getUsageByApi / getRevenueByPeriod
├── api.listByProject / create / updateEndpointPricing / updateBaseUrl / delete
├── balance.get / getLedger
├── project.list / getById / create / update / delete
└── withdrawal.request / list
```

## Tests

`apps/server/src/__tests__/` — run with `pnpm --filter server test`.
Unit coverage for the routing, money, replay-key, SSRF and pricing logic, plus a
Supertest suite over the gateway (402 challenge, paid path, replay, upstream
failure, header hygiene) driven by local stub facilitator and upstream servers.

The paid-path integration tests **skip themselves** until
`0003_glossy_nightmare.sql` is applied to `DATABASE_URL`, since the payment
reservation needs the new `payment_receipt` columns. Everything else runs
unconditionally.
