import { env } from "@turborepo-boilerplate/env";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const EXACT_SCHEME = "exact";

let resourceServer: x402ResourceServer | null = null;
let initPromise: Promise<void> | null = null;

export function getResourceServer(): x402ResourceServer {
  if (!resourceServer) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: env.FACILITATOR_URL,
    });

    resourceServer = new x402ResourceServer(facilitatorClient);
    registerExactEvmScheme(resourceServer);
  }

  return resourceServer;
}

/**
 * The resource server, guaranteed to have loaded the facilitator's supported
 * payment kinds.
 *
 * `initialize()` is what populates the supported-kinds map from the facilitator's
 * `/supported` response; without it `buildPaymentRequirements` throws
 * "Facilitator does not support exact on <network>" and no 402 challenge is ever
 * issued. `@x402/express`'s own middleware awaits this once at startup — the
 * gateway builds routes per request and so has to do it itself.
 *
 * Memoized on the singleton: the supported-kinds map lives on the shared
 * `x402ResourceServer`, so one successful initialization serves every
 * per-request `x402HTTPResourceServer`. The promise is cleared on failure so a
 * transient facilitator outage cannot poison the process for its lifetime.
 */
export async function getInitializedResourceServer(): Promise<x402ResourceServer> {
  const server = getResourceServer();

  initPromise ??= server.initialize().catch((error: unknown) => {
    initPromise = null;
    throw error;
  });

  await initPromise;
  return server;
}

export function getPayTo(): string {
  if (!env.PAY_TO) {
    throw new Error(
      "PAY_TO environment variable is required for payment processing"
    );
  }
  return env.PAY_TO;
}

export function getPlatformFeePercent(): number {
  return env.PLATFORM_FEE_PERCENT;
}

export function getNetwork(): `${string}:${string}` {
  return env.X402_NETWORK as `${string}:${string}`;
}

/**
 * Edge case #23: verify the gateway's payment configuration on startup.
 *
 * Runs the same memoized initialization the request path uses, so a fresh
 * deployment learns about a missing scheme or an unreachable facilitator once at
 * boot instead of 502-ing per request with no clue why.
 */
export async function checkFacilitatorHealth(): Promise<void> {
  if (!env.PAY_TO) {
    console.warn(
      "[x402] PAY_TO is not set — the payment gateway is disabled and every paid request will fail."
    );
    return;
  }

  const network = getNetwork();

  if (!getResourceServer().hasRegisteredScheme(network, EXACT_SCHEME)) {
    console.error(
      `[x402] WARNING: no '${EXACT_SCHEME}' scheme is registered for ${network}. Check X402_NETWORK — the gateway cannot price requests on this chain.`
    );
    return;
  }

  try {
    await getInitializedResourceServer();
    console.log(
      `[x402] Facilitator ready: ${env.FACILITATOR_URL} — settling '${EXACT_SCHEME}' on ${network}`
    );
  } catch (error) {
    console.error(
      `[x402] WARNING: could not load supported payment kinds from ${env.FACILITATOR_URL}. Gateway payments will fail until it is reachable.`,
      error instanceof Error ? error.message : error
    );
  }
}
