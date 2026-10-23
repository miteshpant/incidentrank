import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { rateLimitRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  RETRY_BACKOFF_STRATEGY_KEY,
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const rateLimitFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "rateLimitStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The provider's rate limit has entered a critical violation state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Rate-limit violations have recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "retryQueueDepth",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The retry queue has crossed 300 pending requests.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The retry queue has dropped back below 300 pending requests.",
      },
    },
    {
      key: "effectiveThroughput",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: rateLimitRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Phase 6.1: candidate-declared completion — deliberately no
  // acceptableCondition. Per the state audit, both partial-mitigation
  // tiers (jitter alone: 14% of requests still 429ing; fixed-delay
  // alone: 28%) leave the provider's rate limit actively violated —
  // "less-bad," not "safe," structurally identical to Payment Retry
  // Storm's already-rejected partial tier. Neither is a deliberate
  // engineering tradeoff, just an incomplete fix. Only the full
  // successCondition (client-side limiting + backoff jitter together)
  // represents a genuinely safe handback state.
  completion: { mode: "candidate_declared" },
};
