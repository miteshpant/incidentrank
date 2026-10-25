import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The hot tenant's allowed configuration-write rate, as a fraction of
 * total shared control-plane throughput the business is willing to let
 * ANY single tenant consume. "unthrottled" (the dangerous default) lets
 * the hot tenant's config-churn requests compete for scheduler/config-
 * service/metadata-DB capacity on equal footing with every other
 * tenant's requests, which is exactly how one tenant starves the rest.
 * "capped-30-percent" enforces the business's explicit per-tenant
 * ceiling (phase6d.md's "one tenant must not consume more than 30% of
 * shared control-plane capacity" invariant). "capped-10-percent" is a
 * stricter cap, useful once the hot tenant is confirmed to be the sole
 * cause of saturation and the business wants faster relief for everyone
 * else at the cost of slower convergence for the hot tenant itself.
 */
export const HOT_TENANT_QUOTA_KEY = "hotTenantQuota";

/**
 * Whether unrelated (non-hot) tenants' config requests get a protected,
 * separately-scheduled lane through the control plane, or share one
 * undifferentiated queue with the hot tenant. "shared-queue" is the
 * default: every tenant's config requests are processed strictly in
 * arrival order, so a tenant generating a flood of requests can push
 * every other tenant's requests arbitrarily far back in the same queue.
 * "dedicated-lane" partitions the queue so small-tenant config requests
 * are scheduled independently of however much the hot tenant is
 * currently generating.
 */
export const QUEUE_PARTITIONING_KEY = "queuePartitioning";

/**
 * How many metadata-DB writes the scheduler batches together before
 * committing, trading metadata-DB write pressure against config
 * convergence latency. "small" batches commit almost immediately (fast
 * convergence, high write pressure per unit of churn). "large" batches
 * commit many config changes at once (far lower metadata-DB write
 * pressure per change) but each individual tenant's config change now
 * waits for a full batch window before it is even visible as converged
 * — the authored pressure-transfer lever: relieving metadata-DB write
 * pressure this way measurably worsens config convergence age for
 * EVERY tenant, not just the hot one.
 */
export const METADATA_WRITE_BATCHING_KEY = "metadataWriteBatching";

/**
 * Worker fleet concurrency serving live tenant data-plane requests
 * (actual customer traffic, not configuration management). This is the
 * tempting-but-wrong lever: the data plane is healthy from the start of
 * this incident, so increasing worker concurrency does nothing to
 * relieve control-plane (scheduler/config-service/metadata-DB)
 * saturation. Worse, "scaled-up" workers each maintain their own
 * metadata-DB connection pool for fetching converged config — more
 * workers means more concurrent metadata-DB reads layered on top of the
 * control plane's own already-elevated write pressure, pushing
 * metadata-DB utilization higher rather than lower.
 */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/**
 * Whether the scheduler and config-service are allowed to keep draining
 * the existing backlog of queued config changes at normal speed, or are
 * throttled back to intentionally slow backlog drain. This exists
 * purely to make sequencing observable: draining the backlog while the
 * hot tenant's quota is still unthrottled just refills the backlog from
 * the front as fast as it drains from the back, whereas draining AFTER
 * the hot tenant is quota-capped actually shrinks the backlog over real
 * elapsed time (see RECOVERY-LAG in definition.ts).
 */
export const BACKLOG_DRAIN_KEY = "backlogDrainMode";

export const controls: ControlDefinition[] = [
  {
    key: HOT_TENANT_QUOTA_KEY,
    allowedValues: ["unthrottled", "capped-30-percent", "capped-10-percent"],
    initialValue: "unthrottled",
  },
  {
    key: QUEUE_PARTITIONING_KEY,
    allowedValues: ["shared-queue", "dedicated-lane"],
    initialValue: "shared-queue",
  },
  {
    key: METADATA_WRITE_BATCHING_KEY,
    allowedValues: ["small", "moderate", "large"],
    initialValue: "small",
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: ["baseline", "scaled-up"],
    initialValue: "baseline",
  },
  {
    key: BACKLOG_DRAIN_KEY,
    allowedValues: ["draining", "paused"],
    initialValue: "draining",
  },
];
