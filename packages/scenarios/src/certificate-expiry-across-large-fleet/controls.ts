import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Which cohort the candidate rotates FIRST. "modern-first" (default): the
 * Modern cohort (fastest rollout capability, lowest dependency risk) is
 * rotated before the Critical cohort. "critical-first": the Critical
 * cohort (the one that can NEVER cross its expiry deadline — business
 * invariant #1) is rotated first, at the cost of leaving Modern's larger
 * but lower-risk population until later. Both are operationally
 * defensible Alternate Strong Paths (see rules.ts) — this control alone
 * never makes anything unsafe; it only changes WHICH cohort's deadline
 * risk is retired earliest.
 */
export const ROTATION_ORDER_KEY = "rotationOrder";

/**
 * How far staged, VERIFIED new-certificate installation has progressed
 * across the fleet's cohorts. "not-started" (default): no cohort has a
 * verifiably-installed new certificate yet. "modern-rotated" /
 * "critical-rotated": the named cohort's new certificate is installed
 * and independently verified as trusted end-to-end (External Clients
 * successfully validate it) — business invariant #2, "new certificates
 * must be verifiably installed before old certificates are withdrawn."
 * "legacy-bridged": the Legacy cohort's new certificate is installed and
 * trusted ALONGSIDE its old one during a temporary overlap window
 * (business invariant #3 — legacy cohorts may require temporary
 * overlap), rather than a hard cutover. "all-cohorts-rotated": every
 * cohort has a verified new certificate installed. This control only
 * ADVANCES when the candidate explicitly sets it forward — it never
 * auto-advances on its own, so a candidate who revokes an old
 * certificate while this still reads "not-started" has verified nothing.
 */
export const COHORT_ROLLOUT_STAGE_KEY = "cohortRolloutStage";

/**
 * Whether old AND new certificates are BOTH currently accepted as
 * trusted, fleet-wide, during the rotation. "closed" (default): only
 * whichever certificate is currently installed on a given cohort is
 * trusted — no deliberate overlap. "open": both the outgoing and
 * incoming certificate are trusted simultaneously for a bounded window —
 * the safe mechanism that makes a staged, cohort-by-cohort rotation
 * possible without ever dropping a client mid-rotation, and in
 * particular what the Legacy cohort's slower rollout capability
 * genuinely depends on (business invariant #3). This is never a risk to
 * eliminate early — the actual danger in this scenario is entirely
 * sequencing (see oldCertificateRevocationTiming), not the existence of
 * an overlap window itself.
 */
export const CERTIFICATE_OVERLAP_WINDOW_KEY = "certificateOverlapWindow";

/**
 * Whether the Legacy cohort's temporary certificate-overlap bridge is
 * engaged. "off" (default): Legacy is rotated on the same hard-cutover
 * timeline as every other cohort — genuinely risky for Legacy
 * specifically, since its dependency chain is slower to pick up a new
 * trust bundle (see trustBundleUpdateStatus). "on": Legacy is granted
 * its own extended overlap window on top of the fleet-wide
 * certificateOverlapWindow, consistent with business invariant #3.
 * Required for cohortRolloutStage to ever legitimately reach
 * "legacy-bridged" — advancing the rollout stage to that value without
 * this engaged is not a real bridge (see rules.ts's false-bridge trap).
 */
export const LEGACY_COMPATIBILITY_BRIDGE_KEY = "legacyCompatibilityBridge";

/**
 * Whether Legacy clients have verifiably picked up the updated trust
 * bundle (the set of CA roots/intermediates External Clients trust) for
 * the NEW certificate. "pending" (default): Legacy's trust bundle has
 * not yet been confirmed updated — Legacy clients may still only trust
 * the OLD certificate's chain. "updated-and-verified": Legacy's trust
 * bundle update has been explicitly confirmed. THIS IS THE SCENARIO'S
 * DEFINING SEQUENCING LEVER (binding requirement): revoking the old
 * certificate (see oldCertificateRevocationTiming) BEFORE this reads
 * "updated-and-verified" for Legacy breaks every Legacy client, even
 * though both the revocation and the trust-bundle update eventually
 * happen — the SAME eventual configuration reached in the WRONG ORDER
 * is unsafe. Legacy specifically (not Modern/Critical) is the one cohort
 * genuinely at risk from this ordering mistake because its dependency
 * chain updates its trust bundle more slowly (business invariant #3).
 */
export const TRUST_BUNDLE_UPDATE_STATUS_KEY = "trustBundleUpdateStatus";

/**
 * Whether the OLD certificate is still being accepted, or has been
 * explicitly revoked/withdrawn. "not-revoked" (default): the old
 * certificate remains valid — safe, since nothing requires it be
 * withdrawn the instant a new one is installed. "revoked": the old
 * certificate has been explicitly invalidated. Revoking before every
 * cohort's new certificate is verifiably installed (cohortRolloutStage
 * !== "all-cohorts-rotated") — and, specifically for Legacy, before
 * trustBundleUpdateStatus reads "updated-and-verified" — creates a real,
 * self-inflicted connection-rejection outage for every not-yet-verified
 * client. Revoking only after the fleet has genuinely finished rotating
 * is the correct, final cleanup step of a safe rotation.
 */
export const OLD_CERTIFICATE_REVOCATION_TIMING_KEY = "oldCertificateRevocationTiming";

/**
 * How the Load Balancers validate presented certificates. "standard-
 * validation" (default): normal chain/expiry/hostname validation
 * applies to every connection. "validation-bypass-all": the Load
 * Balancers stop validating certificates altogether and terminate TLS
 * for any presented certificate, expired or not. This looks like an
 * instant fix the moment a cohort's certificate actually expires and
 * connections start failing — every rejected connection immediately
 * starts succeeding again, with no propagation delay at all — but it is
 * a real, counted validation-bypass security violation: every
 * connection served in this mode is a connection whose certificate was
 * not genuinely verified by anything, for every cohort, not just the
 * one that expired. This is NEVER an acceptable way to bridge an expiry
 * gap (business invariant #4, "broad validation bypass is not
 * acceptable"); the only sanctioned responses to an actual expiry are
 * completing the rotation or (for Legacy specifically) extending the
 * compatibility bridge.
 */
export const LOAD_BALANCER_CERTIFICATE_MODE_KEY = "loadBalancerCertificateMode";

export const controls: ControlDefinition[] = [
  {
    key: ROTATION_ORDER_KEY,
    allowedValues: ["modern-first", "critical-first"],
    initialValue: "modern-first",
  },
  {
    key: COHORT_ROLLOUT_STAGE_KEY,
    allowedValues: ["not-started", "modern-rotated", "critical-rotated", "legacy-bridged", "all-cohorts-rotated"],
    initialValue: "not-started",
  },
  {
    key: CERTIFICATE_OVERLAP_WINDOW_KEY,
    allowedValues: ["closed", "open"],
    initialValue: "closed",
  },
  {
    key: LEGACY_COMPATIBILITY_BRIDGE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: TRUST_BUNDLE_UPDATE_STATUS_KEY,
    allowedValues: ["pending", "updated-and-verified"],
    initialValue: "pending",
  },
  {
    key: OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
    allowedValues: ["not-revoked", "revoked"],
    initialValue: "not-revoked",
  },
  {
    key: LOAD_BALANCER_CERTIFICATE_MODE_KEY,
    allowedValues: ["standard-validation", "validation-bypass-all"],
    initialValue: "standard-validation",
  },
];
