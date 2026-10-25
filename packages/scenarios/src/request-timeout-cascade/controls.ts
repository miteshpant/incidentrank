import type { ControlDefinition } from "@incidentrank/simulator";

/** Timeout budget for the Gateway's call into Service A — the outermost
 * hop, closest to the customer. Per the scenario's binding design
 * requirement, this must be proportioned SHORTER than the combined budget
 * of everything beneath it (aToBTimeoutMs + bToDependencyTimeoutMs plus
 * retry overhead); left too long relative to the hops below, the Gateway
 * keeps a thread/connection open waiting on a chain that may itself still
 * be retrying underneath it. */
export const GATEWAY_TO_A_TIMEOUT_MS_KEY = "gatewayToATimeoutMs";

/** Timeout budget for Service A's call into Service B — the middle hop.
 * Must be proportioned against bToDependencyTimeoutMs (and its retries)
 * beneath it, not tuned in isolation: shortening the Gateway's own budget
 * without also shortening this one just moves where in the chain blocked
 * threads accumulate. */
export const A_TO_B_TIMEOUT_MS_KEY = "aToBTimeoutMs";

/** Timeout budget for Service B's call into the Dependency — the
 * innermost hop, closest to where the latency blip actually originates.
 * The natural instinct is to tighten this first, but tightening it alone
 * while the Gateway and Service A keep their original long budgets only
 * relieves Service B's own pool — everything above B is still sized
 * around a call chain that no longer takes as long underneath it. */
export const B_TO_DEPENDENCY_TIMEOUT_MS_KEY = "bToDependencyTimeoutMs";

/** Number of times the Gateway itself re-issues a request after its own
 * timeout fires. Each Gateway-level retry starts a brand-new call chain
 * through Service A, Service B, and the Dependency — multiplying the
 * number of concurrent request chains in flight — while the ORIGINAL,
 * already-abandoned chain keeps occupying its own threads/connections at
 * every layer below unless requestCancellationEnabled is on. Retrying
 * more aggressively against a chain that is not actually failing, only
 * slow, directly multiplies in-flight load rather than relieving it. */
export const GATEWAY_RETRY_COUNT_KEY = "gatewayRetryCount";

/** When enabled, a caller that gives up on a call (its own timeout fires,
 * or a retry supersedes it) propagates a cancellation signal downstream,
 * freeing the thread/connection the abandoned request was holding at
 * Service A, Service B, and the Dependency instead of letting it run to
 * completion for a caller that is no longer listening. Without this,
 * every Gateway-level retry adds a new in-flight chain on top of the old
 * one that is still silently consuming capacity below — the scenario's
 * central mechanism. Enabling it does nothing to fix a badly proportioned
 * timeout budget by itself; it only stops abandoned work from piling up
 * on top of whatever the budget already allows through. */
export const REQUEST_CANCELLATION_ENABLED_KEY = "requestCancellationEnabled";

/** Circuit breaker in front of Service B's calls to the Dependency. When
 * tripped, B fails fast on every call into the Dependency instead of
 * waiting out a timeout or retrying — protecting B's pool, and in turn
 * Service A's and the Gateway's, from ever blocking on the Dependency
 * again, at the cost of serving errors for the capability the Dependency
 * provides while the breaker stays open. A structurally different
 * mitigation from re-proportioning the budget: it fences the Dependency
 * off rather than correctly sizing the calls into it. */
export const CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY = "circuitBreakerBToDependency";

export const controls: ControlDefinition[] = [
  {
    key: GATEWAY_TO_A_TIMEOUT_MS_KEY,
    allowedValues: [9_000, 4_500, 1_800, 700],
    initialValue: 9_000,
  },
  {
    key: A_TO_B_TIMEOUT_MS_KEY,
    allowedValues: [7_000, 3_500, 1_200, 450],
    initialValue: 7_000,
  },
  {
    key: B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
    allowedValues: [5_500, 2_800, 900, 300],
    initialValue: 5_500,
  },
  {
    key: GATEWAY_RETRY_COUNT_KEY,
    allowedValues: [0, 1, 2, 4],
    initialValue: 1,
  },
  {
    key: REQUEST_CANCELLATION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
