import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const REGRESSION_START_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "regression-begins",
    atMs: REGRESSION_START_MS,
    type: "TRIGGER_SET",
    message: "A recent deploy changed query shape and the planner stopped using the expected index — queries are now doing full table scans.",
    setTriggers: { regressionActive: true },
  },
];
