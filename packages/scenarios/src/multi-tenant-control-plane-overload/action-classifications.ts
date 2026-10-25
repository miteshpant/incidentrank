import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: HOT_TENANT_QUOTA_KEY,
    valueEquals: "capped-30-percent",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped the hot tenant at the shared control-plane ceiling",
      explanation:
        "Capping the hot tenant's configuration-change rate at 30% of shared control-plane throughput is the only lever that reduces how much of the scheduler/config-service/metadata-DB capacity that tenant can consume. This is the structural fix -- it addresses the root cause (unthrottled churn from one tenant) rather than just changing how the overload is experienced downstream, and it keeps the business's explicit per-tenant ceiling intact.",
    },
  },
  {
    id: "acr_2",
    controlKey: HOT_TENANT_QUOTA_KEY,
    valueEquals: "capped-10-percent",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped the hot tenant more aggressively than required",
      explanation:
        "A 10% cap goes further than the business's 30% ceiling requires. It gives unrelated tenants faster relief at the cost of slightly slower convergence for the hot tenant's own legitimate config changes -- a real, defensible, conservative choice once the hot tenant is confirmed to be the sole saturation source.",
    },
  },
  {
    id: "acr_3",
    controlKey: HOT_TENANT_QUOTA_KEY,
    valueEquals: "unthrottled",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "harmful",
    feedback: {
      title: "Left the hot tenant's configuration churn unthrottled",
      explanation:
        "Leaving the hot tenant's quota unthrottled means it keeps consuming far more than the business's 30% shared-capacity ceiling, continuing to starve unrelated tenants' configuration changes no matter what else is changed elsewhere in the control plane. Nothing downstream (queue partitioning, batching, worker capacity) can substitute for actually bounding the tenant that is causing the churn.",
    },
  },
  {
    id: "acr_4",
    controlKey: QUEUE_PARTITIONING_KEY,
    valueEquals: "dedicated-lane",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "beneficial",
    feedback: {
      title: "Gave unrelated tenants a protected scheduling lane",
      explanation:
        "Partitioning the scheduler queue so unrelated tenants are no longer scheduled strictly behind however much the hot tenant is currently generating directly protects the business invariant that one tenant must not starve unrelated tenants. On its own this does not reduce the hot tenant's actual consumption of shared capacity -- combined with a quota cap, it produces the fullest, fairest recovery.",
    },
  },
  {
    id: "acr_5",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueEquals: "scaled-up",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled up the worker fleet instead of the control plane",
      explanation:
        "The data plane was healthy before this change and stays healthy immediately afterward, so scaling worker concurrency does nothing to relieve the actual bottleneck -- the scheduler, config service, and metadata DB are the subsystems under pressure, not the worker fleet. Worse, each additional worker opens its own metadata-DB connection to read converged config, adding concurrent read load directly on top of the control plane's already-elevated write pressure: metadata-DB write pressure rose from the unmitigated baseline rather than falling, and real metadata writes began being dropped -- a durability risk this scenario's business invariant explicitly forbids, paid for with increased infrastructure cost and no actual relief.",
    },
  },
  {
    id: "acr_6",
    controlKey: METADATA_WRITE_BATCHING_KEY,
    valueEquals: "large",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "harmful",
    feedback: {
      title: "Pushed metadata write batching to its most aggressive setting",
      explanation:
        "Batching metadata-DB writes into very large batches did measurably lower metadata-DB write pressure, but it transferred that pressure directly onto config convergence latency: every tenant's config changes now wait for a full, much larger batch window before they are even visible as converged, far worse than any other genuinely mitigated state in this incident. Relieving one tier this aggressively measurably worsened another.",
    },
  },
  {
    id: "acr_7",
    controlKey: METADATA_WRITE_BATCHING_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "neutral",
    feedback: {
      title: "Moved metadata write batching to a moderate setting",
      explanation:
        "A moderate batch size trades a small amount of convergence latency for a real reduction in metadata-DB write pressure without pushing convergence delay into the range that starts to look like its own incident -- a reasonable, bounded tuning choice once the hot tenant itself has already been contained.",
    },
  },
  {
    id: "acr_8",
    controlKey: BACKLOG_DRAIN_KEY,
    valueEquals: "paused",
    whenTriggerEquals: { hotTenantChurning: true },
    outcome: "neutral",
    feedback: {
      title: "Paused backlog draining",
      explanation:
        "Pausing backlog drain neither helps nor hurts on its own -- the backlog only ever shrinks once the hot tenant's quota is actually capped, so whether draining is nominally 'on' or 'paused' before that happens has no observable effect either way.",
    },
  },
];
