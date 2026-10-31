import type { TimedEvent } from "@incidentrank/simulator";

// The compaction level-size multiplier was actually lowered from 8 to 2
// roughly three weeks before this incident (an attempt to shrink
// per-compaction-round memory use during a prior, unrelated memory-
// pressure incident). That change itself caused no visible symptom at
// the time — it only quietly raised write amplification, which ate
// IOPS headroom that nobody was watching because nothing crossed a
// threshold. TRAFFIC_BUMP_BEGINS_MS is the first moment that headroom
// actually runs out: a routine, unremarkable increase in write volume
// is what finally tips the now-amplified write path into disk IOPS
// saturation. The misconfiguration is authored directly into
// initialValues/rules as the pre-existing state, not as a separate
// timed event — there is nothing to "trigger" about a setting that was
// already wrong; only the traffic bump is a dated event.
const TRAFFIC_BUMP_BEGINS_MS = 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "routine-traffic-bump-begins",
    atMs: TRAFFIC_BUMP_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "Write volume has increased to its normal weekly peak. Disk IOPS utilization and write latency have both started climbing.",
    setTriggers: { trafficBumpActive: true },
  },
];
