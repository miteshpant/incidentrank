import type { TimedEvent } from "@incidentrank/simulator";

// A recent deployment changed the cached object shape (larger payloads)
// and cardinality (far more distinct keys). Eviction churn starts rising
// almost immediately as the cache's existing memory footprint can no
// longer hold the new working set.
const EVICTION_CHURN_RISING_MS = 30_000;

// A second wave: sustained high eviction churn drives DB read load high
// enough, for long enough, that read latency on the database itself
// starts climbing — but only as the continuation of an already-visible
// trend (DB reads/sec and hit ratio have already been moving the wrong
// way since EVICTION_CHURN_RISING_MS), never a surprise flip from a
// healthy-looking state. A candidate watching dbReadsPerSec climb and
// hitRatioPct fall has every reason to expect this.
const DB_READ_PRESSURE_MS = EVICTION_CHURN_RISING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "eviction-churn-rising",
    atMs: EVICTION_CHURN_RISING_MS,
    type: "TRIGGER_SET",
    message:
      "Since the latest deployment, cache eviction rate and database read volume are both climbing while hit ratio falls.",
    setTriggers: { evictionChurnRising: true },
  },
  {
    id: "db-read-pressure-building",
    atMs: DB_READ_PRESSURE_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained cache-miss load has driven database read volume high enough that read latency on the primary is now climbing too.",
    setTriggers: { evictionChurnRising: true, dbReadPressureBuilding: true },
  },
];

export { EVICTION_CHURN_RISING_MS, DB_READ_PRESSURE_MS };
