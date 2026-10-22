import type { TimedEvent } from "@incidentrank/simulator";

const POISON_MESSAGE_ARRIVES_MS = 30_000;
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
    id: "second-poison-message-arrives",
    atMs: SECOND_POISON_MESSAGE_MS,
    type: "TRIGGER_SET",
    message: "The same buggy producer has emitted a second malformed message.",
    setTriggers: { poisonMessagePresent: true, secondPoisonMessage: true },
  },
];
