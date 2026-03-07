import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  correlationId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T
): T => {
  return requestContextStorage.run(context, callback);
};

export const getRequestContext = (): RequestContext | undefined => {
  return requestContextStorage.getStore();
};

export const getCorrelationId = (): string | undefined => {
  return getRequestContext()?.correlationId;
};
