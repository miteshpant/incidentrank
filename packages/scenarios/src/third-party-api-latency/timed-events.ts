import type { TimedEvent } from "@incidentrank/simulator";
import { INCIDENT_START_MS } from "../timing";

const VENDOR_SLOWNESS_START_MS = INCIDENT_START_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "vendor-slowness-begins",
    atMs: VENDOR_SLOWNESS_START_MS,
    type: "TRIGGER_SET",
    message:
      "The third-party shipping-rate API has begun responding slowly. It has not returned any outright errors — it is simply slow.",
    setTriggers: { vendorSlow: true },
  },
];
