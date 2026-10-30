import type { ScenarioDefinition } from "./types";
import {
  enterpriseWideDependencyDeprecationSimulation,
  COMPATIBILITY_LAYER_MODE_KEY,
  DEADLINE_ESCALATION_MODE_KEY,
  DEPRECATED_API_TRAFFIC_BLOCK_KEY,
  DUAL_SUPPORT_MODE_KEY,
  MIGRATION_COHORT_ORDER_KEY,
  MIGRATION_VERIFICATION_MODE_KEY,
  PRODUCT_A_MIGRATION_KEY,
  PRODUCT_B_MIGRATION_KEY,
  PRODUCT_C_MIGRATION_KEY,
  PRODUCT_D_MIGRATION_KEY,
  REPLACEMENT_TRAFFIC_PERCENT_KEY,
  ROLLBACK_READINESS_KEY,
} from "./enterprise-wide-dependency-deprecation/definition";
import { enterpriseWideDependencyDeprecationCandidateUI } from "./enterprise-wide-dependency-deprecation/candidate-ui";
import { ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING } from "./enterprise-wide-dependency-deprecation/scoring";

/**
 * Enterprise-Wide Dependency Deprecation — a paid, Principal-level
 * IncidentRank scenario and the Phase 6E flagship. A critical external
 * dependency has a hard, known deprecation deadline. Four independent
 * products already sit at different real migration stages: Product A
 * reports migrated but was never independently verified, Product B is
 * partially migrated, Product C is blocked by a genuine compatibility
 * issue with the Replacement API, and Product D is fully untouched.
 * Nothing here is a classic outage — every live traffic metric can read
 * fully healthy for a long time while the real problem (ungoverned,
 * unverified, or stalled migration against an approaching hard deadline)
 * compounds untouched. No single control and no single product's
 * migration resolves this scenario: the candidate must identify a real
 * migration order, establish genuine compatibility/correctness
 * verification, clear Product C's structural blocker, drain deprecated
 * traffic, and prepare a rollback path — all before the deadline — while
 * resisting five distinct, non-cartoonish traps along the way.
 */
export const enterpriseWideDependencyDeprecation: ScenarioDefinition = {
  id: "enterprise-wide-dependency-deprecation",
  slug: "enterprise-wide-dependency-deprecation",
  version: 1,
  name: "Enterprise-Wide Dependency Deprecation",
  description:
    "A critical external dependency has a hard, known deprecation deadline. Four independent products are already at different real migration stages: Product A reports migrated — but it was never independently verified. Product B is partially migrated. Product C is blocked by a genuine compatibility issue with the Replacement API. Product D is fully untouched. Every live traffic/error/latency dashboard can read fully healthy for a long time; this is a governance and sequencing problem, not an outage. Six business invariants govern every decision: (1) no critical product may remain dependent on the deprecated API past the hard deadline; (2) a product must not be marked migrated until compatibility and correctness checks pass; (3) dual-support may be temporary but cannot become indefinite hidden debt; (4) a shared compatibility layer must not become a permanent single point of failure; (5) migration order should reflect business criticality and technical dependency risk; (6) deadline risk must remain candidate-visible throughout. Decide how to sequence the four products, whether and how to verify each migration before counting it as done, how to clear Product C's real technical blocker, how much deprecated traffic to drain and how fast, whether a temporary dual-support bridge is worth its ongoing cost, and — critically — whether marking everything \"migrated\" and walking away is actually safe, or whether the dashboard staying green is hiding a deadline that is about to arrive regardless.",
  difficulty: "principal",
  estimatedMinutes: 30,
  isFree: false,
  structure: "linear",
  simulation: enterpriseWideDependencyDeprecationSimulation,
  library: {
    category: "Deployments & Reliability",
    tags: [
      "Migration Governance",
      "Deprecation",
      "Deadline Risk",
      "Multi-Team Coordination",
      "Verification",
      "Technical Debt",
      "Rollback Readiness",
    ],
    skills: [
      "Sequencing a multi-product migration by business criticality and technical dependency risk",
      "Distinguishing a claimed completion from a verified one",
      "Recognizing when a temporary bridge (dual-support, a compatibility shim) has become permanent debt",
      "Resisting deadline-pressure panic that trades a visible risk for a guaranteed outage",
      "Treating a healthy live dashboard as insufficient evidence that a deadline-driven risk is under control",
    ],
    shortDescription:
      "Four products sit at four different migration stages against a hard external deprecation deadline — every live dashboard reads healthy while marking everything 'migrated' without verification, or waiting because nothing looks broken yet, quietly becomes the real incident.",
  },
};

export {
  enterpriseWideDependencyDeprecationSimulation,
  enterpriseWideDependencyDeprecationCandidateUI,
  ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING,
  COMPATIBILITY_LAYER_MODE_KEY,
  DEADLINE_ESCALATION_MODE_KEY,
  DEPRECATED_API_TRAFFIC_BLOCK_KEY,
  DUAL_SUPPORT_MODE_KEY,
  MIGRATION_COHORT_ORDER_KEY,
  MIGRATION_VERIFICATION_MODE_KEY,
  PRODUCT_A_MIGRATION_KEY,
  PRODUCT_B_MIGRATION_KEY,
  PRODUCT_C_MIGRATION_KEY,
  PRODUCT_D_MIGRATION_KEY,
  REPLACEMENT_TRAFFIC_PERCENT_KEY,
  ROLLBACK_READINESS_KEY,
};
