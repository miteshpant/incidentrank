import type { TimedEvent } from "@incidentrank/simulator";

// One large tenant begins generating excessive configuration churn
// (rapid repeated config-change requests -- e.g. a misbehaving
// automation re-applying the same policy thousands of times). The
// observable precursor the candidate sees first is schedulerQueueDepth
// and metadataDbWritePressure climbing while dataPlaneSuccessRate stays
// at 100 -- the misleading symptom this scenario is built around.
const HOT_TENANT_CHURN_BEGINS_MS = 30_000;

// Second wave: if nothing has contained the hot tenant's share of
// control-plane throughput by this point, the backlog has grown large
// enough that convergence delay starts affecting every tenant, not just
// the hot one -- a genuine, observable escalation distinct from the
// initial onset, never a retroactive rewrite of earlier state.
const CONTROL_PLANE_SATURATION_MS = HOT_TENANT_CHURN_BEGINS_MS + 2 * 60_000;

// Backlog-drain observation window: whatever mitigation is in place by
// this point, the SHAPE of the backlog (did it actually shrink over
// real elapsed time, or merely stop growing, or keep growing) becomes
// observable here. This is what makes recovery lag real rather than
// assumed -- draining a queue takes authored elapsed time to show up in
// schedulerQueueDepth, never an instant jump to a low number the tick
// after a control changes.
const DRAIN_WINDOW_MS = HOT_TENANT_CHURN_BEGINS_MS + 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "hot-tenant-churn-begins",
    atMs: HOT_TENANT_CHURN_BEGINS_MS,
    type: "TRIGGER_SET",
    message:
      "Tenant 'north-star-retail' has begun issuing a very high rate of configuration-change requests -- far above its historical baseline. The data plane continues serving live traffic normally.",
    setTriggers: { hotTenantChurning: true },
  },
  {
    id: "control-plane-saturation",
    atMs: CONTROL_PLANE_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "The shared scheduler queue has grown large enough that config convergence is now visibly slow for tenants other than the hot tenant as well.",
    setTriggers: { hotTenantChurning: true, controlPlaneSaturated: true },
  },
  {
    id: "drain-window-elapsed",
    atMs: DRAIN_WINDOW_MS,
    type: "TRIGGER_SET",
    message:
      "Several minutes have now passed since the incident began -- enough time for a genuine mitigation to show measurable backlog drain, or for an ineffective one to reveal that the backlog never actually shrank.",
    setTriggers: { hotTenantChurning: true, drainWindowElapsed: true },
  },
];

export { HOT_TENANT_CHURN_BEGINS_MS, CONTROL_PLANE_SATURATION_MS, DRAIN_WINDOW_MS };
