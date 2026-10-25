import type { TimedEvent } from "@incidentrank/simulator";

// A deploy ships a new response field that returns full nested related
// records instead of lightweight references. Traffic against the
// affected endpoints is immediate — the regression is visible from the
// first tick after rollout, not a slow-building trend.
const REGRESSION_DEPLOYED_MS = 30_000;

// A second wave: sustained oversized responses finally exhaust the API
// tier's per-instance memory headroom (garbage from repeatedly building
// huge, short-lived object graphs accumulates faster than it can be
// collected) and GC pressure starts spiking error rate on top of the
// already-elevated latency — but only as the continuation of an
// already-visible trend (apiMemoryUtilization and p99LatencyMs have
// been elevated since REGRESSION_DEPLOYED_MS), never a surprise flip
// from a healthy-looking state. A candidate watching apiMemoryUtilization
// climb has every reason to expect this.
const MEMORY_EXHAUSTION_MS = REGRESSION_DEPLOYED_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "payload-regression-deployed",
    atMs: REGRESSION_DEPLOYED_MS,
    type: "TRIGGER_SET",
    message:
      "A deploy has shipped a new response field that returns full nested related records instead of lightweight references. Response payload size, serialization latency, and memory pressure are all climbing together.",
    setTriggers: { payloadRegressed: true },
  },
  {
    id: "api-memory-exhausting",
    atMs: MEMORY_EXHAUSTION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained oversized responses have exhausted API-tier memory headroom; garbage-collection pressure is now driving errors on top of already-elevated latency.",
    setTriggers: { payloadRegressed: true, memoryExhausting: true },
  },
];

export { REGRESSION_DEPLOYED_MS, MEMORY_EXHAUSTION_MS };
