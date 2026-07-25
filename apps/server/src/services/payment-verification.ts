import { env } from "@turborepo-boilerplate/env";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

let resourceServer: x402ResourceServer | null = null;

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
 * Edge case #23: Verify facilitator is reachable on startup.
 * Logs a warning if PAY_TO is set but the facilitator can't be reached.
 */
export async function checkFacilitatorHealth(): Promise<void> {
  if (!env.PAY_TO) return; // Gateway not configured

  try {
    const res = await fetch(`${env.FACILITATOR_URL}/supported`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(
        `[x402] Facilitator connected: ${env.FACILITATOR_URL} — supported networks:`,
        data
      );
    } else {
      console.warn(
        `[x402] Facilitator returned ${res.status} at ${env.FACILITATOR_URL}/supported`
      );
    }
  } catch (err) {
    console.error(
      `[x402] WARNING: Facilitator unreachable at ${env.FACILITATOR_URL}. Gateway payments will fail.`,
      err instanceof Error ? err.message : err
    );
  }
}
