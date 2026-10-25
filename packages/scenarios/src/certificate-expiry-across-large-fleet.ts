import type { ScenarioDefinition } from "./types";
import {
  certificateExpiryAcrossLargeFleetSimulation,
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "./certificate-expiry-across-large-fleet/definition";
import { certificateExpiryAcrossLargeFleetCandidateUI } from "./certificate-expiry-across-large-fleet/candidate-ui";
import { CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING } from "./certificate-expiry-across-large-fleet/scoring";

/**
 * Certificate Expiry Across Large Fleet — a paid, Senior-Staff
 * IncidentRank scenario (Phase 6E.4). A large fleet of TLS certificates,
 * spanning Modern, Critical, and Legacy cohorts with genuinely different
 * rotation capability, rollout speed, and dependency risk, is approaching
 * a shared expiry deadline. Live connection success stays perfectly
 * healthy for days of simulated calendar time while the deadline clock
 * runs down — this is a proactive, calendar-driven remediation, not an
 * external failure. Five business invariants govern every decision: (1)
 * the Critical cohort may never cross the expiry deadline un-rotated;
 * (2) a new certificate must be verifiably installed before the old one
 * is withdrawn; (3) Legacy cohorts may require a temporary overlap
 * bridge, because their dependency chain updates its trust bundle more
 * slowly; (4) broad validation bypass is never an acceptable way to
 * paper over either an expiry or a sequencing gap; (5) deadline risk
 * must be tracked explicitly per cohort, never averaged into one
 * fleet-wide number. The scenario's defining lesson is sequencing: the
 * SAME eventual configuration (trust bundle updated, old certificate
 * eventually revoked) is only safe reached in the correct order —
 * revoking the old certificate before Legacy's trust bundle is verified
 * breaks Legacy clients even though both steps eventually happen.
 */
export const certificateExpiryAcrossLargeFleet: ScenarioDefinition = {
  id: "certificate-expiry-across-large-fleet",
  slug: "certificate-expiry-across-large-fleet",
  version: 1,
  name: "Certificate Expiry Across Large Fleet",
  description:
    "A large fleet of TLS certificates, spanning Modern, Critical, and Legacy cohorts with genuinely different rotation capability, rollout speed, and dependency risk, is approaching a shared expiry deadline across the Certificate Authority, Secret Distribution, Service Fleet, Load Balancers, and External Clients. Live connection success stays perfectly healthy for days of simulated calendar time while the deadline clock runs down — this is a proactive, calendar-driven remediation, not an external failure. Five business invariants govern every decision: (1) the Critical cohort may never cross the expiry deadline un-rotated; (2) new certificates must be verifiably installed before old certificates are withdrawn; (3) Legacy cohorts may require a temporary overlap bridge, because their dependency chain updates its trust bundle more slowly than Modern or Critical; (4) broad validation bypass is not acceptable, however urgently it would restore connectivity; (5) deadline risk must be explicitly tracked by cohort, never averaged into one fleet-wide number that could hide which specific cohort is actually at risk. The scenario's defining lesson is sequencing, not merely speed: the SAME eventual configuration — trust bundle updated, old certificate eventually revoked — is only safe when reached in the correct order. Revoking the old certificate before the Legacy cohort's trust bundle is verified breaks every Legacy client, even though both the revocation and the trust-bundle update eventually happen in the same timeline. Decide which cohort to rotate first, how to stage and verify each cohort's new certificate before withdrawing the old one, whether Legacy needs its own extended bridge, and — when a premature gap is ever created — whether to close it the deliberate, auditable way or reach for the tempting but forbidden broad validation bypass.",
  difficulty: "senior_staff",
  estimatedMinutes: 25,
  isFree: false,
  simulation: certificateExpiryAcrossLargeFleetSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Certificate Rotation",
      "Deadline Risk",
      "Fleet Operations",
      "Sequencing",
      "Historical Damage",
      "Operational Governance",
    ],
    skills: [
      "Tracking deadline risk explicitly per cohort rather than one fleet-wide average",
      "Sequencing new-certificate verification before old-certificate revocation",
      "Recognizing when a cohort genuinely needs a temporary compatibility bridge",
      "Rejecting broad validation bypass as a tempting but forbidden shortcut",
    ],
    shortDescription:
      "A large certificate fleet spanning Modern, Critical, and Legacy cohorts approaches a shared expiry deadline — revoking the old certificate before Legacy's trust bundle is verified breaks it, even though the same eventual fix would have worked in the right order.",
  },
};

export {
  certificateExpiryAcrossLargeFleetSimulation,
  certificateExpiryAcrossLargeFleetCandidateUI,
  CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
};
