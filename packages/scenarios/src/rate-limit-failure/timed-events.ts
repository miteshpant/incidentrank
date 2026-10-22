import type { TimedEvent } from "@incidentrank/simulator";

const RATE_LIMIT_TRIGGER_MS = 30_000;
const PROVIDER_TIGHTENS_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "rate-limit-begins",
    atMs: RATE_LIMIT_TRIGGER_MS,
    type: "TRIGGER_SET",
    message: "Outbound traffic has exceeded the provider's allowed rate; requests are now being throttled with 429 responses.",
    setTriggers: { rateLimited: true },
  },
  {
    id: "provider-tightens-limit",
    atMs: PROVIDER_TIGHTENS_MS,
    type: "TRIGGER_SET",
    message: "The provider has tightened its rate limit further in response to continued violations.",
    setTriggers: { rateLimited: true, limitTightened: true },
  },
];
