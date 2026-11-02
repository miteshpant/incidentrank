import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const REGRESSION_DETECTED_MS = INCIDENT_START_MS;
const MEMORY_GROWTH_ESCALATION_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "regression-detected",
    atMs: REGRESSION_DETECTED_MS,
    type: "TRIGGER_SET",
    message: "The new deploy has been live for a few minutes and error rates have begun climbing on affected endpoints.",
    setTriggers: { regressionActive: true },
  },
  {
    id: "memory-growth-escalation",
    atMs: MEMORY_GROWTH_ESCALATION_MS,
    type: "TRIGGER_SET",
    message: "Memory usage on the regressed version is continuing to climb without bound.",
    setTriggers: { regressionActive: true, memoryGrowthActive: true },
  },
];
