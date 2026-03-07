import { env } from "@turborepo-boilerplate/env";
import { redis } from "@turborepo-boilerplate/services";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";

const DEFAULT_KEY_PREFIX = "rl";

export interface RateLimiterOptions {
  points: number; // Number of points
  duration: number; // Per second(s)
  keyPrefix?: string;
}

export interface RateLimitResult {
  consumedPoints: number;
  isFirstInDuration: boolean;
  msBeforeNext: number;
  remainingPoints: number;
}

const createMemoryRateLimiter = (options: Required<RateLimiterOptions>) => {
  return new RateLimiterMemory({
    points: options.points,
    duration: options.duration,
    keyPrefix: options.keyPrefix,
  });
};

export const createRateLimiter = (options: RateLimiterOptions) => {
  const normalizedOptions = {
    ...options,
    keyPrefix: options.keyPrefix ?? DEFAULT_KEY_PREFIX,
  };

  const memoryLimiter = createMemoryRateLimiter(normalizedOptions);

  if (env.RATE_LIMIT_MODE === "redis") {
    const redisClient = redis;

    if (!redisClient) {
      throw new Error(
        "RATE_LIMIT_MODE is set to redis but REDIS_URL is not configured."
      );
    }

    return new RateLimiterRedis({
      storeClient: redisClient,
      points: normalizedOptions.points,
      duration: normalizedOptions.duration,
      keyPrefix: normalizedOptions.keyPrefix,
      insuranceLimiter: memoryLimiter,
    });
  }

  return memoryLimiter;
};

export const isRateLimitResult = (value: unknown): value is RateLimitResult => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RateLimitResult>;

  return (
    typeof candidate.msBeforeNext === "number" &&
    typeof candidate.remainingPoints === "number" &&
    typeof candidate.consumedPoints === "number" &&
    typeof candidate.isFirstInDuration === "boolean"
  );
};

export const getRetryAfterSeconds = (result: RateLimitResult): number => {
  return Math.max(1, Math.ceil(result.msBeforeNext / 1000));
};
