# Zapx Recommendations

Actionable recommendations for improving client connectivity, developer experience, and ecosystem integration.

---

## 1. Client SDK and Documentation

**Recommendation:** Provide a small wrapper or example that points at `gateway.zapx.com` and documents the base URL pattern.

**Actions:**
- Publish a minimal `@zapx/client` or `zapx-js` package that preconfigures the base URL and exposes a simple `zapx.fetch(url)` or `zapx.get(projectSlug, path)` API
- Document the gateway URL format: `https://gateway.zapx.com/{project_slug}/{path}` or `https://gateway.zapx.com/{api_slug}/{path}`
- Include a "Quick Start for Buyers" in the main docs with copy-paste examples for fetch and axios

---

## 2. Preflight / Cost Discovery

**Recommendation:** Clients can `HEAD` the endpoint to get 402 and inspect `PAYMENT-REQUIRED` before paying.

**Actions:**
- Document the preflight pattern in client docs
- Example: `HEAD /weatherapi/weather` → 402 with `PAYMENT-REQUIRED` header
- Parse `accepts[0].maxAmountRequired` (atomic units) → divide by 1_000_000 for USDC cost
- Consider adding an optional `GET /apis/{slug}/pricing` endpoint that returns endpoint prices without requiring payment (for dashboards and discovery)

---

## 3. Agent Support

**Recommendation:** Document MCP and tool-use patterns so AI agents can call Zapx APIs.

**Actions:**
- Add an "AI Agents" section to docs with:
  - MCP server example that wraps Zapx endpoints as tools
  - Anthropic tool-use example with `wrapFetchWithPayment`
  - Budget-controlled agent pattern (`onBeforePayment` for spending limits)
- Provide a sample MCP config for Claude Desktop pointing at Zapx
- Document environment variables: `EVM_PRIVATE_KEY`, `RESOURCE_SERVER_URL` (gateway URL)

---

## 4. Bazaar Integration

**Recommendation:** If you use a facilitator with Bazaar, register Zapx APIs so agents can discover them.

**Actions:**
- Add the `bazaar` extension to route config when using a Bazaar-capable facilitator
- Include `discoverable: true`, `category`, `tags`, `inputSchema`, `outputSchema` for better agent discovery
- Zapx APIs will appear in `GET /discovery/resources` for facilitators that support Bazaar
- Enables "discover → filter by price → call" workflows for autonomous agents

---

## 5. Error Handling

**Recommendation:** Document common errors (insufficient USDC, wrong network, etc.) so clients can handle them.

**Actions:**
- Publish an error reference with:
  - `insufficient funds` — Wallet needs more USDC; link to faucet for testnet
  - `No matching scheme` — Client doesn't support any of the server's accepted networks
  - `signature rejected` — Payment signature invalid; check private key and network
  - `timeout` — Payment or settlement timed out; suggest retry with payment-identifier
  - `402` with `invalidReason` in `PAYMENT-RESPONSE` — Parse and surface to user
- Provide example try/catch patterns for fetch and axios clients
- Include HTTP status codes: 402 (payment required), 400 (bad payment), 500 (server/facilitator error)

---

## 6. Additional Recommendations

### 6.1 Payment-Identifier (Idempotency)

- Enable the `payment-identifier` extension on gateway routes for safe retries
- Document how clients can generate and send payment IDs for idempotent requests
- Use Redis (or similar) for distributed idempotency cache in production

### 6.2 API Key Bypass (Optional)

- If offering subscription tiers, use `onProtectedRequest` to bypass payment when valid API key is present
- Document the `X-API-Key` header for clients who have pre-paid or subscription access

### 6.3 Multi-Network Support

- Document which networks Zapx supports (e.g. Base Sepolia for testnet, Base Mainnet for production)
- If supporting both EVM and Solana, document client setup for both (`registerExactEvmScheme` + `registerExactSvmScheme`)
- Provide network preference guidance (e.g. prefer Base for lower fees)
