import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { apiMigrationDualWriteFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const apiMigrationDualWriteFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "writeAuthorityRiskStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Write authority risk has entered a critical state — dual-write divergence is actively accumulating.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Write authority risk has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "unreconciledDivergentRecordCount",
      trackPeak: true,
      threshold: {
        value: 100,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The unreconciled divergent record count has crossed 100 records.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The unreconciled divergent record count has dropped back below 100.",
      },
    },
    {
      key: "newOnlyUnreconciledRecordCount",
      trackPeak: true,
    },
    {
      key: "exposedDivergentReadCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "A customer-facing read has exposed unresolved divergent state.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Exposed divergent reads have stopped.",
      },
    },
    {
      key: "silentlyLostAcknowledgedWriteCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "An acknowledged write has become silently unreachable from customer-facing reads.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further acknowledged writes are being lost.",
      },
    },
    {
      key: "blindReplayCorruptionCount",
      trackPeak: true,
    },
    {
      key: "newServiceWriteLatencyMs",
      trackPeak: true,
    },
    {
      key: "reconciliationQueueDepth",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: apiMigrationDualWriteFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.2.md section 10, same style/rigor
  // as distributed-coordination-failure/definition.ts) ────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (unreconciled / newOnlyUnreconciled / exposedReads /
  // lostWrites / blindReplayCorruption / correctnessStatus):
  //
  //   dual-write-unmitigated-baseline              UNSAFE  120/55/0/0/0  unresolved
  //   dual-write-unmitigated-escalated              UNSAFE  300/140/0/0/0 unresolved
  //   aggressive-rollout-increase-...(+escalated)   UNSAFE  210-520/95-240/0/0/0 unresolved
  //   aggressive-rollout-increase-with-shadow-warmup
  //     (+escalated)                                UNSAFE  165-400/75-185/0/0/0 unresolved
  //     (real, measurable partial mitigation vs the cold variant above
  //     at the same trigger window — but still strictly worse than
  //     dual-write-unmitigated-baseline; shadow traffic alone never
  //     makes raising rollout while dual-writing safe)
  //   divergence-active-unmanaged                   UNSAFE  300/140/0/0/0 unresolved
  //   replay-blind-corrupts-data                    UNSAFE  40/10/0/0/95 violated
  //   unsafe-sequence-rollback-before-reconcile(-early) UNSAFE 140-340/85-210/20-58/85-210/0 violated
  //   unsafe-sequence-rollback-cohort-exposed        UNSAFE  340/210/44/0/0 violated
  //   frozen-no-reconciliation-legacy-authoritative  ACCEPTABLE-CANDIDATE 300/140/0/0/0 contained
  //   frozen-no-reconciliation-new-authoritative     ACCEPTABLE-CANDIDATE 300/140/0/0/0 contained
  //   draining-early-legacy-authoritative            UNSAFE  220/100/0/0/0 contained (above threshold)
  //   draining-early-new-authoritative               UNSAFE  220/100/0/0/0 contained (above threshold)
  //   draining-normal-priority-legacy-authoritative  ACCEPTABLE 95/40/0/0/0  contained
  //   draining-normal-priority-new-authoritative     ACCEPTABLE 95/40/0/0/0  contained
  //   draining-critical-first-new-authoritative      ACCEPTABLE 55/20/0/0/0  contained
  //   draining-critical-first-high-rollout-contention ACCEPTABLE 50/18/0/0/0 contained
  //   fully-reconciled-undeclared                    OPTIMAL-ELIGIBLE* 0/0/0/0/0 safe
  //   fully-reconciled-rollback-legacy                OPTIMAL 0/0/0/0/0  safe
  //   fully-reconciled-continue-new                   OPTIMAL 0/0/0/0/0  safe
  //
  // * fully-reconciled-undeclared satisfies successCondition's literal
  //   field checks (every count is zero, correctnessStatus === "safe")
  //   even though no migrationDirection has been declared — the
  //   business invariants never required a declared strategic
  //   direction, only that write authority be single-sourced and the
  //   backlog be fully drained. It is listed as OPTIMAL exactly like
  //   the two declared-direction states; migrationDirection is a
  //   candidate-facing signal of intent, not a gate on either success
  //   condition.
  //
  // ── Why "frozen-no-reconciliation-*" is UNSAFE, not acceptable ──────
  // These two states have correctnessStatus === "contained" (new
  // divergence has genuinely stopped) and zero hard-violation counts —
  // on first glance this looks like it should satisfy the acceptable
  // bar. It does NOT: acceptableCondition additionally requires
  // unreconciledDivergentRecordCount <= 100, and these frozen-but-
  // unreconciled states sit at 300 — a backlog that is bounded only in
  // the sense that it has stopped GROWING, never ACTUALLY DRAINING.
  // Per phase6d.2.md section 9's binding rule ("fixing the cause does
  // NOT automatically undo damage already caused... requires a real,
  // separately-modeled reconciliation/repair process"), a frozen write
  // mode alone is the CAUSE being fixed, not the damage being undone —
  // treating "stopped getting worse" as "safe enough to hand back"
  // would defeat the entire historical-damage requirement this
  // scenario exists to test. Only once reconciliationMode is actually
  // "diff-and-repair" (the draining-* family) does the backlog size
  // drop below the acceptable threshold.
  //
  // ── Why "draining-early-*" is ALSO UNSAFE despite diff-and-repair
  // actually running ────────────────────────────────────────────────
  // This is the recovery-lag honesty check: turning reconciliationMode
  // to "diff-and-repair" is necessary but not sufficient — the backlog
  // must ALSO have had real elapsed reconciliation time to actually
  // drain. draining-early's 220/100 sits strictly below the frozen
  // ceiling of 300 (real, distinct progress from reconciliation
  // running — proving this isn't a dead control) but still strictly
  // above acceptableCondition's <=100 bound. Without this intermediate
  // state, the very first tick after enabling diff-and-repair could
  // satisfy the acceptable bar, letting Finish/scoring treat "just
  // turned on the right control" as equivalent to "the historical
  // backlog has meaningfully drained" — exactly the instant-recovery-
  // lag violation phase6d.2.md section 9 forbids.
  //
  // ── Why the two unsafe-sequence states are UNSAFE, not acceptable ───
  // Both have correctnessStatus === "violated" (hard, counted
  // correctness violations — exposed divergent reads, lost
  // acknowledged writes) which fails acceptableCondition's
  // exposedDivergentReadCount/silentlyLostAcknowledgedWriteCount ===
  // 0 checks directly, regardless of requestSuccessRate reading 98-99
  // throughout. This is precisely phase6d.2.md section 10's rule: "a
  // state where new damage is still accumulating must NEVER be
  // classified acceptable" — and a correctness violation that already
  // happened is itself non-self-resetting new damage that was
  // incurred, never un-incurred, within the same incident.
  //
  // ── Why replay-blind-corrupts-data is UNSAFE despite a LOWER raw
  // divergence count than the frozen/draining families ─────────────
  // This is the deliberate trap: unreconciledDivergentRecordCount (40)
  // and newOnlyUnreconciledRecordCount (10) both look better than
  // every other non-optimal state in this table — but
  // blindReplayCorruptionCount (95) is a hard violation
  // acceptableCondition gates on directly. A candidate who only
  // watches the divergence counter would conclude this path is
  // working; the scenario is authored specifically to punish that.
  //
  // ── Why NO state here is OPTIMAL merely because it is fast ──────────
  // successCondition requires reconciliationWindowElapsed (a real,
  // fixed recovery-lag window) AND diff-and-repair having actually run
  // the whole time AND single-sourced write authority — there is no
  // control combination that reaches unreconciledDivergentRecordCount
  // === 0 before that window elapses, regardless of which controls are
  // set, because rules.ts's draining-* family (the only path toward
  // zero) is itself gated on reconciliationWindowElapsed === false
  // and authored with a nonzero backlog throughout that window.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "frozen, stalled" (UNSAFE) and "frozen, actively
  // draining" (ACCEPTABLE) is a real system-state distinction (bounded
  // AND demonstrably draining, per section 10), but deciding WHEN a
  // still-nonzero, still-draining backlog is safe enough to hand back
  // — as opposed to continuing to wait for the fully-reconciled optimal
  // state — is a genuine judgment call a Principal engineer must make
  // explicitly, not a state the engine should auto-resolve the instant
  // a threshold is crossed. This mirrors Multi-Region Payment Platform
  // Degradation's (#61) completion-mode reasoning exactly: an
  // acceptable tier that is correctness-safe but intentionally
  // imperfect is best modeled as a declared handback, not an automatic
  // transition.
  completion: { mode: "candidate_declared", acceptableCondition },
};
