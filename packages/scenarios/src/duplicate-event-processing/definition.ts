import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { duplicateEventProcessingRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  IDEMPOTENT_PROCESSING_ENABLED_KEY,
  DEDUPLICATION_WINDOW_SECONDS_KEY,
  ACK_TIMEOUT_MS_KEY,
  MAX_REDELIVERY_ATTEMPTS_KEY,
  CONSUMER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const duplicateEventProcessingSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "brokerStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The broker has entered a critical redelivery state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The broker has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "duplicateOrderCount",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Duplicate order count has crossed 50.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Duplicate order count has dropped back below 50.",
      },
    },
    {
      key: "duplicatePaymentCount",
      trackPeak: true,
    },
    {
      key: "redeliveryVolumePerMin",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: duplicateEventProcessingRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified by their REAL
  // authored values — not by how healthy consumerThroughputPerSec or
  // ackFailureRatePct happen to look:
  //
  //   redelivering (baseline)                     UNSAFE — duplicateOrderCount=60,
  //                                                 duplicatePaymentCount=42, climbing.
  //   redelivery-compounding (2nd wave, no fix)    UNSAFE — duplicateOrderCount=260,
  //                                                 duplicatePaymentCount=190, climbing further.
  //   wasted-scaling (concurrency trap)            UNSAFE — throughput=920 (looks
  //                                                 healthy/improved!), but
  //                                                 duplicateOrderCount=95, climbing
  //                                                 FASTER than baseline.
  //   wasted-scaling-compounding (trap, 2nd wave)  UNSAFE — throughput=980 (still looks
  //                                                 healthy), duplicateOrderCount=540 —
  //                                                 the explicit required trap: looks
  //                                                 like it's helping while duplicates
  //                                                 keep accumulating.
  //   ack-timeout-amplified (re-ack trap)          UNSAFE — duplicateOrderCount=140,
  //                                                 ackFailureRatePct actually worse (18%).
  //   idempotency-without-window (partial)         UNSAFE — idempotency toggle on, but
  //                                                 no real dedup window to check
  //                                                 against; duplicateOrderCount=18,
  //                                                 still actively occurring.
  //   deduplicated                                 OPTIMAL — duplicateOrderCount=0,
  //                                                 duplicatePaymentCount=0,
  //                                                 duplicateSafetyStatus=
  //                                                 "safe-deduplicated": idempotent
  //                                                 processing AND a real
  //                                                 deduplication window both in
  //                                                 effect.
  //
  // No acceptableCondition: per section 9's binding standard, an
  // acceptableCondition must never tolerate an ongoing correctness
  // violation. Every non-optimal reachable state here has
  // duplicateOrderCount/duplicatePaymentCount > 0 and climbing under
  // continued redelivery — none of them represent a genuinely safe,
  // merely-imperfect handback (unlike, say, Missing Database Index's
  // "feature disabled, nothing left to corrupt" acceptable tier). This
  // scenario's whole point is that there is exactly one safe destination
  // and several destinations that look safe but are not — manufacturing
  // a second tier here would blur the line the scenario exists to teach.
  //
  // Decision: candidate_declared, no acceptableCondition. "Is this safe
  // enough to hand back?" is exactly the right question — an automatic
  // mode would silently withhold success (successCondition already
  // requires duplicateOrderCount<=0), but candidate_declared is what
  // lets the product surface the explicit, testable moment where a
  // candidate tries to Finish from a healthy-looking-but-duplicating
  // state and is told declared_unstable rather than resolved. See
  // duplicate-event-processing.test.ts's "Finish from the harmful trap
  // -> declared_unstable" assertions.
  completion: { mode: "candidate_declared" },
};
