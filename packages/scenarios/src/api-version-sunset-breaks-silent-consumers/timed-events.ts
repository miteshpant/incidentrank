import type { TimedEvent } from "@incidentrank/simulator";

const SUNSET_TAKES_EFFECT_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "v1-sunset-takes-effect",
    atMs: SUNSET_TAKES_EFFECT_MS,
    type: "TRIGGER_SET",
    message:
      "Orders API v1 has been sunset on schedule. 5xx errors and order-creation failures are climbing — the consumer registry says every known integration finished migrating, but the traffic says otherwise.",
    setTriggers: { v1Sunset: true },
  },
];
