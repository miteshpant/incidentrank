import type { TimedEvent } from "@incidentrank/simulator";

// Pricing, Promotions, and Tax all begin degrading moderately at the same
// moment. None of the three, on its own, would read as an outage --
// each is independently within a "slow but serving" band. The incident
// exists entirely because all three sit on the SAME synchronous checkout
// critical path at once, so their latencies add rather than hide behind
// each other.
const DEPENDENCIES_DEGRADED_MS = 30_000;

// Second wave: the underlying dependency degradation itself clears on its
// own schedule, independent of anything the candidate did. This does not
// retroactively drain whatever in-flight request backlog or
// retry-amplified pressure already built up -- that still needs to be
// observed decaying over real elapsed time (recovery lag).
const DEPENDENCIES_RECOVERED_MS = DEPENDENCIES_DEGRADED_MS + 6 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "dependencies-degraded",
    atMs: DEPENDENCIES_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "Pricing, Promotions, and Tax have each begun returning moderately elevated latency and error rates. Individually, none of the three looks like an outage.",
    setTriggers: { dependenciesDegraded: true },
  },
  {
    id: "dependencies-recovered",
    atMs: DEPENDENCIES_RECOVERED_MS,
    type: "TRIGGER_SET",
    message:
      "Pricing, Promotions, and Tax have all returned to normal latency and error rates on their own schedule.",
    setTriggers: { dependenciesDegraded: true, dependenciesRecovered: true },
  },
];

export { DEPENDENCIES_DEGRADED_MS, DEPENDENCIES_RECOVERED_MS };
