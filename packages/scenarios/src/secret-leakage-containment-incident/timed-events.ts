import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the credential is believed exposed — found in
// plaintext in a Logging record and in a CI/CD build artifact. This is
// an EXTERNAL discovery, not a candidate action: nothing the candidate
// has done yet caused or changed this.
export const EXPOSURE_IDENTIFIED_MS = 30_000;

// If the credential is still being treated as fully-trusted this long
// after exposure was identified, continued exposure risk has compounded
// (more elapsed time during which the leaked credential could have been
// used by someone other than legitimate dependent systems) into a
// materially worse, explicitly-named escalation band. This is EXTERNAL
// elapsed-time progression, not a candidate action.
export const SUSTAINED_EXPOSURE_MS = EXPOSURE_IDENTIFIED_MS + 4 * 60_000;

// Cohort migration recovery-lag (business invariant: revoking a
// credential a not-yet-migrated critical integration still relies on
// creates a real, avoidable outage — migration must be sequenced, not
// instant). Once newCredentialIssued=true, migrating dependent-system
// Cohort A (the smaller, lower-risk cohort) to the new credential takes
// real elapsed time — it never completes on the same tick the
// replacement credential is issued. Cohort B (the larger, higher-risk
// cohort — the "critical, not-yet-migrated integration" the business
// invariant explicitly names) takes additional real elapsed time beyond
// Cohort A.
export const COHORT_A_MIGRATION_WINDOW_MS = 3 * 60_000;
export const COHORT_B_MIGRATION_WINDOW_MS = 7 * 60_000;

// NOTE: the engine processes timedEvents strictly in array order via a
// monotonically-advancing index (packages/simulator/src/tick.ts) — it
// never skips ahead to a later-indexed event whose atMs has already
// passed while an earlier-indexed event's atMs has not. This array
// MUST therefore be listed in strictly ascending atMs order; the
// Cohort-A migration window (210s after exposure) fires BEFORE
// sustained-exposure (240s after exposure), so it is listed first
// below despite being authored/explained after it above.
export const timedEvents: TimedEvent[] = [
  {
    id: "exposure-identified",
    atMs: EXPOSURE_IDENTIFIED_MS,
    type: "TRIGGER_SET",
    message:
      "A credential used by Applications and External Integrations has been found in plaintext in a Logging record and in a CI/CD build artifact — it must now be treated as believed-exposed.",
    setTriggers: { exposureIdentified: true },
  },
  {
    id: "cohort-a-migration-window-elapsed",
    atMs: EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for Dependent-System Cohort A to have completed migration to a new credential, if one has been issued and migration was genuinely under way.",
    setTriggers: { exposureIdentified: true, cohortAMigrationWindowElapsed: true },
  },
  {
    id: "sustained-exposure",
    atMs: SUSTAINED_EXPOSURE_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The exposure window has remained open for an extended period — continued exposure risk has compounded the longer the credential has gone untreated.",
    setTriggers: {
      exposureIdentified: true,
      cohortAMigrationWindowElapsed: true,
      sustainedExposure: true,
    },
  },
  {
    id: "cohort-b-migration-window-elapsed",
    atMs: EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for Dependent-System Cohort B — the larger, higher-risk cohort — to have completed migration to a new credential, if one has been issued and migration was genuinely under way.",
    setTriggers: {
      exposureIdentified: true,
      cohortAMigrationWindowElapsed: true,
      sustainedExposure: true,
      cohortBMigrationWindowElapsed: true,
    },
  },
];
