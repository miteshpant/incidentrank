import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import { POOL_SIZE_KEY, QUERY_TIMEOUT_MS_KEY, READ_REPLICA_ENABLED_KEY } from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "background-jobs": "healthy",
  "connection-pool": "healthy",
  "primary-db": "healthy",
  "read-replica": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "background-jobs": "degraded",
  "connection-pool": "degraded",
  "primary-db": "healthy",
  "read-replica": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "background-jobs": "critical",
  "connection-pool": "critical",
  "primary-db": "degraded",
  "read-replica": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "background-jobs": "healthy",
  "connection-pool": "healthy",
  "primary-db": "healthy",
  "read-replica": "healthy",
};

/**
 * Authored rule table for Database Connection Saturation, ordered
 * most-specific-first. Encodes a good-recovery path (scale the pool AND
 * offload reads to a replica), two partial-improvement paths (either
 * alone), a plausible-but-harmful path (raising the query timeout
 * instead of fixing pool capacity — queries hold connections longer and
 * the backlog grows), and a batch-job escalation that makes an
 * under-provisioned pool worse once a second workload competes for it.
 */
export const saturationRules: Rule[] = [
  // ── Good recovery: pool scaled AND read replica offloads reads, even
  // through the batch-job escalation.
  {
    id: "scaled-pool-with-replica",
    when: {
      triggerEquals: { saturating: true },
      controlAtLeast: { [POOL_SIZE_KEY]: 100 },
      controlEquals: { [READ_REPLICA_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      connectionUsage: 52,
      requestLatencyMs: 110,
      errorRate: 0.4,
      queuedConnections: 0,
      dbStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Harmful: raising the query timeout while the pool is still small.
  // Queries that would have failed fast now hold their connection far
  // longer, so the backlog grows worse, not better.
  {
    id: "high-timeout-small-pool-harmful",
    when: {
      triggerEquals: { saturating: true },
      controlAtMost: { [POOL_SIZE_KEY]: 50 },
      controlAtLeast: { [QUERY_TIMEOUT_MS_KEY]: 15_000 },
    },
    incidentState: "saturated-worsening",
    values: {
      connectionUsage: 100,
      requestLatencyMs: 14_200,
      errorRate: 31,
      queuedConnections: 420,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Batch job escalation: pool alone (no replica) was holding steady
  // under the initial spike, but the overlapping batch job pushes it
  // back into critical.
  {
    id: "batch-job-overwhelms-pool-only",
    when: {
      triggerEquals: { saturating: true, batchJobRunning: true },
      controlAtLeast: { [POOL_SIZE_KEY]: 100 },
      controlEquals: { [READ_REPLICA_ENABLED_KEY]: false },
    },
    incidentState: "saturated",
    values: {
      connectionUsage: 97,
      requestLatencyMs: 4_100,
      errorRate: 19,
      queuedConnections: 260,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial improvement, with a visible precursor: pool scaled, but
  // reads still compete with writes on the primary (no replica offload),
  // AND background batch demand is already visibly accumulating
  // (queuedConnections climbing from 40 to 165, candidate-visible on the
  // metrics panel) — the honest signal that this pool-only mitigation is
  // not yet durable, before the batch job fully engages. Ordered before
  // the plain scaled-pool-only rule below (more specific: additionally
  // requires batchPressureRising) and after batch-job-overwhelms-pool-only
  // (which wins once the batch job fully engages).
  {
    id: "batch-pressure-rising-pool-only",
    when: {
      triggerEquals: { saturating: true, batchPressureRising: true },
      controlAtLeast: { [POOL_SIZE_KEY]: 100 },
      controlEquals: { [READ_REPLICA_ENABLED_KEY]: false },
    },
    incidentState: "degraded-batch-pressure-rising",
    values: {
      connectionUsage: 84,
      requestLatencyMs: 1_350,
      errorRate: 4.5,
      queuedConnections: 165,
      dbStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: pool scaled, but reads still compete with
  // writes on the primary (no replica offload). Only reachable before
  // batchPressureRising fires (t<3min) — after that, the rising-pressure
  // tier above or the full batch-job-overwhelms-pool-only tier applies.
  {
    id: "scaled-pool-only",
    when: {
      triggerEquals: { saturating: true },
      controlAtLeast: { [POOL_SIZE_KEY]: 100 },
    },
    incidentState: "degraded",
    values: {
      connectionUsage: 78,
      requestLatencyMs: 820,
      errorRate: 3.5,
      queuedConnections: 40,
      dbStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: replica enabled, but the pool is still too
  // small for the write path, which is unaffected by read offload.
  {
    id: "replica-only-small-pool",
    when: {
      triggerEquals: { saturating: true },
      controlAtMost: { [POOL_SIZE_KEY]: 50 },
      controlEquals: { [READ_REPLICA_ENABLED_KEY]: true },
    },
    incidentState: "degraded",
    values: {
      connectionUsage: 90,
      requestLatencyMs: 2_600,
      errorRate: 9,
      queuedConnections: 140,
      dbStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: small pool, default timeout, no replica.
  {
    id: "saturated-default",
    when: { triggerEquals: { saturating: true } },
    incidentState: "saturated",
    values: {
      connectionUsage: 98,
      requestLatencyMs: 4_500,
      errorRate: 22,
      queuedConnections: 310,
      dbStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no spike active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      connectionUsage: 40,
      requestLatencyMs: 80,
      errorRate: 0.1,
      queuedConnections: 0,
      dbStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
