import type { TimedEvent } from "@incidentrank/simulator";

const POISON_MESSAGE_ARRIVES_MS = 30_000;
// How long a 50-attempt bounded retry limit takes to actually exhaust and
// route the poison message to the dead-letter queue — the slow-masking
// partial-improvement path's eventual (if costly) recovery point. Chosen
// to land well after the failure condition's own 60s sustain window from
// POISON_MESSAGE_ARRIVES_MS, so a candidate who chose this path and
// nothing better genuinely has to wait it out rather than it resolving
// suspiciously fast.
const HIGH_RETRY_LIMIT_EXHAUSTS_MS = POISON_MESSAGE_ARRIVES_MS + 4 * 60_000;
const SECOND_POISON_MESSAGE_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "poison-message-arrives",
    atMs: POISON_MESSAGE_ARRIVES_MS,
    type: "TRIGGER_SET",
    message: "A malformed message from a buggy upstream producer has entered the queue and is failing to process.",
    setTriggers: { poisonMessagePresent: true },
  },
  {
    id: "high-retry-limit-exhausts",
    atMs: HIGH_RETRY_LIMIT_EXHAUSTS_MS,
    type: "TRIGGER_SET",
    message: "The bounded 50-attempt retry limit has finally exhausted; the poison message has routed to the dead-letter queue.",
    setTriggers: { highRetryLimitExhausted: true },
  },
  {
    id: "second-poison-message-arrives",
    atMs: SECOND_POISON_MESSAGE_MS,
    type: "TRIGGER_SET",
    message: "The same buggy producer has emitted a second malformed message.",
    setTriggers: { poisonMessagePresent: true, secondPoisonMessage: true },
  },
];

export { HIGH_RETRY_LIMIT_EXHAUSTS_MS };
