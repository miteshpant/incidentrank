import type { TimedEvent } from "@incidentrank/simulator";

const TRAFFIC_SPIKE_MS = 30_000;
// A second wave: the cache hit-rate collapse and database connection
// growth that have been visible since TRAFFIC_SPIKE_MS finally drive the
// connection pool to its ceiling, producing outright queuing/errors — but
// only as the continuation of an already-visible trend (cacheHitRatePct
// falling and dbConnectionUtilization climbing have been on-screen the
// whole time), never a surprise flip from a healthy-looking state.
const POOL_SATURATION_MS = TRAFFIC_SPIKE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "traffic-spike-begins",
    atMs: TRAFFIC_SPIKE_MS,
    type: "TRIGGER_SET",
    message:
      "Request volume is climbing sharply. The new traffic mix is hitting a wider, colder set of cache keys than usual, and the cache hit rate is dropping as database load rises to cover the misses.",
    setTriggers: { trafficSpiking: true },
  },
  {
    id: "db-pool-saturating",
    atMs: POOL_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained cache-miss load has driven the database connection pool to its ceiling; new requests are now queueing for a free connection.",
    setTriggers: { trafficSpiking: true, poolSaturating: true },
  },
];

export { TRAFFIC_SPIKE_MS, POOL_SATURATION_MS };
