import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { multiServiceMemoryPressureIncidentRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RESPONSE_FIELD_SET_MODE_KEY,
  AGGREGATION_CONCURRENCY_KEY,
  MAX_RESPONSE_SIZE_KEY,
  API_CONCURRENCY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  CACHE_POLICY_KEY,
  WORKER_COUNT_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const multiServiceMemoryPressureIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "aggregatorStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Aggregator has entered a critical memory-pressure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Aggregator has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "aggregatorMemoryUtilizationPct",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Aggregator memory utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Aggregator memory utilization has dropped back below 90%.",
      },
    },
    {
      key: "dependencyAMemoryUtilizationPct",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Dependency A memory utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Dependency A memory utilization has dropped back below 90%.",
      },
    },
    {
      key: "dependencyBMemoryUtilizationPct",
      trackPeak: true,
    },
    {
      key: "dependencyCMemoryUtilizationPct",
      trackPeak: true,
    },
    {
      key: "gcPauseMsP99",
      trackPeak: true,
    },
    {
      key: "restartChurnCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: multiServiceMemoryPressureIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.4.md section 11, mandatory) ───────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (completenessPct / errorRatePct / aggregatorStatus /
  // rootCauseHealth / fleetIntegrityHealth / memoryPressureHealth):
  //
  //   healthy-default                              N/A (pre-incident)
  //   shape-change-pre-thrashing                   UNSAFE  100/0/warning/unaddressed — early warning, not a resolution.
  //   dependency-a-gc-thrashing-baseline           UNSAFE  100/3/warning/unaddressed — decoy symptom, root cause active.
  //   unmitigated-spread-baseline                  UNSAFE  85/12/critical/unaddressed — spread confirms non-decoy-specific cause.
  //   oom-churn-active-unmitigated                 UNSAFE  70/22/critical/unaddressed, fleet churn-scarred.
  //   max-response-size-truncation-violation       UNSAFE  38/26/warning/unaddressed — correctness violation, never safe however calm memory looks.
  //   decoy-scaled-temporary-relief                UNSAFE  100/2/warning/unaddressed — real but temporary; root cause still active.
  //   decoy-scaled-pressure-reaccumulated           UNSAFE  100/9/critical/unaddressed — decoy relief has faded, B/C now critical.
  //   worker-count-scaled-worsens-aggregator        UNSAFE  100/7/critical/unaddressed — wrong-location scaling, worse than baseline.
  //   api-concurrency-scaled-worsens-everything     UNSAFE  100/6/critical/unaddressed — more demand on an unfixed root cause.
  //   cache-policy-partial-relief                   UNSAFE  100/1/warning/unaddressed — real but incomplete relief.
  //   partial-response-mode-protects-fleet-not-root-cause
  //                                                 ACCEPTABLE  88/0/warning/unaddressed — genuinely, deliberately safe-but-
  //                                                 imperfect: the fleet cannot OOM-churn (the binding invariant) and
  //                                                 error rate is zero, but enrichment completeness is intentionally
  //                                                 reduced (85–95%) and the root cause remains unaddressed. A real,
  //                                                 bounded tradeoff, not partial credit for an unfinished fix.
  //   root-cause-fixed-field-set-just-applied       UNSAFE  100/0/warning/addressed-pending-decay — fix just applied, decay not yet run.
  //   root-cause-fixed-field-set-decaying-1/2       UNSAFE  100/0/warning/addressed-pending-decay — decay in progress, not yet safe to hand back.
  //   root-cause-fixed-concurrency-decaying-1/2     UNSAFE  100/0/warning/addressed-pending-decay — same, via the alternate fix.
  //   root-cause-fixed-field-set-fully-recovered    OPTIMAL  100/0/normal/resolved, memoryPressureHealth=clear, never churned.
  //   root-cause-fixed-concurrency-fully-recovered  OPTIMAL  100/0/normal/resolved, memoryPressureHealth=clear, never churned —
  //                                                 a genuinely distinct alternate strong path (fewer concurrent oversized
  //                                                 objects, rather than smaller objects), same safety bar.
  //   root-cause-fixed-field/concurrency-after-churn-scarred
  //                                                 OPTIMAL (completion-eligible — current state is genuinely, fully
  //                                                 safe) but SCORED WORSE than the clean optimal paths: dataIntegrity
  //                                                 penalizes fleetIntegrityHealth="churn-scarred" independently of
  //                                                 rootCauseHealth, so the permanent historical scar still costs real
  //                                                 points even though current health is perfect. This is the
  //                                                 scenario's authored instance of "root cause fixed != damage
  //                                                 erased" (phase6d.4.md section 13): completion eligibility is about
  //                                                 current safety (genuinely met), while scoring is where the
  //                                                 irreversible consequence of letting the incident run long enough
  //                                                 to churn is actually paid.
  //
  // Decision: candidate_declared, WITH a genuine acceptableCondition.
  // partial-response-mode-protects-fleet-not-root-cause is the one
  // real, deliberate, bounded-tradeoff safe-but-imperfect state — it
  // protects the single hardest invariant ("the service fleet must not
  // enter restart/OOM churn") at the real cost of reduced enrichment,
  // without ever touching the actual root cause. Every other
  // intermediate state is either an active trap (decoy scaling,
  // truncation, wrong-location scaling) or an honest "fix applied, GC/
  // heap decay still running" state that is not yet safe, never partial
  // credit for an unfinished fix. The core judgment this scenario tests
  // — "is Dependency A actually the problem, or is it a symptom of
  // upstream amplification, and did my fix actually touch the upstream
  // cause or just buy time" — is not an objective automatic condition:
  // multiple numerically-healthy-looking states (decoy-scaled-temporary-
  // relief, cache-policy-partial-relief) are NOT safe to hand back
  // despite calm numbers, which is exactly why Finish requires an
  // explicit candidate declaration rather than auto-resolving on a
  // metric crossing a line.
  completion: { mode: "candidate_declared", acceptableCondition },
};
