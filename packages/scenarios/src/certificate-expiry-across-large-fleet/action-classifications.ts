import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── rotationOrder ────────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: ROTATION_ORDER_KEY,
    valueEquals: "modern-first",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Rotating the Modern cohort first retires its larger population's risk earliest",
      explanation:
        "Rotating Modern before Critical gets the fastest-capability, lowest-dependency-risk cohort — typically the largest population — off the old certificate first. This is an operationally defensible strategy choice, not a correctness requirement: it does not by itself make anything unsafe, but it does mean Critical's own deadline risk (the one cohort that may never cross the expiry deadline) is retired slightly later than if critical-first ordering had been chosen instead.",
    },
  },
  {
    id: "acc_2",
    controlKey: ROTATION_ORDER_KEY,
    valueEquals: "critical-first",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Rotating the Critical cohort first retires the single highest-consequence risk earliest",
      explanation:
        "Rotating Critical before Modern closes the deadline risk on the one cohort that may never cross the expiry deadline as early as possible in the timeline — at the cost of leaving Modern's larger population on the old certificate slightly longer. Equally defensible to modern-first; neither ordering is unsafe on its own, and this control never gates correctness — only which cohort's risk window closes first.",
    },
  },

  // ── cohortRolloutStage ───────────────────────────────────────────────
  {
    id: "acc_3",
    controlKey: COHORT_ROLLOUT_STAGE_KEY,
    valueEquals: "all-cohorts-rotated",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Advancing every cohort to verified-rotated closes all three cohorts' deadline risk",
      explanation:
        "Confirming that Modern, Critical, and Legacy all have a verifiably installed new certificate is the scenario's core remediation lever — it is what actually retires each cohort's deadline risk, rather than merely declaring intent. This reads as real progress only when the fleet-wide overlap window (certificateOverlapWindow) was genuinely open while advancing, and Legacy's rotation specifically also requires its compatibility bridge and verified trust bundle — advancing this value without those prerequisites is a false claim the system does not reward (see the false-bridge trap).",
    },
  },
  {
    id: "acc_4",
    controlKey: COHORT_ROLLOUT_STAGE_KEY,
    valueEquals: "not-started",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving rollout at not-started while the deadline clock runs down is a real, growing deadline risk",
      explanation:
        "No cohort has a verified new certificate while rollout stays at its untouched default. Every calendar checkpoint that passes without progress (T-24h, T-6h, T-1h) increases the odds that the fleet-wide expiry deadline passes with some or all cohorts still un-rotated — a deterministic, calendar-driven outage, not a random one. The longer this stays untouched, the smaller the remaining window for a safe, staged rotation.",
    },
  },

  // ── certificateOverlapWindow ─────────────────────────────────────────
  {
    id: "acc_5",
    controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY,
    valueEquals: "open",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Opening the overlap window is what makes a staged, cohort-by-cohort rotation safe",
      explanation:
        "With both the outgoing and incoming certificate trusted simultaneously, each cohort can adopt the new certificate in its own time without ever dropping a client mid-rotation. This carries a small, real ongoing cost (see revenue-and-cost.ts) but is the prerequisite mechanism cohortRolloutStage's progress actually depends on — without it, cohort-stage advances are not genuine, verified rotations.",
    },
  },
  {
    id: "acc_6",
    controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY,
    valueEquals: "closed",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the overlap window closed means no staged cohort rotation can be genuinely verified yet",
      explanation:
        "Without the overlap window open, a cohort cannot adopt a new certificate while the old one remains trusted for every still-unrotated client — this is not itself a violation, but it is a prerequisite gap: cohortRolloutStage's progress claims are only genuine once this is engaged.",
    },
  },

  // ── legacyCompatibilityBridge ────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaging the Legacy bridge grants the one cohort that genuinely needs extra overlap time",
      explanation:
        "Legacy's dependency chain updates its trust bundle more slowly than Modern or Critical — this control grants Legacy its own extended overlap window on top of the fleet-wide one, exactly the accommodation its slower rollout capability requires. It carries a small, real ongoing cost, and is the prerequisite for cohortRolloutStage ever legitimately reaching 'legacy-bridged.'",
    },
  },
  {
    id: "acc_8",
    controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY,
    valueEquals: "off",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the Legacy bridge disengaged means Legacy is on the same hard-cutover timeline as every other cohort",
      explanation:
        "Not engaging Legacy's extended bridge is not itself a violation, but it does mean Legacy — the one cohort whose dependency chain is genuinely slower to pick up a new trust bundle — has no extra accommodation. A cohortRolloutStage claim of 'legacy-bridged' without this engaged is a false claim the system catches rather than rewards.",
    },
  },

  // ── trustBundleUpdateStatus ──────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY,
    valueEquals: "updated-and-verified",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Verifying the trust bundle before any revocation is this scenario's defining sequencing safeguard",
      explanation:
        "Confirming Legacy clients have genuinely picked up the updated trust bundle is the specific prerequisite that makes revoking the old certificate safe afterward. This is the scenario's central lesson: the SAME eventual configuration (trust bundle updated, old certificate eventually revoked) is only safe in this order — verify first, revoke second. Doing this before oldCertificateRevocationTiming is set to 'revoked' is what separates the safe path from the premature-gap trap.",
    },
  },
  {
    id: "acc_10",
    controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY,
    valueEquals: "pending",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the trust bundle pending is safe on its own, but makes revocation unsafe if attempted now",
      explanation:
        "Not yet verifying Legacy's trust bundle update is not itself a violation — the old certificate is presumably still valid and clients can still connect through it. The risk only materializes if oldCertificateRevocationTiming is set to 'revoked' while this still reads 'pending': that specific combination is the scenario's required sequencing trap.",
    },
  },

  // ── oldCertificateRevocationTiming ───────────────────────────────────
  {
    // Deliberately classified "neutral," not unconditionally "harmful":
    // this engine's ActionClassificationRule has no way to condition on
    // ANOTHER control's value at the moment of the action (only on
    // triggers — see packages/simulator/src/types.ts), so a flat
    // "revoked is always harmful" classification would also incorrectly
    // tag the LAST, CORRECT step of a fully-verified rotation (revoking
    // only after every cohort is genuinely verified) as a harmful
    // change, double-penalizing operationalEfficiency on top of the
    // dataIntegrity dimension that already correctly, sequence-
    // sensitively penalizes a premature revocation via
    // fleetConnectionStatus (see rules.ts/scoring.ts). The real,
    // sequencing-dependent correctness consequence of this action is
    // fully and correctly captured by dataIntegrity/reliability/
    // customerImpact already; operationalEfficiency's harmfulChangeCount
    // is reserved for actions that are harmful regardless of timing
    // (like the validation-bypass trap below), never for an action whose
    // safety depends entirely on sequencing already scored elsewhere.
    id: "acc_11",
    controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
    valueEquals: "revoked",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "neutral",
    feedback: {
      title: "Revoking the old certificate is only safe once every cohort is genuinely verified",
      explanation:
        "Withdrawing the old certificate is the correct final cleanup step once every cohort's new certificate is verifiably installed AND, specifically for Legacy, its trust bundle update is independently verified — but the identical action taken before that point rejects every not-yet-verified client's connection, a real, self-inflicted outage. Whether this specific revocation was safe or premature is visible directly in fleetConnectionStatus immediately afterward (nominal vs. premature-gap-outage), not in this action alone.",
    },
  },
  {
    id: "acc_12",
    controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
    valueEquals: "not-revoked",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Leaving the old certificate valid until every cohort is verified avoids a self-inflicted outage",
      explanation:
        "Keeping the old certificate valid until every cohort's new certificate is verifiably installed and trusted costs nothing in correctness — there is no requirement to withdraw it the instant a new one exists. This is the safe default throughout the staged rotation, and the deliberate, auditable fix for a premature-gap mistake: restoring this to 'not-revoked' (together with a genuinely verified trust bundle) closes the gap without any validation bypass.",
    },
  },

  // ── loadBalancerCertificateMode ──────────────────────────────────────
  {
    id: "acc_13",
    controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY,
    valueEquals: "validation-bypass-all",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling certificate validation looked like an instant fix but is a real, counted security violation",
      explanation:
        "Bypassing certificate validation fleet-wide makes every connection succeed immediately, with no propagation delay at all — a tempting-looking instant fix the moment a cohort's certificate actually expires or a premature-gap outage begins. But every connection served this way is a connection whose certificate was not genuinely verified by anything, for every cohort, not just the affected one. This never satisfies either completion condition, however long it runs, and the cumulative bypassed-connection count is a real, permanent mark on this attempt's record. Broad validation bypass is not an acceptable remediation (business invariant #4); the only sanctioned fixes are completing the rotation or extending the Legacy bridge.",
    },
  },
  {
    id: "acc_14",
    controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY,
    valueEquals: "standard-validation",
    whenTriggerEquals: { expiryWindowActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping standard validation enforced means every served connection was genuinely verified",
      explanation:
        "Leaving certificate validation enforced throughout means any connection that succeeds genuinely presented a trusted, unexpired certificate. This is the only mode in which 'a connection succeeded' ever means 'a connection was genuinely authenticated' — never a substitute for actually completing the rotation on time.",
    },
  },
];
