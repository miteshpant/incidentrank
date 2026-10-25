import type { TimedEvent } from "@incidentrank/simulator";

// A returning-user traffic mix shift begins: a marketing push drives a
// wave of returning, already-authenticated users back to the product.
// Under sticky-session hashing, every one of them is routed to whichever
// instance their (still-valid) session cookie was originally pinned to —
// which happens to concentrate heavily onto Instance A and, to a lesser
// degree, Instance B, while Instance C and D (which mostly serve
// first-time/unauthenticated traffic) stay near baseline.
const SESSION_SURGE_MS = 30_000;

// Second wave: with the balancer's health check still on its stale,
// infrequent polling interval, it keeps reporting Instance A as healthy
// well past the point its connection count and latency have been
// visibly climbing — so the balancer keeps sending it NEW unpinned
// traffic too, on top of the pinned load, compounding the skew. This is
// the continuation of an already-visible trend (instanceAConnectionCount
// and instanceALatencyMs have been rising since SESSION_SURGE_MS), never
// a surprise flip from a healthy-looking state.
const STALE_HEALTH_CHECK_COMPOUNDING_MS = SESSION_SURGE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "session-surge-begins",
    atMs: SESSION_SURGE_MS,
    type: "TRIGGER_SET",
    message:
      "A wave of returning, already-authenticated users is landing. Instance A and Instance B's request rate, connection count, and latency are climbing while C and D stay flat.",
    setTriggers: { sessionSurge: true },
  },
  {
    id: "stale-health-check-compounding",
    atMs: STALE_HEALTH_CHECK_COMPOUNDING_MS,
    type: "TRIGGER_SET",
    message:
      "The health check's infrequent polling interval is still reporting Instance A as healthy despite its climbing connection count — new, unpinned traffic keeps landing there too, compounding the skew.",
    setTriggers: { sessionSurge: true, staleHealthCheckCompounding: true },
  },
];

export { SESSION_SURGE_MS, STALE_HEALTH_CHECK_COMPOUNDING_MS };
