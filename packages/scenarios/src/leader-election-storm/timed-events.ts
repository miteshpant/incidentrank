import type { TimedEvent } from "@incidentrank/simulator";

/** Intermittent network latency on node-3's link begins — heartbeats
 * from node-3 are now sporadically delayed, with spikes reaching ~900ms,
 * even though node-3 itself is fully alive and healthy. */
const JITTER_STARTS_MS = 30_000;

/**
 * node-3's link health visibly deteriorates beyond ordinary jitter
 * noise — node3HeartbeatMissStreak (rules.ts) rises further here, in
 * EVERY jitter-phase state including the otherwise-fully-stable
 * margin-fixed and isolated paths, independent of whatever controls are
 * set. This is the honest, candidate-visible precursor (phase6b.md
 * section 7) that node-3 specifically is trending toward a real
 * failure, not just experiencing transient blips — it never depends on
 * rules.ts's internal knowledge of the future crash, only on a signal
 * every path genuinely exposes.
 */
const NODE3_DEGRADING_MS = JITTER_STARTS_MS + 3 * 60_000;

/**
 * node-3 suffers a genuine hardware fault and goes down for real — an
 * external incident event no engineer could have predicted the exact
 * timing of (phase6b.md section 7's named exception). This does NOT
 * retroactively make an earlier, correct "raise the timeout with real
 * margin" decision wrong — it tests whether the margin chosen was
 * proportionate or excessive, which is exactly the tradeoff this
 * scenario is about.
 */
const GENUINE_CRASH_MS = NODE3_DEGRADING_MS + 60_000;

/** Once a failover is actually underway (margin-fixed or excessive-
 * timeout path), the one-time election completes and the cluster
 * settles under its new leader well within this window — long enough
 * to exceed even the excessive 3000ms timeout's worst-case detection
 * time several times over, never a hidden instant flip. */
const CRASH_SETTLED_MS = GENUINE_CRASH_MS + 30_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "node3-jitter-starts",
    atMs: JITTER_STARTS_MS,
    type: "TRIGGER_SET",
    message:
      "Node-3's network link is experiencing intermittent latency spikes. Heartbeats from node-3 are sporadically arriving late, though node-3 itself remains up.",
    setTriggers: { networkJitterNode3: true },
  },
  {
    id: "node3-degrading",
    atMs: NODE3_DEGRADING_MS,
    type: "TRIGGER_SET",
    message:
      "Node-3's heartbeat miss streak is climbing beyond ordinary jitter noise — its link health appears to be deteriorating, not just intermittently blipping.",
    setTriggers: { networkJitterNode3: true, node3Degrading: true },
  },
  {
    id: "node3-genuine-crash",
    atMs: GENUINE_CRASH_MS,
    type: "TRIGGER_SET",
    message:
      "Node-3 has suffered a genuine hardware fault and is no longer responding at all — this is a real failure, not transient jitter.",
    setTriggers: { networkJitterNode3: true, node3Crashed: true },
  },
  {
    id: "node3-crash-settled",
    atMs: CRASH_SETTLED_MS,
    type: "TRIGGER_SET",
    message: "The cluster has finished failing over away from node-3 and has settled under a new leader.",
    setTriggers: { networkJitterNode3: true, node3Crashed: true, crashSettled: true },
  },
];

export { JITTER_STARTS_MS, NODE3_DEGRADING_MS, GENUINE_CRASH_MS, CRASH_SETTLED_MS };
