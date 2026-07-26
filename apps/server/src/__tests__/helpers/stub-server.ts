import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal `node:http` server used to stand in for external services.
 *
 * Every stub in these tests binds to port 0 on the loopback interface and
 * reports the port the OS handed out, so suites never collide and never depend
 * on a service outside the test process.
 */
export type StubServer = {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
};

export type StubHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

export async function startStubServer(
  handler: StubHandler
): Promise<StubServer> {
  const server: Server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "stub failure",
        })
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Collects a request body into a single buffer. */
export function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
