import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const FAILOVER_BEGINS_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "cache-node-failover-begins",
    atMs: FAILOVER_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "A session cache node has failed over. Some logged-in users are reporting being bounced to a logged-out or stale-cart state.",
    setTriggers: { affinityBroken: true },
  },
];
