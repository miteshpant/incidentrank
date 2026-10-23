import type { TimedEvent } from "@incidentrank/simulator";

// A routing change moved the default partition-key strategy to
// round-robin ahead of this incident window to absorb a traffic increase
// (producers emit more events/sec than the account-id-keyed layout could
// evenly spread across partitions). The consequence — per-account events
// landing on different partitions, processed out of causal order by
// independently-scheduled consumers — starts showing up as the incident
// opens.
const ROUTING_CHANGE_LIVE_MS = 30_000;

// A second wave: sustained cross-partition reordering under continued
// load means the reconciliation backlog, if not actually draining,
// keeps compounding — but only as the continuation of an already-visible
// trend (unreconciledViolationCount has already been rising since
// ROUTING_CHANGE_LIVE_MS for any unsafe configuration), never a surprise
// flip from a healthy-looking state. A candidate watching
// unreconciledViolationCount and staleStateCorrectionRate climb has every
// reason to expect this.
const SUSTAINED_LOAD_MS = ROUTING_CHANGE_LIVE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "routing-change-live",
    atMs: ROUTING_CHANGE_LIVE_MS,
    type: "TRIGGER_SET",
    message:
      "A partition-routing change rolled out to absorb rising producer throughput. Consumer lag is climbing and the first ordering violations are appearing for accounts whose events now span multiple partitions.",
    setTriggers: { routingChangeActive: true },
  },
  {
    id: "sustained-cross-partition-load",
    atMs: SUSTAINED_LOAD_MS,
    type: "TRIGGER_SET",
    message:
      "Cross-partition event traffic has stayed elevated for several minutes. Any still-unresolved ordering skew continues to compound under the sustained load.",
    setTriggers: { routingChangeActive: true, sustainedLoad: true },
  },
];

export { ROUTING_CHANGE_LIVE_MS, SUSTAINED_LOAD_MS };
