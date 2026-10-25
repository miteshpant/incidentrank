import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Fraction (0-100) of shared control-plane throughput (scheduler +
  // config-service capacity) the hot tenant's config-churn requests are
  // currently consuming. The business invariant is that this must never
  // exceed 30 for any single tenant; the dangerous default (unthrottled
  // quota) lets it climb far past that.
  hotTenantControlPlaneShare: 8,
  // Depth of the shared scheduler queue, in pending config-change
  // requests. Climbs when the hot tenant floods the control plane
  // without a quota; drains over real elapsed time once draining is
  // genuinely possible (see RECOVERY-LAG), never resets to 0 instantly.
  schedulerQueueDepth: 40,
  // End-to-end scheduler processing latency in milliseconds. Elevated
  // queue depth directly worsens this for EVERY tenant waiting behind
  // the hot tenant, not only the hot tenant itself.
  schedulerLatencyMs: 200,
  // Metadata DB write pressure, 0-100. The control plane's own
  // config-commit writes are the primary driver; worker-fleet metadata
  // reads (when workers are scaled up) add additional load on top,
  // which is the second authored pressure-transfer path.
  metadataDbWritePressure: 15,
  // Age, in seconds, of the oldest config change that has been accepted
  // but not yet fully converged/visible to its owning tenant. Rises
  // under heavy batching (large batches commit less often) and under
  // queue backlog; this is the field that answers "how stale is desired
  // state right now."
  configConvergenceAgeSeconds: 10,
  // Fraction (0-100) of config-change requests from tenants OTHER than
  // the hot tenant that succeed within a reasonable time, rather than
  // being starved behind the hot tenant's flood. This is the fairness
  // metric the business invariant "one tenant must not starve unrelated
  // tenants" is checked against directly.
  smallTenantConfigSuccessRate: 100,
  // Worker fleet utilization, 0-100, serving live customer (data-plane)
  // requests. Starts and stays healthy independent of control-plane
  // health for as long as the candidate does not create a second,
  // self-inflicted failure domain by scaling workers into metadata-DB
  // contention.
  workerUtilization: 55,
  // Customer-facing data-plane success rate, 0-100 — the metric that
  // proves "existing data-plane traffic should remain available" either
  // held or was violated. This is the metric most likely to mislead a
  // candidate who checks it first and concludes nothing is wrong.
  dataPlaneSuccessRate: 100,
  // Count of metadata writes rejected or dropped due to overload, rather
  // than durably persisted (possibly delayed). Must stay at 0 under any
  // genuinely safe mitigation — metadata durability must be preserved
  // even while convergence slows. Nonzero only under the harmful,
  // aggressive-batching-plus-overload combination.
  metadataWriteLossCount: 0,
  // Severity field (exactly normal|warning|critical) summarizing
  // control-plane health as a whole, independent of data-plane health —
  // the field that makes "this is a control-plane emergency, not a
  // customer outage" directly observable rather than inferred.
  controlPlaneStatus: "normal",
  // Generic string-state field recording WHICH mitigation mechanism (if
  // any) is currently containing the hot tenant, read only by scoring's
  // dataIntegrity/operational measures, never by any scenario-specific
  // scorer code. "quota-enforced" = the structural fix (hot tenant
  // capped below the 30% business ceiling). "lane-only" = small tenants
  // protected via a dedicated queue lane, but the hot tenant itself was
  // never throttled, so control-plane capacity is still being consumed
  // unfairly overall. "unmitigated" = no isolation mechanism engaged
  // (covers both the untouched baseline and the worker-scaling trap).
  hotTenantContainment: "unmitigated",
};
