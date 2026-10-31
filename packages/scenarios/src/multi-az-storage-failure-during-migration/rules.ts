import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
  INSPECT_AZ_A_VOLUME_HEALTH_KEY,
  INSPECT_AZ_C_SATURATION_KEY,
  INSPECT_MIGRATION_RETRY_LOGS_KEY,
  PAUSE_MIGRATION_KEY,
  RESTART_AZ_A_VOLUMES_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "app-service": "healthy",
  "storage-router": "healthy",
  "storage-az-a": "healthy",
  "storage-az-b": "healthy",
  "storage-az-c": "healthy",
  "migration-controller": "healthy",
};

const degradedSourceHealth: Record<string, ComponentHealth> = {
  "app-service": "healthy",
  "storage-router": "healthy",
  "storage-az-a": "degraded",
  "storage-az-b": "healthy",
  "storage-az-c": "healthy",
  "migration-controller": "degraded",
};

const cascadingHealth: Record<string, ComponentHealth> = {
  "app-service": "critical",
  "storage-router": "critical",
  "storage-az-a": "critical",
  "storage-az-b": "healthy",
  "storage-az-c": "critical",
  "migration-controller": "critical",
};

const recoveredAfterCascadeHealth: Record<string, ComponentHealth> = {
  "app-service": "healthy",
  "storage-router": "healthy",
  "storage-az-a": "degraded",
  "storage-az-b": "healthy",
  "storage-az-c": "healthy",
  "migration-controller": "degraded",
};

const overloadedAzCHealth: Record<string, ComponentHealth> = {
  "app-service": "critical",
  "storage-router": "critical",
  "storage-az-a": "critical",
  "storage-az-b": "healthy",
  "storage-az-c": "critical",
  "migration-controller": "critical",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "app-service": "degraded",
  "storage-router": "degraded",
  "storage-az-a": "degraded",
  "storage-az-b": "healthy",
  "storage-az-c": "degraded",
  "migration-controller": "healthy",
};

/**
 * Authored rule table for the Multi-AZ Storage Failure During Live
 * Migration incident — a cascading-structure scenario (ScenarioStructure
 * "cascading"): the FIRST failure (AZ-A's volumes degrading mid-
 * migration) is not itself the outage. It only becomes one once the
 * migration controller's own retry logic, re-attempting every failed
 * AZ-A copy operation, begins re-targeting AZ-C — the one AZ that was
 * still fully healthy and already carrying live production traffic.
 * That retry amplification is the cascade: a second, distinct failure
 * (AZ-C saturation) caused entirely by the system's own automated
 * response to the first failure, not by any new external trigger. This
 * is deliberately NOT a single-shot primary-database-failover (there is
 * no single primary here — AZ-A is a migration source, not "the"
 * primary) and NOT a schema-migration-under-live-traffic correctness
 * problem (there is no live-traffic correctness invariant at stake
 * here — the failure mode is pure cascading overload, not divergent
 * data).
 *
 * `diagnosisPath` captures what the candidate actually did by
 * completion: correlated investigation (looked at AZ-A's volumes, the
 * migration controller's retry logs, AND AZ-C's own saturation) before
 * applying the two-part fix, applied the two-part fix without
 * investigating first (guessed), or chased one of two plausible-but-
 * inferior single-action remediations — restarting AZ-A's volumes
 * (treats the symptom on the wrong side: the volumes are a hardware/
 * infra degradation a process restart cannot repair) or failing 100%
 * of live traffic onto AZ-C without first stopping the migration retry
 * storm (this ACCELERATES the cascade rather than stopping it, since
 * AZ-C is now absorbing both the full live-traffic load AND the
 * uninterrupted retry storm at once).
 */
export const multiAzStorageFailureDuringMigrationRules: Rule[] = [
  // ── Best path: investigated all three signal sources AND applied the
  // full two-part fix — paused/backed-off the migration retry storm
  // AND failed live traffic over to AZ-C at a controlled (not 100%) rate.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { cascadeToAzC: true },
      controlEquals: {
        [INSPECT_AZ_A_VOLUME_HEALTH_KEY]: true,
        [INSPECT_MIGRATION_RETRY_LOGS_KEY]: true,
        [INSPECT_AZ_C_SATURATION_KEY]: true,
        [PAUSE_MIGRATION_KEY]: true,
      },
      controlAtLeast: { [FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY]: 50 },
    },
    incidentState: "recovering",
    values: {
      appServiceErrorRatePercent: 0.3,
      appServiceP99LatencyMs: 110,
      azAVolumeIoErrorRatePercent: 38,
      migrationCopyThroughputMBps: 0,
      migrationRetryRatePerMinute: 0,
      azCConnectionUtilizationPercent: 48,
      azCP99LatencyMs: 60,
      migrationProgressPercent: 35,
      controllerCpuPercent: 10,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: recoveredAfterCascadeHealth,
  },

  // ── Correct fix, applied without investigating the correlation first
  // (guessed the same two-part remediation on instinct). The cascade
  // still stops — the fix is the fix — but the candidate never
  // demonstrated they understood WHY, which investigation-quality
  // scoring penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { cascadeToAzC: true },
      controlEquals: { [PAUSE_MIGRATION_KEY]: true },
      controlAtLeast: { [FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY]: 50 },
    },
    incidentState: "recovering",
    values: {
      appServiceErrorRatePercent: 0.3,
      appServiceP99LatencyMs: 110,
      azAVolumeIoErrorRatePercent: 38,
      migrationCopyThroughputMBps: 0,
      migrationRetryRatePerMinute: 0,
      azCConnectionUtilizationPercent: 48,
      azCP99LatencyMs: 60,
      migrationProgressPercent: 35,
      controllerCpuPercent: 10,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: recoveredAfterCascadeHealth,
  },

  // ── Partial relief: migration paused (stops the retry storm) but
  // live traffic never failed over off degraded AZ-A — AZ-C stops
  // getting worse, but app-service keeps routing part of its load at
  // the still-degraded AZ-A, so customer impact only partially recovers.
  {
    id: "paused-migration-only",
    when: {
      triggerEquals: { cascadeToAzC: true },
      controlEquals: { [PAUSE_MIGRATION_KEY]: true },
      controlAtMost: { [FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY]: 25 },
    },
    incidentState: "degraded",
    values: {
      appServiceErrorRatePercent: 9,
      appServiceP99LatencyMs: 1_300,
      azAVolumeIoErrorRatePercent: 40,
      migrationCopyThroughputMBps: 0,
      migrationRetryRatePerMinute: 0,
      azCConnectionUtilizationPercent: 55,
      azCP99LatencyMs: 220,
      migrationProgressPercent: 35,
      controllerCpuPercent: 9,
      diagnosisPath: "paused-migration-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path A: restarted AZ-A's volumes only. A process/volume
  // restart does nothing for a hardware/infra-level I/O degradation,
  // and the migration controller keeps retrying against AZ-A, so the
  // cascade onto AZ-C continues completely unabated.
  {
    id: "restarted-az-a-only",
    when: {
      triggerEquals: { cascadeToAzC: true },
      controlEquals: { [RESTART_AZ_A_VOLUMES_KEY]: true },
      controlAtMost: { [FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY]: 25 },
    },
    incidentState: "critical",
    values: {
      appServiceErrorRatePercent: 22,
      appServiceP99LatencyMs: 2_600,
      azAVolumeIoErrorRatePercent: 61,
      migrationCopyThroughputMBps: 4,
      migrationRetryRatePerMinute: 48,
      azCConnectionUtilizationPercent: 94,
      azCP99LatencyMs: 1_850,
      migrationProgressPercent: 35,
      controllerCpuPercent: 88,
      diagnosisPath: "restarted-az-a-only",
    },
    componentHealth: cascadingHealth,
  },

  // ── Inferior path B: failed 100% of live traffic onto AZ-C WITHOUT
  // stopping the migration retry storm first. This actively makes
  // things worse — AZ-C now absorbs the full live-traffic load AND the
  // uninterrupted retry storm simultaneously, the exact double-load
  // the cascade already created, just applied deliberately instead of
  // accidentally.
  {
    id: "full-failover-without-pausing-migration",
    when: {
      triggerEquals: { cascadeToAzC: true },
      controlEquals: { [PAUSE_MIGRATION_KEY]: false },
      controlAtLeast: { [FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY]: 100 },
    },
    incidentState: "critical",
    values: {
      appServiceErrorRatePercent: 31,
      appServiceP99LatencyMs: 3_400,
      azAVolumeIoErrorRatePercent: 58,
      migrationCopyThroughputMBps: 2,
      migrationRetryRatePerMinute: 60,
      azCConnectionUtilizationPercent: 99,
      azCP99LatencyMs: 2_900,
      migrationProgressPercent: 35,
      controllerCpuPercent: 92,
      diagnosisPath: "full-failover-without-pausing-migration",
    },
    componentHealth: overloadedAzCHealth,
  },

  // ── Cascade baseline: AZ-A degraded, migration retry storm actively
  // hammering AZ-C, no mitigation applied yet.
  {
    id: "cascade-baseline",
    when: { triggerEquals: { cascadeToAzC: true } },
    incidentState: "cascading",
    values: {
      appServiceErrorRatePercent: 24,
      appServiceP99LatencyMs: 2_900,
      azAVolumeIoErrorRatePercent: 55,
      migrationCopyThroughputMBps: 6,
      migrationRetryRatePerMinute: 54,
      azCConnectionUtilizationPercent: 99,
      azCP99LatencyMs: 2_100,
      migrationProgressPercent: 35,
      controllerCpuPercent: 90,
      diagnosisPath: "not-attempted",
    },
    componentHealth: cascadingHealth,
  },

  // ── First failure only: AZ-A's volumes have degraded, but the
  // controller's retries haven't yet amplified onto AZ-C. The window
  // where a candidate could intervene before the cascade even starts.
  {
    id: "az-a-degraded-only",
    when: { triggerEquals: { azADegraded: true } },
    incidentState: "degraded",
    values: {
      appServiceErrorRatePercent: 1.5,
      appServiceP99LatencyMs: 180,
      azAVolumeIoErrorRatePercent: 14,
      migrationCopyThroughputMBps: 70,
      migrationRetryRatePerMinute: 11,
      azCConnectionUtilizationPercent: 28,
      azCP99LatencyMs: 50,
      migrationProgressPercent: 35,
      controllerCpuPercent: 32,
      diagnosisPath: "not-attempted",
    },
    componentHealth: degradedSourceHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      appServiceErrorRatePercent: 0.2,
      appServiceP99LatencyMs: 90,
      azAVolumeIoErrorRatePercent: 0.5,
      migrationCopyThroughputMBps: 180,
      migrationRetryRatePerMinute: 2,
      azCConnectionUtilizationPercent: 22,
      azCP99LatencyMs: 40,
      migrationProgressPercent: 35,
      controllerCpuPercent: 15,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
