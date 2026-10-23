import type { ControlDefinition } from "@incidentrank/simulator";

/** Timeout budget for the API's call into Service A. Must exceed what
 * Service A itself needs to either succeed or fail fast against Service
 * B — otherwise the API gives up before A can even react, and if it's
 * left far too long relative to the hops below it, API threads calling A
 * pile up waiting on a chain that is itself blocked on Service C. */
export const API_TO_A_TIMEOUT_MS_KEY = "apiToATimeoutMs";

/** Timeout budget for Service A's call into Service B. The scenario's
 * central timeout-budget lesson lives here: this value must be tightened
 * together with bToCTimeoutMs, not in isolation — leaving this long while
 * only the B->C hop is fixed still lets A's threads block on B for far
 * longer than B itself now needs to fail fast against C. */
export const A_TO_B_TIMEOUT_MS_KEY = "aToBTimeoutMs";

/** Timeout budget for Service B's call into the now-slow Service C. The
 * hop closest to the actual degraded dependency — the first place
 * blocked threads physically accumulate. */
export const B_TO_C_TIMEOUT_MS_KEY = "bToCTimeoutMs";

/** Retry attempts Service B makes against Service C after a timeout or
 * error. Retrying a dependency that is uniformly slow (not intermittently
 * flaky) multiplies the request volume C has to serve without giving it
 * any more capacity, and keeps B's outbound connections to C occupied for
 * even longer in aggregate. */
export const B_TO_C_RETRY_COUNT_KEY = "bToCRetryCount";

/** Circuit breaker in front of Service B's calls to Service C. When
 * tripped, B fails fast on calls to C instead of waiting out a timeout or
 * retrying — protecting B's own thread/connection pool, and in turn
 * everything upstream of B, from ever blocking on C's slowness, at the
 * cost of serving errors for the capability C provides while the breaker
 * stays open. */
export const CIRCUIT_BREAKER_B_TO_C_KEY = "circuitBreakerBToC";

/** Service A's own concurrency ceiling for in-flight calls to Service B —
 * a bulkhead. Lowering it caps how many of A's own threads/connections
 * can ever be simultaneously blocked waiting on B, protecting A's pool
 * (and therefore the API's own pool calling A) independent of whatever
 * timeout value is chosen, at the cost of rejecting some requests outright
 * once the ceiling is hit rather than queueing them. */
export const SERVICE_A_CONCURRENCY_LIMIT_KEY = "serviceAConcurrencyLimit";

export const controls: ControlDefinition[] = [
  {
    key: API_TO_A_TIMEOUT_MS_KEY,
    allowedValues: [8_000, 4_000, 1_500, 600],
    initialValue: 8_000,
  },
  {
    key: A_TO_B_TIMEOUT_MS_KEY,
    allowedValues: [6_000, 3_000, 1_000, 400],
    initialValue: 6_000,
  },
  {
    key: B_TO_C_TIMEOUT_MS_KEY,
    allowedValues: [5_000, 2_500, 800, 250],
    initialValue: 5_000,
  },
  {
    key: B_TO_C_RETRY_COUNT_KEY,
    allowedValues: [0, 1, 3, 5],
    initialValue: 1,
  },
  {
    key: CIRCUIT_BREAKER_B_TO_C_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SERVICE_A_CONCURRENCY_LIMIT_KEY,
    allowedValues: [400, 200, 80, 30],
    initialValue: 400,
  },
];
