import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { type LogRequest, type LogResponse, logger } from "../utils/logger";
import { runWithRequestContext } from "../utils/request-context";

/**
 * Paths to exclude from logging
 */
const EXCLUDED_PATHS = ["/health", "/favicon.ico"];

/**
 * Check if a path should be excluded from logging
 */
const shouldExcludePath = (path: string): boolean => {
  // Exclude health check and static paths
  if (EXCLUDED_PATHS.includes(path)) {
    return true;
  }

  // Exclude static file paths (e.g., .js, .css, .png, etc.)
  const staticFileExtensions = [
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
  ];
  return staticFileExtensions.some((ext) => path.endsWith(ext));
};

/**
 * Logger middleware for Express
 *
 * Features:
 * - Uses incoming correlation id (x-correlation-id / x-request-id) or generates one
 * - Logs request and response with structured data
 * - Measures response time in milliseconds
 * - Excludes health check and static paths
 * - Adds correlation id headers on request/response for traceability
 */
export const loggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip logging for excluded paths
  if (shouldExcludePath(req.path)) {
    next();
    return;
  }

  const incomingCorrelationId =
    req.get("x-correlation-id") || req.get("x-request-id");
  const correlationId = incomingCorrelationId || randomUUID();

  // Keep compatibility with existing request-id usage.
  req.headers["x-correlation-id"] = correlationId;
  req.headers["x-request-id"] = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  res.setHeader("x-request-id", correlationId);

  runWithRequestContext({ correlationId }, () => {
    // Record start time
    const startTime = Date.now();

    const requestLog: LogRequest = {
      type: "request",
      method: req.method,
      url: req.url,
      requestId: correlationId,
      userAgent: req.get("user-agent") ?? undefined,
      ip: req.ip || req.socket.remoteAddress,
    };
    logger.info(requestLog);

    res.on("finish", () => {
      const responseTimeMs = Date.now() - startTime;
      const responseLog: LogResponse = {
        type: "response",
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTimeMs,
        requestId: correlationId,
        contentLength: res.get("content-length"),
      };
      logger.info(responseLog);
    });

    next();
  });
};
