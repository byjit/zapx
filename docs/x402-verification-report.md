# x402 Protocol Verification Report

**Source:** Official x402 docs from [x402-docs/llms.txt](../x402-docs/llms.txt) and fetched documentation  
**Verified against:** [spec.md](spec.md)  
**Token:** USDC stablecoin (platform standard)

---

## 1. Documentation Sources (from llms.txt)

The following official x402 documentation pages were used for verification:

| Page | URL | Purpose |
|------|-----|---------|
| HTTP 402 | https://docs.x402.org/core-concepts/http-402.md | Core protocol, headers |
| Client/Server | https://docs.x402.org/core-concepts/client-server.md | Roles, flow |
| Facilitator | https://docs.x402.org/core-concepts/facilitator.md | Verify/settle flow |
| Networks & Tokens | https://docs.x402.org/core-concepts/network-and-token-support.md | CAIP-2, EIP-3009 |
| Payment-Identifier | https://docs.x402.org/extensions/payment-identifier.md | Idempotency |
| Bazaar | https://docs.x402.org/extensions/bazaar.md | Discovery layer |
| Lifecycle Hooks | https://docs.x402.org/advanced-concepts/lifecycle-hooks.md | Custom logic |
| Quickstart Sellers | https://docs.x402.org/getting-started/quickstart-for-sellers.md | Implementation |

---

## 2. USDC Stablecoin Support

**Zapx uses USDC for all payments.** x402 fully supports USDC:

- **EVM (Base):** USDC implements EIP-3009 (`TransferWithAuthorization`) — gasless, signature-based payments
- **Solana:** USDC as SPL token
- **Default token:** Price strings like `"$0.001"` infer USDC; SDK converts to atomic units (6 decimals)
- **Networks:** Base Mainnet (`eip155:8453`), Base Sepolia (`eip155:84532`), Solana mainnet/devnet

USDC contract addresses (EVM):
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 3. What the Spec Gets Right

- **HTTP 402** — Correct status code for payment-required responses
- **Overall flow** — Request → 402 → client pays → retry with payment → verify → forward → return
- **Custodial model** — Compatible with x402. Set `payTo` = platform wallet; facilitator settles USDC to that address
- **Tech stack** — `@x402/express` is correct for Express gateway
- **Base + USDC for MVP** — Aligns with x402's recommended setup
- **Replay / double-spend protection** — Conceptually correct; implementation details differ (see below)
- **Payment verification checks** — Transaction hash, amount, recipient, nonce are all relevant

---

## 4. Corrections Needed

### 4.1 Header Names (Spec §4, Step 2 & 4)

| Spec says | x402 V2 (current) |
|-----------|-------------------|
| `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Response body JSON | `PAYMENT-REQUIRED` header (base64 JSON) |
| — | `PAYMENT-RESPONSE` header (base64 JSON) |

**Action:** Update spec to use V2 headers: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`.  
`X-PAYMENT` is V1 (legacy); SDK supports both but V2 is preferred.

### 4.2 Payment Requirement Format (Spec §4, Step 2)

Spec shows:

```
{
  price: 0.001 USDC
  network: Solana
  recipient: platform_wallet
  nonce: random_nonce
}
```

x402 V2 uses `PAYMENT-REQUIRED` header with base64-encoded JSON like:

```typescript
{
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",        // CAIP-2, not "Solana"
      maxAmountRequired: "1000",      // Atomic units (0.001 USDC)
      payTo: "0x...",                 // Recipient (platform wallet)
      resource: "/weather",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC on Base Sepolia
      // ...
    }
  ]
}
```

**Action:** Replace simplified format with `accepts` array and CAIP-2 network identifiers.

### 4.3 Network Identifiers (Spec §4, §11)

Spec uses `network: Solana`. x402 V2 uses CAIP-2:

| Network | CAIP-2 ID |
|---------|-----------|
| Base Sepolia (testnet) | `eip155:84532` |
| Base Mainnet | `eip155:8453` |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |

**Action:** Use CAIP-2 identifiers everywhere instead of plain names.

---

## 5. Missing Concepts

### 5.1 Facilitator (Critical)

The spec does not mention the facilitator. In x402:

- Facilitator verifies payment payloads (POST `/verify`)
- Facilitator settles payments on-chain (POST `/settle`)
- Facilitator does not hold funds; it submits signed transactions
- `payTo` in payment requirements determines where USDC goes

**For Zapx:** Use a facilitator (e.g. `https://x402.org/facilitator` for testnet, CDP for mainnet) with `payTo` = platform wallet. The gateway calls the facilitator for verify and settle; no direct blockchain integration needed.

**Action:** Add a "Facilitator" section describing its role and how the gateway uses it.

### 5.2 Verify vs Settle (Two-Step Flow)

x402 flow:

1. **Verify** — POST payload + requirements to facilitator `/verify` → check signature and requirements
2. **Settle** — POST same to facilitator `/settle` → submit USDC transfer to blockchain and wait for confirmation

Spec currently describes a single "verify payment" step. These are two distinct operations.

**Action:** Update flow to explicitly show verify → settle.

### 5.3 Payment Schemes

- **exact** — Fixed price per request (production)
- **upto** — Pay up to max based on usage (proposed)
- **deferred** — Batched settlement (proposed)

**Action:** State that Zapx uses the `exact` scheme for MVP with USDC.

### 5.4 EIP-3009 (EVM / USDC)

EVM uses EIP-3009 `TransferWithAuthorization` for USDC:

- Client signs off-chain; facilitator submits on-chain
- Gasless for the client
- USDC implements this natively

**Action:** Briefly note that EVM USDC payments are gasless via EIP-3009.

### 5.5 Payment-Identifier Extension (Idempotency)

x402 has a `payment-identifier` extension for idempotency:

- Client sends a unique payment ID
- Server caches responses by payment ID
- Retries with same ID return cached response without re-processing payment

Spec mentions `request_id` and nonce; the extension is the standard way to handle idempotency.

**Action:** Reference the `payment-identifier` extension for idempotency and retries.

### 5.6 Solana Duplicate Settlement

On Solana, the same signed USDC transaction can be submitted multiple times before confirmation. Mitigation:

- Use facilitator with built-in `SettlementCache`, or
- Implement equivalent duplicate detection if settling directly

**Action:** If Solana is supported, document duplicate-settlement handling.

### 5.7 Bazaar (Discovery)

Bazaar is x402's discovery layer. Zapx's API discovery could:

- Register APIs with Bazaar via the `bazaar` extension
- Use `/discovery/resources` for discovery

**Action:** Optional: add Bazaar integration to the discovery roadmap.

### 5.8 Lifecycle Hooks

x402 supports hooks such as:

- `onAfterSettle` — Record ledger entries after USDC settlement
- `onProtectedRequest` — Bypass payment for API keys, etc.

**Action:** Use `onAfterSettle` for ledger updates and `onProtectedRequest` for API-key bypass if needed.

---

## 6. Implementation Verification

### 6.1 Correct Approach

- **Gateway:** Express + `@x402/express` payment middleware
- **Custodial model:** `payTo` = platform wallet; facilitator settles USDC to it
- **Ledger:** Update balances in `onAfterSettle` after successful settlement
- **Token:** USDC (price strings like `"$0.001"` in route config)
- **Packages:** `@x402/express`, `@x402/core`, `@x402/evm` (and `@x402/svm` if using Solana)

### 6.2 Request Flow (Aligned with x402)

1. Client → `GET gateway.platform.com/weatherapi/weather`
2. Gateway → `402` + `PAYMENT-REQUIRED` header (base64 JSON, USDC price)
3. Client signs USDC payment, retries with `PAYMENT-SIGNATURE` header
4. Gateway → POST to facilitator `/verify`
5. If valid → POST to facilitator `/settle`
6. On success → proxy to provider API
7. Gateway → `onAfterSettle` → credit provider balance in ledger
8. Gateway → return provider response + `PAYMENT-RESPONSE` header

### 6.3 Facilitator Choice

| Environment | Facilitator URL |
|-------------|-----------------|
| Testnet | `https://x402.org/facilitator` |
| Mainnet | `https://api.cdp.coinbase.com/platform/v2/x402` (CDP API keys) |

### 6.4 Route Config Example (USDC, x402-Compatible)

```typescript
{
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",           // USDC
        network: "eip155:84532",   // Base Sepolia
        payTo: platformWalletAddress,
      },
    ],
    description: "Weather data",
    mimeType: "application/json",
  },
}
```

---

## 7. Summary

| Category | Status |
|----------|--------|
| Core concept (402, pay-per-request) | Correct |
| Custodial model | Correct |
| USDC stablecoin | Supported; platform standard |
| Header names | Update to V2 |
| Payment format | Update to `accepts` + CAIP-2 |
| Facilitator | Add to spec |
| Verify vs settle | Clarify two-step flow |
| Payment schemes | Add `exact` for MVP |
| Idempotency | Reference `payment-identifier` |
| Implementation approach | Correct |
| Tech stack | Correct |

---

## 8. Recommended Spec Updates

1. **§4 (x402 Protocol Flow):** Use V2 headers and `accepts` format; add facilitator verify/settle steps; clarify USDC.
2. **§5.2 (Payment Facilitation):** Add facilitator; clarify verify vs settle.
3. **§6.3 (Payment Verification Service):** Describe facilitator integration (POST `/verify`, POST `/settle`).
4. **§8 (Architecture):** Add facilitator client configuration.
5. **§9 (Security):** Add Solana duplicate-settlement handling if Solana is supported.
6. **§11 (Token/Network):** Use CAIP-2 identifiers; state USDC as the platform token; mention EIP-3009 for EVM.
7. **§12 (API Discovery):** Optionally mention Bazaar integration.
