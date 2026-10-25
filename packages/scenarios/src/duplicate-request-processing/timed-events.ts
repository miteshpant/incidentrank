import type { TimedEvent } from "@incidentrank/simulator";

const LATENCY_RISING_MS = 30_000;
// A second wave: sustained retry pressure without any mitigation
// continues to compound — but only as the continuation of an
// already-visible trend (serviceLatencyMs, retryVolumePerMin, and
// duplicateRequestRatePct have already been elevated since
// LATENCY_RISING_MS), never a surprise flip from a healthy-looking
// state. A candidate watching retry volume and duplicate request rate
// climb has every reason to expect continued compounding if nothing
// changes.
const SUSTAINED_RETRY_PRESSURE_MS = LATENCY_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "downstream-dependency-slow",
    atMs: LATENCY_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "A downstream dependency has slowed down. Order-service response times are rising, and clients are beginning to time out and retry before responses return.",
    setTriggers: { dependencySlow: true },
  },
  {
    id: "sustained-retry-pressure",
    atMs: SUSTAINED_RETRY_PRESSURE_MS,
    type: "TRIGGER_SET",
    message:
      "Retry volume has remained elevated for several minutes. Without a durable fix, the same ambiguous-acknowledgement pattern keeps repeating on every slow request.",
    setTriggers: { dependencySlow: true, sustainedRetryPressure: true },
  },
];

export { LATENCY_RISING_MS, SUSTAINED_RETRY_PRESSURE_MS };
