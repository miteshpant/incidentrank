import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const SCHEMA_DRIFT_BEGINS_MS = INCIDENT_START_MS;
const COMPACTION_JOB_BEGINS_MS = 45_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "schema-drift-begins",
    atMs: SCHEMA_DRIFT_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "Orders Service deployed a new event shape. Billing, Analytics, and Fraud Detection are each showing different symptoms.",
    setTriggers: { schemaContractDrifting: true },
  },
  {
    id: "unrelated-compaction-job-begins",
    atMs: COMPACTION_JOB_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "The warehouse's nightly storage compaction job has started (scheduled, unrelated).",
    setTriggers: { compactionJobRunning: true },
  },
];
