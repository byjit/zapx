# Edge Cases & Known Gaps

Issues, race conditions, and unhandled scenarios in the current MVP implementation. Organized by severity.

---

## Critical — Money at Risk

### 1. Payment settled but ledger credit fails

**File:** `apps/server/src/routes/gateway/index.ts:222-252`

If `creditProvider()` or the `paymentReceipt` insert throws after `processSettlement()` succeeds, the USDC has already moved on-chain but the provider's balance is never credited. The error is logged but there is no retry queue or reconciliation job.

**Impact:** Provider loses earnings. Platform holds USDC it hasn't accounted for.

**Fix:** Add a dead-letter queue (BullMQ). On ledger failure, enqueue the credit with all context (userId, amount, txHash). A worker retries until the ledger write succeeds. Add a reconciliation script that compares on-chain `paymentReceipt` records against `ledger_entry` rows and flags mismatches.

---

### 2. Upstream fails after payment is verified but before settlement

**File:** `apps/server/src/routes/gateway/index.ts:202-208`

The flow is: verify → proxy upstream → settle. If `fetchUpstream()` throws or returns a 5xx, the gateway still calls `processSettlement()`. The client paid, received a 502 or similar, and the payment is settled without the client getting the resource.

**Fix:** Only call `processSettlement()` if the upstream responded successfully (2xx). If upstream fails, don't settle and return a 502 to the client. The client can retry with the same payment signature (the facilitator hasn't settled it yet, so it's still valid).

---

### 3. No row-level lock on balance check during withdrawal

**File:** `packages/api/src/routers/withdrawal.ts:32-48`

The withdrawal transaction reads `availableBalance` and then deducts. Under concurrent requests, two withdrawals could read the same balance before either deducts, draining more than available. The `SELECT` inside the transaction doesn't use `FOR UPDATE`.

**Fix:** Use `SELECT ... FOR UPDATE` on the `user_balance` row. In Drizzle, this requires a raw SQL query or the `.for("update")` modifier if supported.

---

### 4. Floating-point arithmetic on financial amounts

**Files:** `apps/server/src/services/ledger.ts:17-19`, `packages/api/src/routers/withdrawal.ts:23`

`Number.parseFloat()` and multiplication are used to compute `platformFee` and `providerCredit`. IEEE 754 floating-point cannot represent all decimals exactly. For example, `0.001 * 10 / 100 = 0.00010000000000000002`.

**Impact:** Rounding errors accumulate over millions of transactions. Ledger may not balance.

**Fix:** Use a decimal library (e.g., `decimal.js` or `big.js`) or perform all arithmetic in integer atomic units (multiply by 1e6 for USDC's 6 decimals, compute in integers, convert back).

---

## High — Security / Data Integrity

### 5. No replay protection / idempotency for gateway requests

**File:** `apps/server/src/routes/gateway/index.ts`

The x402 `payment-identifier` extension is not implemented. If a client retries a request with the same payment signature (e.g., network timeout on first attempt), the gateway will attempt to settle the same payment twice. The facilitator may reject it, but the behavior is undefined.

**Fix:** Before calling `processSettlement()`, check if a `payment_receipt` already exists for the `paymentId` / `txHash`. If found, return the cached response. Use Redis for hot lookups in production.

---

### 6. Gateway doesn't verify the API owner is active / not banned

**File:** `apps/server/src/routes/gateway/index.ts:111`

The gateway looks up the API by ID and proxies to its `baseUrl`. It never checks if the owning user is banned or if the API is in a disabled state. A banned provider's APIs continue to earn money.

**Fix:** Join on `user` table during API lookup and check `user.banned`. Add a `status` column to `provider_api` (active/disabled/suspended). Check both in `getCachedApiData()`.

---

### 7. Provider can set `baseUrl` to internal/private IPs (SSRF)

**File:** `apps/server/src/routes/gateway/index.ts:299-348`

`fetchUpstream()` uses `fetch()` with whatever `baseUrl` the provider stored. A malicious provider could set `baseUrl` to `http://169.254.169.254` (cloud metadata), `http://localhost:8000/api/...` (internal APIs), or any internal service.

**Fix:** Validate `baseUrl` on API creation: reject private IPs, loopback, link-local, and cloud metadata ranges. Optionally use a DNS resolver that filters private IPs before connecting.

---

### 8. In-memory cache is never bounded or invalidated on updates

**File:** `apps/server/src/routes/gateway/index.ts:28-66`

`apiCache` is an unbounded `Map`. If thousands of APIs are queried, it grows without limit. Entries expire after 60s by TTL, but stale pricing persists for up to a minute after an endpoint price update. In a multi-instance deployment, each instance has its own cache — a price change on one instance isn't visible to others.

**Fix:** Cap the cache (LRU with max size). For multi-instance: use Redis as a shared cache or publish cache invalidation events on price update. Reduce TTL if stale pricing is unacceptable.

---

### 9. No timeout on upstream proxy requests

**File:** `apps/server/src/routes/gateway/index.ts:299-348`

`fetchUpstream()` has no `AbortSignal` timeout. A slow or hanging upstream can hold the gateway connection open indefinitely, eventually exhausting connection pools.

**Fix:** Add `signal: AbortSignal.timeout(30_000)` (or configurable) to the `fetch()` call.

---

## Medium — Functional Gaps

### 10. `matchPath()` doesn't handle wildcard or regex patterns

**File:** `apps/server/src/routes/gateway/index.ts:351-370`

The path matcher handles exact matches and simple `{param}` / `:param` segments. It does not support:
- Wildcards: `/files/**`
- Optional segments: `/users/{id?}`
- Regex constraints: `/users/{id:[0-9]+}`

OpenAPI specs commonly use these. A provider uploading a complex spec will have endpoints that never match at the gateway.

**Fix:** Use a proper path-matching library (e.g., `path-to-regexp`) to compile OpenAPI path templates into matchers.

---

### 11. Binary request/response bodies are not forwarded correctly

**File:** `apps/server/src/routes/gateway/index.ts:341-345`

POST/PUT/PATCH bodies are forwarded with `JSON.stringify(req.body)`. If the upstream expects `multipart/form-data`, raw binary, or URL-encoded data, this re-serialization corrupts the payload. Similarly, upstream binary responses (images, PDFs) go through `arrayBuffer()` → `Buffer` which works, but the `content-type` is not validated.

**Fix:** Forward the raw request body instead of re-serializing. Use `req.pipe()` or buffer `req` before `express.json()` runs. For the gateway specifically, avoid parsing the body with `express.json()` on `/gateway` routes.

---

### 12. Network is hardcoded to Base Sepolia

**File:** `apps/server/src/routes/gateway/index.ts:22`

`BASE_SEPOLIA_NETWORK = "eip155:84532"` is a constant. There is no way for a provider to specify which network they want, and switching to mainnet requires a code change.

**Fix:** Make the network configurable via env var (`X402_NETWORK`). Support per-endpoint network configuration in the `provider_endpoint` table.

---

### 13. x402 resource server is re-created per request

**File:** `apps/server/src/routes/gateway/index.ts:141-150`

A new `HTTPFacilitatorClient`, `x402ResourceServer`, and `x402HTTPResourceServer` are instantiated for every gateway request. The `registerExactEvmScheme()` call and facilitator initialization may involve network calls or setup overhead.

**Fix:** Use the singleton from `payment-verification.ts` (`getResourceServer()`) which already exists but isn't used in the gateway. Build `x402HTTPResourceServer` per-request (because routes differ), but reuse the underlying `x402ResourceServer`.

---

### 14. Deleted API or endpoint still served from cache

**File:** `apps/server/src/routes/gateway/index.ts:53-66`

If a provider deletes an API or endpoint, the cache continues serving it for up to 60 seconds. During this window, payments can be collected and proxied to an upstream that may no longer exist.

**Fix:** Invalidate the cache entry when an API or endpoint is deleted/updated. In the `api.ts` tRPC router, call `apiCache.delete(apiId)` or publish an invalidation event.

---

### 15. Withdrawal race: user can spam withdrawal requests

**File:** `packages/api/src/routers/withdrawal.ts:32-48`

Even within a transaction, a user could fire many concurrent withdrawal requests before any transaction commits. Each reads the full `availableBalance` and deducts, potentially overdrawing.

Same root cause as #3 — no `FOR UPDATE` lock.

---

### 16. Admin withdrawal approval has no double-approval guard

**File:** `packages/api/src/routers/admin.ts:261-300`

Two admins clicking "approve" at the same time could both read `status = "pending"` and both execute the approval transaction, doubling the balance deduction. The status check is inside a transaction but without a row lock.

**Fix:** Use `SELECT ... FOR UPDATE` on the `withdrawal_request` row inside the transaction, or add a unique constraint on `(id, status)` transitions.

---

## Low — Operational / Polish

### 17. `balance.get` returns a synthetic object when no row exists

**File:** `packages/api/src/routers/balance.ts:16-23`

When a user has never received a payment, there is no `user_balance` row. The router returns a hardcoded object with `"0"` balances. This object doesn't have `id`, `createdAt`, or `updatedAt` fields, which could confuse frontend code expecting a full record.

**Fix:** Either always create a `user_balance` row on user signup, or return a properly shaped default with all fields.

---

### 18. `getLedger` returns no total count for pagination

**File:** `packages/api/src/routers/balance.ts:26-64`

The ledger query returns a page of results but no `totalCount`. The frontend can't know how many pages exist without a separate count query.

**Fix:** Return `{ entries, totalCount }` by running a parallel `count()` query.

---

### 19. Analytics queries will get slow at scale

**Files:** `packages/api/src/routers/analytics.ts`

`getSummary`, `getUsageByApi`, and `getRevenueByPeriod` all scan `ledger_entry` with aggregations. There are indexes on `user_id`, `api_id`, `type`, and `created_at`, but as the table grows to millions of rows, these queries will slow down.

**Fix:** Materialized views, pre-aggregated daily summary tables, or a time-series database for analytics. Consider adding a `gateway_request` table for request-level logging separate from financial ledger.

---

### 20. No minimum withdrawal amount

**File:** `packages/api/src/routers/withdrawal.ts:15`

The amount regex accepts any positive decimal, including `0.000001`. Processing micro-withdrawals (manual USDC transfer for MVP) is not practical.

**Fix:** Add a minimum withdrawal threshold (e.g., `$1.00`).

---

### 21. Upstream response headers are mostly dropped

**File:** `apps/server/src/routes/gateway/index.ts:259-265`

Only `content-type` is forwarded from the upstream response. Other headers the client might need (e.g., `cache-control`, `etag`, `x-ratelimit-*`, `content-disposition`) are silently dropped.

**Fix:** Forward all upstream response headers except hop-by-hop and payment-related ones.

---

### 22. No rate limiting on gateway routes

**File:** `apps/server/src/app.ts`

The global rate limiter applies to `/gateway` routes with the same `global:` key prefix. This means gateway traffic shares limits with web asset requests. A high-volume API consumer could inadvertently rate-limit dashboard users.

**Fix:** Use a separate rate limit key for gateway traffic (e.g., `gateway:${ip}` or `gateway:${apiId}:${ip}`). Consider per-API rate limits configurable by the provider.

---

### 23. No health check for the facilitator connection

The server starts and accepts gateway requests even if the facilitator URL is unreachable. The first payment attempt would fail with an opaque error.

**Fix:** On startup, call `GET /supported` on the facilitator to verify connectivity and log supported networks. Fail loudly if the facilitator is unreachable and `PAY_TO` is set.

---

### 24. Query param duplication in upstream proxy

**File:** `apps/server/src/routes/gateway/index.ts:306-313`

`req.originalUrl` includes the full path with query params (e.g., `/gateway/abc123/weather?city=London`). The code parses `originalUrl` and appends its search params to the upstream URL. But `path` already came from Express params. If the upstream `baseUrl` has a path component, `new URL(path, baseUrl)` may resolve incorrectly.

**Fix:** Use `req.query` directly to build upstream query params instead of re-parsing `originalUrl`.
