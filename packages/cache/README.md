# @turborepo-boilerplate/cache

This package provides caching and rate limiting utilities.

## Rate Limiter

The rate limiter supports both Memory and Redis strategies, controlled by environment variables.

### Configuration

Set the following environment variables in your `.env` file:

- `RATE_LIMIT_MODE`: "memory" or "redis" (default: "memory")
- `REDIS_URL`: URL for Redis connection (required if mode is "redis")

### Usage

```typescript
import { createRateLimiter } from "@turborepo-boilerplate/cache";

const rateLimiter = createRateLimiter({
  points: 10, // Number of points
  duration: 1, // Per second(s)
  keyPrefix: "rl", // Optional prefix
});

// Consume points
try {
  await rateLimiter.consume(key);
} catch (rejRes) {
  // Handle rate limit exceeded
}
```
