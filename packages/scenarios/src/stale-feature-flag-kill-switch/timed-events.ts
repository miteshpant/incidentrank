import type { TimedEvent } from "@incidentrank/simulator";

const UNRELATED_FLAG_FLIP_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "unrelated-flag-flip-wakes-dead-code",
    atMs: UNRELATED_FLAG_FLIP_MS,
    type: "TRIGGER_SET",
    message:
      "The on-call engineer enabled the new checkout layout flag for a routine rollout. Minutes later, checkout prices started mismatching cart totals.",
    setTriggers: { legacyEngineWoken: true },
  },
];
