import type { TimedEvent } from "@incidentrank/simulator";

const ACK_FAILURES_BEGIN_MS = 30_000;
// A second wave: redelivery that was already visibly climbing (ack
// failure rate, redelivery volume, duplicate event rate all rising since
// ACK_FAILURES_BEGIN_MS) continues long enough that duplicate side
// effects compound further if nothing has been done — never a surprise
// flip from a healthy-looking state, since the candidate has already
// been watching duplicateEventRatePct and redeliveryVolumePerMin climb.
const SUSTAINED_REDELIVERY_MS = ACK_FAILURES_BEGIN_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "consumer-acks-failing",
    atMs: ACK_FAILURES_BEGIN_MS,
    type: "TRIGGER_SET",
    message:
      "Consumer acknowledgements to the broker are failing intermittently. Unacknowledged messages are being redelivered, and the redelivery volume is climbing.",
    setTriggers: { ackFailuresActive: true },
  },
  {
    id: "sustained-redelivery",
    atMs: SUSTAINED_REDELIVERY_MS,
    type: "TRIGGER_SET",
    message:
      "Acknowledgement failures have continued for several minutes. Redelivery volume and the duplicate event rate remain elevated with no sign of recognition or suppression.",
    setTriggers: { ackFailuresActive: true, sustainedRedelivery: true },
  },
];

export { ACK_FAILURES_BEGIN_MS, SUSTAINED_REDELIVERY_MS };
