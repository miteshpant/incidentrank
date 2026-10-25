import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { partialRegionalDependencyFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  US_ROUTING_MODE_KEY,
  EU_ROUTING_MODE_KEY,
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  TIMEOUT_POLICY_MS_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const partialRegionalDependencyFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "apacDependencyHealth",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The shared dependency is now critically unhealthy from APAC.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The shared dependency has recovered from APAC's perspective.",
      },
    },
    { key: "usDependencyHealth" },
    { key: "euDependencyHealth" },
  ],
  numericWatchFields: [
    {
      key: "apacSuccessRate",
      trackPeak: false,
    },
    {
      key: "euLatencyMs",
      trackPeak: true,
      threshold: {
        value: 2_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "EU dependency latency has crossed 2,000ms.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "EU dependency latency has dropped back below 2,000ms.",
      },
    },
    {
      key: "globalCustomerSuccessRate",
      trackPeak: false,
    },
    {
      key: "fallbackTrafficPercent",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: partialRegionalDependencyFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   healthy (pre-incident)                        n/a (not an
  //                                                  incident state)
  //   regional-divergence (baseline)                 UNSAFE
  //     globalCustomerSuccessRate=85.0, apacDependencyHealth=critical
  //   tight-timeout-tradeoff                         UNSAFE
  //     globalCustomerSuccessRate=85.0, apacDependencyHealth=critical
  //   eu-only-fixed (APAC untouched)                 UNSAFE
  //     globalCustomerSuccessRate=88.9, apacDependencyHealth=critical
  //   apac-only-fixed (EU untouched)                 UNSAFE
  //     globalCustomerSuccessRate=93.6 (below both bars)
  //   apac-worsened (second wave, no fix)             UNSAFE
  //     globalCustomerSuccessRate=74.3, apacDependencyHealth=critical
  //   global-breaker-no-fallback (breaker, no landing) UNSAFE
  //     globalCustomerSuccessRate=40.0 (also triggers automatic failure
  //     at 60s sustained)
  //   global-breaker-tripped (uniform global mitigation) ACCEPTABLE
  //     globalCustomerSuccessRate=96.8, no region critical,
  //     mitigationApproach="global" — every region including the
  //     healthy US region, non-critical/stable, but US was forced onto
  //     the identical fallback path it never needed.
  //   regional-scoped-recovery (region-by-region mitigation)  OPTIMAL
  //     globalCustomerSuccessRate=98.0, no region critical,
  //     mitigationApproach="regional" — US untouched, EU and APAC
  //     isolated onto fallback. usSuccessRate stays 99.8 the entire
  //     time (vs. 96.5 under the global-breaker path), which is the
  //     scenario's required measurable proof that the uniform global
  //     mitigation leaves the healthy region strictly worse off.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (region-scoped isolation vs. a uniform global
  // breaker trip), and the difference is a deliberate, bounded tradeoff
  // (sacrificing a healthy region's full service for operational
  // simplicity) rather than "almost passed" or "partial credit" — this
  // is a legitimate acceptableCondition per section 10's standard. Every
  // other reachable state (both single-region partial fixes, the tight
  // global timeout, the no-fallback breaker trip, and the untouched
  // baseline/second-wave states) is a real but incomplete or actively
  // harmful mitigation that never crosses either bar — correctly left
  // ineligible for Finish, not awarded a third tier.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // global-breaker-tripped state. "Is the blended success rate above a
  // threshold" is not, by itself, proof this is the best safe state to
  // hand back — the candidate must judge whether every region's
  // treatment was actually warranted by that region's own health, which
  // is exactly the "is this safe enough to hand back, and at what cost"
  // judgment candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
