import type { ScenarioDefinition } from "./types";
import {
  expensiveRetryAndLoggingAmplificationSimulation,
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "./expensive-retry-and-logging-amplification/definition";
import { expensiveRetryAndLoggingAmplificationCandidateUI } from "./expensive-retry-and-logging-amplification/candidate-ui";
import { EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING } from "./expensive-retry-and-logging-amplification/scoring";

/**
 * Expensive Retry and Logging Amplification — a paid, Senior-Staff-level
 * IncidentRank scenario (Phase 6E.2). A recent deploy raised retry
 * frequency, logging verbosity, telemetry duplication, and payload
 * logging size. There is no outage: request success rate and the
 * External Dependency's own health both stay normal throughout nearly
 * every reachable state, including the worst-cost and worst-audit
 * states. This is a self-inflicted cost and observability-posture
 * problem, not a dependency degradation — the candidate must decide
 * where observability spend is genuinely valuable versus pure waste,
 * without ever trading away required audit/security log coverage to
 * get there.
 */
export const expensiveRetryAndLoggingAmplification: ScenarioDefinition = {
  id: "expensive-retry-and-logging-amplification",
  slug: "expensive-retry-and-logging-amplification",
  version: 1,
  name: "Expensive Retry and Logging Amplification",
  description:
    "A recent deploy raised retry frequency, logging verbosity, telemetry duplication, and payload logging size across the API and Worker. System health remains acceptable throughout — this is not an outage and the External Dependency itself is not meaningfully degraded. Instead, logging cost, telemetry ingestion cost, dependency request cost, and storage cost have risen dramatically. Five business invariants govern every decision here: (1) security/audit-required logs must remain intact; (2) operational debugging signal must remain sufficient; (3) retries must preserve correctness and bounded reliability; (4) duplicate and noisy logs may be reduced freely; (5) cost reduction must never blind operators or violate audit requirements. Decide where observability spend is genuinely valuable and where it is pure waste, which layer should own retries, and whether a bounded, bounded-cost partial fix is worth handing back versus pursuing the full cost floor.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: expensiveRetryAndLoggingAmplificationSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: [
      "Cost Efficiency",
      "Observability",
      "Retry Amplification",
      "Logging",
      "Telemetry",
      "Audit Logging",
      "Internal Tooling",
    ],
    skills: [
      "Distinguishing wasteful observability spend from required audit/debugging signal",
      "Recognizing disabling audit logging as a forbidden cost lever regardless of how cheap or healthy it looks",
      "Choosing between reducing retry amplification and reducing telemetry/logging noise as independent cost levers",
      "Judging when a bounded, safe partial cost fix is good enough to hand back versus pursuing full remediation",
    ],
    shortDescription:
      "A bad deploy quietly tripled observability and dependency-request cost with no outage — fixing it the cheap way by disabling audit logs looks great on cost but is a compliance trap.",
  },
};

export {
  expensiveRetryAndLoggingAmplificationSimulation,
  expensiveRetryAndLoggingAmplificationCandidateUI,
  EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
};
