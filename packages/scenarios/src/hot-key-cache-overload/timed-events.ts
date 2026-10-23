import type { TimedEvent } from "@incidentrank/simulator";

const HOT_KEY_SPIKE_MS = 30_000;
// A second wave: sustained unmitigated hot-key traffic finally exhausts
// the hot shard's own memory headroom, so it starts evicting OTHER
// (cold) keys to make room for the churn on the hot key — pushing even
// more unrelated traffic to origin on top of the hot key's own load.
// This is only ever a continuation of an already-visible trend: the hot
// shard's utilization and latency have been climbing, and its cache hit
// rate falling, since HOT_KEY_SPIKE_MS — never a surprise flip from a
// healthy-looking state.
const SHARD_EVICTION_CASCADE_MS = HOT_KEY_SPIKE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "hot-key-spike",
    atMs: HOT_KEY_SPIKE_MS,
    type: "TRIGGER_SET",
    message:
      "A single key is receiving a surge of traffic. The shard it hashes to is climbing in utilization and latency while the rest of the cache cluster remains flat.",
    setTriggers: { hotKeySpike: true },
  },
  {
    id: "hot-shard-eviction-cascade",
    atMs: SHARD_EVICTION_CASCADE_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained hot-key load has exhausted the hot shard's memory headroom. It has begun evicting unrelated cached keys, and origin traffic for those evicted keys is now climbing too.",
    setTriggers: { hotKeySpike: true, hotShardEvicting: true },
  },
];

export { HOT_KEY_SPIKE_MS, SHARD_EVICTION_CASCADE_MS };
