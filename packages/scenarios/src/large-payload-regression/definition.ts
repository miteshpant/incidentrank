import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { largePayloadRegressionRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RESPONSE_PROJECTION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  COMPRESSION_ENABLED_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const largePayloadRegressionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "apiStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The API tier has entered a critical serialization/memory-pressure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The API tier has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "apiMemoryUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "API memory utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "API memory utilization has dropped back below 90%.",
      },
    },
    {
      key: "responsePayloadSizeKb",
      trackPeak: true,
    },
    {
      key: "p99LatencyMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: largePayloadRegressionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified by their actual
  // authored values:
  //
  //   payload-bloated (baseline)            UNSAFE   mem=85, critical,
  //                                           payloadShapeHealth=unresolved
  //   memory-exhausted (second wave)         UNSAFE   mem=97, critical,
  //                                           errorRate=14%
  //   scaled-no-payload-relief (harmful)     UNSAFE   mem=46, critical —
  //                                           payload/network/latency
  //                                           stay exactly as bloated
  //   compressed-bandwidth-relief (partial)  UNSAFE   mem=80, warning —
  //                                           network/latency improve,
  //                                           memory/serialization don't
  //   response-cache-partial (partial)       UNSAFE   mem=88, critical —
  //                                           low hit rate under
  //                                           per-account-variable data
  //   payload-truncated/512kb (trap)         UNSAFE   mem=30, warning,
  //                                           but errorRate=22% — looks
  //                                           clean on size/latency,
  //                                           actively breaking callers
  //   payload-truncated/128kb (trap)         UNSAFE   mem=26, warning,
  //                                           errorRate=41% — worse the
  //                                           tighter the cap gets
  //   recovered-paginated (alternate good)   OPTIMAL  mem=28, normal,
  //                                           payloadShapeHealth=
  //                                           shape-fixed, errorRate=0
  //   recovered-projected (primary fix)      OPTIMAL  mem=24, normal,
  //                                           payloadShapeHealth=
  //                                           shape-fixed, errorRate=0
  //
  // Unlike Missing Database Index, no state here clears the genuine
  // "safe enough to hand back" bar while still being a deliberate,
  // bounded tradeoff. The one state that looks superficially like a
  // candidate (payload size limit truncation) is disqualified by its
  // own numbers: a 22-41% error rate from callers failing against data
  // that was silently cut off is not a bounded, acceptable tradeoff —
  // it is an active correctness failure dressed up as healthy capacity
  // metrics. Per section 10's explicit standard ("not an ineffective
  // mitigation, not a scoring middle tier"), this does not earn an
  // acceptableCondition. Every other non-optimal state is either still
  // critical or only partially relieves one mechanism while leaving the
  // actual cause (oversized response shape) untouched.
  //
  // Decision: candidate_declared, with NO acceptableCondition. The
  // judgment this scenario tests — "did the response shape actually get
  // fixed, or do the numbers just look okay because of truncation,
  // caching luck, compression, or added instances" — is exactly the
  // "is this safe enough to hand back" reasoning candidate_declared
  // exists to test, even though only one bar (successCondition) is ever
  // reachable. automatic was rejected because a candidate who merely
  // waits, scales broadly, or enables compression/caching would
  // otherwise need the engine itself to decide "good enough" on their
  // behalf — exactly the judgment this scenario is designed to put on
  // the candidate.
  //
  // ── Immediate-Finish audit (section 9) ────────────────────────────
  // At t=0 (before the incident even starts, trafficRising/
  // payloadRegressed never set), the engine's own default-fallback rule
  // ("healthy-default") already satisfies successCondition's literal
  // conditions (apiMemoryUtilization=22<=35, apiStatus="normal"!=
  // "critical") — but payloadShapeHealth starts as "unresolved", not
  // "shape-fixed", so successCondition's third condition is NOT met at
  // t=0. An immediate zero-action Finish before REGRESSION_DEPLOYED_MS
  // is therefore correctly ineligible (declared_unstable) — see this
  // scenario's test file. Once the regression deploys, no further wait
  // ever satisfies successCondition without an actual shape fix, since
  // every unmitigated/partially-mitigated path leaves
  // payloadShapeHealth at "unresolved" or "feature-limited" forever —
  // there is no scenario state where "just waiting" eventually turns
  // payloadShapeHealth to "shape-fixed" on its own. This makes the
  // 30-second sustainedSeconds window a genuine confirmation interval
  // for an actual candidate action, never a free waiting-game exploit.
  completion: { mode: "candidate_declared" },
};
