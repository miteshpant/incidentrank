import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { serviceDiscoveryRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const serviceDiscoveryFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "discoveryStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Service discovery has entered a critical state — Service A can no longer reliably reach Service C.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Service discovery has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "connectionFailuresPerMinute",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Connection failures against Service C have crossed 300 per minute.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Connection failures against Service C have dropped back below 300 per minute.",
      },
    },
    {
      key: "retryVolumePerMinute",
      trackPeak: true,
    },
    {
      key: "discoveryRefreshAgeSeconds",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: serviceDiscoveryRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Completion-mode audit (Phase 6B section 8/9): every reachable
  // recovery state in rules.ts is binary-safe — fast-refresh-with-
  // fallback, fallback-only, and fast-refresh-only all fully clear
  // successCondition with no accepted tradeoff recorded anywhere (unlike
  // Kafka Partition Skew's orderingMode tradeoff). The non-recovered
  // states (capacity-pinched, partially-recovering, stale-endpoints
  // baseline, retry-amplification) are all actively unsafe to varying
  // degrees, never "safe but imperfect." There is therefore no genuine
  // acceptable tier to author — see UNSAFE/ACCEPTABLE/OPTIMAL breakdown
  // in the scenario's test file and completion report. candidate_declared
  // (rather than automatic) because the real judgment call this incident
  // tests is "do I trust this recovery is durable enough to hand back,"
  // not merely "did a threshold get crossed" — the same reasoning
  // poison-message-loop uses with its own three alternate good paths and
  // no acceptable tier.
  completion: { mode: "candidate_declared" },
};
