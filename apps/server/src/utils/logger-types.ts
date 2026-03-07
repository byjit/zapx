/**
 * Typed log event definitions for consistent structured logging.
 *
 * Usage: import { logger, type LogRequest } from "../utils/logger"
 * Then: logger.info({ type: "request", ... } satisfies LogRequest)
 *
 * To add a new log type: define an interface and add it to the LogEvent union.
 */

/** Request log - incoming HTTP request */
export interface LogRequest {
  type: "request";
  method: string;
  url: string;
  requestId: string;
  userAgent?: string;
  ip?: string;
}

/** Response log - completed HTTP response */
export interface LogResponse {
  type: "response";
  method: string;
  url: string;
  statusCode: number;
  responseTimeMs: number;
  requestId: string;
  contentLength?: string;
}

/** tRPC/OpenAPI adapter error */
export interface LogTrpcOpenApiError {
  type: "trpc-to-openapi";
  message: string;
  path?: string;
  method: string;
}

/** General error handler log */
export interface LogError {
  type: "error";
  message: string;
  stack?: string;
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
}

/** Union of all known log event types - extend this when adding new log types */
export type LogEvent =
  | LogRequest
  | LogResponse
  | LogTrpcOpenApiError
  | LogError;
