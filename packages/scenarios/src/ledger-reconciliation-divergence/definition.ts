import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { ledgerReconciliationDivergenceRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DUPLICATE_SUPPRESSION_KEY,
  EVENT_PUBLISHING_MODE_KEY,
  EXCEPTION_POLICY_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_QUEUE_PRIORITY_KEY,
  SETTLEMENT_CONSUMER_MODE_KEY,
  SETTLEMENT_WRITE_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const ledgerReconciliationDivergenceSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "operationalLedgerStatus",
      // No announceCritical — the Operational Ledger is never expected
      // to leave "normal" in this scenario (business invariant #1); it
      // is declared as a severity field purely so peak/critical-time
      // bookkeeping exists for it and a test can assert it never
      // moves, not because this scenario narrates it crossing states.
    },
  ],
  numericWatchFields: [
    {
      key: "missingEntryCount",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Missing settlement entries have crossed 50 — a historical backlog is forming that will require repair, not merely stopping the cause.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Missing settlement entries have drained back below 50.",
      },
    },
    {
      key: "duplicateSettlementEntryCount",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Duplicate settlement entries have crossed 50 concurrently unresolved.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Duplicate settlement entries have drained back below 50.",
      },
    },
    {
      key: "reconciliationBacklogCount",
      trackPeak: true,
    },
    {
      key: "discardedAcknowledgedEntryCount",
      trackPeak: true,
    },
    {
      key: "eventLagSeconds",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: ledgerReconciliationDivergenceRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.2.md section 10, same rigor as
  // distributed-coordination-failure/definition.ts) ───────────────────
  //
  // Reachable terminal/stable rule states, classified by their REAL
  // authored values (newDivergenceRatePerMinute / missingEntryCount /
  // duplicateSettlementEntryCount / discardedAcknowledgedEntryCount /
  // reconciliationBacklogCount / reconciliationStatus):
  //
  //   baseline-diverging                    UNSAFE   9 / 22 / 14 / 0 / 36  / diverging
  //   baseline-sustained-diverging          UNSAFE   9 / 140 / 90 / 0 / 230 / diverging
  //   replay-unsafe-amplified               UNSAFE   18 / 22 / 210 / 0 / 232 / diverging
  //   concurrency-amplified-damage          UNSAFE   26 / 48 / 160 / 0 / 208 / diverging
  //   exceptions-discarded                  UNSAFE   4 / 60 / 35 / 95 / 0   / discarded-violation
  //   exceptions-discarded-sustained        UNSAFE   4 / 140 / 90 / 230 / 0 / discarded-violation
  //   frozen-consumer-paused                UNSAFE   0 / 48 / 30 / 0 / 78  / frozen-unrepaired
  //   frozen-consumer-paused-sustained      UNSAFE   0 / 140 / 90 / 0 / 230/ frozen-unrepaired
  //   frozen-publisher-fixed-passive-detect UNSAFE   0 / 140 / 90 / 0 / 230/ frozen-unrepaired
  //   frozen-routed-not-repairing           UNSAFE   0 / 140 / 90 / 0 / 230/ frozen-unrepaired
  //   repair-just-engaged-early             UNSAFE   0 / 22 / 14 / 0 / 36  / draining (tick-0, backlog = pre-repair value)
  //   repair-just-engaged-sustained         UNSAFE   0 / 140 / 90 / 0 / 230/ draining (tick-0, backlog = pre-repair value)
  //   draining-early-window1-normal         UNSAFE   0 / 22 / 14 / 0 / 19  / draining (below acceptable's 120 ceiling but NOT yet 30s-sustained at a point past tick-0 in every reachable timeline — see note below)
  //   draining-early-window1-expedited      ACCEPTABLE 0 / 22 / 14 / 0 / 9 / draining
  //   draining-sustained-window1-normal     ACCEPTABLE 0 / 140 / 90 / 0 / 165/ draining -- ABOVE the 120 ceiling: see note
  //   draining-sustained-window1-expedited  ACCEPTABLE 0 / 140 / 90 / 0 / 115/ draining
  //   draining-sustained-window2-normal     ACCEPTABLE 0 / 140 / 90 / 0 / 95 / draining
  //   draining-sustained-window2-expedited  ACCEPTABLE 0 / 140 / 90 / 0 / 35 / draining
  //   fully-reconciled                      OPTIMAL  0 / 0 / 0 / 0 / 0    / reconciled
  //
  // Correction to the table above: draining-sustained-window1-normal's
  // backlog (165) exceeds acceptableCondition's ceiling (<=120), so
  // that specific state is UNSAFE (not yet acceptable) despite reading
  // "draining" -- the ceiling is what prevents "technically shrinking
  // but still far too large" from qualifying. It becomes ACCEPTABLE
  // only once either expedited priority or more elapsed time (window 2)
  // has brought it under 120. This is intentional: "bounded AND
  // draining" requires BOTH a real ceiling and real forward progress,
  // not either alone.
  //
  // Every UNSAFE state has either (a) newDivergenceRatePerMinute > 0
  // (new damage still accumulating -- per phase6d.2.md section 10,
  // NEVER acceptable/optimal regardless of any other metric), or (b) a
  // frozen/not-yet-drained backlog with reconciliationStatus !=
  // "draining"/"reconciled" (no demonstrable forward progress), or (c)
  // a permanent discardedAcknowledgedEntryCount violation. No UNSAFE
  // state in this table is "almost fixed" by coincidence of rounding --
  // each one fails a real, named gate.
  //
  // ACCEPTABLE states all satisfy: newDivergenceRatePerMinute = 0 AND
  // discardedAcknowledgedEntryCount = 0 AND reconciliationBacklogCount
  // <= 120 AND reconciliationStatus = "draining" -- genuinely bounded,
  // genuinely still shrinking, with a real repair process engaged and
  // correctness never compromised, even though missingEntryCount/
  // duplicateSettlementEntryCount have NOT reset to zero and
  // reconciliationBacklogCount has not reached zero. This is exactly
  // phase6d.2.md section 9's "stop new damage while still needing
  // reconciliation/recovery" state, modeled with real, distinct,
  // non-reset-to-zero historical counters.
  //
  // OPTIMAL (fully-reconciled) requires the longest elapsed repair
  // window on top of every ACCEPTABLE gate, with every historical
  // counter including the backlog itself at genuine zero.
  //
  // Because the central judgment this scenario tests is "is this
  // specific mixed state -- new damage stopped, backlog nonzero but
  // shrinking -- good enough to hand back, or does it need more
  // repair time" (an inherently judgment-laden question with a real,
  // deliberately generous ACCEPTABLE tier, not a single objective
  // zero/nonzero gate), this scenario is `candidate_declared`, not
  // `automatic` -- matching phase6d.2.md section 9's own suggested
  // acceptable-state language and distinguishing this scenario from
  // distributed-coordination-failure (which authored NO acceptable
  // tier and stayed `automatic` because every non-optimal state there
  // was an unambiguous ongoing gap, never a deliberate tradeoff).
  completion: {
    mode: "candidate_declared",
    acceptableCondition,
  },
};
