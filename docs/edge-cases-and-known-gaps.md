# Edge Cases & Known Gaps

Issues, race conditions, and unhandled scenarios found in the MVP implementation.
Organized by severity.

> **Reviewed 2026-07-25.** Every item below now carries a status line. The original
> analysis is kept verbatim for provenance, so the **file paths and line numbers in
> the bodies point at the pre-fix code** and no longer match the tree — read the
> status line, not the line number. Items #1, #5, #7, #10 and #22 were previously
> marked fixed in code comments while only partly addressed; their status lines say
> exactly what is and is not covered now. Only #19 (analytics at scale) remains
> fully open, deliberately.

---

## Critical — Money at Risk

### 1. Payment settled but ledger credit fails

> Status: **Addressed** (2026-07-25) — `creditProvider()` claims the payment receipt inside the crediting transaction, so a `payment_receipt` row left at `status = 'pending'` is now a durable, queryable reconciliation record rather than only a log line. A retry queue is still deferred, per spec.

**File:** `apps/server/src/routes/gateway/index.ts:222-252`

If `creditProvider()` or the `paymentReceipt` insert throws after `processSettlement()` succeeds, the USDC has already moved on-chain but the provider's balance is never credited. The error is logged but there is no retry queue or reconciliation job.

**Impact:** Provider loses earnings. Platform holds USDC it hasn't accounted for.

**Fix:** Add a dead-letter queue (BullMQ). On ledger failure, enqueue the credit with all context (userId, amount, txHash). A worker retries until the ledger write succeeds. Add a reconciliation script that compares on-chain `paymentReceipt` records against `ledger_entry` rows and flags mismatches.

---

### 2. Upstream fails after payment is verified but before settlement

> Status: **Fixed** — the gateway settles only after a 2xx upstream response. A reservation is never handed back: releasing one on upstream failure would make a single signature an unbounded lever for free upstream work, since the caller can induce the failure (a slow query, a redirect) and nothing settles on that path. Nothing is charged either way, so retrying costs only a fresh signature.

**File:** `apps/server/src/routes/gateway/index.ts:202-208`

The flow is: verify → proxy upstream → settle. If `fetchUpstream()` throws or returns a 5xx, the gateway still calls `processSettlement()`. The client paid, received a 502 or similar, and the payment is settled without the client getting the resource.

**Fix:** Only call `processSettlement()` if the upstream responded successfully (2xx). If upstream fails, don't settle and return a 502 to the client. The client can retry with the same payment signature (the facilitator hasn't settled it yet, so it's still valid).

---

### 3. No row-level lock on balance check during withdrawal

> Status: **Fixed** — `withdrawal.request` locks the balance row with `SELECT … FOR UPDATE`, and `user_balance` now carries `CHECK (available_balance >= 0)` as a backstop.

**File:** `packages/api/src/routers/withdrawal.ts:32-48`

The withdrawal transaction reads `availableBalance` and then deducts. Under concurrent requests, two withdrawals could read the same balance before either deducts, draining more than available. The `SELECT` inside the transaction doesn't use `FOR UPDATE`.

**Fix:** Use `SELECT ... FOR UPDATE` on the `user_balance` row. In Drizzle, this requires a raw SQL query or the `.for("update")` modifier if supported.

---

### 4. Floating-point arithmetic on financial amounts

> Status: **Fixed** — all arithmetic happens in PostgreSQL `numeric`. The provider credit is derived from the *rounded* platform fee (not rounded independently), and `CHECK (platform_fee + provider_credit = amount)` enforces it for every credit.

**Files:** `apps/server/src/services/ledger.ts:17-19`, `packages/api/src/routers/withdrawal.ts:23`

`Number.parseFloat()` and multiplication are used to compute `platformFee` and `providerCredit`. IEEE 754 floating-point cannot represent all decimals exactly. For example, `0.001 * 10 / 100 = 0.00010000000000000002`.

**Impact:** Rounding errors accumulate over millions of transactions. Ledger may not balance.

**Fix:** Use a decimal library (e.g., `decimal.js` or `big.js`) or perform all arithmetic in integer atomic units (multiply by 1e6 for USDC's 6 decimals, compute in integers, convert back).

---

## High — Security / Data Integrity

### 5. No replay protection / idempotency for gateway requests

> Status: **Fixed** — differently than proposed. The replay key is derived from the payment payload itself (the EIP-3009/Permit2 nonce), never from a client-supplied header or extension, and the receipt row is inserted *before* the upstream call. A client-chosen identifier was rejected as a design: it would let one caller squat on another's key, and let a caller replay one settled payment forever by re-signing under the same key.

**File:** `apps/server/src/routes/gateway/index.ts`

The x402 `payment-identifier` extension is not implemented. If a client retries a request with the same payment signature (e.g., network timeout on first attempt), the gateway will attempt to settle the same payment twice. The facilitator may reject it, but the behavior is undefined.

**Fix:** Before calling `processSettlement()`, check if a `payment_receipt` already exists for the `paymentId` / `txHash`. If found, return the cached response. Use Redis for hot lookups in production.

---

### 6. Gateway doesn't verify the API owner is active / not banned

> Status: **Fixed** — `getApiWithEndpoints()` joins `user` and the handler returns 403 for a banned owner. Ban status comes from a fresh probe on every request, so it is never served stale.

**File:** `apps/server/src/routes/gateway/index.ts:111`

The gateway looks up the API by ID and proxies to its `baseUrl`. It never checks if the owning user is banned or if the API is in a disabled state. A banned provider's APIs continue to earn money.

**Fix:** Join on `user` table during API lookup and check `user.banned`. Add a `status` column to `provider_api` (active/disabled/suspended). Check both in `getCachedApiData()`.

---

### 7. Provider can set `baseUrl` to internal/private IPs (SSRF)

> Status: **Fixed at both ends** — `validateBaseUrl()` rejects private/loopback literals plus IPv4-mapped IPv6, `fc00::/7`, `fe80::/10` and wildcard loopback domains (`localtest.me`, `*.localhost`, `nip.io`); `fetchUpstream()` sets `redirect: "error"` so a validated public host cannot redirect into the private network at request time. Full DNS-resolve-and-recheck remains out of scope.

**File:** `apps/server/src/routes/gateway/index.ts:299-348`

`fetchUpstream()` uses `fetch()` with whatever `baseUrl` the provider stored. A malicious provider could set `baseUrl` to `http://169.254.169.254` (cloud metadata), `http://localhost:8000/api/...` (internal APIs), or any internal service.

**Fix:** Validate `baseUrl` on API creation: reject private IPs, loopback, link-local, and cloud metadata ranges. Optionally use a DNS resolver that filters private IPs before connecting.

---

### 8. In-memory cache is never bounded or invalidated on updates

> Status: **Fixed** — the endpoint cache is LRU-bounded at one entry per API and keyed on `provider_api.updated_at`, so a price change takes effect on the next request. Because every instance reads that version from the database, there is no cross-instance staleness either.

**File:** `apps/server/src/routes/gateway/index.ts:28-66`

`apiCache` is an unbounded `Map`. If thousands of APIs are queried, it grows without limit. Entries expire after 60s by TTL, but stale pricing persists for up to a minute after an endpoint price update. In a multi-instance deployment, each instance has its own cache — a price change on one instance isn't visible to others.

**Fix:** Cap the cache (LRU with max size). For multi-instance: use Redis as a shared cache or publish cache invalidation events on price update. Reduce TTL if stale pricing is unacceptable.

---

### 9. No timeout on upstream proxy requests

> Status: **Fixed** — `AbortSignal.timeout(30_000)`.

**File:** `apps/server/src/routes/gateway/index.ts:299-348`

`fetchUpstream()` has no `AbortSignal` timeout. A slow or hanging upstream can hold the gateway connection open indefinitely, eventually exhausting connection pools.

**Fix:** Add `signal: AbortSignal.timeout(30_000)` (or configurable) to the `fetch()` call.

---

## Medium — Functional Gaps

### 10. `matchPath()` doesn't handle wildcard or regex patterns

> Status: **Mostly fixed** — `matchPath()` handles `/files/*`, `/files/**`, `{param}`, `{param?}` and `:param`, and OpenAPI templates are translated to the `:param` syntax x402's own matcher understands. Regex constraints (`/users/{id:[0-9]+}`) are still unsupported.

**File:** `apps/server/src/routes/gateway/index.ts:351-370`

The path matcher handles exact matches and simple `{param}` / `:param` segments. It does not support:
- Wildcards: `/files/**`
- Optional segments: `/users/{id?}`
- Regex constraints: `/users/{id:[0-9]+}`

OpenAPI specs commonly use these. A provider uploading a complex spec will have endpoints that never match at the gateway.

**Fix:** Use a proper path-matching library (e.g., `path-to-regexp`) to compile OpenAPI path templates into matchers.

---

### 11. Binary request/response bodies are not forwarded correctly

> Status: **Fixed** — `express.raw()` on gateway routes; the raw buffer is forwarded without re-serialization.

**File:** `apps/server/src/routes/gateway/index.ts:341-345`

POST/PUT/PATCH bodies are forwarded with `JSON.stringify(req.body)`. If the upstream expects `multipart/form-data`, raw binary, or URL-encoded data, this re-serialization corrupts the payload. Similarly, upstream binary responses (images, PDFs) go through `arrayBuffer()` → `Buffer` which works, but the `content-type` is not validated.

**Fix:** Forward the raw request body instead of re-serializing. Use `req.pipe()` or buffer `req` before `express.json()` runs. For the gateway specifically, avoid parsing the body with `express.json()` on `/gateway` routes.

---

### 12. Network is hardcoded to Base Sepolia

> Status: **Fixed** — `X402_NETWORK`, validated as a CAIP-2 chain id, with a startup assert that the testnet-only public facilitator is not paired with another chain. Per-endpoint networks remain out of scope.

**File:** `apps/server/src/routes/gateway/index.ts:22`

`BASE_SEPOLIA_NETWORK = "eip155:84532"` is a constant. There is no way for a provider to specify which network they want, and switching to mainnet requires a code change.

**Fix:** Make the network configurable via env var (`X402_NETWORK`). Support per-endpoint network configuration in the `provider_endpoint` table.

---

### 13. x402 resource server is re-created per request

> Status: **Fixed** — the singleton `x402ResourceServer` is reused and its `initialize()` is memoized once per process; only the lightweight `x402HTTPResourceServer` is built per request.

**File:** `apps/server/src/routes/gateway/index.ts:141-150`

A new `HTTPFacilitatorClient`, `x402ResourceServer`, and `x402HTTPResourceServer` are instantiated for every gateway request. The `registerExactEvmScheme()` call and facilitator initialization may involve network calls or setup overhead.

**Fix:** Use the singleton from `payment-verification.ts` (`getResourceServer()`) which already exists but isn't used in the gateway. Build `x402HTTPResourceServer` per-request (because routes differ), but reuse the underlying `x402ResourceServer`.

---

### 14. Deleted API or endpoint still served from cache

> Status: **Fixed** — the version-keyed cache cannot outlive an update, and `api.delete` is refused outright once an API has payment history.

**File:** `apps/server/src/routes/gateway/index.ts:53-66`

If a provider deletes an API or endpoint, the cache continues serving it for up to 60 seconds. During this window, payments can be collected and proxied to an upstream that may no longer exist.

**Fix:** Invalidate the cache entry when an API or endpoint is deleted/updated. In the `api.ts` tRPC router, call `apiCache.delete(apiId)` or publish an invalidation event.

---

### 15. Withdrawal race: user can spam withdrawal requests

> Status: **Fixed** — same lock as #3, plus the database-level non-negative check.

**File:** `packages/api/src/routers/withdrawal.ts:32-48`

Even within a transaction, a user could fire many concurrent withdrawal requests before any transaction commits. Each reads the full `availableBalance` and deducts, potentially overdrawing.

Same root cause as #3 — no `FOR UPDATE` lock.

---

### 16. Admin withdrawal approval has no double-approval guard

> Status: **Fixed** — every admin transition goes through one `lockWithdrawal()` helper that takes `SELECT … FOR UPDATE` and asserts the allowed source statuses, so the lock and the guard cannot drift apart.

**File:** `packages/api/src/routers/admin.ts:261-300`

Two admins clicking "approve" at the same time could both read `status = "pending"` and both execute the approval transaction, doubling the balance deduction. The status check is inside a transaction but without a row lock.

**Fix:** Use `SELECT ... FOR UPDATE` on the `withdrawal_request` row inside the transaction, or add a unique constraint on `(id, status)` transitions.

---

## Low — Operational / Polish

### 17. `balance.get` returns a synthetic object when no row exists

> Status: **Fixed** — a fully shaped default is returned.

**File:** `packages/api/src/routers/balance.ts:16-23`

When a user has never received a payment, there is no `user_balance` row. The router returns a hardcoded object with `"0"` balances. This object doesn't have `id`, `createdAt`, or `updatedAt` fields, which could confuse frontend code expecting a full record.

**Fix:** Either always create a `user_balance` row on user signup, or return a properly shaped default with all fields.

---

### 18. `getLedger` returns no total count for pagination

> Status: **Fixed** — `{ entries, totalCount }`.

**File:** `packages/api/src/routers/balance.ts:26-64`

The ledger query returns a page of results but no `totalCount`. The frontend can't know how many pages exist without a separate count query.

**Fix:** Return `{ entries, totalCount }` by running a parallel `count()` query.

---

### 19. Analytics queries will get slow at scale

> Status: **Open** — deliberately deferred. Materialized views are outside MVP scope.

**Files:** `packages/api/src/routers/analytics.ts`

`getSummary`, `getUsageByApi`, and `getRevenueByPeriod` all scan `ledger_entry` with aggregations. There are indexes on `user_id`, `api_id`, `type`, and `created_at`, but as the table grows to millions of rows, these queries will slow down.

**Fix:** Materialized views, pre-aggregated daily summary tables, or a time-series database for analytics. Consider adding a `gateway_request` table for request-level logging separate from financial ledger.

---

### 20. No minimum withdrawal amount

> Status: **Fixed** — $1.00 minimum.

**File:** `packages/api/src/routers/withdrawal.ts:15`

The amount regex accepts any positive decimal, including `0.000001`. Processing micro-withdrawals (manual USDC transfer for MVP) is not practical.

**Fix:** Add a minimum withdrawal threshold (e.g., `$1.00`).

---

### 21. Upstream response headers are mostly dropped

> Status: **Fixed** — all upstream headers are forwarded except hop-by-hop and payment headers. Also now stripped: `content-encoding` and `content-length`, which described the compressed upstream body that `fetch` had already decompressed; `set-cookie` is dropped entirely rather than comma-joined — the gateway serves from the Zapx origin, so relaying a provider's cookies would let a malicious upstream overwrite a caller's session cookie site-wide, and x402 callers are wallets and agents rather than cookie-bearing browsers.

**File:** `apps/server/src/routes/gateway/index.ts:259-265`

Only `content-type` is forwarded from the upstream response. Other headers the client might need (e.g., `cache-control`, `etag`, `x-ratelimit-*`, `content-disposition`) are silently dropped.

**Fix:** Forward all upstream response headers except hop-by-hop and payment-related ones.

---

### 22. No rate limiting on gateway routes

> Status: **Fixed for the per-IP dimension** — gateway traffic uses its own `gateway:${ip}` key. Per-wallet and per-endpoint limits (spec §9) are still open; the payer address is available on the verified payload if that dimension is wanted.

**File:** `apps/server/src/app.ts`

The global rate limiter applies to `/gateway` routes with the same `global:` key prefix. This means gateway traffic shares limits with web asset requests. A high-volume API consumer could inadvertently rate-limit dashboard users.

**Fix:** Use a separate rate limit key for gateway traffic (e.g., `gateway:${ip}` or `gateway:${apiId}:${ip}`). Consider per-API rate limits configurable by the provider.

---

### 23. No health check for the facilitator connection

> Status: **Fixed** — startup runs the same memoized `initialize()` the request path uses, so a missing scheme, a bad `X402_NETWORK` or an unreachable facilitator is reported once at boot instead of per request.

The server starts and accepts gateway requests even if the facilitator URL is unreachable. The first payment attempt would fail with an opaque error.

**Fix:** On startup, call `GET /supported` on the facilitator to verify connectivity and log supported networks. Fail loudly if the facilitator is unreachable and `PAY_TO` is set.

---

### 24. Query param duplication in upstream proxy

> Status: **Fixed** — `buildUpstreamUrl()` preserves the base URL's own path prefix (`https://api.example.com/v1` + `/weather` → `/v1/weather`) and copies the query string verbatim from the raw request line, which also preserves duplicate-key order and bracketed keys (`?filter[a]=1`) that Express's `qs` parser turns into objects.

**File:** `apps/server/src/routes/gateway/index.ts:306-313`

`req.originalUrl` includes the full path with query params (e.g., `/gateway/abc123/weather?city=London`). The code parses `originalUrl` and appends its search params to the upstream URL. But `path` already came from Express params. If the upstream `baseUrl` has a path component, `new URL(path, baseUrl)` may resolve incorrectly.

**Fix:** Use `req.query` directly to build upstream query params instead of re-parsing `originalUrl`.
