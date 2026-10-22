import "server-only";
import { headers } from "next/headers";

function isLocalhostHost(host: string | null): boolean {
  if (!host) return false;
  // IPv6 loopback has no unambiguous ":"-based port split ("::1:3000" is
  // indistinguishable from the address itself), so check the bracketed
  // form ("[::1]:3000") and the bare address directly before falling
  // back to a plain host:port split for "localhost"/"127.0.0.1".
  if (host === "::1" || host.startsWith("[::1]")) return true;
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Local-dev-only convenience to unlock paid scenarios without a real
 * entitlement system (see practice-access.ts — do not use this to fake
 * entitlements for anyone but the developer running the app on their own
 * machine). Requires ALL of: non-production NODE_ENV, the explicit opt-in
 * env var, AND the request actually arriving on localhost — so setting
 * the env var on a deployed preview/staging environment by mistake still
 * does not unlock anything there.
 */
export function isDevUnlockPaidScenariosRequest(host: string | null): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_UNLOCK_PAID_SCENARIOS === "true" &&
    isLocalhostHost(host)
  );
}

export async function isDevUnlockPaidScenarios(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || process.env.DEV_UNLOCK_PAID_SCENARIOS !== "true") {
    return false;
  }
  const requestHeaders = await headers();
  return isLocalhostHost(requestHeaders.get("host"));
}
