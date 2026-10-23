import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { fanOutRequestExplosionRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  ENRICHMENT_CALL_ENABLED_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const fanOutRequestExplosionSimulation: ScenarioSimulationDefinition = {
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
        enteringMessage: "The aggregator has entered a critical state — the product-detail response path is failing.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The aggregator has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "serviceESaturationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Service E saturation has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Service E saturation has dropped back below 90%.",
      },
    },
    {
      key: "serviceASaturationPercent",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Service A (a core dependency) saturation has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Service A saturation has dropped back below 90%.",
      },
    },
    {
      key: "aggregatorLatencyMs",
      trackPeak: true,
    },
    {
      key: "partialResponseRatePercent",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: fanOutRequestExplosionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   fan-out-widened (early warning)           UNSAFE   success=97%,
  //                                               Service E not yet
  //                                               degraded — a transient
  //                                               pre-incident warning
  //                                               state, not a candidate
  //                                               resolution.
  //   service-e-degraded (baseline)             UNSAFE   success=44%,
  //                                               aggregator critical.
  //   concurrency-worsens-contention (harmful)  UNSAFE   success=41%,
  //                                               aggregator critical,
  //                                               corePathHealth
  //                                               "core-path-at-risk".
  //   core-path-broken (compound harmful trap)  UNSAFE   success=54%,
  //                                               Service A critical,
  //                                               corePathHealth
  //                                               "core-path-at-risk".
  //   batching-shifts-pressure (partial)        UNSAFE   success=91%,
  //                                               aggregator "warning",
  //                                               corePathHealth
  //                                               "core-path-at-risk" —
  //                                               Service A is visibly
  //                                               climbing but the
  //                                               system is not yet
  //                                               safe to hand back.
  //   cache-partial-relief (partial)            UNSAFE   success=85%,
  //                                               aggregator "warning".
  //   enrichment-excluded                       OPTIMAL  success=99.6%,
  //                                               aggregator "normal",
  //                                               corePathHealth
  //                                               "core-path-intact".
  //   partial-response-recovery (alternate)     OPTIMAL  success=99.4%,
  //                                               same tier — a
  //                                               genuinely different
  //                                               strategy (tolerate +
  //                                               fast-timeout the
  //                                               optional call rather
  //                                               than disable it) that
  //                                               reaches the same safe
  //                                               bar.
  //   batching-cache-recovered (alternate)      OPTIMAL  success=99.3%,
  //                                               same tier — a third
  //                                               genuinely different
  //                                               strategy (batch +
  //                                               cache, keeping
  //                                               enrichment live and
  //                                               relieving the Service
  //                                               A pressure batching
  //                                               alone introduces).
  //
  // No state qualifies as a genuine ACCEPTABLE tier per section 9's
  // standard. batching-shifts-pressure (91% success) is real, visible
  // progress from baseline, but Service A is actively being pushed
  // toward saturation as a direct consequence — this is exactly the
  // "almost passed" / "partial mitigation deserves credit" case section
  // 9 explicitly excludes, not a deliberate, operationally-safe
  // handback state. cache-partial-relief (85% success) is weaker still.
  // Both remain correctly ineligible for any Finish tier rather than
  // being awarded a third tier.
  //
  // Decision: candidate_declared, with NO acceptableCondition. Three
  // distinct, genuinely different mitigation strategies converge on one
  // successCondition (corePathHealth stays "core-path-intact" and the
  // aggregator never goes critical) — "is the core response path
  // actually safe to hand back, or did my fix just move pressure onto
  // Service A" is exactly the judgment candidate_declared exists to
  // test, and an objective automatic recovery condition does not exist
  // here: nothing about reaching 99% customer success by itself proves
  // the candidate didn't get there by quietly endangering a core
  // dependency (batching-shifts-pressure never reaches 99%, but the
  // broader principle — numeric health alone cannot certify "safe" —
  // is what this scenario is built to test).
  completion: { mode: "candidate_declared" },
};
