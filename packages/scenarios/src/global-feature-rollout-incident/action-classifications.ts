import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * (per phase6d.4.md section 18) what pressure moved elsewhere, what
 * invariant was protected or violated, and what historical consequence
 * was created.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: MIGRATION_REPAIR_KEY,
    valueEquals: "repairing",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaged migration repair",
      explanation:
        "Repair is the only mechanism that actually reduces the already-incompatible write backlog — repairedRecordCount climbs toward alreadyIncompatibleWriteCount over real elapsed time. It is only genuinely effective once growth has stopped first (every region halted/paused, dual-write engaged, or global rollback). If any region is still actively writing new-only when repair starts, repair races a moving target and the backlog never actually shrinks net — check that growth has stopped before relying on this alone.",
    },
  },
  {
    id: "acr_2",
    controlKey: MIGRATION_REPAIR_KEY,
    valueEquals: "idle",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Left migration repair idle",
      explanation:
        "With repair idle, alreadyIncompatibleWriteCount never decreases no matter how long the incident runs or how many other controls are fixed — rolling back or halting alone only stops the backlog from growing further, it does not repair what was already written.",
    },
  },
  {
    id: "acr_3",
    controlKey: GLOBAL_ROLLBACK_KEY,
    valueEquals: true,
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Rolled back the feature globally",
      explanation:
        "Global rollback stops every region from writing further new-only incompatible records. Per the invariant that rollback may not discard or hide already-written incompatible data, alreadyIncompatibleWriteCount is explicitly NOT erased by this action — it freezes at whatever it was. Without also engaging repair or the read-compatibility shim, reads against the already-written backlog keep failing in strict mode: rollback alone leaves a real, measurable, growing unreadableReadCount gap, not a resolved incident.",
    },
  },
  {
    id: "acr_4",
    controlKey: DATA_READ_COMPATIBILITY_MODE_KEY,
    valueEquals: "compatibility-shim",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaged the read-compatibility shim",
      explanation:
        "The shim translates incompatible representations at read time, making already-written records readable again immediately — without waiting for a full repair pass to rewrite the underlying rows. Combined with stopping further growth (rollback, halt, or dual-write), this is one of the two genuinely independent paths to a safe handback. It does not by itself reduce alreadyIncompatibleWriteCount or repairedRecordCount — the underlying data is still unrepaired, only readable via translation.",
    },
  },
  {
    id: "acr_5",
    controlKey: WRITE_COMPATIBILITY_MODE_KEY,
    valueEquals: "dual-write",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaged fleet-wide dual-write",
      explanation:
        "Dual-write populates both the old and new representations on every write going forward, so NEW writes stop creating NEW incompatibility — this is the forward-fix path, and lets the rollout continue safely rather than requiring a full halt. It does nothing for records already written new-only before dual-write was engaged: that pre-existing backlog remains a real, outstanding, unrepaired gap, which is why this reaches the ACCEPTABLE tier rather than OPTIMAL on its own.",
    },
  },
  {
    id: "acr_6",
    controlKey: REGION_ROLLOUT_EU_KEY,
    valueEquals: "halted",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Halted the EU regional rollout",
      explanation:
        "EU was the first region to expose the correctness divergence, and halting it independently stops EU from writing any further new-only records without touching US or APAC — proving a regional rollout may genuinely be halted on its own. US and APAC continue writing (and degrading) independently unless they are also halted or the rollout is rolled back/paused globally.",
    },
  },
  {
    id: "acr_7",
    controlKey: REGION_ROLLOUT_US_KEY,
    valueEquals: "halted",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Halted the US regional rollout",
      explanation:
        "Halting US independently protects US correctness without affecting EU or APAC, which keep degrading on their own schedule. Regional independence means fixing the loudest region first is not sufficient — each affected region needs its own deliberate decision.",
    },
  },
  {
    id: "acr_8",
    controlKey: REGION_ROLLOUT_APAC_KEY,
    valueEquals: "halted",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Halted the APAC regional rollout",
      explanation:
        "Halting APAC independently protects APAC correctness without affecting EU or US. Combined with halting every other affected region (or a global rollback), this is what actually stops alreadyIncompatibleWriteCount from growing further across the whole fleet.",
    },
  },
  {
    id: "acr_9",
    controlKey: ROLLOUT_PAUSE_KEY,
    valueEquals: true,
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Paused further rollout expansion",
      explanation:
        "Pausing stops the rollout pipeline from onboarding additional cohorts — it bounds how much WORSE exposure can get, but every region already rolled out keeps writing new-only for its existing traffic. This is a containment step, not a fix: alreadyIncompatibleWriteCount keeps growing from already-exposed traffic until a region is actually halted, rolled back, or dual-write/repair is engaged.",
    },
  },
  {
    id: "acr_10",
    controlKey: ROLLOUT_PAUSE_KEY,
    valueEquals: false,
    whenTriggerEquals: { rolloutRegressionActive: true, sustainedRollout: true },
    outcome: "harmful",
    feedback: {
      title: "Left the rollout unpaused during a known, sustained regression",
      explanation:
        "Leaving rolloutPause at false while the regression is active and already sustained lets exposure keep expanding into additional cohorts on top of the correctness divergence already in progress. alreadyIncompatibleWriteCount and unreadableReadCount both get materially worse the longer this continues, directly working against 'correctness outranks rollout velocity.'",
    },
  },
  {
    id: "acr_11",
    controlKey: DATA_READ_COMPATIBILITY_MODE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { rolloutRegressionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Left the read path in strict compatibility mode",
      explanation:
        "Strict mode is the safe default absent an engaged shim — it never silently serves corrupted data, but it also does not make any already-written incompatible record readable. Reads against the backlog continue failing until records are either repaired or the compatibility shim is engaged.",
    },
  },
];
