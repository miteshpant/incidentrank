import type { ScenarioDefinition } from "./types";
import {
  apiVersionSunsetBreaksSilentConsumersSimulation,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  ENABLE_COMPATIBILITY_SHIM_KEY,
  FORCE_HARD_CUTOVER_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
} from "./api-version-sunset-breaks-silent-consumers/definition";
import { apiVersionSunsetBreaksSilentConsumersCandidateUI } from "./api-version-sunset-breaks-silent-consumers/candidate-ui";
import { API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING } from "./api-version-sunset-breaks-silent-consumers/scoring";

/**
 * A staff-scoped API-ownership incident, distinct from the principal-
 * tier, org-wide Enterprise-Wide Dependency Deprecation scenario: here
 * the team owns and is sunsetting its OWN deprecated API version
 * (Orders API v1), not migrating off someone else's dependency across
 * multiple products. The team's consumer registry says every registered
 * integration finished migrating off v1 — true, and beside the point,
 * because a long tail of internal callers nobody ever registered keeps
 * calling v1 and starts failing hard the moment the sunset takes effect.
 * The candidate must choose one of three genuinely different remediation
 * strategies: extend the sunset deadline (buys time, no infra cost),
 * stand up an emergency compatibility shim (fast mitigation, ongoing
 * infra cost, imperfect fidelity for one legacy payload shape), or force
 * a hard cutover (the gateway's own dashboards go green immediately, but
 * every silent consumer that was never found just keeps failing on its
 * own side — a trap, not a fix). Either of the first two strategies only
 * becomes a durable fix once paired with actually finding and migrating
 * the long tail the investigation surfaces.
 */
export const apiVersionSunsetBreaksSilentConsumers: ScenarioDefinition = {
  id: "api-version-sunset-breaks-silent-consumers",
  slug: "api-version-sunset-breaks-silent-consumers",
  version: 1,
  name: "API Version Sunset Breaks Silent Long-Tail Consumers",
  description:
    "Your team sunset Orders API v1 on schedule. The consumer registry says every known integration migrated to v2 months ago — and it's right, as far as it goes. But 5xx errors and order-creation failures are climbing, and the support ticket queue is filling up with callers nobody has ever heard of. A long tail of internal consumers nobody tracked is still calling v1. Do you extend the deadline, stand up an emergency compatibility shim, or force the cutover through and hope the long tail sorts itself out?",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "branching",
  simulation: apiVersionSunsetBreaksSilentConsumersSimulation,
  library: {
    category: "Microservices & Dependencies",
    tags: [
      "API Versioning",
      "Deprecation",
      "Consumer Discovery",
      "Backward Compatibility",
      "Internal Dependencies",
    ],
    primarySkill: "Diagnosing an inaccurate consumer inventory before trusting a 'looks done' signal",
    skills: [
      "Distinguishing a complete registry from a complete consumer inventory",
      "Choosing between buy-time, mitigate-fast, and force-through remediation strategies",
      "Recognizing when a dashboard going green masks unresolved client-side failures",
      "Pairing a mitigation (shim/extended deadline) with real follow-through migration",
    ],
    shortDescription:
      "Sunsetting Orders API v1 breaks a long tail of internal consumers the team's own registry never knew existed.",
  },
};

export {
  apiVersionSunsetBreaksSilentConsumersSimulation,
  apiVersionSunsetBreaksSilentConsumersCandidateUI,
  API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING,
  INSPECT_CONSUMER_REGISTRY_KEY,
  INSPECT_GATEWAY_ACCESS_LOGS_KEY,
  INSPECT_SUPPORT_TICKET_QUEUE_KEY,
  EXTEND_SUNSET_DEADLINE_KEY,
  ENABLE_COMPATIBILITY_SHIM_KEY,
  FORCE_HARD_CUTOVER_KEY,
  MIGRATE_DISCOVERED_CONSUMERS_KEY,
};
