import type { TimedEvent } from "@incidentrank/simulator";

const AZ_A_DEGRADES_MS = 30_000;
const CASCADE_BEGINS_MS = 75_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "az-a-volumes-degrade",
    atMs: AZ_A_DEGRADES_MS,
    type: "TRIGGER_SET",
    message: "Storage AZ-A's volumes have started reporting elevated I/O errors mid-migration.",
    setTriggers: { azADegraded: true },
  },
  {
    id: "migration-retry-cascade-begins",
    atMs: CASCADE_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "The migration controller's retry logic has begun re-targeting AZ-C for every failed AZ-A copy attempt — AZ-C connection utilization is climbing.",
    setTriggers: { azADegraded: true, cascadeToAzC: true },
  },
];
