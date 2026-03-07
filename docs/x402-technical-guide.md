# Building Systems with x402

Technical guide for architects and engineers building payment-enabled systems on top of the x402 protocol.

---

## 1. Protocol Overview

x402 embeds stablecoin payments into HTTP using the 402 "Payment Required" status code. It is designed for:

- **Machine-to-machine (M2M) payments** — AI agents, autonomous services
- **Pay-per-use APIs** — No subscriptions, API keys, or account creation
- **Micropayments** — Low-friction, per-request billing in USDC

**Core idea:** The server declares payment requirements; the client signs a payment authorization; the server verifies and settles via a facilitator; the resource is returned.

---

## 2. Architecture Components

### 2.1 Roles

| Role | Responsibility |
|------|-----------------|
| **Client (Buyer)** | Initiates request, reads 402, signs payment, retries with `PAYMENT-SIGNATURE` |
| **Server (Seller)** | Enforces payment, returns 402 + `PAYMENT-REQUIRED`, verifies, settles, returns resource |
| **Facilitator** | Verifies signatures and settles on-chain (does not hold funds) |
| **Wallet** | Client holds keys; signs off-chain; facilitator submits on-chain |

### 2.2 Flow (High Level)

```
Client                    Server                     Facilitator              Blockchain
  |                          |                             |                        |
  |--- GET /resource ------->|                             |                        |
  |<-- 402 + PAYMENT-REQUIRED|                             |                        |
  |                          |                             |                        |
  |  (signs payment)        |                             |                        |
  |--- GET + PAYMENT-SIGNATURE -------------------------->|                        |
  |                          |--- POST /verify ----------->|                        |
  |                          |<-- { isValid: true } ------|                        |
  |                          |--- POST /settle ---------->|--- submit tx --------->|
  |                          |<-- { txHash } -------------|<-- confirmed ----------|
  |                          |                             |                        |
  |<-- 200 + resource + PAYMENT-RESPONSE -----------------|                        |
```

### 2.3 V2 Headers

| Header | Direction | Content |
|--------|-----------|---------|
| `PAYMENT-REQUIRED` | Server → Client | Base64 JSON: payment options (`accepts` array) |
| `PAYMENT-SIGNATURE` | Client → Server | Base64 JSON: signed payment payload |
| `PAYMENT-RESPONSE` | Server → Client | Base64 JSON: settlement result (txHash, success) |

---

## 3. The Facilitator

The facilitator is the bridge between HTTP and blockchain. It does **not** hold funds.

### 3.1 Responsibilities

1. **Verify** — Validate that the signed payload matches the server's payment requirements (amount, recipient, network, nonce)
2. **Settle** — Submit the validated payment to the blockchain and wait for confirmation
3. **Respond** — Return verification and settlement results to the server

### 3.2 API

| Endpoint | Purpose |
|----------|----------|
| `POST /verify` | Check signature and requirements; return `{ isValid, invalidReason }` |
| `POST /settle` | Submit to chain; return `{ success, txHash, networkId, error }` |
| `GET /supported` | List supported scheme+network pairs |

### 3.3 Facilitator URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| Testnet | `https://x402.org/facilitator` | Free, no auth; Base Sepolia + Solana Devnet |
| Mainnet | `https://api.cdp.coinbase.com/platform/v2/x402` | CDP API keys required |

### 3.4 Who Pays Gas?

On EVM, the facilitator sponsors gas. Clients sign EIP-3009 `TransferWithAuthorization`; the facilitator submits the transaction. Clients do not need native tokens (ETH) for gas.

---

## 4. Payment Schemes

| Scheme | Status | Description |
|--------|--------|-------------|
| **exact** | Production | Fixed price per request. EIP-3009 on EVM, SPL on Solana. |
| **upto** | Proposed | Pay up to max; settle based on actual usage (e.g. LLM tokens). |
| **deferred** | Proposed | Batched settlement for high-frequency micropayments. |

**For new systems:** Use `exact` with USDC.

---

## 5. Networks and Tokens

### 5.1 CAIP-2 Network Identifiers

x402 V2 uses CAIP-2 format (`namespace:reference`):

| Network | CAIP-2 ID |
|---------|-----------|
| Base Sepolia | `eip155:84532` |
| Base Mainnet | `eip155:8453` |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |

### 5.2 USDC

- **Default token** for x402
- **EVM:** Implements EIP-3009; price strings like `"$0.001"` infer USDC (6 decimals)
- **Contract (Base Sepolia):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Contract (Base Mainnet):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 6. System Patterns

### 6.1 Direct Seller (Simple API)

**Use case:** Single API owner monetizes their own endpoints.

```
Client → API (with x402 middleware) → Facilitator → Blockchain
```

- `payTo` = seller's wallet
- Funds go directly to seller
- No intermediary

**Stack:** Express/Hono/Next.js + `@x402/express` (or equivalent) + facilitator client

### 6.2 API Gateway (Proxy)

**Use case:** Gateway fronts multiple upstream APIs; each request is paid once.

```
Client → Gateway (x402) → Facilitator → Blockchain
                ↓
         Upstream API (no x402)
```

- Gateway returns 402, verifies, settles
- Gateway proxies to upstream after payment
- `payTo` = gateway/platform wallet

### 6.3 Custodial Platform (Zapx-style)

**Use case:** Platform aggregates payments; developers earn credits; withdraw later.

```
Client → Gateway → Facilitator → Blockchain (payTo = platform wallet)
                ↓
         Internal ledger (provider_balance += credit)
                ↓
         Developer withdraws
```

**Key design:**

- `payTo` = platform wallet for all routes
- After `onAfterSettle`, credit provider balance in internal ledger
- Platform holds USDC; developers see balances; withdrawals are a separate flow
- No per-request payouts; no developer wallet required for receiving

### 6.4 Multi-Tenant Gateway

**Use case:** Many APIs, each with its own pricing; platform takes a fee.

- Route config is dynamic: `gateway/:project_slug/:path` or `gateway/:api_slug/:path`
- Pricing comes from DB (provider_endpoints table)
- `payTo` is always platform wallet
- Ledger: `provider_credit = price - platform_fee` per request

---

## 7. Implementation Patterns

### 7.1 Route Configuration (Static)

```typescript
const routes = {
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: platformWalletAddress,
      },
    ],
    description: "Weather data",
    mimeType: "application/json",
  },
};
```

### 7.2 Dynamic Pricing (Gateway)

Load pricing from DB per request; build `accepts` array dynamically. Use `onProtectedRequest` or equivalent to inject route config based on `project_slug` / `api_slug`.

### 7.3 Ledger Integration (Custodial)

Use `onAfterSettle` to record the payment and credit the provider:

```typescript
server.onAfterSettle(async (context) => {
  await ledger.credit({
    providerId: resolveProviderFromRoute(context),
    amount: context.requirements.maxAmountRequired,
    txHash: context.result.txHash,
    networkId: context.result.networkId,
  });
});
```

### 7.4 Idempotency (payment-identifier)

- Advertise `payment-identifier` extension in route config
- Client sends unique payment ID in payload
- Server caches response by payment ID; retries return cached response
- Use Redis in production for distributed cache

### 7.5 API Key Bypass

Use `onProtectedRequest` to skip payment when valid API key is present:

```typescript
httpServer.onProtectedRequest(async (context) => {
  const apiKey = context.adapter.getHeader("X-API-Key");
  if (apiKey && await isValidApiKey(apiKey)) {
    return { grantAccess: true };
  }
});
```

---

## 8. Security Considerations

### 8.1 Replay Protection

- **Nonce:** Each payment uses a random 32-byte nonce (EVM exact scheme)
- **Payment-identifier:** Same payment ID retries return cached response; no double settlement
- **Settlement cache (Solana):** If settling directly on Solana, use a short-lived cache to reject duplicate submissions (same tx submitted before confirmation)

### 8.2 Double Spending

- One signed payload = one settlement
- Facilitator ensures each payload is settled at most once
- Link payment to `request_id` or `payment_id` in your ledger for auditability

### 8.3 Solana Duplicate Settlement

On Solana, the same signed transaction can be submitted multiple times before confirmation. Mitigations:

- Use a facilitator with built-in `SettlementCache`
- If self-settling: maintain in-memory cache of payloads being settled; reject duplicates; evict after ~120 seconds

### 8.4 Fraudulent APIs

- Monitor provider APIs (uptime, latency, response validity)
- Developer verification, ratings, dispute handling
- Rate limiting by IP, wallet, endpoint

---

## 9. SDK and Packages

### 9.1 Server (Node.js)

| Package | Purpose |
|--------|---------|
| `@x402/express` | Express payment middleware |
| `@x402/next` | Next.js payment proxy / `withX402` |
| `@x402/hono` | Hono payment middleware |
| `@x402/core` | Resource server, facilitator client |
| `@x402/evm` | EVM exact scheme (Base, etc.) |
| `@x402/svm` | Solana exact scheme |

### 9.2 Client

| Package | Purpose |
|--------|---------|
| `@x402/fetch` | `wrapFetchWithPayment` |
| `@x402/axios` | `wrapAxiosWithPayment` |
| `@x402/core` | `x402Client`, `x402HTTPClient` |
| `@x402/evm` | EVM client scheme |
| `viem` | Wallet/signer (EVM) |

### 9.3 Extensions

| Package | Purpose |
|---------|---------|
| `@x402/extensions/payment-identifier` | Idempotency |
| `@x402/extensions/bazaar` | Discovery |

---

## 10. Build Order (Custodial Gateway)

1. **Control plane:** User auth, projects, OpenAPI upload, endpoint pricing config
2. **Gateway:** Express + `@x402/express`, dynamic route config from DB
3. **Facilitator:** Configure `HTTPFacilitatorClient` with platform wallet as `payTo`
4. **Ledger:** `onAfterSettle` → insert ledger row, update provider balance
5. **Proxy:** After settlement, forward request to upstream API; return response
6. **Idempotency:** Add payment-identifier extension; Redis cache for retries
7. **Withdrawals:** Separate service; process withdrawal requests from provider balances

---

## 11. References

- **Official docs:** https://docs.x402.org
- **GitHub:** https://github.com/coinbase/x402
- **Protocol spec (internal):** `.agents/skills/x402-payments/references/protocol-spec.md`
- **Verification report:** [x402-verification-report.md](x402-verification-report.md)
