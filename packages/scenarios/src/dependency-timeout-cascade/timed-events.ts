import type { TimedEvent } from "@incidentrank/simulator";

const SERVICE_C_DEGRADED_MS = 30_000;
// A second wave: if Service B keeps retrying the still-slow Service C
// (bToCRetryCount > 0) without the circuit breaker, those retries
// accumulate on Service C's own inbound connection pool over several
// minutes of sustained amplified load, until C's connection headroom
// itself runs out — but only as the continuation of an already-visible
// trend (serviceCConnectionsInUse has been climbing since
// SERVICE_C_DEGRADED_MS whenever retries are active), never a surprise
// flip from a healthy-looking state. A candidate watching
// serviceCConnectionsInUse climb has every reason to expect this.
const RETRY_AMPLIFICATION_SATURATION_MS = SERVICE_C_DEGRADED_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "service-c-degraded",
    atMs: SERVICE_C_DEGRADED_MS,
    type: "TRIGGER_SET",
    message:
      "Service C's response latency has risen sharply. Calls into it from Service B are starting to take noticeably longer.",
    setTriggers: { serviceCDegraded: true },
  },
  {
    id: "retry-amplification-saturating",
    atMs: RETRY_AMPLIFICATION_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained retry volume against Service C has driven its inbound connection pool close to its ceiling.",
    setTriggers: { serviceCDegraded: true, retryAmplificationSaturating: true },
  },
];

export { SERVICE_C_DEGRADED_MS, RETRY_AMPLIFICATION_SATURATION_MS };
