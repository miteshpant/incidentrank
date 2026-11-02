import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const EU_REGION_OUTAGE_BEGINS_MS = INCIDENT_START_MS;
const AUTOMATIC_FAILOVER_COMPLETES_MS = 45_000;
const EU_REGION_INFRASTRUCTURE_RECOVERS_MS = 180_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "eu-region-outage-begins",
    atMs: EU_REGION_OUTAGE_BEGINS_MS,
    type: "TRIGGER_SET",
    message: "eu-west-1 is reporting elevated error rates across all availability zones.",
    setTriggers: { euRegionOutage: true },
  },
  {
    id: "automatic-failover-completes",
    atMs: AUTOMATIC_FAILOVER_COMPLETES_MS,
    type: "TRIGGER_SET",
    message:
      "The Global Traffic Manager's availability-only failover policy has automatically shifted EU customer traffic to us-east-1. EU availability is restored.",
    setTriggers: { euRegionOutage: true, autoFailedOverToUs: true },
  },
  {
    id: "eu-region-infrastructure-recovers",
    atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS,
    type: "TRIGGER_SET",
    message: "eu-west-1's own infrastructure has finished recovering and is healthy again.",
    setTriggers: { euRegionOutage: true, autoFailedOverToUs: true, euRegionInfraRecovered: true },
  },
];
