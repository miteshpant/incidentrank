import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { capacityExhaustionDuringPeakEventRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const capacityExhaustionDuringPeakEventSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "dbSaturationStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "The database has entered a critical saturation state — it is being actively pushed toward collapse.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The database has recovered out of its critical saturation state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "cumulativeCriticalTrafficDroppedCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "Non-policy-based shedding has begun indiscriminately dropping real checkout/transaction traffic. This is a permanent historical record for this attempt.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage:
          "Non-policy-based shedding has stopped. The traffic already dropped while it was active remains a permanent historical record — it is not restored.",
      },
    },
    {
      key: "asyncQueueBacklogCount",
      trackPeak: true,
    },
    {
      key: "dbConnectionUtilizationPercent",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: capacityExhaustionDuringPeakEventRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.4.md section 11) ─────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (checkout% / dbSaturationStatus / queueDraining /
  // searchAvailability / historicalDrop / peakEventStatus):
  //
  //   healthy-default                   N/A      (pre-incident)
  //   baseline-escalating                UNSAFE  98.5 / warning  / growing  / normal   / 0   / escalating
  //   baseline-cache-degraded            UNSAFE  96.5 / warning  / growing  / normal   / 0   / escalating
  //   baseline-sustained                 UNSAFE  89.0 / critical / growing  / normal   / 0   / db-collapse-risk
  //   capacity-escalation-early          UNSAFE  93.0 / critical / growing  / normal   / 0   / db-collapse-risk
  //   capacity-escalation-trap           UNSAFE  78.0 / critical / growing  / normal   / 0   / db-collapse-risk
  //   premature-worker-drain             UNSAFE  88.0 / critical / draining / normal   / 0   / db-collapse-risk
  //   random-shed-active                 UNSAFE  91.5 / warning  / draining / normal   / 180 / critical-traffic-dropped
  //   random-shed-sustained              UNSAFE  89.0 / warning  / draining / normal   / 520 / critical-traffic-dropped
  //   shed-optional-only                 UNSAFE  97.0 / warning  / draining / degraded / 0   / escalating
  //   cache-strategy-only                UNSAFE  95.5 / warning  / draining / normal   / 0   / escalating
  //   db-budget-only                     UNSAFE  94.0 / warning  / growing  / normal   / 0   / escalating
  //   async-deferral-only                UNSAFE  95.0 / warning  / draining / normal   / 0   / escalating
  //   strategy-a-converging          ACCEPTABLE* 99.3 / warning  / draining / disabled / 0   / safe-degraded
  //   strategy-b-converging          ACCEPTABLE* 98.9 / warning  / draining / degraded / 0   / safe-degraded
  //   safe-degraded-protected            ACCEPTABLE  99.1 / warning  / draining / disabled / 0   / safe-degraded
  //   strategy-a-optimal                 OPTIMAL     99.8 / normal   / draining / disabled / 0   / optimal-protected
  //   strategy-b-optimal                 OPTIMAL     99.6 / normal   / draining / degraded / 0   / optimal-protected
  //
  // (*strategy-a/b-converging satisfy acceptableCondition's objective
  // bar identically to safe-degraded-protected — all three require
  // checkout >= 98%, dbSaturationStatus != critical, queue draining,
  // and zero historical drops. They are listed separately above only
  // because rules.ts models them as distinct intermediate STATES on
  // the path to optimal, not because the completion bar treats them
  // differently.)
  //
  // Every UNSAFE state fails at least one of: the database is actively
  // being pushed toward collapse RIGHT NOW (dbSaturationStatus
  // "critical"), the async queue backlog is actively GROWING rather
  // than demonstrably draining (violates invariant #6), or real
  // checkout/transaction traffic has been dropped by a non-policy-based
  // mechanism (cumulativeCriticalTrafficDroppedCount > 0, violates
  // invariant #5 permanently and irreversibly for this attempt — see
  // the historical-damage doctrine note in rules.ts). None of these is
  // ever a fake "almost fixed" tier — each one has a real, observable,
  // currently-active problem.
  //
  // ACCEPTABLE genuinely exists and is distinct from OPTIMAL: the
  // critical path is fully protected (checkout >= 98%), the database is
  // never in its critical band, the queue is draining, and there is
  // zero historical damage — but the database has not yet fully
  // recovered to "normal" (recovery lag, see timed-events.ts's
  // DB_RECOVERY_FULLY_DONE_MS) and/or search is fully disabled rather
  // than recovered/degraded. This is a genuine, deliberate, bounded
  // tradeoff a candidate may legitimately choose to hand back without
  // waiting for full recovery — not partial credit for an incomplete
  // fix with an ongoing violation.
  //
  // OPTIMAL requires the database to have genuinely, fully recovered
  // (dbSaturationStatus "normal") AND the queue backlog to be small AND
  // draining AND zero historical damage — reachable only after BOTH
  // independent recovery-lag windows (cache warmup AND DB connection
  // pool recovery) have genuinely elapsed, via either strategy A or
  // strategy B.
  //
  // Because ACCEPTABLE is a genuine, bounded, judgment-based tradeoff
  // ("is this degraded-but-safe state good enough to hand back right
  // now, or do I keep waiting for full recovery?") rather than an
  // objective, formula-checkable bar, this scenario is
  // `candidate_declared`, not `automatic` — the engine itself never
  // auto-resolves; the candidate must explicitly declare completion via
  // Finish, evaluated against this exact tracked sustain-window state
  // (see packages/simulator/src/completion.ts).
  completion: { mode: "candidate_declared", acceptableCondition },
};
