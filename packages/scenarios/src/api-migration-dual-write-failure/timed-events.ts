import type { TimedEvent } from "@incidentrank/simulator";

// The incident starts already mid-rollout: dual-write has been active
// for a while before the candidate is paged, so some real divergence
// already exists at T=0 of the active-incident window. This trigger
// marks "the candidate has been notified / is now watching," not the
// literal start of dual-write (which predates the incident).
const DUAL_WRITE_DIVERGENCE_ACTIVE_MS = 20_000;

// Natural/organic escalation: if dual-write is left running
// unaddressed, New Service's capacity continues to intermittently
// fail a fraction of writes under its own load, so the asymmetric-
// write mechanism keeps producing new divergence at an accelerating
// rate the longer it runs unaddressed.
const DIVERGENCE_ESCALATES_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 3 * 60_000;

// RECOVERY-LAG window (phase6d.2.md section 9 / binding for all 5
// scenarios): reconciliation cannot be assumed to finish the instant
// diff-and-repair is turned on. This trigger fires a fixed, real number
// of simulated minutes after reconciliation would need to have been
// running continuously to have fully drained a bounded backlog —
// rules.ts gates the fully-drained ("safe"/"reconciled") values on this
// trigger in combination with reconciliationMode actually having been
// "diff-and-repair" the whole window, never on the control value alone.
const RECONCILIATION_WINDOW_ELAPSED_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 5 * 60_000;

// Intermediate recovery-lag checkpoint: a real, fixed amount of
// simulated time must pass with diff-and-repair actually running
// before the backlog has drained far enough to even be CONSIDERED
// bounded (acceptableCondition's <=100 threshold). Without this
// checkpoint, the very first tick after starting diff-and-repair could
// otherwise satisfy the acceptable bar, which would let recovery time
// score as if the historical backlog had meaningfully drained within
// seconds — defeating the recovery-lag requirement. Rules.ts's
// draining-* (bounded, <=100) family is gated on this trigger; before
// it fires, only the higher, still-above-the-acceptable-threshold
// draining-early values are reachable even with diff-and-repair
// correctly running the whole time.
const RECONCILIATION_PARTIALLY_DRAINED_MS = DUAL_WRITE_DIVERGENCE_ACTIVE_MS + 90_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "dual-write-divergence-active",
    atMs: DUAL_WRITE_DIVERGENCE_ACTIVE_MS,
    type: "TRIGGER_SET",
    message:
      "Dual-write is active between Legacy and New. Some writes are succeeding on only one side — Legacy and New have begun to diverge for a real, growing set of records.",
    setTriggers: { dualWriteDivergenceActive: true },
  },
  // NOTE: ordered strictly by ascending atMs — the engine processes
  // timedEvents by array position, never by sorting atMs.
  {
    id: "reconciliation-partially-drained",
    atMs: RECONCILIATION_PARTIALLY_DRAINED_MS,
    type: "TRIGGER_SET",
    message:
      "A reconciliation process that has been running continuously has had enough time to drain the backlog to a materially smaller, bounded size, provided diff-and-repair has actually been active.",
    setTriggers: {
      dualWriteDivergenceActive: true,
      reconciliationPartiallyDrained: true,
    },
  },
  {
    id: "divergence-escalates",
    atMs: DIVERGENCE_ESCALATES_MS,
    type: "TRIGGER_SET",
    message:
      "New Service's own capacity limits are intermittently failing a larger fraction of dual-writes. Left unaddressed, the divergent-record count is now growing faster than before.",
    setTriggers: {
      dualWriteDivergenceActive: true,
      reconciliationPartiallyDrained: true,
      divergenceEscalated: true,
    },
  },
  {
    id: "reconciliation-window-elapsed",
    atMs: RECONCILIATION_WINDOW_ELAPSED_MS,
    type: "TRIGGER_SET",
    message:
      "Enough time has passed for a continuously running diff-and-repair process to have fully drained the historical divergence backlog, provided one has actually been running the whole window.",
    setTriggers: {
      dualWriteDivergenceActive: true,
      reconciliationPartiallyDrained: true,
      divergenceEscalated: true,
      reconciliationWindowElapsed: true,
    },
  },
];

export {
  DUAL_WRITE_DIVERGENCE_ACTIVE_MS,
  RECONCILIATION_PARTIALLY_DRAINED_MS,
  DIVERGENCE_ESCALATES_MS,
  RECONCILIATION_WINDOW_ELAPSED_MS,
};
