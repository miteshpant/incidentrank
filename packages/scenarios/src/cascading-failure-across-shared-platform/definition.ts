import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cascadingFailureAcrossSharedPlatformRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ASYNC_WORKER_CONCURRENCY_KEY,
  ASYNC_WORKLOAD_DEFERRAL_KEY,
  CACHE_ASSIST_POLICY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  IDENTITY_FAILURE_MODE_KEY,
  METADATA_WRITE_POLICY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_B_PRIORITY_KEY,
  PRODUCT_B_RETRY_POLICY_KEY,
  PRODUCT_C_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cascadingFailureAcrossSharedPlatformSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "identityStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Shared Identity has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Shared Identity has recovered.",
      },
    },
    {
      key: "dbStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Shared Database has entered a critical connection-pressure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Shared Database has recovered.",
      },
    },
    {
      key: "messagingStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Shared Messaging has entered a critical backlog state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Shared Messaging has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "messagingBacklogCount",
      trackPeak: true,
      threshold: {
        value: 1_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Shared Messaging backlog has crossed 1,000 queued messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Shared Messaging backlog has dropped back below 1,000.",
      },
    },
    {
      key: "dbConnectionPoolUtilizationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Shared Database connection pool utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Shared Database connection pool utilization has dropped back below 90%.",
      },
    },
    // Historical-damage counters (phase6d.4.md section 13, binding):
    // peak-tracked so the permanent, non-resettable record of worst-
    // ever cumulative damage is available to scoring even once current
    // health is fully clean — mirrors Authorization Policy Rollout
    // Failure's cumulativeUnauthorizedAccessCount mechanism exactly.
    { key: "cumulativeConnectionExhaustionCount", trackPeak: true },
    { key: "cumulativeUnverifiedGrantCount", trackPeak: true },
    { key: "productAHeldConnectionCount", trackPeak: true },
    { key: "productBRequestMultiplier", trackPeak: true },
  ],
  timedEvents,
  rules: cascadingFailureAcrossSharedPlatformRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.4.md section 11, binding) ────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (identitySuccessRate / messagingBacklogCount /
  // dbWriteSuccessRatePercent / cumulativeUnverifiedGrantCount /
  // platformStatus):
  //
  //   healthy-default                      N/A (pre-incident)
  //   baseline-root-degrading              UNSAFE   88   / 220   / 99   / 0 / root-degrading
  //   amplification-uncontained            UNSAFE   61   / 1850  / 78   / 0 / amplifying
  //   cache-assist-only                    UNSAFE   76   / 1300  / 73   / 0 / amplifying
  //   metadata-protected-platform-exposed  UNSAFE   59   / 1700  / 64   / 0 / amplifying
  //   deferral-only                        UNSAFE   60   / 980   / 65   / 0 / amplifying
  //   isolate-bystander-wasted             UNSAFE   58   / 1750  / 60   / 0 / amplifying
  //   db-capped-root-exposed               UNSAFE   63   / 1600  / 91   / 0 / amplifying
  //   wrong-root-trap (isolated variant)   UNSAFE   58   / 1100  / 61   / 0 / starving
  //   wrong-root-trap (deprio variant)     UNSAFE   57   / 1250  / 63   / 0 / starving
  //   root-protected-db-exposed            UNSAFE   98   / 600   / 59   / 0 / starving
  //   worker-scaling-pressure-transfer     UNSAFE   64   / 900   / 41   / 0 / starving
  //   full-cascade (sustained, uncontained)UNSAFE   52   / 2600  / 38   / 0 / starving
  //   full-cascade-unaddressed (failing)   UNSAFE   44   / 3400  / 22   / 0 / starving
  //   identity-fail-open-violation         UNSAFE   99.9 / 2400  / 96   / 640 / identity-correctness-violated
  //   re-cascaded                          UNSAFE   61   / 2900  / 54   / 0 / re-cascading
  //   contained-not-yet-drained            UNSAFE   90   / 1400  / 93   / 0 / contained
  //   draining-window1                     UNSAFE   97.5 / 520   / 97.5/ 0 / draining
  //   draining-window2                     UNSAFE   98.8 / 180   / 99.5/ 0 / draining
  //   acceptable-drained-isolated          ACCEPTABLE 99.4/ 0    / 100 / 0 / contained
  //   optimal-recovered (either path)      OPTIMAL  99.5+/ 0    / 100 / 0 / recovered
  //
  // Every state above the acceptable/optimal tiers leaves at least one
  // correctness-relevant or availability-relevant signal genuinely,
  // measurably unsafe — either Shared Identity itself is still below
  // its 99% success bar, the Shared Messaging backlog is still nonzero
  // (meaning real queued work has not yet drained), Shared Database
  // write success is below its 99.5% durability bar, or (in the single
  // worst case) a real, non-resettable unverified-identity-grant count
  // has been incurred. None of these qualifies as a genuine safe-but-
  // imperfect handback tier on its own — "the dashboard looks calmer"
  // is not the same as "the platform is safe," which is exactly this
  // scenario's required judgment.
  //
  // ACCEPTABLE genuinely exists (unlike Distributed Coordination
  // Failure, which authors none): "acceptable-drained-isolated" is a
  // state where Shared Identity has fully recovered, BOTH independent
  // recovery-lag subsystems have fully drained to zero/baseline, and no
  // correctness violation was ever incurred — the platform itself is
  // completely safe. The only thing distinguishing it from OPTIMAL is
  // that the candidate has not yet made the deliberate restoration-
  // order decision; Products A and B remain intentionally isolated/
  // degraded. Business invariant #4 ("products may be intentionally
  // degraded or isolated to protect the platform") makes this a real,
  // legitimate, deliberately-bounded tradeoff, not an incomplete fix —
  // a candidate who hands back a fully-safe-but-not-yet-restored
  // platform has made a genuinely different, reasonable call than one
  // who also completes restoration, and the scoring config's
  // dataIntegrity penalty for platformStatus "contained" (-30 of 200,
  // vs 0 for "recovered") reflects that modest, real gap without
  // treating it as failure.
  //
  // With a genuine ACCEPTABLE tier whose only difference from OPTIMAL
  // is a judgment call about whether to proceed with restoration right
  // now, this scenario is `candidate_declared`, not `automatic` — the
  // core Principal-level judgment here (which failure is actually
  // causal, which product is amplifying, what to protect first, what
  // remains after the root is fixed, what is safe to restore now vs.
  // must wait) is precisely a judgment about whether the current state
  // is safe enough to hand back, which an automatic engine-decided
  // resolution would remove entirely.
  completion: { mode: "candidate_declared", acceptableCondition },

  // ── Immediate-Finish audit (phase6d.4.md section 12, binding) ───────
  // Trigger incident, zero actions, Finish: the engine's own
  // sustain-tracking state at that instant has consecutiveSuccessSeconds
  // and consecutiveAcceptableSeconds both at 0 (the baseline-root-
  // degrading rule's identitySuccessRate of 88 never satisfies either
  // condition's 99/99.5 bars, and messagingBacklogCount/
  // dbWriteSuccessRatePercent never satisfy them either). Expected
  // result: declared_unstable. No observation-only sustained-stability
  // strategy exists for this scenario — the root dependency genuinely
  // degrades and nothing recovers without real candidate intervention
  // (see rules.ts: every rule reachable with no controls touched stays
  // in a UNSAFE incidentState). Confirmed by this scenario's own test
  // suite's "Immediate Finish" test.
};
