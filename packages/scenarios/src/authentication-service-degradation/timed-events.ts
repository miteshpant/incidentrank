import type { TimedEvent } from "@incidentrank/simulator";

const DEGRADATION_START_MS = 30_000;
const ESCALATION_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "auth-degradation-begins",
    atMs: DEGRADATION_START_MS,
    type: "TRIGGER_SET",
    message: "The identity database is under heavy load; token validation latency has spiked.",
    setTriggers: { authDegraded: true },
  },
  {
    id: "degraded-cache-escalation",
    atMs: ESCALATION_MS,
    type: "TRIGGER_SET",
    message: "A degraded cache hit rate is forcing more sessions to re-validate against the struggling auth service.",
    setTriggers: { authDegraded: true, cacheHitRateDegraded: true },
  },
];
