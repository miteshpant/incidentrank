import type { ScenarioDefinition } from "./types";
import {
  rateLimitMisconfigurationSimulation,
  RATE_LIMIT_POLICY_KEY,
  BURST_SIZE_KEY,
  PER_TENANT_QUOTA_KEY,
  GLOBAL_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  EMERGENCY_BYPASS_KEY,
} from "./rate-limit-misconfiguration/definition";
import { rateLimitMisconfigurationCandidateUI } from "./rate-limit-misconfiguration/candidate-ui";
import { RATE_LIMIT_MISCONFIGURATION_SCORING } from "./rate-limit-misconfiguration/scoring";

/**
 * Rate-Limit Misconfiguration — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 44). A newly deployed
 * rate-limit policy at the API gateway has two problems at once: its
 * per-tenant quota is too tight for ordinary, legitimate steady traffic,
 * and its burst allowance is generous enough that one high-volume
 * tenant can spike past a fair share and consume a disproportionate
 * amount of shared backend capacity. An emergency bypass exists that
 * can silence rejections immediately by removing enforcement entirely —
 * it is not the same thing as fixing the policy.
 */
export const rateLimitMisconfiguration: ScenarioDefinition = {
  id: "rate-limit-misconfiguration",
  slug: "rate-limit-misconfiguration",
  version: 1,
  name: "Rate-Limit Misconfiguration",
  description:
    "A newly deployed rate-limit policy at the API gateway is throttling legitimate tenant traffic while one high-volume tenant's bursts keep consuming a disproportionate share of shared backend capacity. The platform serves many tenants on shared capacity, and protecting one tenant's throughput by sacrificing every other tenant's fair access is not an acceptable outcome — nor is simply turning off rate-limit enforcement to stop the rejections. Diagnose what the deployed policy got wrong and bring legitimate traffic back to a durable, fair, protected state.",
  difficulty: "senior",
  estimatedMinutes: 16,
  isFree: false,
  simulation: rateLimitMisconfigurationSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Rate Limiting", "Multi-Tenancy", "Fairness", "API Gateway", "Quotas"],
    skills: [
      "Diagnosing a two-sided rate-limit misconfiguration (too tight and too loose at once)",
      "Distinguishing fairness/protection fixes from mere symptom suppression",
      "Recognizing when disabling protection is not the same as fixing it",
      "Evaluating per-tenant quota, burst size, and priority-class tradeoffs under shared capacity",
    ],
    shortDescription:
      "A newly deployed rate-limit policy throttles legitimate tenants while letting one high-volume tenant dominate shared capacity — and an emergency bypass can hide the problem without fixing it.",
  },
};

export {
  rateLimitMisconfigurationSimulation,
  rateLimitMisconfigurationCandidateUI,
  RATE_LIMIT_MISCONFIGURATION_SCORING,
  RATE_LIMIT_POLICY_KEY,
  BURST_SIZE_KEY,
  PER_TENANT_QUOTA_KEY,
  GLOBAL_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  EMERGENCY_BYPASS_KEY,
};
