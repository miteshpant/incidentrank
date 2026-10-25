import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { duplicateRequestProcessingRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const duplicateRequestProcessingSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "serviceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The order service has entered a critical state as duplicate side effects accumulate.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The order service has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "duplicateRequestRatePct",
      trackPeak: true,
      threshold: {
        value: 20,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Duplicate request rate has crossed 20%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Duplicate request rate has dropped back below 20%.",
      },
    },
    {
      key: "retryVolumePerMin",
      trackPeak: true,
    },
    {
      key: "sideEffectCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: duplicateRequestProcessingRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   baseline-ambiguous-ack                     UNSAFE  dupRate=18,
  //                                                critical, duplicating
  //   sustained-ambiguous-ack (second wave)        UNSAFE  dupRate=29,
  //                                                critical, duplicating
  //   timeout-amplified (harmful)                  UNSAFE  dupRate=34,
  //                                                critical, duplicating
  //   timeout-amplified-compounding (harmful, 2nd  UNSAFE  dupRate=46,
  //     wave)                                       critical, duplicating
  //   retry-count-amplified (harmful)              UNSAFE  dupRate=38,
  //                                                critical, duplicating
  //   retry-count-amplified-compounding (harmful,  UNSAFE  dupRate=52,
  //     2nd wave — also crosses the automatic        critical, duplicating
  //     failure threshold if sustained)
  //   logged-only (visibility without protection)  UNSAFE  dupRate=24,
  //                                                critical, duplicating
  //   dedup-window-only (partial)                   UNSAFE  dupRate=16,
  //                                                warning, duplicating
  //   enforced-without-atomic (partial — race      UNSAFE  dupRate=6,
  //     still lets some duplicates through)          warning, duplicating
  //   deduplicated (idempotency enforced + atomic) OPTIMAL  dupRate=0,
  //                                                normal, deduplicated
  //
  // Every single non-optimal reachable state has duplicateRequestRatePct
  // STILL ABOVE ZERO and duplicateSideEffectStatus === "duplicating" — an
  // ongoing, real correctness violation. Per this scenario's explicit
  // binding standard ("a state with a real correctness violation
  // happening must never satisfy successCondition/acceptableCondition,
  // however healthy availability/throughput metrics look"), none of
  // these states — including the two partial mitigations that visibly
  // reduce the duplicate rate — are safe to hand back. There is
  // deliberately no acceptableCondition: "reduced" is not "safe," and
  // authoring a middle tier here would be exactly the "almost fixed"/
  // "partial credit" tier the acceptable-condition standard forbids.
  //
  // Decision: candidate_declared, with no acceptableCondition. The
  // judgment this scenario tests — "is the apparent improvement in
  // latency/throughput actually a correctness fix, or did I just make
  // retries faster/more numerous?" — is exactly the kind of "is this
  // safe enough to hand back" question candidate_declared exists to
  // force, and an automatic mode would let the engine's own success
  // check silently do that judgment for the candidate.
  completion: { mode: "candidate_declared" },
};
