import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done`-style state keys, which the rule table
// reads to determine the authored `diagnosisPath` value (see rules.ts).
// This mirrors the reference incident's investigation-control pattern
// exactly (packages/scenarios/src/checkout-payment-inventory-redis-
// contention/controls.ts) — the engine has no separate "investigation
// action" primitive by design.
export const INSPECT_LOCK_SERVICE_LOGS_KEY = "inspectLockServiceLogs";
export const INSPECT_LEDGER_ORDERING_KEY = "inspectLedgerOrdering";
export const INSPECT_RATE_LIMITER_WINDOWS_KEY = "inspectRateLimiterWindows";
export const INSPECT_NTP_SYNC_STATUS_KEY = "inspectNtpSyncStatus";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The real fix: force every fleet node to resync against a healthy NTP
// source, then force a clean leader re-election once clocks agree again
// (re-election alone, while clocks are still skewed, just re-elects
// another equally-unreliable leader — see rules.ts).
export const RESYNC_FLEET_CLOCKS_KEY = "resyncFleetClocks";
export const FORCE_LEADER_REELECTION_KEY = "forceLeaderReelection";

// Plausible-but-inferior remediations: restarting each affected
// subsystem individually. Each restart clears that subsystem's own
// in-memory state for a short window, producing a brief, misleading dip
// — but the fleet's clocks are still skewed underneath, so each
// "fixed" subsystem independently relapses once new timestamp-ordered
// decisions accumulate again.
export const RESTART_LOCK_SERVICE_KEY = "restartLockService";
export const RESTART_LEDGER_SERVICE_KEY = "restartLedgerService";
export const RESTART_RATE_LIMITER_KEY = "restartRateLimiter";

export const controls: ControlDefinition[] = [
  { key: INSPECT_LOCK_SERVICE_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_LEDGER_ORDERING_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_RATE_LIMITER_WINDOWS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_NTP_SYNC_STATUS_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESYNC_FLEET_CLOCKS_KEY, allowedValues: [false, true], initialValue: false },
  { key: FORCE_LEADER_REELECTION_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_LOCK_SERVICE_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_LEDGER_SERVICE_KEY, allowedValues: [false, true], initialValue: false },
  { key: RESTART_RATE_LIMITER_KEY, allowedValues: [false, true], initialValue: false },
];
