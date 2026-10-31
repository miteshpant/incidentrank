import type { TimedEvent } from "@incidentrank/simulator";

const PRICING_DEGRADATION_BEGINS_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "pricing-degradation-begins",
    atMs: PRICING_DEGRADATION_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "Pricing Service's own database is under maintenance load. Pricing error rate and latency have started climbing.",
    setTriggers: { pricingDegraded: true },
  },
];
