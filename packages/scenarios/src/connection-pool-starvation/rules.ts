import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DB_POOL_MAX_SIZE_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_POOL_CONFIG_KEY,
  RESTART_API_PODS_KEY,
  SCALE_API_REPLICAS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "healthy",
  "api-service": "healthy",
  "connection-pool": "healthy",
  "primary-db": "healthy",
};

const starvingHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "degraded",
  "api-service": "critical",
  "connection-pool": "critical",
  "primary-db": "healthy",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "deploy-pipeline": "degraded",
  "api-service": "degraded",
  "connection-pool": "degraded",
  "primary-db": "healthy",
};

/**
 * Authored rule table for Connection Pool Starvation, ordered
 * most-specific-first per this codebase's existing convention. The
 * distinct lesson here (vs. database-connection-saturation, which is
 * traffic-spike-driven): `trafficRequestsPerSecond` never moves from its
 * healthy baseline anywhere in this table — the regression is a dropped
 * config default (DB_POOL_MAX_SIZE 100 -> 10) shipped in a deploy, not
 * demand growth. `dbCpuPercent` also stays normal throughout (the
 * misleading "the database itself looks fine" signal — only the pool's
 * own utilization/queue depth are the tell). The only correct fix is
 * restoring the pool ceiling (dbPoolMaxSize >= 100); adding API replicas
 * or restarting pods are plausible-but-inferior remediations that do not
 * touch the actual ceiling, mirroring the reference incident's
 * inferior-path pattern. `diagnosisPath` captures what the candidate
 * correlated (deploy history + pool config, i.e. "this is a config
 * regression, not a traffic surge") by the time they applied the fix —
 * read generically by scoring.ts via the existing finalStringEquals
 * measure, and by the post-incident narrative via roleInIncident-tagged
 * metrics (candidate-ui.ts).
 */
export const starvationRules: Rule[] = [
  // ── Best path: investigated deploy history AND pool config (correctly
  // correlating "this is a config regression, not a traffic surge")
  // AND restored the pool ceiling.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { poolStarving: true },
      controlEquals: {
        [INSPECT_DEPLOY_HISTORY_KEY]: true,
        [INSPECT_POOL_CONFIG_KEY]: true,
      },
      controlAtLeast: { [DB_POOL_MAX_SIZE_KEY]: 100 },
    },
    incidentState: "recovering",
    values: {
      trafficRequestsPerSecond: 430,
      requestLatencyMs: 95,
      requestErrorRate: 0.1,
      poolUtilizationPercent: 24,
      poolWaitQueueDepth: 0,
      dbCpuPercent: 25,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 9,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the correlation first
  // (e.g. raised the pool size on a guess). The outage still resolves —
  // the fix is the fix — but the candidate never demonstrated they
  // understood this was a config regression rather than a traffic
  // surge, which is exactly what the investigation-quality scoring
  // dimension penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { poolStarving: true },
      controlAtLeast: { [DB_POOL_MAX_SIZE_KEY]: 100 },
    },
    incidentState: "recovering",
    values: {
      trafficRequestsPerSecond: 430,
      requestLatencyMs: 95,
      requestErrorRate: 0.1,
      poolUtilizationPercent: 24,
      poolWaitQueueDepth: 0,
      dbCpuPercent: 25,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 9,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path A: restarted API pods only. Restarting briefly
  // clears each pod's held connections, so there's a short dip, but the
  // pool ceiling itself (10) is still far below what normal traffic
  // needs, so the queue rebuilds within moments.
  {
    id: "restarted-pods-only",
    when: {
      triggerEquals: { poolStarving: true },
      controlEquals: { [RESTART_API_PODS_KEY]: true },
      controlAtMost: { [DB_POOL_MAX_SIZE_KEY]: 50 },
    },
    incidentState: "degraded",
    values: {
      trafficRequestsPerSecond: 425,
      requestLatencyMs: 3_800,
      requestErrorRate: 21,
      poolUtilizationPercent: 98,
      poolWaitQueueDepth: 310,
      dbCpuPercent: 26,
      apiPodRestartCount: 1,
      deployAuditLogScrollCount: 14,
      diagnosisPath: "restarted-pods-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path B: scaled out API replicas only. More pods means
  // more concurrent connection requests against the SAME 10-connection
  // ceiling — this doesn't relieve the pool, and can make queuing
  // slightly worse, not better. Plausible because "add capacity" is the
  // right instinct for a traffic-driven saturation incident — it's just
  // the wrong diagnosis here, which is the whole point of the scenario.
  {
    id: "scaled-replicas-only",
    when: {
      triggerEquals: { poolStarving: true },
      controlEquals: { [SCALE_API_REPLICAS_KEY]: true },
      controlAtMost: { [DB_POOL_MAX_SIZE_KEY]: 50 },
    },
    incidentState: "degraded",
    values: {
      trafficRequestsPerSecond: 428,
      requestLatencyMs: 4_300,
      requestErrorRate: 26,
      poolUtilizationPercent: 100,
      poolWaitQueueDepth: 360,
      dbCpuPercent: 27,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 12,
      diagnosisPath: "scaled-replicas-only",
    },
    componentHealth: starvingHealth,
  },

  // ── Partial relief: pool ceiling raised, but not enough (50 vs. the
  // 100 actually required to clear steady-state traffic).
  {
    id: "partial-pool-increase",
    when: {
      triggerEquals: { poolStarving: true },
      controlEquals: { [DB_POOL_MAX_SIZE_KEY]: 50 },
    },
    incidentState: "degraded",
    values: {
      trafficRequestsPerSecond: 422,
      requestLatencyMs: 740,
      requestErrorRate: 6,
      poolUtilizationPercent: 70,
      poolWaitQueueDepth: 60,
      dbCpuPercent: 25,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 10,
      diagnosisPath: "partial-pool-increase",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Baseline critical: pool starving, no mitigation applied yet.
  // Traffic is deliberately flat (never a surge) and DB CPU is
  // deliberately normal (the misleading "database itself is fine"
  // signal) — only pool utilization/queue depth are the tell.
  {
    id: "starving-baseline",
    when: { triggerEquals: { poolStarving: true } },
    incidentState: "starving",
    values: {
      trafficRequestsPerSecond: 418,
      requestLatencyMs: 4_600,
      requestErrorRate: 29,
      poolUtilizationPercent: 100,
      poolWaitQueueDepth: 380,
      dbCpuPercent: 24,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 8,
      diagnosisPath: "not-attempted",
    },
    componentHealth: starvingHealth,
  },

  // ── Deploy has shipped, pool not yet fully starved. Transitional state
  // between the regression landing and the pool actually exhausting —
  // traffic is still flat throughout.
  {
    id: "deploy-shipped-not-yet-starving",
    when: { triggerEquals: { regressionDeployed: true } },
    incidentState: "degraded",
    values: {
      trafficRequestsPerSecond: 420,
      requestLatencyMs: 310,
      requestErrorRate: 3,
      poolUtilizationPercent: 68,
      poolWaitQueueDepth: 20,
      dbCpuPercent: 24,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 3,
      diagnosisPath: "not-attempted",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Default/fallback: before the deploy ships.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      trafficRequestsPerSecond: 420,
      requestLatencyMs: 90,
      requestErrorRate: 0.1,
      poolUtilizationPercent: 22,
      poolWaitQueueDepth: 0,
      dbCpuPercent: 24,
      apiPodRestartCount: 0,
      deployAuditLogScrollCount: 0,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
