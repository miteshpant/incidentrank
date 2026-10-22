import type { ScenarioDefinition } from "./types";
import {
  rateLimitFailureSimulation,
  RETRY_BACKOFF_STRATEGY_KEY,
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
} from "./rate-limit-failure/definition";
import { rateLimitFailureCandidateUI } from "./rate-limit-failure/candidate-ui";
import { RATE_LIMIT_FAILURE_SCORING } from "./rate-limit-failure/scoring";

/**
 * Rate-Limit Failure — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). Outbound
 * traffic has exceeded a payment-verification provider's allowed request
 * rate, and the client's naive immediate retries on every 429 are making
 * the violation worse instead of better. The candidate must recognize
 * that the durable fix is proactive client-side rate limiting plus
 * exponential-with-jitter backoff — not simply sending more requests in
 * parallel to "make up for" the failures.
 */
export const rateLimitFailure: ScenarioDefinition = {
  id: "rate-limit-failure",
  slug: "rate-limit-failure",
  version: 1,
  name: "Rate-Limit Failure",
  description:
    "Outbound calls to your payment-verification provider have exceeded its allowed request rate, and the provider has begun returning 429 responses. Your client is retrying failed requests immediately with no backoff, and the retry queue is growing fast. Diagnose the throttling and restore healthy throughput before the retry storm extends the provider's penalty window indefinitely.",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  isFree: false,
  simulation: rateLimitFailureSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Rate Limiting", "Backoff", "Retries", "Throttling"],
    skills: [
      "Diagnosing rate-limit violations and throttling",
      "Exponential backoff and jitter",
      "Proactive client-side rate limiting",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "Naive immediate retries on 429 responses are extending a payment provider's rate-limit penalty window instead of clearing it.",
  },
};

export {
  rateLimitFailureSimulation,
  rateLimitFailureCandidateUI,
  RATE_LIMIT_FAILURE_SCORING,
  RETRY_BACKOFF_STRATEGY_KEY,
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
};
