import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { outOfOrderEventsRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const outOfOrderEventsSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "materializedStateStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The materialized account state has entered a critical divergence state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The materialized account state has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "unreconciledViolationCount",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Unreconciled ordering violations have crossed 500.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Unreconciled ordering violations have dropped back below 500.",
      },
    },
    { key: "orderingViolationRate", trackPeak: true },
    { key: "consumerLagMessages", trackPeak: true },
  ],
  timedEvents,
  rules: outOfOrderEventsRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   divergence (baseline, round-robin, no fix)         UNSAFE
  //     unreconciledViolationCount=600, growing, critical
  //   sustained-divergence (second wave, no fix)          UNSAFE
  //     unreconciledViolationCount=1_400, critical (crosses failure bar)
  //   scaled-amplified-divergence (parallelism, harmful)  UNSAFE
  //     unreconciledViolationCount=900, critical
  //   validation-without-reconciliation (harmful trap)    UNSAFE
  //     eventsPerSecond=3_200, consumerLagMessages=60 —
  //     BOTH LOOK HEALTHY — but unreconciledViolationCount=380 and
  //     climbing every tick; reconciliationRate (6) << violationRate (50)
  //   unreconciled-divergence (harmful trap)               UNSAFE
  //     eventsPerSecond=3_150, consumerLagMessages=65 — BOTH LOOK
  //     HEALTHY — but unreconciledViolationCount=420 and climbing;
  //     reconciliationRate (18) << violationRate (50); tolerance window
  //     too short to let the reorder buffer actually catch up
  //   rekeyed-draining (partial, re-keyed but buffer off)  UNSAFE
  //     unreconciledViolationCount=40, not draining (reconciliationRate=0),
  //     warning status — a real but incomplete fix
  //   bounded-reconciliation (round-robin, full safeguards) ACCEPTABLE
  //     unreconciledViolationCount=12 and PROVEN bounded — reconciliation
  //     rate (55) >= violation rate (50) in the authored values, not
  //     merely asserted; orderingIntegrityMode="reordering-risk"
  //   ordering-restored (re-keyed + reorder buffer)        OPTIMAL
  //     unreconciledViolationCount=0, orderingIntegrityMode=
  //     "ordering-preserved" — the physical cause is gone
  //
  // The two "harmful trap" states above are the ones this batch exists
  // to catch: every candidate-visible availability metric
  // (eventsPerSecond, consumerLagMessages) looks exactly as healthy as
  // the genuinely safe acceptable path, while unreconciledViolationCount
  // — a real, distinct, candidate-visible field — is elevated and
  // actively growing. Neither successCondition nor acceptableCondition
  // can ever be satisfied by them, because both gate on
  // unreconciledViolationCount staying low AND on orderingIntegrityMode
  // being exactly "ordering-preserved" or "reordering-risk" respectively
  // — "unsafe-divergence" satisfies neither.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // bounded-reconciliation state. "Does throughput/lag look fine" is not,
  // by itself, proof the materialized state is trustworthy — the
  // candidate must judge whether reconciliation is actually keeping pace
  // with ongoing violations, which is exactly the "is this safe enough
  // to hand back" judgment candidate_declared exists to test. Most
  // states here are real but incomplete mitigations that never cross
  // either bar — correctly left ineligible for Finish rather than
  // awarded a third tier, per section 9's explicit "not almost passed"
  // rule.
  completion: { mode: "candidate_declared", acceptableCondition },
};
