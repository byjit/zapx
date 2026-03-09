import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "@turborepo-boilerplate/api/context";
import { appRouter } from "@turborepo-boilerplate/api/routers/index";
import { auth } from "@turborepo-boilerplate/auth";
import {
  createRateLimiter,
  getRetryAfterSeconds,
  isRateLimitResult,
} from "@turborepo-boilerplate/cache";
import { env } from "@turborepo-boilerplate/env";
import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import {
  createOpenApiExpressMiddleware,
  generateOpenApiDocument,
} from "trpc-to-openapi";
import { loggerMiddleware } from "./middleware/logger";
import { v1Router } from "./routes/v1";
import { HttpError } from "./utils/http-error";
import {
  type LogError,
  type LogTrpcOpenApiError,
  logger,
} from "./utils/logger";

const REQUEST_SIZE_LIMIT_IN_MB = 10;
const URLENCODED_SIZE_LIMIT_IN_MB = 10;
const corsOrigin = env.CORS_ORIGIN?.trim();
const RATE_LIMIT_POINTS = 10;
const RATE_LIMIT_DURATION_SECONDS = 1;

const getRateLimitKey = (req: Request) => {
  if (req.path.startsWith("/api/auth")) {
    return `auth:${req.ip ?? "unknown"}`;
  }

  if (req.path.startsWith("/api") || req.path.startsWith("/trpc")) {
    return `api:${req.ip ?? "unknown"}`;
  }

  return `global:${req.ip ?? "unknown"}`;
};

const setRateLimitHeaders = (
  res: Response,
  result: { remainingPoints: number; msBeforeNext: number }
) => {
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_POINTS));
  res.setHeader(
    "X-RateLimit-Remaining",
    String(Math.max(0, result.remainingPoints))
  );
  res.setHeader(
    "X-RateLimit-Reset",
    String(Math.ceil((Date.now() + result.msBeforeNext) / 1000))
  );
};

export const createServer = (): Express => {
  const app = express();

  app.set("trust proxy", 1);

  // Security headers
  app.use(helmet());

  // Rate limiting
  const rateLimiter = createRateLimiter({
    points: RATE_LIMIT_POINTS, // 10 requests
    duration: RATE_LIMIT_DURATION_SECONDS, // per 1 second by key
  });

  app.use(async (req, res, next) => {
    if (req.path === "/health") {
      next();
      return;
    }

    try {
      const result = await rateLimiter.consume(getRateLimitKey(req));
      setRateLimitHeaders(res, result);
      next();
      return;
    } catch (error) {
      if (isRateLimitResult(error)) {
        setRateLimitHeaders(res, error);
        res.setHeader("Retry-After", String(getRetryAfterSeconds(error)));
        res.status(429).json({ error: "Too Many Requests" });
        return;
      }

      const requestId =
        (req.headers["x-correlation-id"] as string) ||
        (req.headers["x-request-id"] as string) ||
        "unknown";
      const rateLimiterError =
        error instanceof Error
          ? error
          : new Error("Unknown rate limiter failure");

      logger.error({
        type: "error",
        message: `Rate limiter unavailable: ${rateLimiterError.message}`,
        stack: env.NODE_ENV === "development" ? rateLimiterError.stack : undefined,
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: 503,
      });

      // Prefer availability when Redis is degraded. Requests still flow, and
      // the in-memory insurance limiter can help smooth short outages.
      next();
    }
  });

  // Apply logger middleware first to log all requests
  app.use(loggerMiddleware);

  app.use(
    cors({
      // Keep browser access explicit. Same-origin and server-to-server requests
      // do not need CORS headers, while cross-origin auth flows should use the
      // configured frontend origin.
      origin: corsOrigin,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Correlation-Id",
        "X-Request-Id",
      ],
      exposedHeaders: ["X-Correlation-Id", "X-Request-Id"],
      credentials: true,
    })
  );

  // Request size limits
  app.use(
    express.urlencoded({
      extended: true,
      limit: `${URLENCODED_SIZE_LIMIT_IN_MB}mb`,
    })
  );
  app.use(express.json({ limit: `${REQUEST_SIZE_LIMIT_IN_MB}mb` }));
  app.use(cookieParser());

  app.all("/api/auth{/*path}", toNodeHandler(auth));

  app.use("/api/v1", v1Router);

  // Generate OpenAPI document
  if (env.ALLOW_OPENAPI) {
    const openApiDocument = generateOpenApiDocument(appRouter, {
      title: "TurboRepo Boilerplate API",
      version: "1.0.0",
      baseUrl: `${env.BASE_URL}/api`,
    });

    // Serve Swagger UI
    app.use("/docs", swaggerUi.serve);
    app.get("/docs", swaggerUi.setup(openApiDocument));

    // Serve OpenAPI JSON
    app.get("/openapi.json", (_req, res) => {
      res.json(openApiDocument);
    });
  }

  // REST adapter for tRPC
  app.use(
    "/api",
    createOpenApiExpressMiddleware({
      router: appRouter,
      createContext,
      responseMeta() {
        return {};
      },
      onError({
        error,
        path,
        req,
      }: {
        error: Error;
        path: string | undefined;
        req: Request;
      }) {
        const log: LogTrpcOpenApiError = {
          type: "trpc-to-openapi",
          message: error.message,
          path,
          method: req.method,
        };
        logger.error(log);
      },
      maxBodySize: REQUEST_SIZE_LIMIT_IN_MB * 1024 * 1024, // Align with Express JSON limit (10MB)
    })
  );

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Health check endpoint (excluded from logging)
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/", (_req, res) => {
    res.status(200).send("OK");
  });

  // Helper functions for error handler
  const getStatusCode = (error: Error): number => {
    if (error instanceof HttpError) {
      return error.statusCode;
    }
    const anyError = error as any;
    if (typeof anyError.status === "number") {
      return anyError.status;
    }
    if (typeof anyError.statusCode === "number") {
      return anyError.statusCode;
    }
    return 500;
  };

  const getResponseMessage = (error: Error): string => {
    if (error instanceof HttpError && error.exposeMessage) {
      return error.message;
    }
    if (env.NODE_ENV === "development") {
      return error.message;
    }
    return "Internal Server Error";
  };

  const getErrorDetails = (error: Error) => {
    if (env.NODE_ENV === "development" && error instanceof HttpError) {
      return error.details;
    }
    return undefined;
  };

  // Centralized error handler to log and return consistent responses
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const requestId =
      (req.headers["x-correlation-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      "unknown";
    const error = err instanceof Error ? err : new Error("Unknown error");
    const statusCode = getStatusCode(error);

    const errorLog: LogError = {
      type: "error",
      message: error.message,
      stack: env.NODE_ENV === "development" ? error.stack : undefined,
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
    };
    logger.error(errorLog);

    if (res.headersSent) {
      next(err);
      return;
    }

    res.status(statusCode).json({
      error: getResponseMessage(error),
      code: error instanceof HttpError ? error.code : undefined,
      details: getErrorDetails(error),
      requestId,
    });
  });

  return app;
};

export type AppServer = ReturnType<typeof createServer>;
