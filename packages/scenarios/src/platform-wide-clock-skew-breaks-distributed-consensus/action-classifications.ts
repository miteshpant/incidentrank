import type { ActionClassificationRule } from "@incidentrank/simulator";
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

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_NTP_SYNC_STATUS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_LOCK_SERVICE_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_LEDGER_ORDERING_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_RATE_LIMITER_WINDOWS_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: RESYNC_FLEET_CLOCKS_KEY,
    valueEquals: true,
    whenTriggerEquals: { clockSkewActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: resync the fleet's clocks",
      explanation:
        "The lock service, ledger, and rate limiter all make timestamp-ordered decisions off the local system clock. Resyncing every node against a healthy NTP source removes the single shared cause behind all three simultaneous symptoms.",
    },
  },
  {
    controlKey: FORCE_LEADER_REELECTION_KEY,
    valueEquals: true,
    whenTriggerEquals: { clockSkewActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct follow-up: force a clean leader re-election",
      explanation:
        "The lock service's current leader was elected under skewed clocks. Once clocks agree again, forcing a re-election lets the lock service converge cleanly instead of leaving a stale, skew-elected leader in place.",
    },
  },
  {
    controlKey: RESTART_LOCK_SERVICE_KEY,
    valueEquals: true,
    whenTriggerEquals: { clockSkewActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting the lock service",
      explanation:
        "Restarting clears the lock service's own split-brain state for a moment, but the fleet's clocks are still skewed underneath — a new split-brain forms on the next lease renewal, and the ledger and rate-limiter symptoms (which never depended on the lock service) are completely untouched.",
    },
  },
  {
    controlKey: RESTART_LEDGER_SERVICE_KEY,
    valueEquals: true,
    whenTriggerEquals: { clockSkewActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting the ledger service",
      explanation:
        "Restarting clears the ledger's own reordering backlog for a moment, but the fleet's clocks are still skewed underneath — reordering resumes, and the lock-service and rate-limiter symptoms are completely untouched.",
    },
  },
  {
    controlKey: RESTART_RATE_LIMITER_KEY,
    valueEquals: true,
    whenTriggerEquals: { clockSkewActive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but insufficient: restarting the rate limiter",
      explanation:
        "Restarting clears the rate limiter's own sliding-window state for a moment, but the fleet's clocks are still skewed underneath — false throttling resumes, and the lock-service and ledger symptoms are completely untouched.",
    },
  },
];
