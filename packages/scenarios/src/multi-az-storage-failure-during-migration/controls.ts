import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Mirrors
// the reference incident's investigation-control pattern exactly.
export const INSPECT_AZ_A_VOLUME_HEALTH_KEY = "inspectAzAVolumeHealth";
export const INSPECT_MIGRATION_RETRY_LOGS_KEY = "inspectMigrationRetryLogs";
export const INSPECT_AZ_C_SATURATION_KEY = "inspectAzCSaturation";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The real fix: pause the migration's background copy traffic (which
// stops the controller's retry loop from re-targeting AZ-C every time
// AZ-A's degraded volumes time out) AND fail the live read/write path
// away from the degraded AZ-A over to AZ-C at a controlled rate — not
// simply "restart AZ-A" (plausible, but the volumes are the thing that
// degraded, a restart does not repair degraded disks) and not simply
// "failover everything to AZ-C instantly" (plausible, but dumping 100%
// of both migration AND live traffic onto AZ-C at once is exactly the
// cascade that is already hurting it).
export const PAUSE_MIGRATION_KEY = "pauseMigration";
export const MIGRATION_RETRY_BACKOFF_KEY = "migrationRetryBackoffSeconds";
export const RESTART_AZ_A_VOLUMES_KEY = "restartAzAVolumes";
export const FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY = "failoverTrafficToAzCPercent";

export const controls: ControlDefinition[] = [
  { key: INSPECT_AZ_A_VOLUME_HEALTH_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_MIGRATION_RETRY_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_AZ_C_SATURATION_KEY, allowedValues: [false, true], initialValue: false },
  { key: PAUSE_MIGRATION_KEY, allowedValues: [false, true], initialValue: false },
  { key: MIGRATION_RETRY_BACKOFF_KEY, allowedValues: [1, 5, 30, 120], initialValue: 1 },
  { key: RESTART_AZ_A_VOLUMES_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: FAILOVER_TRAFFIC_TO_AZ_C_PERCENT_KEY,
    allowedValues: [0, 25, 50, 100],
    initialValue: 0,
  },
];
