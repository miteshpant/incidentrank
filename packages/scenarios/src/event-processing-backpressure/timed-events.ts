import type { TimedEvent } from "@incidentrank/simulator";

const PRODUCER_SURGE_MS = 30_000;
// A second wave: if the candidate has pushed consumer/worker concurrency
// up without also managing external-API concurrency, sustained high
// outbound call volume finally trips the external API's own rate
// limiter — but only as the continuation of an already-visible trend
// (externalApiErrorRate has already been climbing since the rule-driven
// consequence of scaling consumers took effect), never a surprise flip
// from a healthy-looking state. A candidate watching externalApiErrorRate
// climb has every reason to expect this.
const EXTERNAL_RATE_LIMIT_MS = PRODUCER_SURGE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "producer-surge",
    atMs: PRODUCER_SURGE_MS,
    type: "TRIGGER_SET",
    message:
      "Upstream event producers have surged well past normal volume. Kafka consumer lag is climbing and event freshness is beginning to degrade.",
    setTriggers: { producersSurged: true },
  },
  {
    id: "external-rate-limit-tripped",
    atMs: EXTERNAL_RATE_LIMIT_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained high-volume outbound calls have tripped the external API's own rate limiter; its error rate has crossed into critical territory.",
    setTriggers: { producersSurged: true, externalRateLimited: true },
  },
];

export { PRODUCER_SURGE_MS, EXTERNAL_RATE_LIMIT_MS };
