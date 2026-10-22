import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  READ_ROUTING_MODE_KEY,
  REPLICATION_BATCH_SIZE_KEY,
  WRITE_THROTTLE_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "write-service": "healthy",
  "primary-database": "healthy",
  "read-replica": "healthy",
  "read-service": "healthy",
  "reporting-job": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "write-service": "healthy",
  "primary-database": "degraded",
  "read-replica": "degraded",
  "read-service": "degraded",
  "reporting-job": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "write-service": "degraded",
  "primary-database": "critical",
  "read-replica": "critical",
  "read-service": "degraded",
  "reporting-job": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "write-service": "healthy",
  "primary-database": "healthy",
  "read-replica": "healthy",
  "read-service": "healthy",
  "reporting-job": "healthy",
};

/**
 * Authored rule table for Read Replica Lag, ordered most-specific-first.
 * Encodes a harmful trap (routing everything to the primary — this
 * "fixes" staleness by eliminating the replica's purpose entirely,
 * overloading the primary with both writes and reads at once, worse than
 * the lag itself), a clean full-recovery path (route only
 * recently-written data's reads to the primary, keep batch size
 * reasonable), a cost/availability-wasting partial (always-primary
 * routing plus write throttling masks the symptom by sacrificing write
 * throughput, never fixing replication itself), a smaller partial
 * (shrinking batch size alone helps lag a little without a routing
 * fix), a baseline-critical default, and a healthy fallback.
 */
export const replicaLagRules: Rule[] = [
  // ── Cost/availability-wasting partial: always-primary routing plus
  // write throttling masks the symptom — the primary survives because
  // writes are deliberately slowed down, but replication lag itself is
  // never addressed and write throughput is sacrificed. Checked before
  // the more general always-primary-harmful rule below, since this is
  // the more specific (routing + throttle) combination.
  {
    id: "throttled-primary-masked",
    when: {
      triggerEquals: { writeBurstActive: true },
      controlEquals: {
        [READ_ROUTING_MODE_KEY]: "always-primary",
        [WRITE_THROTTLE_ENABLED_KEY]: true,
      },
    },
    incidentState: "masked-lag",
    values: {
      replicationLagMs: 4_000,
      staleReadRate: 0.1,
      writeLatencyMs: 900,
      queuedWrites: 60,
      replicaStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful: routing all reads to the primary (without throttling)
  // while a write burst is active — the primary now serves every write
  // AND every read at once, which is worse than letting the replica lag,
  // not a fix for it.
  {
    id: "always-primary-harmful",
    when: {
      triggerEquals: { writeBurstActive: true },
      controlEquals: { [READ_ROUTING_MODE_KEY]: "always-primary" },
    },
    incidentState: "primary-overloaded",
    values: {
      replicationLagMs: 9_500,
      staleReadRate: 0.2,
      writeLatencyMs: 2_800,
      queuedWrites: 420,
      replicaStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: route only recently-written data's reads to the
  // primary (read-your-writes), leave the replica serving everything
  // else, and keep replication batch size reasonable.
  {
    id: "primary-for-recent-writes-recovery",
    when: {
      triggerEquals: { writeBurstActive: true },
      controlEquals: { [READ_ROUTING_MODE_KEY]: "primary-for-recent-writes" },
    },
    incidentState: "recovering",
    values: {
      replicationLagMs: 120,
      staleReadRate: 0.6,
      writeLatencyMs: 35,
      queuedWrites: 0,
      replicaStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: smaller replication batch size alone, no
  // routing fix — helps lag somewhat without addressing staleness for
  // consumers still reading from the replica.
  {
    id: "small-batch-partial",
    when: {
      triggerEquals: { writeBurstActive: true },
      controlEquals: { [REPLICATION_BATCH_SIZE_KEY]: "small" },
    },
    incidentState: "degraded",
    values: {
      replicationLagMs: 2_200,
      staleReadRate: 4,
      writeLatencyMs: 25,
      queuedWrites: 0,
      replicaStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: write burst active, no mitigation (default
  // always-replica routing, medium batch size).
  {
    id: "lag-critical-default",
    when: { triggerEquals: { writeBurstActive: true } },
    incidentState: "lagging",
    values: {
      replicationLagMs: 8_000,
      staleReadRate: 15,
      writeLatencyMs: 22,
      queuedWrites: 0,
      replicaStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no write burst active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      replicationLagMs: 80,
      staleReadRate: 0.5,
      writeLatencyMs: 20,
      queuedWrites: 0,
      replicaStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
