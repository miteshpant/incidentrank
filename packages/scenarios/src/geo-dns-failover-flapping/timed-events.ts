import type { TimedEvent } from "@incidentrank/simulator";

const LATENCY_BLIPS_BEGIN_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "transient-latency-blips-begin",
    atMs: LATENCY_BLIPS_BEGIN_MS,
    type: "TRIGGER_SET",
    message:
      "US-East is showing brief, transient p99 latency blips. GeoDNS failover activity is climbing.",
    setTriggers: { latencyBlipsActive: true },
  },
];
