import type { ScenarioDefinition } from "./types";
import {
  multiTenantControlPlaneOverloadSimulation,
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./multi-tenant-control-plane-overload/definition";
import { multiTenantControlPlaneOverloadCandidateUI } from "./multi-tenant-control-plane-overload/candidate-ui";
import { MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING } from "./multi-tenant-control-plane-overload/scoring";

/**
 * Multi-Tenant Control Plane Overload — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6d.md, scenario 63). One large tenant
 * has begun issuing a very high rate of configuration-change requests,
 * saturating the shared control plane (scheduler, config service,
 * policy engine, metadata DB) that manages desired state for every
 * tenant. The worker fleet that actually serves live tenant traffic
 * remains healthy throughout the opening of this incident — the
 * misleading symptom the candidate must see past: a control-plane
 * emergency is not the same thing as a customer-facing data-plane
 * outage, even though both share the same front door.
 */
export const multiTenantControlPlaneOverload: ScenarioDefinition = {
  id: "multi-tenant-control-plane-overload",
  slug: "multi-tenant-control-plane-overload",
  version: 1,
  name: "Multi-Tenant Control Plane Overload",
  description:
    "One large tenant ('north-star-retail') has begun issuing a very high rate of configuration-change requests, saturating the shared control plane — the scheduler, config service, policy engine, and metadata DB that manage desired state for every tenant. The worker fleet that actually serves live tenant traffic remains healthy: this is the misleading symptom. A control-plane emergency is not the same thing as a customer-facing data-plane outage, even though both share the same front door. The business has stated the following invariants explicitly: existing data-plane traffic must remain available throughout; config convergence may slow temporarily, but metadata durability must never be lost — a config write may be delayed, it must never be silently dropped; one tenant must not starve unrelated tenants' configuration changes; and no single tenant may consume more than 30% of shared control-plane capacity, regardless of how much that tenant is currently generating. Decide how to contain the hot tenant's churn, protect everyone else's fairness, and bring the control plane back under its own capacity ceiling — without creating a second, self-inflicted failure domain in the data plane you were never asked to touch.",
  difficulty: "senior_staff",
  estimatedMinutes: 20,
  isFree: false,
  structure: "linear",
  simulation: multiTenantControlPlaneOverloadSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Multi-Tenancy", "Control Plane", "Fairness", "Capacity Isolation", "Blast Radius"],
    skills: [
      "Distinguishing a control-plane emergency from a customer-facing data-plane outage",
      "Protecting system-wide tenant fairness without a global capacity increase",
      "Recognizing when a mitigation transfers pressure rather than resolving its root cause",
      "Sequencing isolation before backlog drain so a fix is not immediately undone",
    ],
    shortDescription:
      "The data plane looks fine while one tenant's unthrottled config churn quietly saturates the shared control plane underneath it.",
  },
};

export {
  multiTenantControlPlaneOverloadSimulation,
  multiTenantControlPlaneOverloadCandidateUI,
  MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
};
