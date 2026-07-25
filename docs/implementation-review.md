# Implementation Review — spec.md vs. current code

Review date: 2026-07-25. Baseline commit: `9c00cb1` ("Implement x402 payment gateway and financial ledger"). Packages audited against the real installed `@x402/{core,evm,express,extensions}` source, not documentation alone.

> **Re-verified after the 2026-07-25 dependency upgrade** (`@x402/* 2.7.0 → 2.19.0`). Every finding below still stands on 2.19.0. In particular: `parseRoutePattern` still escapes `{` and `}` as regex literals (2.19 only added backslash escaping), and `buildPaymentRequirements` still throws the same "Make sure to call `initialize()`" error. Line numbers cited from `dist/cjs/server/index.js` refer to 2.7.0 and have shifted; function names are unchanged.

Scope: how far the code delivers **spec.md §15 (MVP Scope)** and the **§8 MVP Build Order**, and what it takes to get there. Deliberately excluded — everything spec.md itself defers: Bazaar, client SDK, public discovery, queues, edge layer, Solana, API-slug routing, materialised analytics views. All confirmed absent from the codebase, correctly so; no work proposed there.

Findings are ranked by impact, each with a **minimal** fix. Where a fix would mean new infrastructure, that is called out rather than assumed. Claims marked *verified* were reproduced by execution or read out of the installed package source.

---

## Verdict

The backend is further along than it looks. The OpenAPI ingestion → endpoint → pricing pipeline is real, the ledger uses correct `numeric(20,6)` money types with arithmetic done in SQL, withdrawal concurrency is genuinely safe (`SELECT … FOR UPDATE` with in-transaction status guards, verified against live Postgres 16), and there is **no cross-tenant data leak anywhere** — every procedure was traced.

But **the paid request path does not work end to end**, for four independent reasons, and a fifth defect lets a caller pay once and then take responses free forever. These five are the whole story; little else matters until they are fixed.

| Build-order step (spec §8) | State |
|---|---|
| 1. Onboarding + projects + OpenAPI ingestion | Done |
| 2. Endpoint pricing config | Done (validation gaps) |
| 3. x402-enabled gateway | **Broken — P0-1 … P0-5** |
| 4. Internal ledger + balances | Done (accounting defects P1-1 … P1-4) |
| 5. Dashboard for usage/revenue | **Not started** — backend ready, zero UI |
| 6. Manual withdrawal workflow | Backend done, **no UI**, payout step unmodelled |
| 7. Public API directory | Correctly deferred |

Worth stating plainly: all five P0s are the kind of defect one end-to-end test would have caught. There are currently **zero backend tests**.

---

## P0 — The gateway cannot serve a paid request

### P0-1. `initialize()` is never called on the x402 resource server

`apps/server/src/services/payment-verification.ts:8-19`

`getResourceServer()` constructs `x402ResourceServer` and registers the EVM exact scheme, but never awaits `initialize()` — the call that populates `supportedResponsesMap` from the facilitator's `/supported` response.

*Verified* in `@x402/core@2.7.0`: `buildPaymentRequirements` calls `getSupportedKind(...)` and, with an empty map, throws

```
Facilitator does not support exact on eip155:84532.
Make sure to call initialize() to fetch supported kinds from facilitators.
```

`processHTTPRequest` does not wrap `buildPaymentRequirementsFromOptions` in a try/catch (`dist/cjs/server/index.js:1083`), so the throw reaches the gateway's outer catch and the caller gets `502 {"error":"Gateway error"}` — never a 402 challenge. Every correctly-priced, correctly-matched endpoint is affected.

The library's own middleware handles this: `@x402/express`'s `paymentMiddlewareFromHTTPServer` does `let initPromise = syncFacilitatorOnStart ? httpServer.initialize() : null` and awaits it before the first `processHTTPRequest`. The gateway bypasses that middleware to build routes per request, and lost initialization with it.

**Fix** — memoize one init promise on the singleton. `supportedResponsesMap` lives on the shared `x402ResourceServer`, so initializing it once fixes every per-request `x402HTTPResourceServer`:

```ts
let initPromise: Promise<void> | null = null;
export async function getInitializedResourceServer() {
  const server = getResourceServer();
  initPromise ??= server.initialize().catch((e) => { initPromise = null; throw e; });
  await initPromise;
  return server;
}
```

The reset in the catch matters — otherwise one facilitator blip poisons the process for its lifetime.

### P0-2. Multi-segment paths are comma-mangled — nested routes 404

`apps/server/src/routes/gateway/index.ts:200-203`

Express 5's `{*path}` yields an **array**; `(req.params as Record<string,string>).path` casts that truth away. *Verified* against the pinned `express@5.2.1`:

| request | `req.params.path` | resulting `proxyPath` |
|---|---|---|
| `/gateway/abc/weather` | `["weather"]` | `/weather` ✓ |
| `/gateway/abc/a/b/c` | `["a","b","c"]` | **`/a,b,c`** ✗ |
| `/gateway/abc//evil.com/x` | `["","evil.com","x"]` | `/,evil.com,x` |

`matchPath` then fails against the stored `/a/b/c` and returns `404 "Endpoint not found"` before payment is ever considered. Only single-segment routes work at all — which is why this survived: the one path shape anyone would try by hand is the one shape that works.

**Fix** — join the array, and collapse leading slashes at the same time:

```ts
const seg = req.params.path;
const joined = Array.isArray(seg) ? seg.join("/") : (seg ?? "");
const proxyPath = "/" + joined.replace(/^\/+/, "");
```

The second half is not optional. `new URL("//evil.com/x", "https://api.good.com/v1")` resolves to **`https://evil.com/x`** (*verified*) — a protocol-relative SSRF that the comma bug is currently masking. Fixing the join with a naive `join("/")` and nothing else opens it.

### P0-3. OpenAPI `{param}` paths never match — those endpoints are served free

`apps/server/src/routes/gateway/index.ts:131` and `:293`

`buildRoutesConfig` builds the x402 route key from `endpoint.path`, which `parseOpenApiSpec` stores verbatim from the spec (`packages/api/src/openapi.ts:85`) — i.e. OpenAPI templating, `/users/{id}`.

x402's `parseRoutePattern` escapes `{` and `}` as regex literals. It understands `:param`, `[param]` and `*` — not braces. *Verified* by compiling the real implementation:

```
GET /users/{id}  ->  ^\/users\/\{id\}$    matches "/users/123": false
GET /users/:id   ->  ^\/users\/[^\/]+$    matches "/users/123": true
```

So `getRouteConfig` returns undefined, `processHTTPRequest` returns `{type:"no-payment-required"}`, and line 293 proxies the request **free of charge**. The gateway's own `matchPath()` matched the endpoint happily one step earlier, so nothing looks wrong in the logs. For most real OpenAPI specs this is the majority of the surface.

**Fix** — two parts, both small:

1. Translate the template when building the route key:
   ```ts
   const routePath = endpoint.path.replace(/\{([^}]+)\}/g, ":$1");
   const routeKey = `${endpoint.method.toUpperCase()} ${routePath}`;
   ```
2. Fail closed. If `matchedEndpoint.priceUsdc` is set but x402 reports `no-payment-required`, that is a config mismatch, not a free endpoint — return 500 rather than proxying. Cheap insurance against this class recurring.

### P0-4. The `payment-identifier` header lets a caller pay once and call free forever

`apps/server/src/routes/gateway/index.ts:331-341`

```ts
const paymentId = (req.headers["payment-identifier"] as string) || generateRequestId();
const existingReceipt = await findExistingReceipt(paymentId);
if (existingReceipt) { /* return upstream body */ return; }   // before processSettlement
```

The idempotency key is a **raw client-supplied header**, and the branch returns before `processSettlement` (:344) and before `creditWithRetry` (:363).

Attack: make one legitimate paid request with `payment-identifier: X`. Thereafter send a **freshly signed** payment payload — signing is free, and since nothing settles it, it never costs anything — with the same header `X`. Verification passes (fresh nonce), the receipt lookup hits, the upstream is called, the response is returned, no settlement, no credit. Unlimited free calls off a single payment, provider earns nothing on any of them. The `paymentReceipt.paymentId` unique index is global — not scoped to payer, API, endpoint, amount or payload — so a receipt created against one API unlocks free calls against **every** API on the platform.

Two further problems in the same block. The check sits *after* `fetchUpstream` (:304), so the provider's backend absorbs every replay for free — the opposite of spec §9's "return cached response without re-processing payment". And when no header is supplied the key falls back to a fresh random ID, so the lookup can never hit: on the default path there is **no replay protection at all**.

It also isn't the extension it's named after. *Verified* against `@x402/extensions`: the ID travels **inside `PaymentPayload.extensions`** as `{ "payment-identifier": { info: { required, id } } }`, never as an HTTP header; the server must advertise it via `declarePaymentIdentifierExtension()`, and `appendPaymentIdentifierToExtensions` returns unchanged if the server didn't declare it — so a compliant client *cannot* opt in to what the gateway is looking for. `paymentIdentifierResourceServerExtension` ships declaration and extraction only, no hooks; the dedupe store is ours to build.

**Fix** — see P0-5; one reservation solves both.

### P0-5. Nothing reserves a payment, so one signature serves unlimited requests

`apps/server/src/routes/gateway/index.ts:299-344`

*Verified*: `x402ResourceServer.verifyPayment` is a pure pass-through to the facilitator's `POST /verify` — no local state, no nonce cache, no dedupe — and Zapx registers no `onBeforeVerify` hook. `grep -rni "nonce|replay"` across `apps/server/src` and `packages` returns **zero hits**. Spec §9 ("Store: nonce, transaction hash, signature, timestamp. Reject duplicates") is unimplemented.

With verify → proxy → settle ordering, N concurrent requests carrying one identical `PAYMENT-SIGNATURE` all pass verify and all reach `fetchUpstream` before any reaches `processSettlement`. The provider serves N responses; EIP-3009's on-chain nonce means exactly one settle succeeds. **Provider does N units of work, is credited for 1.** The same statelessness makes P0-4 exploitable, and makes the non-2xx branch (:321-328) — which returns the upstream body without settling *and* without consuming the payload — infinitely replayable for any endpoint whose useful content sits behind a non-2xx status.

**Fix** — one atomic insert before proxying, reusing the unique index that already exists. Turns the dead `SELECT` at :333 into a real reservation, at the cost of one query:

```ts
const key = extractPaymentIdentifier(paymentPayload)
         ?? (paymentPayload.payload as any).authorization.nonce;   // EIP-3009 bytes32
const reserved = await db.insert(paymentReceipt)
  .values({ paymentId: key, amount, status: "pending" })
  .onConflictDoNothing({ target: paymentReceipt.paymentId })
  .returning();
if (reserved.length === 0) { res.status(409).json({ error: "Payment already used" }); return; }
// ...proxy, settle, then UPDATE status -> 'settled' | 'failed'
```

Server-derived key, checked before the upstream call. Client input stops being trusted, replay protection works by default, and `status:'pending'` rows double as the reconciliation queue for P1-4. Declaring the real extension (`extensions: { [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(false) }` in `buildRoutesConfig`) can follow later.

---

## P1 — Money correctness and security

### P1-1. The fee split creates money

`apps/server/src/services/ledger.ts:26-37`. Both halves are rounded to 6 dp independently:

```sql
(amount * pct / 100)::numeric(20,6)              AS platform_fee
(amount - (amount * pct / 100))::numeric(20,6)   AS provider_credit
```

When `amount * pct/100` lands on a half-ULP tie, Postgres rounds half-away-from-zero on *both* expressions and both round up, so `platform_fee + provider_credit > amount`. *Verified* against live Postgres 16 — these overshoot by +0.000001 on 100% of requests at that price point:

| price | fee % | fee | credit | drift |
|---|---|---|---|---|
| 0.0001 | 2.5 | 0.000003 | 0.000098 | +0.000001 |
| 0.0025 | 12.5 | 0.000313 | 0.002188 | +0.000001 |
| 0.00035 | 15 | 0.000053 | 0.000298 | +0.000001 |
| 0.0333 | 7.5 | 0.002498 | 0.030803 | +0.000001 |

Drift is always positive — money created, never destroyed — so recorded liabilities exceed the USDC actually collected and reconciliation (spec §6.5) can never close.

**Fix** — derive one side from the rounded other. *Verified* zero drift across all 120 price × fee combinations tested:

```sql
round(amount * pct / 100, 6)              AS platform_fee,
amount - round(amount * pct / 100, 6)     AS provider_credit
```

### P1-2. A payment can be credited twice

`gateway/index.ts:333` (read) vs `:374-392` (insert); `services/ledger.ts:20-72`.

The receipt read and insert are separated by `fetchUpstream` (up to 30 s), `processSettlement`, and `creditProvider`. Two concurrent requests with the same key both see no receipt, both settle, both credit. The unique index only fires on the insert — and that failure is caught and merely logged, *after* the ledger has already been double-credited.

`creditWithRetry` (`:171-194`) compounds it: if `creditProvider`'s transaction commits but the response is lost (Neon WS drop), the await rejects and the retry commits a second credit. Nothing at the DB level prevents this — `ledger_entry.request_id` has no unique constraint, contradicting spec §9's "Each payment linked to unique request_id".

**Fix** — partial unique index `ledger_entry(request_id) WHERE type='credit'`, and move the `paymentReceipt` write **inside** the `creditProvider` transaction so a duplicate aborts the credit instead of being logged after it.

### P1-3. The ledger is not append-only — one admin click erases it

`packages/db/src/schema/ledger-entry.ts:34`, `user-balance.ts:19`, `withdrawal.ts:33` all declare `onDelete: "cascade"` on `user_id`.

`admin.removeUser` (`packages/api/src/routers/admin.ts:118-141`) calls better-auth's `deleteUser`, a hard `DELETE`. The cascade wipes every `ledger_entry`, `user_balance` and `withdrawal_request` row for that user — including rows for payments the platform received and still custodies. Spec §8 requires the money trail be "append-only and auditable"; today that is convention only, with no triggers or constraints behind it.

**Fix** — `onDelete: "restrict"` on `ledger_entry.user_id` and `withdrawal_request.user_id`. Ban rather than delete; `admin.banUser` already exists and is used.

### P1-4. Settled-but-uncredited payments are unrecoverable

`gateway/index.ts:374-404`. The receipt is written outside the credit transaction with `status: creditSuccess ? "settled" : "pending"`, so a receipt exists even when all three credit attempts failed. The next identical request short-circuits at :334 and never retries. The USDC sits on-chain in the platform wallet but exists in the system only as a `RECONCILIATION NEEDED` log line — no ledger row, no queue, no recovery path.

**Fix** — same as P1-2. Once the receipt lives inside the credit transaction, "receipt exists" implies "provider credited", and that log line becomes a genuine exception rather than routine.

### P1-5. Inbound `Authorization` and `Cookie` are forwarded to provider-controlled upstreams

`gateway/index.ts:505-514`. `skipHeaders` covers host, hop-by-hop and payment headers but **not** `authorization`, `cookie`, or `x-forwarded-*`. Any provider can register a `baseUrl` they control and harvest the caller's Better-Auth session cookie or bearer token from browser traffic.

**Fix** — add `authorization`, `cookie`, `proxy-authorization`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`, `te`, `trailer`, `upgrade` to `skipHeaders`.

### P1-6. SSRF: the proxy follows redirects into the private network

`gateway/index.ts:523-528` sets only `method`, `headers`, `signal`; `fetch` follows redirects by default. *Verified empirically*: a validated public host returned `302 → http://127.0.0.1:<port>/` and the gateway fetched it and returned the internal body.

`packages/api/src/url-validation.ts` blocks the obvious literals well — Node's WHATWG URL normalizes `2130706433`, `0177.0.0.1`, `0x7f000001`, `127.1` and `[::1]` into blocked forms, so those are *not* bypasses. Live gaps: `http://localtest.me/` (any DNS name resolving to loopback), `[::ffff:127.0.0.1]`, and IPv6 ULA/link-local (`fc00::/7`, `fe80::`).

**Fix** — add `redirect: "error"` to the `RequestInit`. That one line closes the exploitable hole, because registration-time validation then also holds at request time. Extend the IPv6 branch to reject `::ffff:`, `fc`/`fd`, `fe80`. Full DNS-resolve-and-recheck is beyond MVP and not proposed.

### P1-7. Withdrawals book the payout before it happens

`packages/api/src/routers/admin.ts:247-309`. `approveWithdrawal` moves `pending_balance → total_withdrawn` and stops. No payout executor exists anywhere in the repo. So `total_withdrawn` records money never sent, status `completed` is unreachable, and `ledger.completeWithdrawal()` is dead code. Spec §6.6 orders it "payout executed → ledger updated".

**Fix** — on approve, set status `approved` and leave funds in `pending_balance`. Move `pending → total_withdrawn` in `completeWithdrawal`, guarded by `status = 'approved'`, called once the operator confirms the transfer. Manual is fine for MVP; the state machine just needs to match reality.

---

## P2 — Correctness and product gaps

| # | Finding | Location | Minimal fix |
|---|---|---|---|
| P2-1 | **The ledger credits the cached DB price, not the amount actually settled.** Across the 402 → sign → retry round-trip the client pays the old price while the provider is credited the new one (60 s cache TTL). | `gateway/index.ts:367,380` | Credit from `settleResult.amount ?? paymentRequirements.amount`, converting atomic → decimal |
| P2-2 | **gzip responses are corrupted.** `forwardUpstreamHeaders` copies `content-encoding: gzip` while `fetch` has already decompressed. *Verified*: 54 compressed bytes announced, 231 plaintext bytes sent. Also `forEach` comma-joins multiple `set-cookie` headers into one corrupt header. | `gateway/index.ts:435-461` | Add `content-encoding`, `content-length` to `HOP_BY_HOP_HEADERS`; use `upstream.headers.getSetCookie()` for cookies |
| P2-3 | **Base-URL path prefixes are dropped.** `new URL("/weather","https://api.example.com/v1")` → `https://api.example.com/weather`. `parseOpenApiSpec` reads `servers[0].url` verbatim and versioned base URLs are the norm, so those APIs 404 upstream. (`edge-cases-and-known-gaps.md` #24 flagged this; only the query-param half was fixed.) | `gateway/index.ts:490` | `const base = new URL(baseUrl); new URL(base.pathname.replace(/\/$/,"") + path, base.origin)` |
| P2-4 | **Endpoint match is first-row-wins with no `ORDER BY`,** so Postgres row order decides pricing. With `/users/{id}` ($0.001) and `/users/me` ($0.05) in one spec, the price charged varies across restarts. | `gateway/index.ts:223`, `:85-90` | Prefer exact: `endpoints.find(exact) ?? endpoints.find(pattern)` |
| P2-5 | **`invalidateApiCache` is exported and never called** — the only occurrence in the repo is its own definition. Price edits don't take effect for up to 60 s, so a provider lowering a price keeps overcharging. | `gateway/index.ts:42` | `packages/api` can't import from `apps/server`; compare the already-bumped `providerApi.updatedAt` before serving cache, or drop `CACHE_TTL_MS` to ~5 s |
| P2-6 | **Bracketed/nested query params are silently dropped.** Express's `qs` parser turns `?filter[a]=1` into an object, matching neither the `string` nor `string[]` branch. | `gateway/index.ts:493-501` | `app.set("query parser","simple")`, or rebuild from `req.originalUrl`'s raw search string — that also preserves duplicate-key order |
| P2-7 | **Price validation accepts `$0` and `$999999999`.** `$0` publishes a 402 challenge with `maxAmountRequired: "0"`; a `$100` typo for `$0.100` overcharges 1000×. The regex is duplicated across 3 files. | `packages/api/src/routers/api.ts:13-18`, `api-endpoints-table.tsx:34`, `api-upload-dialog.tsx:24` | Reject zero, cap the integer part, hoist to one shared constant |
| P2-8 | **A provider can never learn their gateway URL.** Nothing in `apps/web` renders `api.id`, the routing key for `/gateway/:apiId/*`. Onboarding completes with no way to publish the monetized endpoint. | `components/projects/api-endpoints-table.tsx` | One read-only row with the full URL and a copy button; `api.id` is already in the `listByProject` payload |
| P2-9 | **Endpoints import unpriced and the gateway hard-fails them** with `400 "Endpoint has no pricing configured"`, with no UI signal. Skipping the optional default price is the happy path. | `packages/db/src/api-registry.ts:60` | Badge unpriced rows, show a count on the API card. Don't make price required at import |
| P2-10 | **No DB-level money invariants.** Zero `CHECK` constraints across all migrations; balances and ledger amounts can go negative. | `0002_wise_namorita.sql` | `CHECK (available_balance >= 0)` and equivalents on `pending_balance`, `total_withdrawn` |
| P2-11 | **Dead, unguarded ledger helpers.** `debitWithdrawal`, `completeWithdrawal`, `refundWithdrawal` are called from nowhere. `debitWithdrawal` duplicates the withdrawal router but omits the minimum-amount check and writes no `withdrawal_request` row; the other two have no transaction, no lock, no status guard. | `services/ledger.ts:80-148` | Delete them, or harden and actually call them |
| P2-12 | **Admin gating is a side-effecting probe,** copy-pasted 3×: `try { auth.api.listUsers({limit:"1"}) } catch { FORBIDDEN }`. Not a live bypass — better-auth does throw for non-admins — but it couples withdrawal approval to an unrelated `user:list` permission and costs a query per call. | `routers/admin.ts:219, 251, 319` | One `adminProcedure` middleware in `packages/api/src/index.ts` |
| P2-13 | **API registry CRUD is write-once.** Only `listByProject`, `create`, `updateEndpointPricing`. A wrong spec or changed base URL can only be fixed by deleting the whole project. | `packages/api/src/routers/api.ts` | Add `api.delete` (FK cascade handles endpoints) and `api.updateBaseUrl` reusing `validateBaseUrl`. Skip spec re-import |
| P2-14 | **The organization surface contradicts spec §6.0** ("User = Provider — one balance per user"). No data conflict — no financial table references orgs — but 12 org procedures are registered and invitations send real emails, so a teammate can accept an invite and then see zero projects, APIs or balance. `organization-settings.tsx` is orphaned. | `routers/index.ts:17`, `packages/auth/src/index.ts:79-93` | Unregister `organizationRouter`, disable the plugin. Do **not** build org-scoped ownership — the spec doesn't want it |
| P2-15 | **Config has no guard rails.** `PAY_TO`, `FACILITATOR_URL`, `X402_NETWORK`, `PLATFORM_FEE_PERCENT` appear in no `.env.example` or compose file — a fresh deploy 502s per request with no clue why. `X402_NETWORK` is free-form and defaults to Base Sepolia; setting mainnet while leaving the default testnet facilitator produces no config error, just silent failure. | `packages/env/src/index.ts:41-47`, `apps/server/.env.example` | Document all four; `X402_NETWORK: z.enum([...])`, `PAY_TO: z.string().regex(/^0x[a-fA-F0-9]{40}$/)`, and a startup assert that mainnet isn't paired with the x402.org facilitator |
| P2-16 | **Zero backend tests** despite the `test` script and CLAUDE.md mandating Supertest; `src/__tests__/` doesn't exist. | `apps/server` | One Supertest file: 402 challenge, paid path, and regressions for P0-2/P0-3 |

---

## P3 — Polish

- **Streaming is impossible**: `await upstreamResponse.arrayBuffer()` (:415) fully buffers, and `mimeType` is hardcoded `"application/json"` (:143). SSE and chunked LLM endpoints are a headline x402 use case — worth an explicit "no streaming in MVP" note rather than a fix now.
- **Dead V1 fallback**: `paymentHeader: req.headers["x-payment"]` (:271-274) is never read — `processHTTPRequest` calls `extractPayment(adapter)`, which checks only `payment-signature`. V1 clients 402-loop. Drop the field or alias it inside the adapter's `getHeader`.
- **CORS emits nothing when `CORS_ORIGIN` is unset** — with `origin: undefined` the `cors` package sends no `Access-Control-*` headers at all (not `*`), so `exposedHeaders` never reaches the browser (`app.ts:38,142`). `Payment-Identifier` is missing from `allowedHeaders`; `methods` omits `HEAD`/`OPTIONS` though the gateway is `.all()`.
- **Rate limiting is per-IP only** (10 req/s, `app.ts:49`, correctly applied to `/gateway`). Spec §9 also asks for per-wallet and per-endpoint; `payer` is available on the verified payload if that dimension is wanted.
- `analytics.getSummary` labels gross price as revenue; per spec §14 the developer's revenue is `provider_credit`, already selected separately (`analytics.ts:24-35`).
- `balance.get` returns a synthetic object missing `id`/`createdAt`/`updatedAt` when no row exists (`balance.ts:16-23`); `getLedger` returns no `totalCount`, so pagination can't render (`balance.ts:26-64`).
- `generateRequestId()` uses `Date.now()` + `Math.random()`; use `crypto.randomUUID()` (`gateway/index.ts:150`).
- `ledger_entry.api_id ON DELETE SET NULL` rewrites committed history and collapses that API's revenue into a `NULL` bucket.
- `openapiSpec: z.string().min(1)` has no `.max()`; bounded only by the 10 MB body limit (`api.ts:25`).
- `apps/web` fails `check-types`: ungenerated `content-collections` types (build-order) plus a real `dir` prop error at `ai-elements/reasoning.tsx:173`.
- `billing.tsx` is untouched boilerplate calling `authClient.customer.state()` while the Polar plugin is commented out (`packages/auth/src/index.ts:94-118`) — likely throws in `beforeLoad`.
- **Defence-in-depth only**: below 1e-6, `@x402/evm`'s `convertToTokenAmount` emits malformed atomic strings (`$0.0000001` → `"1e-7000000"`). Unreachable today because `endpointPriceSchema` caps at 6 decimals — noted so the cap isn't casually relaxed.

---

## Missing MVP UI (spec §15)

Every backend procedure below exists and is correctly authorized. A grep of `apps/web/src` for `trpc.balance|trpc.analytics|trpc.withdrawal` returns nothing.

| Surface | Backend | Frontend |
|---|---|---|
| API upload (OpenAPI) | ready | **built** |
| Endpoint pricing config | ready | **built** |
| Project CRUD | ready | **built** |
| Balance / revenue dashboard | `analytics.getSummary` | missing — `dashboard.tsx` is a 64-line stub showing a project count |
| Transaction / ledger list | `balance.getLedger` | missing |
| Withdrawal request form | `withdrawal.request`/`list` | missing |
| Admin withdrawal queue | `admin.listWithdrawals`/`approve`/`reject` | missing — `admin.tsx` only does user management |
| Gateway URL display | `api.id` in payload | missing (P2-8) |

Sidebar (`app-sidebar.tsx:34-58`) has no Balance / Transactions / Withdrawals entries, and `/_auth/admin` has no client-side role gate.

---

## Suggested order

1. **P0-1 … P0-5.** Small and independent, except that P0-4 and P0-5 share one fix. Nothing else is worth doing first: until these land there is no working paid request, and P0-4 is actively exploitable.
2. **P1-1 … P1-4** (ledger integrity), plus **P1-5** and **P1-6** — both are additions to existing deny-lists, a few lines each.
3. **One Supertest suite** over the gateway (P2-16), pinning the P0-2 and P0-3 regressions in particular.
4. **Dashboard, ledger list, withdrawal form** — build-order step 5, and the last thing between this and a demoable MVP.
5. P2 cleanup, then P1-7 and P3.

## Explicitly not proposed

Bazaar, client SDK, public API discovery, BullMQ/queues, edge layer, Solana, API-slug routing, materialised analytics views, org-scoped ownership, and DNS-resolving SSRF protection. spec.md defers all of them, none exist in the code, none block the MVP.

## Corrections to existing docs

- `docs/mvp-implementation-status.md` lists only "Dashboard UI" as missing and describes the gateway flow as working. Backend build-order items 1-4 and 6 are genuinely done, but the gateway does not currently serve a paid request, and three MVP UI surfaces are absent rather than one.
- `docs/edge-cases-and-known-gaps.md` line numbers no longer match the code, and several items it lists as open (#6 banned owners, #9 timeouts, #13 singleton server, #22 rate limiting) are now fixed. Items #5 (replay protection), #21 (header forwarding) and #24 (base URL resolution) are marked fixed in code comments but are only partly addressed — see P0-4, P2-2 and P2-3.
