import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import {
  readRequestBody,
  type StubServer,
  sendJson,
  startStubServer,
} from "./stub-server";

export type UpstreamRequest = {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

export type UpstreamStub = StubServer & {
  /** Every request the provider API actually received, in order. */
  readonly requests: UpstreamRequest[];
  /** Swap to control status, headers and body for a given test. */
  respond: (request: UpstreamRequest, res: ServerResponse) => void;
  reset(): void;
};

export const UPSTREAM_DEFAULT_BODY = { ok: true, source: "upstream" };

const defaultRespond = (request: UpstreamRequest, res: ServerResponse) => {
  sendJson(res, 200, { ...UPSTREAM_DEFAULT_BODY, url: request.url });
};

/** A stand-in for a provider's API, recording exactly what the gateway forwards. */
export async function startUpstreamStub(): Promise<UpstreamStub> {
  const requests: UpstreamRequest[] = [];

  const stub = {
    requests,
    respond: defaultRespond,
    reset() {
      requests.length = 0;
      stub.respond = defaultRespond;
    },
  };

  const server = await startStubServer(async (req, res) => {
    const request: UpstreamRequest = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
      body: await readRequestBody(req),
    };
    requests.push(request);
    stub.respond(request, res);
  });

  return Object.assign(stub, server);
}
