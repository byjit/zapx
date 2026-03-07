# Rate Limiting Guide

This document captures the current rate-limiting strategy and operating guidance for this project.

## Overview

Rate limiting is implemented at the **application layer** in the server and supports:

- `memory` mode for local/simple setups
- `redis` mode for distributed/shared limits across instances

Nginx currently acts as reverse proxy and security boundary, but does not replace application-aware rate limiting.

## Where it lives

- Limiter creation and helpers: `packages/cache/src/rate-limiter.ts`
- Redis client for limiter storage: `packages/services/src/redis.ts`
- Global middleware usage: `apps/server/src/app.ts`

## Runtime behavior

### Modes

- `RATE_LIMIT_MODE=memory`
  - Uses in-process memory limiter.
  - Suitable for local development or single-instance deployments.
- `RATE_LIMIT_MODE=redis`
  - Uses Redis-backed limiter for shared counters.
  - Requires `REDIS_URL`.
  - Startup fails fast if Redis mode is selected but Redis is not configured.

### Redis resilience

When Redis mode is enabled:

- The limiter uses an in-memory `insuranceLimiter` as fallback protection.
- Redis client uses `enableOfflineQueue: false` to avoid hidden command buildup during disconnections.
- Redis client emits lifecycle logs (`ready`, `reconnecting`, `error`) for operational visibility.

### Request handling semantics

The middleware distinguishes two classes of failures:

1. **Actual rate-limit exceeded**
   - Responds with HTTP `429`.
   - Sets `Retry-After`.
   - Returns rate limit headers.
2. **Limiter backend failure** (for example Redis issue)
   - Does **not** respond with `429`.
   - Logs the failure and currently follows a fail-open policy (request continues).

This prevents masking infrastructure outages as user-throttling errors.

### Headers returned

On successful checks and/or rate-limit responses, the server sets:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

On `429`, it also sets:

- `Retry-After`

## Keying strategy

Keys are grouped by route family and IP to avoid one global bucket for all traffic:

- `auth:<ip>` for `/api/auth/*`
- `api:<ip>` for `/api/*` and `/trpc/*`
- `global:<ip>` for remaining routes

The `/health` endpoint is excluded from limiting.

## Environment variables

Defined in `packages/env/src/index.ts`:

- `RATE_LIMIT_MODE`: `"memory"` or `"redis"` (default: `"memory"`)
- `REDIS_URL`: required when `RATE_LIMIT_MODE=redis`

Example:

```env
RATE_LIMIT_MODE=redis
REDIS_URL=redis://redis:6379
```

## Nginx relationship

The production Nginx config currently has no `limit_req` or `limit_conn` directives. It mainly handles:

- reverse proxying
- security headers
- request size constraints

Recommendation: keep app-level limits as the source of truth, and optionally add coarse edge rate limits in Nginx for defense in depth.

## Operational recommendations

- Keep stricter limits for sensitive endpoints (auth, password flows, OTP, etc.).
- Keep Redis mode for multi-instance production deployments.
- Monitor logs for Redis reconnect/error events and unexpected limiter fallback frequency.
- Tune `points` and `duration` from observed traffic and abuse patterns.

## Quick verification

Use burst requests and confirm both behavior and headers:

```bash
# Should eventually return 429 with Retry-After
for i in {1..20}; do
  curl -i http://localhost/api/health-check-or-target-endpoint
done
```

For Redis mode testing:

1. Start with `RATE_LIMIT_MODE=redis` and a valid `REDIS_URL`.
2. Verify normal traffic and headers.
3. Temporarily interrupt Redis connectivity and confirm:
   - traffic is not mislabeled as `429`
   - server logs show limiter backend errors
