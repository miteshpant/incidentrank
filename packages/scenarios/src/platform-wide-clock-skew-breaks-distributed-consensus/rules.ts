import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  FORCE_LEADER_REELECTION_KEY,
  INSPECT_LEDGER_ORDERING_KEY,
  INSPECT_LOCK_SERVICE_LOGS_KEY,
  INSPECT_NTP_SYNC_STATUS_KEY,
  INSPECT_RATE_LIMITER_WINDOWS_KEY,
  RESTART_LEDGER_SERVICE_KEY,
  RESTART_LOCK_SERVICE_KEY,
  RESTART_RATE_LIMITER_KEY,
  RESYNC_FLEET_CLOCKS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "ntp-time-source": "healthy",
  "lock-service": "healthy",
  "ledger-service": "healthy",
  "rate-limiter": "healthy",
  "fleet-nodes": "healthy",
};

const skewedHealth: Record<string, ComponentHealth> = {
  "ntp-time-source": "critical",
  "lock-service": "critical",
  "ledger-service": "critical",
  "rate-limiter": "critical",
  "fleet-nodes": "critical",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "ntp-time-source": "degraded",
  "lock-service": "degraded",
  "ledger-service": "degraded",
  "rate-limiter": "degraded",
  "fleet-nodes": "degraded",
};

const widenedSkewHealth: Record<string, ComponentHealth> = {
  "ntp-time-source": "critical",
  "lock-service": "critical",
  "ledger-service": "critical",
  "rate-limiter": "critical",
  "fleet-nodes": "degraded",
};

/**
 * Authored rule table for the Platform-Wide Clock Skew Breaks Distributed
 * Consensus incident (Phase 6D, principal). ONE root cause — the fleet's
 * NTP sync job failing silently, letting node clocks drift apart — casts
 * SIMULTANEOUS, seemingly-unrelated failures across three independent
 * subsystems that share no direct dependency on each other: the
 * distributed lock service starts split-brained (two nodes both believe
 * they hold a lease because their clocks disagree about which lease
 * token is newer), the event-sourcing ledger starts reordering writes
 * (its conflict resolution is timestamp-based), and the rate limiter
 * starts false-throttling (its sliding window is timestamp-bucketed).
 * None of the three calls any of the others — the only thing a candidate
 * can trace back to is the NTP sync status itself, several hops upstream
 * of every symptom.
 *
 * This is deliberately a causal-UNIFICATION lesson, distinct from the
 * existing single-subsystem split-brain/leader-election/quorum-loss
 * scenarios in this catalog: those incidents are explained end-to-end by
 * fixing ONE subsystem. Here, restarting any one of the three affected
 * subsystems individually (RESTART_LOCK_SERVICE_KEY /
 * RESTART_LEDGER_SERVICE_KEY / RESTART_RATE_LIMITER_KEY) produces a
 * brief, misleading dip in that subsystem's own symptom — its in-memory
 * state is cleared — but the underlying clocks are still skewed, so the
 * "fixed" subsystem relapses on its own within the same incident, and
 * the other two subsystems are completely unaffected by it, because they
 * never depended on it. Only resyncing the fleet's clocks addresses all
 * three at once. Forcing a leader re-election WITHOUT first resyncing
 * clocks just re-elects another equally-unreliable leader under the same
 * skew, so lock-service split-brain barely improves; re-election is only
 * useful as a cheap way to converge the lock service onto the resynced
 * clocks once they actually agree again.
 *
 * `diagnosisPath` captures what the candidate correlated by the time
 * they resynced clocks: investigated the NTP source itself plus
 * correlated across the three affected subsystems before fixing
 * ("unified-then-fixed"), resynced without investigating the shared
 * cause first ("guessed-fix"), chased one of the three single-subsystem
 * restarts ("restarted-<x>-only"), or did nothing ("not-attempted"). Read
 * generically by scoring.ts via the existing finalStringEquals measure,
 * and by the post-incident narrative via roleInIncident-tagged metrics
 * (candidate-ui.ts) — never a bespoke mechanism.
 */
export const clockSkewRules: Rule[] = [
  // ── Best path: investigated the NTP sync status AND at least one of
  // the three affected subsystems directly, THEN resynced fleet clocks
  // and forced a clean leader re-election. All three subsystems recover
  // together, proving the candidate understood the shared upstream cause
  // rather than chasing any one symptom.
  {
    id: "unified-then-fixed",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: {
        [INSPECT_NTP_SYNC_STATUS_KEY]: true,
        [INSPECT_LOCK_SERVICE_LOGS_KEY]: true,
        [INSPECT_LEDGER_ORDERING_KEY]: true,
        [INSPECT_RATE_LIMITER_WINDOWS_KEY]: true,
        [RESYNC_FLEET_CLOCKS_KEY]: true,
        [FORCE_LEADER_REELECTION_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      fleetClockSkewMs: 10,
      lockServiceSplitBrainCount: 0,
      ledgerOutOfOrderWriteRatePercent: 0.1,
      rateLimiterFalseThrottleRatePercent: 0.2,
      ntpSyncOffsetMs: 6,
      apiRequestVolumePerSecond: 4_150,
      diagnosisPath: "unified-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating/correlating first
  // (e.g. resynced clocks and forced re-election on a guess, or after
  // inspecting only one subsystem). The outage still resolves — the fix
  // is the fix — but the candidate never demonstrated they understood
  // this was ONE shared root cause across three subsystems, which is
  // exactly what dataIntegrity scoring penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: {
        [RESYNC_FLEET_CLOCKS_KEY]: true,
        [FORCE_LEADER_REELECTION_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      fleetClockSkewMs: 10,
      lockServiceSplitBrainCount: 0,
      ledgerOutOfOrderWriteRatePercent: 0.1,
      rateLimiterFalseThrottleRatePercent: 0.2,
      ntpSyncOffsetMs: 6,
      apiRequestVolumePerSecond: 4_150,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial: clocks resynced but leader re-election never forced.
  // Ledger ordering and rate-limiter windows recover (they read the
  // corrected clock directly), but the lock service's existing
  // split-brained leader was elected under the OLD skewed clocks and
  // stays wedged until a re-election actually happens.
  {
    id: "resynced-without-reelection",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: { [RESYNC_FLEET_CLOCKS_KEY]: true, [FORCE_LEADER_REELECTION_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      fleetClockSkewMs: 10,
      lockServiceSplitBrainCount: 2,
      ledgerOutOfOrderWriteRatePercent: 0.2,
      rateLimiterFalseThrottleRatePercent: 0.3,
      ntpSyncOffsetMs: 6,
      apiRequestVolumePerSecond: 4_180,
      diagnosisPath: "resynced-without-reelection",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path A: restarted the lock service only. Split-brain
  // count briefly clears from the restart, but clocks are still skewed —
  // a new split-brain forms once two nodes race another lease renewal —
  // and the ledger/rate-limiter symptoms are completely untouched (they
  // never depended on lock-service at all).
  {
    id: "restarted-lock-service-only",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: { [RESTART_LOCK_SERVICE_KEY]: true, [FORCE_LEADER_REELECTION_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      fleetClockSkewMs: 820,
      lockServiceSplitBrainCount: 3,
      ledgerOutOfOrderWriteRatePercent: 6.5,
      rateLimiterFalseThrottleRatePercent: 9.2,
      ntpSyncOffsetMs: 640,
      apiRequestVolumePerSecond: 3_900,
      diagnosisPath: "restarted-lock-service-only",
    },
    componentHealth: skewedHealth,
  },

  // ── Inferior path B: restarted the ledger service only. Out-of-order
  // write rate briefly clears, but clocks are still skewed so reordering
  // resumes; lock-service and rate-limiter are untouched.
  {
    id: "restarted-ledger-service-only",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: { [RESTART_LEDGER_SERVICE_KEY]: true, [FORCE_LEADER_REELECTION_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      fleetClockSkewMs: 820,
      lockServiceSplitBrainCount: 4,
      ledgerOutOfOrderWriteRatePercent: 5.8,
      rateLimiterFalseThrottleRatePercent: 9.4,
      ntpSyncOffsetMs: 640,
      apiRequestVolumePerSecond: 3_880,
      diagnosisPath: "restarted-ledger-service-only",
    },
    componentHealth: skewedHealth,
  },

  // ── Inferior path C: restarted the rate limiter only. False-throttle
  // rate briefly clears, but clocks are still skewed so throttling
  // misbehaves again; lock-service and ledger are untouched.
  {
    id: "restarted-rate-limiter-only",
    when: {
      triggerEquals: { clockSkewActive: true },
      controlEquals: { [RESTART_RATE_LIMITER_KEY]: true, [FORCE_LEADER_REELECTION_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      fleetClockSkewMs: 820,
      lockServiceSplitBrainCount: 4,
      ledgerOutOfOrderWriteRatePercent: 6.8,
      rateLimiterFalseThrottleRatePercent: 3.1,
      ntpSyncOffsetMs: 640,
      apiRequestVolumePerSecond: 3_910,
      diagnosisPath: "restarted-rate-limiter-only",
    },
    componentHealth: skewedHealth,
  },

  // ── Wider cascade once skew has gone unresynced long enough (second
  // timed event) — worse than the initial baseline.
  {
    id: "skew-widened-default",
    when: { triggerEquals: { clockSkewActive: true, skewCascadeWidened: true } },
    incidentState: "wide-skew",
    values: {
      fleetClockSkewMs: 2_400,
      lockServiceSplitBrainCount: 6,
      ledgerOutOfOrderWriteRatePercent: 11.0,
      rateLimiterFalseThrottleRatePercent: 15.5,
      ntpSyncOffsetMs: 2_100,
      apiRequestVolumePerSecond: 3_400,
      diagnosisPath: "not-attempted",
    },
    componentHealth: widenedSkewHealth,
  },

  // ── Baseline critical: clock skew active, no mitigation applied yet.
  // All three subsystems degrade simultaneously, with no edge between
  // any pair of them — the only shared ancestor is the NTP source.
  {
    id: "skew-baseline",
    when: { triggerEquals: { clockSkewActive: true } },
    incidentState: "skewed",
    values: {
      fleetClockSkewMs: 820,
      lockServiceSplitBrainCount: 4,
      ledgerOutOfOrderWriteRatePercent: 7.2,
      rateLimiterFalseThrottleRatePercent: 9.8,
      ntpSyncOffsetMs: 640,
      apiRequestVolumePerSecond: 3_850,
      diagnosisPath: "not-attempted",
    },
    componentHealth: skewedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      fleetClockSkewMs: 12,
      lockServiceSplitBrainCount: 0,
      ledgerOutOfOrderWriteRatePercent: 0.1,
      rateLimiterFalseThrottleRatePercent: 0.2,
      ntpSyncOffsetMs: 8,
      apiRequestVolumePerSecond: 4_200,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
