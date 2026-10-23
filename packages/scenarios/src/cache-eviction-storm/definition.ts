import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cacheEvictionStormRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  OBJECT_CACHING_POLICY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  API_CONCURRENCY_KEY,
  DB_PROTECTION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cacheEvictionStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "cacheStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The cache layer has entered a critical eviction-churn state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The cache layer has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "evictionRatePerSec",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Eviction rate has crossed 300/sec.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Eviction rate has dropped back below 300/sec.",
      },
    },
    { key: "dbReadsPerSec", trackPeak: true },
    { key: "hitRatioPct", trackPeak: false },
  ],
  timedEvents,
  rules: cacheEvictionStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   eviction-churn-critical (baseline)         UNSAFE  hitRatio=34, critical
  //   scaled-concurrency-worsened (harmful)       UNSAFE  hitRatio=22, critical
  //   ttl-lowered-worsened (harmful)               UNSAFE  hitRatio=28, critical
  //   db-read-pressure-critical (second wave)      UNSAFE  hitRatio=18, critical
  //   db-shielded-cache-still-thrashing (partial)  UNSAFE  hitRatio=31, warning
  //   memory-scaled-moderate-partial (4x, partial) UNSAFE  hitRatio=55, warning
  //   memory-scaled-partial (8x, partial)          UNSAFE  hitRatio=68, warning
  //   object-policy-fixed-recovered (policy fix)   OPTIMAL hitRatio=95, normal,
  //                                                  cacheRecoveryMode=
  //                                                  "policyFixed"
  //   admission-fixed-recovered (policy fix)       OPTIMAL hitRatio=95, normal,
  //                                                  cacheRecoveryMode=
  //                                                  "policyFixed"
  //   policy-fixed-recovered (both policy fixes)   OPTIMAL hitRatio=96, normal,
  //                                                  cacheRecoveryMode=
  //                                                  "policyFixed"
  //
  // Even at the maximum memory multiplier (8x), the memory-only path
  // tops out at cacheStatus="warning" and hitRatioPct=68 — it never
  // crosses successCondition's bar (cacheStatus normal, hitRatio>=90,
  // cacheRecoveryMode="policyFixed") and it is NOT a genuinely safe
  // handback state per section 9's standard: eviction churn is reduced
  // but not resolved, and the scenario's whole point is that this state
  // will keep degrading as the oversized/high-cardinality working set
  // continues growing into the larger ceiling. There is no distinct,
  // operationally-safe-but-imperfect tier here — only "still thrashing,
  // just less severely." Unlike Missing Database Index's genuine
  // feature-disabled handback or Hot Database Partition's genuine
  // bounded-throttle handback, nothing in this scenario's state space
  // is both safe to hand back AND short of optimal. Section 9 is
  // explicit that "almost passed" / "partial mitigation deserves
  // credit" is NOT a legitimate basis for acceptableCondition, so none
  // is authored here.
  //
  // With no genuine acceptable tier, the remaining choice is between
  // candidate_declared (no acceptableCondition) and automatic. The
  // optimal states here are each reached by an objective, observable
  // state condition (cacheStatus normal, hitRatio>=90,
  // cacheRecoveryMode="policyFixed") with no ambiguity about whether the
  // system is "safe enough to hand back" the way Missing Database
  // Index's fixed-vs-disabled judgment call requires — once the policy
  // is actually fixed, the system IS fully recovered, period. This is
  // the "has an objective recovery condition happened" case the audit
  // process names as the automatic criterion, so this scenario is
  // authored as automatic rather than forcing a candidate_declared
  // judgment call onto a state space that does not need one.
  completion: { mode: "automatic" },
};
