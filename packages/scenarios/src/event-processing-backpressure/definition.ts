import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { eventProcessingBackpressureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  PRODUCER_THROTTLE_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
  CONSUMER_COUNT_KEY,
  BATCH_SIZE_KEY,
  EXTERNAL_API_CALL_CONCURRENCY_KEY,
  PRIORITY_ROUTING_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const eventProcessingBackpressureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "kafkaStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Kafka consumer lag has entered a critical backlog state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Kafka consumer lag has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "kafkaLagMessages",
      trackPeak: true,
      threshold: {
        value: 5_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Kafka consumer lag has crossed 5,000 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Kafka consumer lag has dropped back below 5,000 messages.",
      },
    },
    {
      key: "dbConnectionUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Database connection utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Database connection utilization has dropped back below 90%.",
      },
    },
    {
      key: "externalApiErrorRate",
      trackPeak: true,
      threshold: {
        value: 25,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "External API error rate has crossed 25%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "External API error rate has dropped back below 25%.",
      },
    },
    {
      key: "eventFreshnessSeconds",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: eventProcessingBackpressureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   backlog-growing (baseline)            UNSAFE   kafkaLag=12000,
  //                                          freshness=150s, critical
  //   throttled-still-stale (masking)        UNSAFE   freshness=70s,
  //                                          kafkaStatus=warning — buys
  //                                          time, never increases drain
  //                                          capacity
  //   db-overloaded (scaling trap)           UNSAFE   dbConn=96, critical
  //   external-api-overloaded (scaling trap) UNSAFE   apiErr=48, critical
  //   both-overloaded (scaling trap, worse)  UNSAFE   dbConn=97, apiErr=42
  //   external-rate-limited (2nd wave)       UNSAFE   kafkaStatus=critical
  //                                          again, apiErr=65
  //   priority-routed-acceptable             ACCEPTABLE  dbConn=55,
  //                                          apiErr=6, downstreamPressure
  //                                          = "low-priority-deferred" —
  //                                          core/high-priority path and
  //                                          every subsystem health
  //                                          signal safe, but low-priority
  //                                          event freshness deliberately
  //                                          deferred, not fully balanced.
  //   balanced-recovery                      OPTIMAL  dbConn=42, apiErr=2,
  //                                          downstreamPressure =
  //                                          "balanced" — ingestion,
  //                                          processing, DB pressure,
  //                                          external dependency
  //                                          pressure, queue growth, and
  //                                          customer freshness are all
  //                                          genuinely balanced at once.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (full balance vs. a deliberate optional-traffic
  // sacrifice), matching section 9's explicit "optional enrichment
  // disabled while core customer path is healthy" standard generalized
  // to "low-priority events deliberately deferred while the core path
  // and every subsystem stay healthy." This is a legitimate
  // acceptableCondition tier, not partial credit. Every other
  // non-terminal-success state above is a real but incomplete or
  // actively harmful mitigation — correctly ineligible for any Finish
  // tier, not awarded a third tier.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // priority-routed-acceptable state. "Has Kafka lag happened to drop"
  // is not, by itself, proof the system is safe to hand back — scaling
  // consumers aggressively drains Kafka lag in the exact same tick as it
  // silently overloads the database or external API, so the candidate
  // must judge whether the drop came from genuinely balanced capacity
  // or from a bottleneck that only moved downstream — exactly the
  // "is this safe enough to hand back" judgment candidate_declared
  // exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
