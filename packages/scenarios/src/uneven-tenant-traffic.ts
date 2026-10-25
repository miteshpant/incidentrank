import type { ScenarioDefinition } from "./types";
import {
  unevenTenantTrafficSimulation,
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  WORKLOAD_ROUTING_KEY,
} from "./uneven-tenant-traffic/definition";
import { unevenTenantTrafficCandidateUI } from "./uneven-tenant-traffic/candidate-ui";
import { UNEVEN_TENANT_TRAFFIC_SCORING } from "./uneven-tenant-traffic/scoring";

/**
 * Uneven Tenant Traffic — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 52). One tenant on a
 * shared multi-tenant platform generates a sharp, sustained traffic
 * surge — a batch job or a traffic anomaly on their end — and consumes a
 * disproportionate share of the shared service fleet and the shared data
 * layer behind it. Every other tenant sharing that same fleet and data
 * layer sees their own latency degrade, even though the hot tenant's own
 * requests stay fast — this is a platform fairness problem, not a "the
 * hot tenant is broken" problem. The platform must stay fair to every
 * tenant sharing it while protecting overall capacity; the candidate
 * must decide whether, and how, to constrain one tenant's traffic to
 * protect everyone else.
 */
export const unevenTenantTraffic: ScenarioDefinition = {
  id: "uneven-tenant-traffic",
  slug: "uneven-tenant-traffic",
  version: 1,
  name: "Uneven Tenant Traffic",
  description:
    "A multi-tenant platform serves many customers from one shared service fleet and one shared data layer. One tenant's traffic has climbed sharply and is consuming a large share of that shared capacity. Every tenant on the platform is contractually entitled to a fair share of shared resources, and no tenant's workload — however large — should be able to degrade service for everyone else. At the same time, that tenant's own traffic must keep making forward progress; it cannot simply be switched off. Diagnose why other tenants' latency is degrading, decide how to restore a fair balance, and bring the platform back to a durable, sustainable state.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  simulation: unevenTenantTrafficSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Multi-Tenancy", "Fairness", "Rate Limiting", "Capacity Planning", "Tenant Isolation"],
    skills: [
      "Diagnosing noisy-neighbor tenant contention on shared infrastructure",
      "Recognizing when broad capacity scaling cannot fix a fairness problem",
      "Weighing per-tenant throttling against dedicated-capacity isolation",
      "Reasoning about platform protection versus single-tenant impact",
    ],
    shortDescription:
      "One tenant's traffic surge is consuming shared capacity and degrading every other tenant, and scaling the shared fleet alone never restores fairness.",
  },
};

export {
  unevenTenantTrafficSimulation,
  unevenTenantTrafficCandidateUI,
  UNEVEN_TENANT_TRAFFIC_SCORING,
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  WORKLOAD_ROUTING_KEY,
};
