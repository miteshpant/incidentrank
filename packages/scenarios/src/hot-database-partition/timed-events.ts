import type { TimedEvent } from "@incidentrank/simulator";

const CONCENTRATION_RISING_MS = 30_000;
// A second wave: sustained concentration finally pushes Partition A
// into outright saturation — but only as the continuation of an
// already-visible trend (partitionARequestRate, partitionALatencyMs,
// and partitionAQueueDepth have already been climbing since
// CONCENTRATION_RISING_MS while B/C/D stayed flat), never a surprise
// flip from a healthy-looking state. A candidate watching the
// per-partition asymmetry has every reason to expect this.
const SATURATION_MS = CONCENTRATION_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "tenant-concentration-rising",
    atMs: CONCENTRATION_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "A small number of high-volume tenants are concentrating traffic on Partition A. Its request rate and latency are climbing while Partitions B, C, and D remain flat.",
    setTriggers: { tenantConcentrationRising: true },
  },
  {
    id: "partition-a-saturating",
    atMs: SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained tenant concentration has driven Partition A to its request-handling ceiling; its queue depth is now growing without bound.",
    setTriggers: { tenantConcentrationRising: true, partitionASaturating: true },
  },
];

export { CONCENTRATION_RISING_MS, SATURATION_MS };
