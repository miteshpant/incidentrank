import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { messageRetryStormRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RETRY_COUNT_KEY,
  BACKOFF_STRATEGY_KEY,
  WORKER_CONCURRENCY_KEY,
  WORKER_COUNT_KEY,
  DLQ_THRESHOLD_KEY,
  CIRCUIT_BREAKER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const messageRetryStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "queueHealth",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The message queue has entered a critical retry-amplification state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The message queue has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "queueDepth",
      trackPeak: true,
      threshold: {
        value: 5_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Queue depth has crossed 5,000 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Queue depth has dropped back below 5,000 messages.",
      },
    },
    {
      key: "retryRatePerMinute",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: messageRetryStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Completion-mode audit (phase6b.md section 8), performed after writing
  // rules.ts:
  //
  // UNSAFE (fail successCondition — queueDepth/retryRate/queueHealth never
  // all recover): retry-storm-building (unmitigated baseline),
  // retry-storm-escalated (unmitigated second wave), retry-storm (harmful
  // worker-scaling trap), lagging-dlq-unused (DLQ enabled but retries
  // still unbounded — escape hatch never used), redelivery-loop (retries
  // bounded but DLQ disabled — backlog growth slows but never reverses),
  // flapping-breaker (circuit breaker alone, no backoff — stabilizes
  // elevated rather than draining). None of these are "safe to hand back
  // but imperfect" — every one of them has a backlog that is actively
  // growing or stuck materially above the healthy baseline, which is
  // exactly the standard section 9 says does NOT qualify for
  // acceptableCondition (a 4,000-message backlog that merely stopped
  // getting worse is not an operationally safe handback state).
  //
  // OPTIMAL (meet successCondition): recovering (bounded retries + DLQ
  // enabled) and recovering-breaker (circuit breaker + exponential
  // backoff) — two structurally different, equally valid strategies that
  // both drain the queue and relieve the dependency, matching section 30's
  // "support more than one good strategy" guidance. No single state
  // between these two "safe" states and the unsafe states above is a
  // genuine third, deliberately-accepted tier — so, as with Poison Message
  // Loop, this scenario has NO acceptableCondition.
  //
  // Given no genuine middle tier exists, the choice is between automatic
  // ("has an objective recovery condition happened") and candidate_declared
  // ("is this safe enough to hand back"). This scenario is candidate_declared:
  // the real judgment calls are (a) recognizing that two structurally
  // different strategies both count as genuinely done, and (b) recognizing
  // the worker-count scaling trap and the DLQ-enabled-but-still-unbounded
  // half-measure as still-unsafe despite superficially "doing something" —
  // judgment calls best expressed by requiring the candidate to decide the
  // incident is over, rather than letting the engine silently resolve it
  // the instant a threshold is crossed.
  completion: { mode: "candidate_declared" },
};
