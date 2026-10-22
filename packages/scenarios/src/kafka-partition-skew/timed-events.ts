import type { TimedEvent } from "@incidentrank/simulator";

const SKEW_START_MS = 30_000;
const SECOND_HOT_TENANT_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "hot-tenant-skew-begins",
    atMs: SKEW_START_MS,
    type: "TRIGGER_SET",
    message: "A single large tenant's traffic has spiked, and its messages are concentrated on one partition.",
    setTriggers: { skewActive: true },
  },
  {
    id: "second-hot-tenant-appears",
    atMs: SECOND_HOT_TENANT_MS,
    type: "TRIGGER_SET",
    message: "A second large tenant has begun sending high-volume traffic, also concentrated on a single partition.",
    setTriggers: { skewActive: true, secondHotTenant: true },
  },
];
