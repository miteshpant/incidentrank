import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { webhookDeliveryStormRules } from "./rules";
import { timedEvents } from "./timed-events";

export {
  DESTINATION_ISOLATION_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const webhookDeliveryStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "dispatcherStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The webhook dispatcher has entered a critical, worker-saturated state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The webhook dispatcher has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dispatcherWorkerUtilization",
      trackPeak: true,
      threshold: {
        value: 95,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Dispatcher worker utilization has crossed 95%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Dispatcher worker utilization has dropped back below 95%.",
      },
    },
    {
      key: "healthyDestinationDeliveryLatencyMs",
      trackPeak: true,
    },
    {
      key: "webhookBacklog",
      trackPeak: true,
    },
    {
      key: "dlqDepth",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: webhookDeliveryStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states once the incident has
  // started, classified:
  //
  //   blast-radius-baseline (no action)            UNSAFE   healthyLatency=1450ms, critical
  //   scaled-concurrency-blast-radius (harmful)     UNSAFE   healthyLatency=3100ms, critical
  //   scaled-workers-blast-radius (harmful)         UNSAFE   healthyLatency=2600ms, critical
  //   unbounded-retries-blast-radius (harmful)      UNSAFE   healthyLatency=2900ms, critical
  //   backoff-partial-relief (partial)              UNSAFE   healthyLatency=650ms (3.6x baseline), warning, still "blast-radius"
  //   dlq-threshold-partial-relief (partial)        UNSAFE   healthyLatency=980ms (5.4x baseline), warning, still "blast-radius"
  //   dlq-escalation-blast-radius (2nd wave, no fix) UNSAFE   healthyLatency=3400ms, critical
  //   isolated-recovery (isolation on)              OPTIMAL  healthyLatency=190ms, warning, "isolated"
  //   isolated-dlq-growing (isolation on, 2nd wave) OPTIMAL  healthyLatency=195ms, warning, "isolated"
  //
  // Every state except the two isolation-enabled ones leaves
  // healthy-destination delivery latency materially degraded (3.6x to
  // 19x its 180ms pre-incident baseline) and deliveryIsolationState
  // stuck at "blast-radius" — none of them represent a deliberate,
  // bounded, genuinely-safe tradeoff the way Missing Database Index's
  // "feature disabled" state or Hot-Key Cache Overload's "locality
  // sacrificed" state do. Backoff and a tighter DLQ threshold are real,
  // honest partial mitigations, but they are incomplete, not safe —
  // per section 10's explicit "not almost passed, not partial credit"
  // rule, no acceptableCondition is authored here. The only reachable
  // sustained-safe state is reached exclusively through the real
  // structural fix (destination isolation).
  //
  // Decision: candidate_declared, with NO acceptableCondition. Whether
  // a given numeric latency reading is "low enough" is not by itself
  // proof the fix is durable — the candidate must judge whether the
  // healthy majority's isolation from the failing subset is real and
  // sustained (not a momentary dip between retry bursts), which is
  // exactly the "is this safe enough to hand back" judgment
  // candidate_declared exists to test. See the immediate-Finish audit
  // in webhook-delivery-storm.test.ts for why a 30-second sustain
  // window (successCondition.sustainedSeconds) on top of this is
  // required before Finish becomes eligible at all.
  completion: { mode: "candidate_declared" },
};
