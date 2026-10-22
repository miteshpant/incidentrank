import type { TimedEvent } from "@incidentrank/simulator";

const TRAFFIC_SPIKE_MS = 30_000;
const FURTHER_SURGE_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "traffic-spike-begins",
    atMs: TRAFFIC_SPIKE_MS,
    type: "TRIGGER_SET",
    message: "Inbound traffic has roughly tripled and continues climbing.",
    setTriggers: { trafficSpiking: true },
  },
  {
    id: "further-surge",
    atMs: FURTHER_SURGE_MS,
    type: "TRIGGER_SET",
    message: "Traffic has climbed even further, well beyond the original spike.",
    setTriggers: { trafficSpiking: true, furtherSurge: true },
  },
];
