import type { TimedEvent } from "@incidentrank/simulator";

const HARDENING_DEPLOYED_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "cors-hardening-deployed",
    atMs: HARDENING_DEPLOYED_MS,
    type: "TRIGGER_SET",
    message:
      "Security has deployed a CORS hardening change restricting Access-Control-Allow-Origin to internal origins only. Partner integration error rates are climbing.",
    setTriggers: { corsHardeningLive: true },
  },
];
