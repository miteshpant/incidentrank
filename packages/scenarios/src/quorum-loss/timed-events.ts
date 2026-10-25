import type { TimedEvent } from "@incidentrank/simulator";

/** A network issue isolates Node D and Node E, dropping reachable nodes
 * from 5 to 3 — exactly at the quorum edge for a 5-node group (quorum
 * requires 3). The group still genuinely holds quorum at this instant,
 * but has zero margin left: losing even one more node loses it. */
const QUORUM_THREATENED_MS = 30_000;

/** Node C's heartbeat begins degrading — the observable precursor to the
 * second wave below. A candidate watching nodeCHeartbeatHealth has real,
 * visible warning that a third node may also go unreachable before it
 * actually happens. */
const NODE_C_WARNING_MS = QUORUM_THREATENED_MS + 60_000;

/** Second wave: Node C goes fully unreachable too, dropping reachable
 * nodes to 2 of 5 — genuinely below the quorum threshold of 3. Only
 * reachable nodes that were never isolated/addressed count against this;
 * if the candidate restored real quorum (e.g. by isolating D/E and
 * reconfiguring membership down to 3) before this fires, Node C going
 * unreachable no longer threatens quorum at all. */
const QUORUM_LOST_MS = QUORUM_THREATENED_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "nodes-d-e-isolated",
    atMs: QUORUM_THREATENED_MS,
    type: "TRIGGER_SET",
    message:
      "A network issue has isolated Node D and Node E. Reachable voting nodes have dropped from 5 to 3 — the consensus group still holds a majority, but with zero margin remaining.",
    setTriggers: { nodesDEUnreachable: true },
  },
  {
    id: "node-c-heartbeat-degrading",
    atMs: NODE_C_WARNING_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "Node C's heartbeat latency is climbing. If Node C also becomes unreachable, the group will drop to 2 of 5 reachable nodes — below quorum.",
    setTriggers: { nodesDEUnreachable: true, nodeCWarning: true },
  },
  {
    id: "node-c-unreachable",
    atMs: QUORUM_LOST_MS,
    type: "TRIGGER_SET",
    message:
      "Node C has gone unreachable. Only 2 of the original 5 nodes remain reachable — the consensus group no longer holds a genuine majority.",
    setTriggers: { nodesDEUnreachable: true, nodeCWarning: true, nodeCUnreachable: true },
  },
];

export { QUORUM_THREATENED_MS, NODE_C_WARNING_MS, QUORUM_LOST_MS };
