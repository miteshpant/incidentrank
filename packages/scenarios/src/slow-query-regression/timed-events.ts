import type { TimedEvent } from "@incidentrank/simulator";

const REGRESSION_START_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "regression-begins",
    atMs: REGRESSION_START_MS,
    type: "TRIGGER_SET",
    message: "A recent deploy changed query shape and the planner stopped using the expected index — queries are now doing full table scans.",
    setTriggers: { regressionActive: true },
  },
];
