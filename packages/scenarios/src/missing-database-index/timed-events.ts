import type { TimedEvent } from "@incidentrank/simulator";

const TRAFFIC_RISING_MS = 30_000;
// A second wave: sustained scan load against the primary finally
// saturates the connection pool and begins producing outright
// connection-pool errors — but only as the continuation of an already-
// visible trend (scanned rows, DB CPU, and queue depth have already
// been rising since TRAFFIC_RISING_MS), never a surprise flip from a
// healthy-looking state. A candidate watching dbConnectionUtilization
// and requestQueueDepth climb has every reason to expect this.
const POOL_SATURATION_MS = TRAFFIC_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "order-history-traffic-rising",
    atMs: TRAFFIC_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "Traffic to the recently deployed order-history endpoint is climbing, and its query latency is rising with it.",
    setTriggers: { trafficRising: true },
  },
  {
    id: "connection-pool-saturating",
    atMs: POOL_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained full-table-scan load has driven connection pool utilization to its ceiling; new requests are now queueing for a free connection.",
    setTriggers: { trafficRising: true, poolSaturating: true },
  },
];

export { TRAFFIC_RISING_MS, POOL_SATURATION_MS };
