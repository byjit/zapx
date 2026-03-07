# Zapx - Pay-Per-Request API Gateway Platform

### x402-Based Machine Payment Infrastructure with Custodial Aggregation

---

# 1. Overview

This platform allows developers to monetize APIs on a per-request basis using the x402 payment protocol.

Instead of subscriptions, API keys, or monthly billing, each API request requires an instant payment before the response is returned.

The platform acts as:

* API gateway
* payment facilitator
* custodial payment aggregator
* settlement layer
* API registry and discovery platform

Payments are aggregated within the platform, and developers withdraw their earnings later.

This removes the need for developers to manage crypto wallets or blockchain infrastructure.

---

# 2. Core Concept

Each API endpoint has a defined price.

Example:

```
GET /weather        → $0.001
POST /translate     → $0.005
POST /image-analyze → $0.02
```

When a request is made:

1. Gateway checks for payment
2. If missing → return HTTP 402
3. Client pays
4. Gateway verifies payment
5. Request forwarded to provider API
6. Provider response returned
7. Developer balance credited internally

---

# 3. Payment Model

## Custodial Aggregation Model

All payments go to the **platform wallet**.

Developer earnings are tracked in an **internal ledger**.

Flow:

```
Client → payment → platform wallet
                    ↓
                internal ledger
                    ↓
             developer withdraws later
```

This eliminates:

* per-request payouts
* blockchain spam
* developer wallet requirements

Developers simply see a balance.

Example dashboard:

```
API Usage: 125,000 requests
Revenue: $112.50
Platform Fee: $12.50
Available Balance: $100
Withdraw
```

---

# 4. x402 Protocol Flow

The platform uses **HTTP 402 Payment Required** to enforce payments.

## Request lifecycle

### Step 1 — Client request

```
GET gateway.platform.com/weatherapi/weather?city=London
```

---

### Step 2 — Gateway returns payment requirement

```
HTTP 402 Payment Required
{
 price: 0.001 USDC
 network: Solana
 recipient: platform_wallet
 nonce: random_nonce
}
```

---

### Step 3 — Client sends payment

Client signs blockchain transaction.

---

### Step 4 — Client retries request

```
GET /weather
X-PAYMENT: signed_payment_payload
```

---

### Step 5 — Platform verifies payment

Verification checks:

* transaction hash
* token type
* correct amount
* correct recipient wallet
* nonce unused

---

### Step 6 — Request forwarded to provider

```
GET providerapi.com/weather
```

---

### Step 7 — Response returned

```
HTTP 200 OK
{
 weather: "Rain"
}
```

---

### Step 8 — Developer credited

Ledger update:

```
provider_balance += (price - platform_fee)
```

---

# 5. Platform Responsibilities

The platform provides four major capabilities.

---

## 5.1 API Monetization

Developers upload APIs and define endpoint pricing.

Example configuration:

```
/weather → $0.001
/forecast → $0.003
/translate → $0.005
```

Platform generates monetized gateway endpoints automatically.

---

## 5.2 Payment Facilitation

Platform verifies payments and processes settlements.

Responsibilities:

* validate payment signatures
* confirm blockchain transaction
* prevent replay attacks
* track payment ledger
* distribute payouts

---

## 5.3 API Gateway

Gateway sits between client and provider.

Responsibilities:

* intercept requests
* enforce payment requirement
* verify payment proof
* route requests to provider API
* return responses

---

## 5.4 Custodial Settlement

Platform stores funds and manages balances.

Responsibilities:

* maintain provider balances
* track transactions
* process withdrawals
* handle refunds and disputes

---

# 6. Platform Components

The system consists of several core services.

---

## 6.0 Entity Model (User → Project → API)

**User = Provider** — one balance per user. The user account is the payee entity for billing and ledger.

**Project** — organizational container for APIs. Users create projects to group related APIs (e.g., "Weather APIs", "ML Services"). Projects do not have separate balances.

**API** — one OpenAPI spec, belongs to a project. Each API has endpoints with pricing.

Hierarchy:

```
User (provider for billing)
  └── Project (organizational container)
        └── API (OpenAPI spec + endpoints + pricing)
```

Gateway routes by project or API slug: `gateway.platform.com/{project_slug}/{route}` or `gateway.platform.com/{api_slug}/{route}`.

---

# 6.1 API Registry

Stores metadata about all APIs.

Stored fields:

```
user_id          — owner (provider for ledger)
project_id      — organizational container
api_name
base_url
openapi_spec
status
rating
...
```

Developers upload:

```
OpenAPI specification
base URL
endpoint prices for each endpoint
```

Platform parses the spec automatically.

---

# 6.2 API Gateway

Central request routing layer.

Responsibilities:

```
receive client requests
check payment headers
issue HTTP 402 if unpaid
verify payment
forward request
return response
```

Gateway endpoint format:

```
gateway.platform.com/{project_slug}/{endpoint}
```
or
```
gateway.platform.com/{api_slug}/{endpoint}
```

Example:

```
gateway.platform.com/weather-project/weather
gateway.platform.com/weatherapi/weather
```

---

# 6.3 Payment Verification Service

Handles blockchain verification.

Checks include:

```
transaction hash
token
amount
recipient wallet
nonce
signature validity
```

Ensures the payment:

* exists
* is correct
* has not been reused

---

# 6.4 Ledger Database

Tracks all platform financial data.

Transaction table example:

```
transaction_id
request_id
user_id         — provider (user = provider, one balance per user)
project_id
api_id
price
platform_fee
provider_credit
payment_tx_hash
timestamp
status
```

User balance table (user = provider):

```
user_id
available_balance
pending_balance
total_withdrawn
```

---

# 6.5 Treasury Service

Manages platform funds.

Responsibilities:

```
platform wallet management
fund accounting
liquidity monitoring
payout execution
```

---

# 6.6 Withdrawal Service

Handles developer payouts.

Withdrawal process:

```
developer requests withdrawal
balance verified
fraud checks performed
payout executed
ledger updated
```

Possible payout methods:

```
crypto wallet (MVP)
bank transfer (future)
```

---

# 7. Infrastructure Design

## Edge Layer (stateless)

Purpose:

```
request routing
payment enforcement
low-latency global access
```

Possible technologies:

```
Cloudflare Workers
Fastly Compute
Vercel Edge
```

---

## Gateway Layer

Responsibilities:

```
request processing
payment verification call
provider routing
response handling
```

Recommended stack:

```
Node.js (Fastify)
Go
Rust
```

---

## Payment Service (stateful)

Handles blockchain verification.

Requires persistent storage.

Possible stack:

```
Rust
Go
Postgres
Redis
```

---

## Database Layer

Primary database:

```
Postgres
```

Supports:

```
transaction tracking
provider balances
withdrawals
fraud detection
```

---

## Queue System

Used for asynchronous tasks.

Examples:

```
Kafka
Redis Streams
RabbitMQ
```

Handles:

```
payment confirmations
analytics
payout batching
event processing
```

---

# 8. Recommended Architecture & Tech Stack

## Architecture Overview

Split the system into **control plane** and **data plane**.

**Control plane** — developer onboarding, OpenAPI upload/parsing, endpoint pricing config, API registry/search, dashboard, balances, withdrawals, admin tools.

**Data plane** — receives paid API requests, returns 402 Payment Required, verifies x402 payment proof, enforces idempotency/replay protection, proxies to provider API, writes ledger entries, returns provider response.

## Recommended Stack

| Layer | Technology |
|-------|------------|
| Frontend | React with Tanstack Router |
| Control API | Express |
| Gateway (MVP) | Express with `@x402/express` |
| Database | Postgres |
| Cache / idempotency / rate limits | Redis |
| Queue (MVP) | BullMQ |
| ORM | Drizzle |
| Auth | Better auth |
| Storage | Cloudflare R2 for OpenAPI specs |

## Monorepo Structure (Turborepo)

```
apps/
  ...
  web          — Next.js dashboard + API discovery
  control-api  — Express: auth, onboarding, pricing, balances, withdrawals
  gateway      — Express: x402 request handling, payment verification, proxy
  worker       — Queue consumers: analytics, reconciliation, payouts

packages/
  ...
  db           — Prisma schema, migrations
  types        — Shared TypeScript types
  auth         — Auth utilities
  openapi-parser
  pricing-engine
  x402-server  — x402 protocol logic
  ledger       — Ledger operations
  provider-proxy
  config       — Shared config
  ui           — Shared UI components
```

## Network & Token (MVP)

Start with **Base + USDC** for best TypeScript/x402 toolchain fit. Add Solana later if needed.

## Request Flow

1. User signs up in web
2. User creates a project and uploads OpenAPI spec
3. Control API parses endpoints, stores pricing config
4. Client calls `gateway/:project_slug/:route` (or `/:api_slug/:route`)
5. If unpaid → gateway returns 402 challenge
6. Client retries with x402 payment headers
7. Gateway validates request id, idempotency, price config
8. Gateway calls payment verification
9. On success → proxy to upstream API
10. Gateway writes immutable ledger row, credits user balance minus fee (user = provider)
11. Async workers handle analytics, reconciliation, withdrawals

## x402 vs Custody

x402 handles protocol-compliant payment challenge, verification, and settlement. Zapx adds a **custodial layer** on top: internal balances, provider credits, treasury, withdrawals. Use x402 externally; maintain a separate internal ledger and payout system.

## Data Model (Key Tables)

Keep request logs and accounting separate. Money trail should be append-only and auditable.

```
users                    — accounts (user = provider for billing)
projects                 — organizational containers, belong to user
provider_apis             — APIs, belong to project
provider_endpoints       — endpoints with pricing
pricing_rules
gateway_requests, payment_attempts, payment_receipts
ledger_entries, user_balances     — user_id = provider for ledger
withdrawal_requests, withdrawals, risk_flags
```

## MVP Build Order

1. User onboarding + project creation + OpenAPI ingestion
2. Endpoint pricing config
3. x402-enabled gateway (one network, one token)
4. Internal ledger + balances (user = provider)
5. Dashboard for usage/revenue
6. Manual withdrawal workflow
7. Public API directory/search (after core flow is stable)

---

# 9. Security Requirements

## Replay Attack Protection

Prevent payment reuse.

Store:

```
nonce
transaction hash
signature
timestamp
```

Reject duplicates.

---

## Double Spending Protection

Ensure one payment cannot unlock multiple requests.

Each payment linked to:

```
unique request_id
```

---

## Fraudulent APIs

Possible provider abuse:

```
fake API
slow responses
invalid data
```

Mitigation:

```
API monitoring
uptime tracking
developer verification
user rating system
```

---

## Rate Limiting

Protect APIs against abuse.

Limits based on:

```
IP
wallet
API endpoint
```

---

# 10. Latency Targets

Target system performance:

```
Gateway processing: <50 ms
Payment verification: <200 ms
Total request latency: <500 ms
```

Low latency is critical for adoption.

---

# 11. Token and Network Strategy (MVP)

Start simple.

Supported:

```
1 blockchain
1 token
```

Example setup:

```
Network: Solana or Base
Token: USDC
```

Benefits:

```
low fees
fast settlement
simple integration
```

---

# 12. API Discovery System

Public registry for available APIs.

Endpoints:

```
/apis
/apis/search
/apis/{project_slug}
/apis/{category}
```

Search parameters:

```
price
latency
rating
category
```

Example query:

```
translation API under $0.01
```

---

# 13. SDK for Developers

Provide SDK to simplify API monetization.

Installation example:

```
npm install x402-pay
```

Usage:

```
x402.protect("/weather", {
 price: 0.002,
 token: "USDC"
})
```

SDK communicates with gateway automatically.

---

# 14. Revenue Model

Platform charges a percentage fee.

Example:

```
API price: $0.01
Platform fee: 10%
Developer receives: $0.009
```

Revenue streams:

```
transaction fees
premium API listings
analytics tools
enterprise gateway hosting
```

---

# 15. MVP Scope

First version includes:

```
API upload via OpenAPI spec
endpoint price configuration
x402 payment gateway
payment verification service
custodial ledger
developer balance dashboard
manual withdrawals
```

Avoid building complex marketplace features initially.

---

# 16. Long-Term Vision

The platform becomes infrastructure for **machine-to-machine payments**.

Future scenarios:

```
AI agents purchasing APIs
data marketplaces
model inference payments
compute services
automation systems
```

Example:

```
AI agent → pay weather API
AI agent → pay translation API
AI agent → pay mapping API
```

All transactions happen automatically.

---

# 17. Strategic Positioning

The platform aims to become:

**Payment infrastructure for APIs and machine services.**

Core value proposition:

```
Turn any API into a pay-per-request service instantly.
```

Developers add monetization with minimal effort while the platform handles:

```
payments
gateway routing
settlement
developer payouts
```
