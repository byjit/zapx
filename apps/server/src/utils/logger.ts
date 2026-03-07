import { env } from "@turborepo-boilerplate/env";
import type { LoggerOptions } from "pino";
import pino from "pino";
import { getCorrelationId } from "./request-context";

/**
 * Creates and configures the Pino logger with transports based on environment settings.
 *
 * Features:
 * - Console logging (always active):
 *   - Pretty format in development
 *   - JSON format in production
 * - File rotation logging (conditional):
 *   - Activated by ENABLE_FILE_LOGGING environment variable
 *   - Runs in worker thread (non-blocking)
 *   - Rotates by configurable file size (default 10MB)
 * - No field redaction - all data logged as-is
 */

const BYTES_IN_KILOBYTE = 1024;
const KILOBYTES_IN_MEGABYTE = 1024;
const MEGABYTES_TO_BYTES = BYTES_IN_KILOBYTE * KILOBYTES_IN_MEGABYTE;
const DEFAULT_FILE_SIZE_LIMIT_MB = 10;
const DEFAULT_MAX_FILE_SIZE = DEFAULT_FILE_SIZE_LIMIT_MB * MEGABYTES_TO_BYTES;
const MAX_FILE_SIZE_IN_BYTES =
  (env.LOG_FILE_MAX_SIZE_MB ?? DEFAULT_FILE_SIZE_LIMIT_MB) * MEGABYTES_TO_BYTES;

/**
 * Base logger configuration
 */
const baseLoggerOptions: LoggerOptions = {
  level: env.NODE_ENV === "development" ? "debug" : "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  // Automatically inject correlationId into every log line when request context exists.
  mixin() {
    const correlationId = getCorrelationId();
    if (!correlationId) {
      return {};
    }
    return { correlationId };
  },
};

/**
 * Console transport configuration
 * - Pretty in development for better readability
 * - JSON in production for structured logging
 */
const consoleTransport = {
  target: env.NODE_ENV === "development" ? "pino-pretty" : "pino/file",
  options:
    env.NODE_ENV === "development"
      ? {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          singleLine: false,
        }
      : {
          destination: 1, // stdout
        },
};

/**
 * File rotation transport configuration
 * - Only active when ENABLE_FILE_LOGGING is true
 * - Rotates at LOG_FILE_MAX_SIZE_MB (default 10MB)
 * - Runs in worker thread for non-blocking I/O
 */
const fileTransport = {
  target: "pino-roll",
  options: {
    file: env.LOG_FILE_PATH ?? "./logs/server.log",
    frequency: 3 * 24 * 60 * 60 * 1000, // 3 days
    size: MAX_FILE_SIZE_IN_BYTES || DEFAULT_MAX_FILE_SIZE,
    mkdir: true,
  },
};

/**
 * Build transport configuration based on environment settings
 */
const buildTransports = (): { targets: Record<string, unknown>[] } => {
  const targets: Record<string, unknown>[] = [consoleTransport];

  if (env.ENABLE_FILE_LOGGING) {
    targets.push(fileTransport);
  }

  return {
    targets,
  };
};

/**
 * Create the Pino logger instance with configured transports
 */
export const logger = pino({
  ...baseLoggerOptions,
  transport: buildTransports() as any,
});

/**
 * Export logger type for use in other modules
 */
export type Logger = typeof logger;

/** Re-export log event types for consistent usage */
export type {
  LogError,
  LogEvent,
  LogRequest,
  LogResponse,
  LogTrpcOpenApiError,
} from "./logger-types";
