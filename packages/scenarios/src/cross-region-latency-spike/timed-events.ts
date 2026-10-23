import type { TimedEvent } from "@incidentrank/simulator";

// A backbone/transit issue between the two regions begins. Both regions
// remain individually healthy — this is specifically a problem with the
// link between them.
const RTT_SPIKE_MS = 30_000;

// Second wave: the backbone issue has not cleared on its own. Sustained
// high RTT means any request path still making a live synchronous
// cross-region call (payment auth, or general traffic left on
// synchronous consistency / required cross-region dependency / "always
// global" locality / primary-region reads from the non-primary region)
// keeps queuing on that round trip — observable beforehand via
// syncWriteLatencyMs and whichever regional customer latency depends on
// the cross-region hop already trending up since RTT_SPIKE_MS, never a
// surprise flip from a healthy-looking state.
const SUSTAINED_DEGRADATION_MS = RTT_SPIKE_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "backbone-rtt-spike",
    atMs: RTT_SPIKE_MS,
    type: "TRIGGER_SET",
    message:
      "Inter-region round-trip latency has spiked sharply. Both US Region and EU Region report healthy local metrics — the issue is specifically on the link between them.",
    setTriggers: { rttSpiking: true },
  },
  {
    id: "backbone-sustained",
    atMs: SUSTAINED_DEGRADATION_MS,
    type: "TRIGGER_SET",
    message:
      "The backbone issue has not cleared. Any request path still waiting on a live cross-region round trip continues to queue on the elevated RTT.",
    setTriggers: { rttSpiking: true, rttSustained: true },
  },
];

export { RTT_SPIKE_MS, SUSTAINED_DEGRADATION_MS };
