import type { TimedEvent } from "@incidentrank/simulator";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const INCIDENT_START_MS = 60 * SECOND_MS;
export const PROVIDER_RECOVERY_START_MS = 12 * MINUTE_MS;
export const PROVIDER_RECOVERY_END_MS = 15 * MINUTE_MS;

export const timedEvents: TimedEvent[] = [
  {
    id: "timed-provider-degraded",
    atMs: INCIDENT_START_MS,
    type: "TRIGGER_SET",
    message: "Payment provider latency has increased sharply.",
    setTriggers: { providerDegraded: true },
  },
  {
    id: "timed-provider-recovery-start",
    atMs: PROVIDER_RECOVERY_START_MS,
    type: "TRIGGER_SET",
    message: "Payment provider latency is beginning to normalize.",
    setTriggers: { providerRecovering: true },
  },
  {
    id: "timed-provider-recovery-complete",
    atMs: PROVIDER_RECOVERY_END_MS,
    type: "TRIGGER_SET",
    message: "Payment provider has fully recovered.",
    setTriggers: { providerDegraded: false, providerRecovering: false },
  },
];
