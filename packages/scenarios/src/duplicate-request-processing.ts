import type { ScenarioDefinition } from "./types";
import {
  duplicateRequestProcessingSimulation,
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
} from "./duplicate-request-processing/definition";
import { duplicateRequestProcessingCandidateUI } from "./duplicate-request-processing/candidate-ui";
import { DUPLICATE_REQUEST_PROCESSING_SCORING } from "./duplicate-request-processing/scoring";

/**
 * Duplicate Request Processing — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 57). A downstream
 * dependency slows down, and the order service's response times rise
 * with it. A client that has not heard back before its own timeout fires
 * has no way to know whether its first request actually succeeded — it
 * retries. The API gateway retries independently on slow/failed
 * responses too. Without the service recognizing a retried request as a
 * copy of one it has already seen, each arriving copy creates another
 * order. The candidate must recognize that a system which looks more
 * responsive — faster timeouts, more retries completing "successfully" —
 * is not the same as a system that is only creating each order once.
 */
export const duplicateRequestProcessing: ScenarioDefinition = {
  id: "duplicate-request-processing",
  slug: "duplicate-request-processing",
  version: 1,
  name: "Duplicate Request Processing",
  description:
    "A downstream dependency has slowed down, and order-service response times are rising. Clients that do not hear back before their own timeout has no way to know whether their first request actually went through, and both the client and the API gateway retry independently. An order's side effect (the charge it creates) must be applied at most once per logical request, regardless of how many times that request is retried along the way — a request that executes its side effect twice is a correctness incident, not a cosmetic one, even if every retry eventually returns a successful response. Diagnose why orders are being duplicated and bring the system to a state that is genuinely safe to hand back, not merely fast.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: duplicateRequestProcessingSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Idempotency", "HTTP Retries", "Correctness", "Request Deduplication", "API Gateway"],
    skills: [
      "Distinguishing apparent request success from correctness guarantees",
      "Recognizing when a retry mitigation increases duplicate side effects",
      "Reasoning about client-side timeout ambiguity and acknowledgement uncertainty",
      "Evaluating idempotency-key enforcement and atomic transaction tradeoffs",
    ],
    shortDescription:
      "Client and gateway retries against a slow dependency are creating the same order more than once, even while retries look like they are succeeding.",
  },
};

export {
  duplicateRequestProcessingSimulation,
  duplicateRequestProcessingCandidateUI,
  DUPLICATE_REQUEST_PROCESSING_SCORING,
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
};
