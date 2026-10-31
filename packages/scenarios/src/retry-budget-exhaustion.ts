import type { ScenarioDefinition } from "./types";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
  retryBudgetExhaustionSimulation,
} from "./retry-budget-exhaustion/definition";
import { retryBudgetExhaustionCandidateUI } from "./retry-budget-exhaustion/candidate-ui";
import { RETRY_BUDGET_EXHAUSTION_SCORING } from "./retry-budget-exhaustion/scoring";

/**
 * Retry Budget Exhaustion — an Intermediate-level IncidentRank scenario.
 * Recommendation Service calls Pricing Service synchronously on every
 * request, and its retry logic was written years ago with no retry
 * budget and no circuit breaker: every failed call is automatically
 * re-issued up to 3 times. When Pricing Service's own database goes
 * into a maintenance-driven slowdown — a moderate degradation the
 * candidate cannot fix directly — Recommendation Service's naive
 * retries silently multiply the load Pricing Service receives far
 * beyond real customer traffic, turning a moderate degradation into a
 * severe outage. This is a deliberately single-hop, introductory
 * amplification lesson: one client, one downstream dependency, no
 * cross-service reasoning required — the candidate only needs to
 * recognize that retries without a budget amplify load, and that
 * scaling out the degraded dependency alone can never catch up with an
 * unbounded multiplier.
 */
export const retryBudgetExhaustion: ScenarioDefinition = {
  id: "retry-budget-exhaustion",
  slug: "retry-budget-exhaustion",
  version: 1,
  name: "Retry Budget Exhaustion",
  description:
    "Recommendation Service calls Pricing Service synchronously on every request. Its retry logic has no retry budget and no circuit breaker: every failed call is automatically retried up to 3 times. Pricing Service's own database has just entered a maintenance-driven slowdown — a moderate degradation, not an outage, and not something you can fix directly. But because Recommendation Service retries every failure with no limit, it is silently multiplying the load Pricing Service receives far beyond real customer traffic, turning a moderate degradation into a severe one. Diagnose why Pricing Service's load looks so much worse than its real traffic would explain, and stop the amplification without assuming more Pricing Service capacity alone will catch up.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  isFree: false,
  structure: "linear",
  simulation: retryBudgetExhaustionSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: ["Retries", "Circuit Breakers", "Load Amplification", "Capacity Planning"],
    primarySkill: "Recognizing that unbounded retries amplify load onto a degraded dependency",
    skills: [
      "Distinguishing a dependency's real degradation from self-inflicted amplified load",
      "Bounding a retry policy with a retry budget and a circuit breaker",
      "Recognizing that added downstream capacity can't outpace an unbounded retry multiplier",
    ],
    shortDescription:
      "A client service's unbudgeted per-call retries multiply load onto an already-degraded downstream dependency.",
  },
};

export {
  retryBudgetExhaustionSimulation,
  retryBudgetExhaustionCandidateUI,
  RETRY_BUDGET_EXHAUSTION_SCORING,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  CIRCUIT_BREAKER_ENABLED_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
};
