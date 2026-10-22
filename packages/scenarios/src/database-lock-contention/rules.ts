import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BATCH_JOB_CHUNK_SIZE_KEY,
  BATCH_JOB_CONCURRENCY_KEY,
  LOCK_TIMEOUT_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "primary-database": "healthy",
  "batch-job-worker": "healthy",
  "transaction-queue": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-service": "degraded",
  "primary-database": "degraded",
  "batch-job-worker": "healthy",
  "transaction-queue": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-service": "critical",
  "primary-database": "critical",
  "batch-job-worker": "degraded",
  "transaction-queue": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-service": "healthy",
  "primary-database": "healthy",
  "batch-job-worker": "healthy",
  "transaction-queue": "healthy",
};

/**
 * Authored rule table for Database Lock Contention, ordered
 * most-specific-first. Encodes a harmful trap (a much larger batch chunk
 * size, thinking "fewer round trips finishes faster," actually holds
 * each row lock far longer and worsens blocking), a masking path (a very
 * long lock timeout stops transactions from erroring out, but they now
 * silently queue instead — the underlying contention is unchanged), a
 * clean recovery path (small chunks + low concurrency, so each
 * transaction holds its lock only briefly), a partial-improvement path,
 * an escalation once a second concurrent batch job starts, a
 * baseline-critical default, and a healthy fallback.
 */
export const contentionRules: Rule[] = [
  // ── Harmful: a much larger chunk size — fewer, bigger transactions —
  // holds each lock for far longer per transaction, worsening blocking
  // even though the batch job itself finishes in fewer round trips.
  {
    id: "oversized-chunks-harmful",
    when: {
      triggerEquals: { batchJobRunning: true },
      controlAtLeast: { [BATCH_JOB_CHUNK_SIZE_KEY]: 50_000 },
    },
    incidentState: "severe-contention",
    values: {
      blockedTransactions: 340,
      queryLatencyP99Ms: 8_500,
      lockWaitTimeMs: 6_200,
      timedOutTransactions: 60,
      lockStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: small chunk size and low concurrency — each
  // transaction holds its row locks only briefly, and fewer concurrent
  // workers means fewer simultaneous lock holders.
  {
    id: "small-chunks-low-concurrency-recovery",
    when: {
      triggerEquals: { batchJobRunning: true },
      controlAtMost: { [BATCH_JOB_CHUNK_SIZE_KEY]: 100, [BATCH_JOB_CONCURRENCY_KEY]: 2 },
    },
    incidentState: "recovering",
    values: {
      blockedTransactions: 2,
      queryLatencyP99Ms: 75,
      lockWaitTimeMs: 25,
      timedOutTransactions: 0,
      lockStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Masking: a very long lock timeout stops transactions from timing
  // out, so the error rate looks fine — but they now queue silently
  // instead of failing fast, and the underlying contention is unchanged.
  {
    id: "long-timeout-masks-contention",
    when: {
      triggerEquals: { batchJobRunning: true },
      controlAtLeast: { [LOCK_TIMEOUT_MS_KEY]: 300_000 },
    },
    incidentState: "masked-contention",
    values: {
      blockedTransactions: 210,
      queryLatencyP99Ms: 4_800,
      lockWaitTimeMs: 4_500,
      timedOutTransactions: 0,
      lockStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: chunk size reduced, but concurrency still
  // high — less lock time per transaction, but still many concurrent
  // lock holders.
  {
    id: "smaller-chunks-only",
    when: {
      triggerEquals: { batchJobRunning: true },
      controlAtMost: { [BATCH_JOB_CHUNK_SIZE_KEY]: 1_000 },
    },
    incidentState: "degraded",
    values: {
      blockedTransactions: 55,
      queryLatencyP99Ms: 1_400,
      lockWaitTimeMs: 950,
      timedOutTransactions: 8,
      lockStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Escalation: a second concurrent batch job joins while no
  // mitigation is in place — worse than the single-job baseline.
  {
    id: "second-workload-escalation",
    when: { triggerEquals: { batchJobRunning: true, secondWorkloadActive: true } },
    incidentState: "severe-contention",
    values: {
      blockedTransactions: 310,
      queryLatencyP99Ms: 7_200,
      lockWaitTimeMs: 5_800,
      timedOutTransactions: 50,
      lockStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: batch job running, no mitigation.
  {
    id: "contention-critical-default",
    when: { triggerEquals: { batchJobRunning: true } },
    incidentState: "contending",
    values: {
      blockedTransactions: 180,
      queryLatencyP99Ms: 5_200,
      lockWaitTimeMs: 4_100,
      timedOutTransactions: 35,
      lockStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no batch job running.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      blockedTransactions: 0,
      queryLatencyP99Ms: 60,
      lockWaitTimeMs: 20,
      timedOutTransactions: 0,
      lockStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
