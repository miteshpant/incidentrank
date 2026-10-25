import type { TimedEvent } from "@incidentrank/simulator";

// A batch of popular catalog objects was warmed at the same time with a
// flat, unjittered TTL. As that shared expiry approaches, the cache miss
// rate and concurrent-refresh count begin climbing ahead of the actual
// expiry instant — a candidate watching cacheMissRatePct/
// concurrentRefreshes has observable warning before the herd lands.
const EXPIRY_APPROACHING_MS = 20_000;
// The shared TTL is crossed: every API instance that independently
// checks the cache for these keys sees a miss at nearly the same moment
// and independently issues its own origin refresh.
const SYNCHRONIZED_EXPIRY_MS = 35_000;
// Second wave: refreshes that failed/timed out against the saturated
// origin have been retrying. Only reachable if the herd is still
// unmitigated — refreshFailureRatePct and originQps are already
// visibly elevated for a full minute before retry amplification
// compounds further, never a surprise flip from a quiet state.
const RETRY_AMPLIFICATION_MS = SYNCHRONIZED_EXPIRY_MS + 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "shared-expiry-approaching",
    atMs: EXPIRY_APPROACHING_MS,
    type: "TRIGGER_SET",
    message:
      "A large batch of popular catalog objects is approaching its shared cache expiry — miss rate and in-flight refresh count are both starting to climb ahead of the expiry instant.",
    setTriggers: { expiryApproaching: true },
  },
  {
    id: "synchronized-expiry",
    atMs: SYNCHRONIZED_EXPIRY_MS,
    type: "TRIGGER_SET",
    message:
      "The shared TTL has been crossed. Every API instance independently detected a cache miss on these popular keys at nearly the same instant and is issuing its own origin refresh.",
    setTriggers: { expiryApproaching: true, herdActive: true },
  },
  {
    id: "retry-amplification",
    atMs: RETRY_AMPLIFICATION_MS,
    type: "TRIGGER_SET",
    message:
      "Refresh failures against the saturated origin have been retrying without relief, and retry volume is now compounding on top of the original herd.",
    setTriggers: { expiryApproaching: true, herdActive: true, retryAmplifying: true },
  },
];

export { EXPIRY_APPROACHING_MS, SYNCHRONIZED_EXPIRY_MS, RETRY_AMPLIFICATION_MS };
