import { env } from "@turborepo-boilerplate/env";
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisListenersAttached: boolean | undefined;
};

const createRedisClient = () => {
  if (!env.REDIS_URL) {
    return undefined;
  }

  return new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
  });
};

const attachRedisEventListeners = (client: Redis) => {
  if (globalForRedis.redisListenersAttached) {
    return;
  }

  client.on("ready", () => {
    console.info("[redis] client connected");
  });

  client.on("reconnecting", () => {
    console.warn("[redis] reconnecting");
  });

  client.on("error", (error) => {
    console.error("[redis] connection error", error);
  });

  globalForRedis.redisListenersAttached = true;
};

export const redis = globalForRedis.redis ?? createRedisClient();

if (redis) {
  attachRedisEventListeners(redis);
}

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
