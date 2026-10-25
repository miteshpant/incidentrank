import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  COMPATIBILITY_LAYER_MODE_KEY,
  DEADLINE_ESCALATION_MODE_KEY,
  DEPRECATED_API_TRAFFIC_BLOCK_KEY,
  DUAL_SUPPORT_MODE_KEY,
  MIGRATION_COHORT_ORDER_KEY,
  MIGRATION_VERIFICATION_MODE_KEY,
  PRODUCT_A_MIGRATION_KEY,
  PRODUCT_B_MIGRATION_KEY,
  PRODUCT_C_MIGRATION_KEY,
  PRODUCT_D_MIGRATION_KEY,
  REPLACEMENT_TRAFFIC_PERCENT_KEY,
  ROLLBACK_READINESS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── productAMigration / productBMigration / productCMigration /
  // productDMigration ────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: PRODUCT_A_MIGRATION_KEY,
    valueEquals: "migrate",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Product A was already migrated — the real question is verification, not the flag",
      explanation:
        "Product A reports migrated from the very start of this incident, but that claim was never independently verified. Setting this control again does not change that — the real decision this product needs is whether migrationVerificationMode is actually set to verify-before-complete, and whether enough time has elapsed for that check to genuinely finish.",
    },
  },
  {
    id: "acc_2",
    controlKey: PRODUCT_B_MIGRATION_KEY,
    valueEquals: "migrate",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Migrating Product B moved real work off the deprecated path",
      explanation:
        "Product B had no structural blocker — migrating it is straightforward, real progress toward the fleet-wide deadline. Whether it counts as genuinely done still depends on migrationVerificationMode: flipping this control alone only claims migration, it does not by itself prove correctness.",
    },
  },
  {
    id: "acc_3",
    controlKey: PRODUCT_C_MIGRATION_KEY,
    valueEquals: "migrate",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Flipping Product C's migration flag alone does not clear its real blocker",
      explanation:
        "Product C is blocked by a genuine compatibility issue with the Replacement API — setting this control to 'migrate' without compatibilityLayerMode active does not actually fix anything; the product's derived status correctly keeps reading 'blocked-incompatible' regardless of what this flag says. Activate the Compatibility Layer first.",
    },
  },
  {
    id: "acc_4",
    controlKey: PRODUCT_D_MIGRATION_KEY,
    valueEquals: "migrate",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Migrating Product D moved the last untouched product off the deprecated path",
      explanation:
        "Product D had no blocker and no partial progress of its own — migrating it is real, straightforward work toward full fleet coverage. As with every product, whether it counts as genuinely done still depends on migrationVerificationMode.",
    },
  },

  // ── migrationVerificationMode ────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: MIGRATION_VERIFICATION_MODE_KEY,
    valueEquals: "verify-before-complete",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Requiring verification before completion is what actually makes 'migrated' mean something",
      explanation:
        "A product must not be marked migrated until compatibility and correctness checks pass — this is the business invariant that makes a 'migrated' product count genuinely trustworthy rather than merely a claim. It takes real elapsed time to converge (see the verification window), but it is the only lever that lets productsMigratedVerifiedCount ever move off zero.",
    },
  },
  {
    id: "acc_6",
    controlKey: MIGRATION_VERIFICATION_MODE_KEY,
    valueEquals: "skip-verification",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "harmful",
    feedback: {
      title: "Skipping verification lets a product look complete while its correctness was never checked",
      explanation:
        "Marking products migrated without ever running a compatibility/correctness check is the scenario's central trap: productsMigratedUnverifiedCount climbs and the fleet can look fully migrated on the surface, but productsMigratedVerifiedCount stays at zero and missedVerificationCount permanently records that the check never happened — a real, non-resetting gap in this attempt's record.",
    },
  },

  // ── migrationCohortOrder (scoring-only governance signal — never a
  // terminal gate; see rules.ts's module doc comment) ──────────────────
  {
    id: "acc_7",
    controlKey: MIGRATION_COHORT_ORDER_KEY,
    valueEquals: "prerequisite-first",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Clearing the technical prerequisite first gave every downstream migration a clean path",
      explanation:
        "Sequencing effort to unblock the Compatibility Layer (and therefore Product C) before pushing on the remaining cohorts reflects real technical dependency risk, not just business pressure. This is Alternate Strong Path A's deliberate sequencing choice — real, visible, rewarded governance, even though it is not required to reach the fully-verified state (Alternate Strong Path B reaches the same destination via targeted dual-support instead).",
    },
  },
  {
    id: "acc_8",
    controlKey: MIGRATION_COHORT_ORDER_KEY,
    valueEquals: "critical-first",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Prioritizing the highest-business-criticality product reflects real risk management",
      explanation:
        "Sequencing migration effort by business criticality, independent of which product happens to be technically easiest, is a legitimate, deliberate governance choice — migration order should reflect business criticality and technical dependency risk, and this is the business-criticality half of that invariant made explicit.",
    },
  },
  {
    id: "acc_9",
    controlKey: MIGRATION_COHORT_ORDER_KEY,
    valueEquals: "unordered",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving migration unordered means real progress is not deliberately governed",
      explanation:
        "Products can still be migrated and verified correctly without a declared cohort order — this control never blocks reaching a fully verified fleet — but migrationGovernanceStatus honestly records 'ungoverned' for the rest of the attempt, a real, visible completeness signal that no deliberate criticality/dependency-risk sequencing was ever applied, distinct from whether the migration itself succeeded.",
    },
  },

  // ── compatibilityLayerMode ────────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: COMPATIBILITY_LAYER_MODE_KEY,
    valueEquals: "active",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Activating the Compatibility Layer is what actually unblocks Product C",
      explanation:
        "Product C's compatibility issue with the Replacement API can only be resolved by routing through this layer — activating it is a real, necessary step, not optional. It takes real elapsed time (the compatibility-convergence window) before Product C's exceptions actually clear, and — per the business invariant that a shared compatibility layer must not become a permanent single point of failure — leaving it active with Product C never actually migrated through it, for long enough, is tracked as its own independent debt.",
    },
  },
  {
    id: "acc_11",
    controlKey: COMPATIBILITY_LAYER_MODE_KEY,
    valueEquals: "inactive",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the Compatibility Layer inactive keeps Product C genuinely blocked",
      explanation:
        "This is the correct value for every product except Product C's own migration path — there is no cost to leaving it inactive while it is not needed, but it also means Product C's real compatibility issue is never resolved this way.",
    },
  },

  // ── dualSupportMode (scoring-only bridging signal — never a terminal
  // gate; see rules.ts's module doc comment) ───────────────────────────
  {
    id: "acc_12",
    controlKey: DUAL_SUPPORT_MODE_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Enabling dual-support is a real, legitimate bridge — but only while genuinely temporary",
      explanation:
        "Dual-support lets a product be migrated gradually instead of all-at-once, which is Alternate Strong Path B's deliberate strategy. It carries a real, ongoing infrastructure cost the whole time it runs, and — per the business invariant that dual-support cannot become indefinite hidden debt — leaving it enabled long after every product has already finished migrating is tracked as its own independent, non-resetting debt counter.",
    },
  },
  {
    id: "acc_13",
    controlKey: DUAL_SUPPORT_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping dual-support disabled avoided an unnecessary ongoing cost",
      explanation:
        "Alternate Strong Path A never needs a dual-write bridge at all — each product's cutover is staged directly once its prerequisites are cleared. Leaving this control at its default avoids a real, ongoing infrastructure cost that this strategy never required in the first place.",
    },
  },

  // ── replacementTrafficPercent ─────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: REPLACEMENT_TRAFFIC_PERCENT_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Shifting all eligible traffic to the Replacement API is the real end state",
      explanation:
        "Routing 100% of eligible Shared SDK traffic to the Replacement API is necessary for the deprecated path to ever actually drain to zero — but it takes real elapsed time (the traffic-drain window) for deprecatedApiTrafficPercent/replacementApiErrorRate to actually converge; an instant flip does not instantly finish the drain.",
    },
  },
  {
    id: "acc_15",
    controlKey: REPLACEMENT_TRAFFIC_PERCENT_KEY,
    valueAtMost: 75,
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "A partial traffic shift is real, bounded progress — not yet a full drain",
      explanation:
        "Shifting some eligible traffic to the Replacement API genuinely reduces deprecated-path dependency, but the deprecated path never fully drains until this reaches 100% and the traffic-drain window has elapsed.",
    },
  },

  // ── deprecatedApiTrafficBlock ──────────────────────────────────────────
  {
    id: "acc_16",
    controlKey: DEPRECATED_API_TRAFFIC_BLOCK_KEY,
    valueEquals: "blocked",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Blocking deprecated traffic once every product is ready closes the loop cleanly",
      explanation:
        "Hard-cutting the deprecated path is the correct final step once every critical product has genuinely finished migrating and verifying — it is what actually enforces the business invariant that no critical product may remain dependent on the deprecated API past the hard deadline. Doing this BEFORE every product is ready is the deadline-panic trap, not this lever's fault — see deadlineEscalationMode.",
    },
  },
  {
    id: "acc_17",
    controlKey: DEPRECATED_API_TRAFFIC_BLOCK_KEY,
    valueEquals: "allowed",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the deprecated path open is correct while any product still legitimately depends on it",
      explanation:
        "The deprecated path must stay reachable for any product that has not yet finished migrating — closing it prematurely breaks whatever still depends on it. This is only a problem if it is STILL open once the hard deadline externally retires the API anyway, at which point the retirement happens regardless of this control's value.",
    },
  },

  // ── rollbackReadiness ──────────────────────────────────────────────────
  {
    id: "acc_18",
    controlKey: ROLLBACK_READINESS_KEY,
    valueEquals: "prepared",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Preparing a verified rollback path is a real, independent safety investment",
      explanation:
        "Having a tested, ready fallback to the deprecated path for any product, in case a migrated product's correctness turns out to be wrong after the fact, is a genuine risk-reduction step distinct from whether migration/verification itself happened. It does not speed up or slow down migration — it is read directly wherever a forced-cutover decision would otherwise be a one-way bet.",
    },
  },
  {
    id: "acc_19",
    controlKey: ROLLBACK_READINESS_KEY,
    valueEquals: "not-prepared",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving rollback unprepared means no verified fallback exists if something is wrong",
      explanation:
        "This never blocks migration progress on its own, but it means that if a migrated product's correctness later turns out to be wrong, there is no tested, ready path back to the deprecated API for it — a real, independent risk left unaddressed.",
    },
  },

  // ── deadlineEscalationMode ─────────────────────────────────────────────
  {
    id: "acc_20",
    controlKey: DEADLINE_ESCALATION_MODE_KEY,
    valueEquals: "forced-cutover",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "harmful",
    feedback: {
      title: "Forcing a cutover while a product remains incompatible traded a visible risk for a guaranteed outage",
      explanation:
        "Forcing the Deprecated External API off immediately, regardless of whether every critical product has actually finished migrating, is never safe when any product remains incompatible with the Replacement API. This permanently increments failedForcedCutoverCount — a real, counted failure event on this attempt's record that persists even after the lever is set back to 'normal'.",
    },
  },
  {
    id: "acc_21",
    controlKey: DEADLINE_ESCALATION_MODE_KEY,
    valueEquals: "normal",
    whenTriggerEquals: { deadlineAnnounced: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping escalation normal let real migration progress — not panic — resolve the deadline",
      explanation:
        "Not forcing an immediate cutover avoids trading a known, visible deadline-risk problem for an immediate, guaranteed outage on whichever product is not yet ready. Deadline risk is addressed by actually finishing migration and verification, not by this lever.",
    },
  },
];
