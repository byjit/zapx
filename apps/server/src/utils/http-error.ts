export interface HttpErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
  exposeMessage?: boolean;
}

export class HttpError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  exposeMessage: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: HttpErrorOptions = {}
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options.code;
    this.details = options.details;
    this.exposeMessage = options.exposeMessage ?? statusCode < 500;

    if (options.cause) {
      this.cause = options.cause as Error;
    }
  }
}

const makeError = (
  statusCode: number,
  defaultMessage: string,
  messageOrOptions?: string | HttpErrorOptions,
  options?: HttpErrorOptions
): HttpError => {
  if (typeof messageOrOptions === "string") {
    return new HttpError(statusCode, messageOrOptions, options);
  }

  return new HttpError(statusCode, defaultMessage, messageOrOptions);
};

export const isHttpError = (error: unknown): error is HttpError =>
  error instanceof HttpError;

export const httpErrors = {
  badRequest: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(400, "Bad Request", messageOrOptions, options),
  unauthorized: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(401, "Unauthorized", messageOrOptions, options),
  forbidden: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(403, "Forbidden", messageOrOptions, options),
  notFound: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(404, "Not Found", messageOrOptions, options),
  conflict: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(409, "Conflict", messageOrOptions, options),
  unprocessableEntity: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(422, "Unprocessable Entity", messageOrOptions, options),
  tooManyRequests: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(429, "Too Many Requests", messageOrOptions, options),
  notImplemented: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(501, "Not Implemented", messageOrOptions, options),
  serviceUnavailable: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(503, "Service Unavailable", messageOrOptions, options),
  internalServerError: (
    messageOrOptions?: string | HttpErrorOptions,
    options?: HttpErrorOptions
  ) => makeError(500, "Internal Server Error", messageOrOptions, options),
};
