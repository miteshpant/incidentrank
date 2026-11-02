import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const ROOT_FAILURE_START_MS = INCIDENT_START_MS;
const CASCADE_WIDENS_MS = 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "root-service-failure-begins",
    atMs: ROOT_FAILURE_START_MS,
    type: "TRIGGER_SET",
    message: "User Profile Service has started timing out on all requests.",
    setTriggers: { rootFailureActive: true },
  },
  {
    id: "cascade-widens",
    atMs: CASCADE_WIDENS_MS,
    type: "TRIGGER_SET",
    message: "Checkout Service and Order Service are now both reporting degraded health.",
    setTriggers: { rootFailureActive: true, cascadeWidened: true },
  },
];
