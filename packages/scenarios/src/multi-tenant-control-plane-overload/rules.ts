import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKLOG_DRAIN_KEY,
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "healthy",
  "config-service": "healthy",
  "policy-engine": "healthy",
  "metadata-db": "healthy",
  "worker-fleet": "healthy",
};

const controlPlaneCriticalHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "critical",
  "config-service": "critical",
  "policy-engine": "degraded",
  "metadata-db": "critical",
  "worker-fleet": "healthy",
};

const controlPlaneCriticalDataPlaneSlippingHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "degraded",
  scheduler: "critical",
  "config-service": "critical",
  "policy-engine": "critical",
  "metadata-db": "critical",
  "worker-fleet": "degraded",
};

const controlPlaneWarningHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "degraded",
  "config-service": "degraded",
  "policy-engine": "healthy",
  "metadata-db": "degraded",
  "worker-fleet": "healthy",
};

const controlPlaneStabilizingHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "degraded",
  "config-service": "healthy",
  "policy-engine": "healthy",
  "metadata-db": "degraded",
  "worker-fleet": "healthy",
};

const optimalHealth: Record<string, ComponentHealth> = healthyHealth;

const workerScalingTrapHealth: Record<string, ComponentHealth> = {
  "tenant-apis": "healthy",
  scheduler: "critical",
  "config-service": "critical",
  "policy-engine": "degraded",
  "metadata-db": "critical",
  "worker-fleet": "degraded",
};

/**
 * Authored rule table for Multi-Tenant Control Plane Overload, ordered
 * most-specific first.
 *
 * Business invariants (stated in the candidate briefing, see
 * multi-tenant-control-plane-overload.ts): existing data-plane traffic
 * must remain available; config convergence may slow temporarily but
 * metadata durability must never be lost; and no single tenant may
 * consume more than 30% of shared control-plane capacity
 * (hotTenantControlPlaneShare must not exceed 30 under any genuinely
 * safe mitigation).
 *
 * HOT_TENANT_QUOTA_KEY is the structural lever: capping the hot
 * tenant's share at or below the 30% business ceiling is the only
 * control that reduces hotTenantControlPlaneShare itself. Everything
 * else (queue partitioning, batching, worker concurrency) changes HOW
 * the overload is experienced by other tenants/subsystems without
 * reducing the hot tenant's actual consumption.
 *
 * QUEUE_PARTITIONING_KEY protects OTHER tenants' fairness
 * (smallTenantConfigSuccessRate) even without a quota, but does nothing
 * about hotTenantControlPlaneShare itself -- a dedicated lane is a
 * mitigation for symptom (2) of the business invariants ("one tenant
 * must not starve unrelated tenants") without addressing the underlying
 * capacity-ceiling violation, which is why lane-only is scored/completed
 * as a lesser, non-structural mechanism (see hotTenantContainment).
 *
 * METADATA_WRITE_BATCHING_KEY is the first authored pressure-transfer
 * mechanism: "large" batching drives metadataDbWritePressure down
 * sharply, but configConvergenceAgeSeconds rises sharply in exchange --
 * relieving one tier measurably worsens another, with real distinct
 * values (see aggressive-batching-trap below).
 *
 * WORKER_CONCURRENCY_KEY is the tempting-but-wrong lever and the second
 * authored pressure-transfer mechanism: the data plane is healthy from
 * the start of this incident, so scaling workers does not touch the
 * control-plane bottleneck at all -- and "scaled-up" workers add their
 * own metadata-DB read load on top of the control plane's elevated
 * write pressure, pushing metadataDbWritePressure HIGHER than doing
 * nothing, and introducing real metadata write loss
 * (metadataWriteLossCount > 0) once combined pressure exceeds the
 * metadata DB's safe limit -- a genuine durability risk this scenario's
 * business invariant explicitly forbids.
 *
 * BACKLOG_DRAIN_KEY plus drainWindowElapsed together encode sequencing:
 * draining the backlog while the hot tenant's quota is still
 * unthrottled never actually shrinks schedulerQueueDepth, no matter how
 * much elapsed time passes, because the hot tenant refills the queue
 * from the front as fast as draining removes from the back. Only once
 * the quota is capped AND real elapsed time (drainWindowElapsed) has
 * passed does the backlog genuinely shrink -- recovery lag, not an
 * instant fix.
 */
export const multiTenantControlPlaneOverloadRules: Rule[] = [
  // ── OPTIMAL: hot tenant quota capped at/below the business ceiling,
  // AND unrelated tenants additionally protected by a dedicated queue
  // lane, AND batching kept at a moderate (not aggressive) level, AND
  // the drain window has elapsed so the backlog has genuinely had time
  // to shrink. This is the full, structural, fair fix.
  {
    id: "quota-lane-moderate-batching-drained",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-30-percent",
        [QUEUE_PARTITIONING_KEY]: "dedicated-lane",
        [METADATA_WRITE_BATCHING_KEY]: "moderate",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "optimal-fix-drained",
    values: {
      hotTenantControlPlaneShare: 28,
      schedulerQueueDepth: 18,
      schedulerLatencyMs: 220,
      metadataDbWritePressure: 30,
      configConvergenceAgeSeconds: 45,
      smallTenantConfigSuccessRate: 99,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "normal",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: optimalHealth,
  },
  // Same control combination, but the drain window has not yet
  // elapsed -- the fix just landed. Backlog is still high because it
  // takes real elapsed time to drain, not an instant jump. This is the
  // RECOVERY-LAG state: the correct fix is in place, but the system is
  // not yet instantly healthy.
  {
    id: "quota-lane-moderate-batching-just-fixed",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: false },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-30-percent",
        [QUEUE_PARTITIONING_KEY]: "dedicated-lane",
        [METADATA_WRITE_BATCHING_KEY]: "moderate",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "optimal-fix-draining",
    values: {
      hotTenantControlPlaneShare: 28,
      schedulerQueueDepth: 210,
      schedulerLatencyMs: 900,
      metadataDbWritePressure: 48,
      configConvergenceAgeSeconds: 140,
      smallTenantConfigSuccessRate: 91,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "warning",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: controlPlaneStabilizingHealth,
  },

  // ── PRESSURE-TRANSFER #1 (aggressive batching). Checked immediately
  // after the optimal/moderate-batching rules above (which explicitly
  // require METADATA_WRITE_BATCHING_KEY to be "moderate" and therefore
  // never match when batching is "large") and BEFORE every other
  // quota-capped rule below, since none of those check the batching
  // control at all and would otherwise match "large" batching too,
  // making this trap unreachable. Hot tenant correctly quota-capped,
  // but batching pushed all the way to "large" to chase
  // metadataDbWritePressure down further. It works for that one metric
  // (20, well below the quota-only fix's 34-55 range, and far below the
  // unmitigated 78-94 range) -- but configConvergenceAgeSeconds explodes
  // to 310, far worse than every other genuinely mitigated state.
  // Relieving metadata-DB pressure this aggressively measurably worsens
  // convergence for every tenant, not just the hot one.
  {
    id: "aggressive-batching-trap",
    when: {
      triggerEquals: { hotTenantChurning: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-30-percent",
        [METADATA_WRITE_BATCHING_KEY]: "large",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "aggressive-batching-trap",
    values: {
      hotTenantControlPlaneShare: 29,
      schedulerQueueDepth: 90,
      schedulerLatencyMs: 300,
      metadataDbWritePressure: 20,
      configConvergenceAgeSeconds: 310,
      smallTenantConfigSuccessRate: 88,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "warning",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: controlPlaneWarningHealth,
  },

  // ── ACCEPTABLE-leaning: quota correctly capped at 10% (stricter than
  // required, faster relief for everyone else, slightly slower
  // convergence for the hot tenant itself), lane and moderate batching
  // also in place, drain window elapsed. Still a structural fix -- just
  // a different, more conservative point on the same safe mechanism.
  {
    id: "quota-10-lane-moderate-batching-drained",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-10-percent",
        [QUEUE_PARTITIONING_KEY]: "dedicated-lane",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "strict-quota-fix-drained",
    values: {
      hotTenantControlPlaneShare: 10,
      schedulerQueueDepth: 12,
      schedulerLatencyMs: 210,
      metadataDbWritePressure: 24,
      configConvergenceAgeSeconds: 50,
      smallTenantConfigSuccessRate: 100,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "normal",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: optimalHealth,
  },

  // ── Quota-only fix: hot tenant capped at the 30% ceiling, but no
  // dedicated lane for unrelated tenants and batching left at the
  // default. Genuinely addresses the root cause (hotTenantControlPlaneShare
  // at the ceiling) and keeps metadata durability intact, but
  // smallTenantConfigSuccessRate recovers more slowly/less fully than
  // with a dedicated lane because unrelated tenants still share one
  // queue with the (now-bounded, but still present) hot tenant load.
  {
    id: "quota-only-drained",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-30-percent",
        [QUEUE_PARTITIONING_KEY]: "shared-queue",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "quota-only-fix-drained",
    values: {
      hotTenantControlPlaneShare: 29,
      schedulerQueueDepth: 35,
      schedulerLatencyMs: 320,
      metadataDbWritePressure: 34,
      configConvergenceAgeSeconds: 70,
      smallTenantConfigSuccessRate: 90,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "warning",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: controlPlaneStabilizingHealth,
  },
  {
    id: "quota-only-just-fixed",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: false },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "capped-30-percent",
        [QUEUE_PARTITIONING_KEY]: "shared-queue",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "quota-only-fix-draining",
    values: {
      hotTenantControlPlaneShare: 29,
      schedulerQueueDepth: 260,
      schedulerLatencyMs: 1100,
      metadataDbWritePressure: 55,
      configConvergenceAgeSeconds: 160,
      smallTenantConfigSuccessRate: 70,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "critical",
      hotTenantContainment: "quota-enforced",
    },
    componentHealth: controlPlaneCriticalHealth,
  },

  // ── ACCEPTABLE, not optimal: a dedicated lane protects unrelated
  // tenants' fairness RIGHT NOW (smallTenantConfigSuccessRate recovers),
  // but the hot tenant itself was never throttled --
  // hotTenantControlPlaneShare stays far above the 30% business ceiling.
  // This is the lane-only mitigation: a real, meaningful improvement for
  // the invariant "one tenant must not starve unrelated tenants," but it
  // does NOT satisfy "one tenant must not consume more than 30% of
  // shared control-plane capacity" -- a genuinely different business
  // rule left unaddressed.
  {
    id: "lane-only-no-quota",
    when: {
      triggerEquals: { hotTenantChurning: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "unthrottled",
        [QUEUE_PARTITIONING_KEY]: "dedicated-lane",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "lane-only-no-quota",
    values: {
      hotTenantControlPlaneShare: 70,
      schedulerQueueDepth: 260,
      schedulerLatencyMs: 1400,
      metadataDbWritePressure: 80,
      configConvergenceAgeSeconds: 95,
      smallTenantConfigSuccessRate: 97,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "warning",
      hotTenantContainment: "lane-only",
    },
    componentHealth: controlPlaneWarningHealth,
  },

  // ── PRESSURE-TRANSFER #2 / THE TEMPTING-BUT-WRONG PATH (worker
  // scaling): data-plane utilization is healthy from the very start of
  // this incident, so scaling the worker fleet addresses nothing about
  // the control-plane bottleneck. Worse: each additional worker opens
  // its own metadata-DB connection to fetch converged config, adding
  // concurrent READ load directly on top of the control plane's own
  // already-elevated WRITE pressure -- metadataDbWritePressure climbs to
  // 94, HIGHER than doing nothing at all (78-88), and once combined
  // pressure crosses the metadata DB's safe limit, real writes start
  // being dropped (metadataWriteLossCount > 0) -- a durability violation
  // the business invariant explicitly forbids. dataPlaneSuccessRate
  // still reads 100 at first, which is exactly what makes this path
  // tempting: the dashboard a candidate checks first looks unaffected
  // while real damage accrues underneath.
  //
  // The saturated variant is checked FIRST since it is strictly more
  // specific (also constrains controlPlaneSaturated=true); otherwise the
  // plain worker-scaling-trap rule below (which does not mention
  // controlPlaneSaturated at all, so matches regardless of its value)
  // would always win and the saturated state would be unreachable.
  {
    id: "worker-scaling-trap-saturated",
    when: {
      triggerEquals: { hotTenantChurning: true, controlPlaneSaturated: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "unthrottled",
        [WORKER_CONCURRENCY_KEY]: "scaled-up",
      },
    },
    incidentState: "worker-scaling-trap-saturated",
    values: {
      hotTenantControlPlaneShare: 80,
      schedulerQueueDepth: 610,
      schedulerLatencyMs: 3400,
      metadataDbWritePressure: 99,
      configConvergenceAgeSeconds: 240,
      smallTenantConfigSuccessRate: 22,
      workerUtilization: 91,
      dataPlaneSuccessRate: 88,
      metadataWriteLossCount: 11,
      controlPlaneStatus: "critical",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: controlPlaneCriticalDataPlaneSlippingHealth,
  },
  // Earlier in the incident (saturation wave has not hit yet): the
  // worker-scaling trap's metadata-DB pressure is already elevated, but
  // the data plane itself has not started to degrade yet.
  {
    id: "worker-scaling-trap",
    when: {
      triggerEquals: { hotTenantChurning: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "unthrottled",
        [WORKER_CONCURRENCY_KEY]: "scaled-up",
      },
    },
    incidentState: "worker-scaling-trap",
    values: {
      hotTenantControlPlaneShare: 74,
      schedulerQueueDepth: 430,
      schedulerLatencyMs: 2650,
      metadataDbWritePressure: 94,
      configConvergenceAgeSeconds: 110,
      smallTenantConfigSuccessRate: 39,
      workerUtilization: 85,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 3,
      controlPlaneStatus: "critical",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: workerScalingTrapHealth,
  },

  // ── UNSAFE SEQUENCING: backlog drain attempted/left running while the
  // hot tenant's quota is still unthrottled. The scheduler keeps
  // processing queued requests at full speed, but the hot tenant keeps
  // generating new ones just as fast, so schedulerQueueDepth never
  // actually falls, no matter how much elapsed time passes --
  // draining-before-isolating refills the backlog from the front as
  // fast as it drains from the back. Checked before the plain
  // unmitigated-churn fallback below since it is a more specific control
  // combination (drain mode is explicitly set, where unmitigated-churn
  // leaves it at the default).
  {
    id: "unsafe-drain-before-quota",
    when: {
      triggerEquals: { hotTenantChurning: true, drainWindowElapsed: true },
      controlEquals: {
        [HOT_TENANT_QUOTA_KEY]: "unthrottled",
        [BACKLOG_DRAIN_KEY]: "draining",
        [WORKER_CONCURRENCY_KEY]: "baseline",
      },
    },
    incidentState: "unsafe-drain-before-quota",
    values: {
      hotTenantControlPlaneShare: 76,
      schedulerQueueDepth: 480,
      schedulerLatencyMs: 2900,
      metadataDbWritePressure: 85,
      configConvergenceAgeSeconds: 100,
      smallTenantConfigSuccessRate: 35,
      workerUtilization: 55,
      dataPlaneSuccessRate: 99,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "critical",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: controlPlaneCriticalHealth,
  },

  // ── Fully unmitigated, saturation wave already hit: the backlog has
  // grown enough that convergence delay now visibly affects every
  // tenant, and the data plane itself has begun slipping (99, not 100).
  {
    id: "unmitigated-churn-saturated",
    when: {
      triggerEquals: { hotTenantChurning: true, controlPlaneSaturated: true },
    },
    incidentState: "unmitigated-churn-saturated",
    values: {
      hotTenantControlPlaneShare: 78,
      schedulerQueueDepth: 650,
      schedulerLatencyMs: 4200,
      metadataDbWritePressure: 88,
      configConvergenceAgeSeconds: 180,
      smallTenantConfigSuccessRate: 18,
      workerUtilization: 55,
      dataPlaneSuccessRate: 97,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "critical",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: controlPlaneCriticalHealth,
  },

  // ── THE MISLEADING-SYMPTOM TRAP: hot tenant churning, nothing
  // mitigated yet, before saturation has spread. Control plane is
  // already critical (queue depth, scheduler latency, metadata-DB write
  // pressure all elevated, small-tenant config success already
  // degraded) while dataPlaneSuccessRate still reads a perfect 100 --
  // this is the state a candidate who only checks data-plane health
  // will misread as "nothing is wrong."
  {
    id: "unmitigated-churn",
    when: {
      triggerEquals: { hotTenantChurning: true },
    },
    incidentState: "unmitigated-churn",
    values: {
      hotTenantControlPlaneShare: 72,
      schedulerQueueDepth: 420,
      schedulerLatencyMs: 2600,
      metadataDbWritePressure: 78,
      configConvergenceAgeSeconds: 95,
      smallTenantConfigSuccessRate: 41,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "critical",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: controlPlaneCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      hotTenantControlPlaneShare: 8,
      schedulerQueueDepth: 40,
      schedulerLatencyMs: 200,
      metadataDbWritePressure: 15,
      configConvergenceAgeSeconds: 10,
      smallTenantConfigSuccessRate: 100,
      workerUtilization: 55,
      dataPlaneSuccessRate: 100,
      metadataWriteLossCount: 0,
      controlPlaneStatus: "normal",
      hotTenantContainment: "unmitigated",
    },
    componentHealth: healthyHealth,
  },
];
