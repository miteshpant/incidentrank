import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal for days of this incident)
  // ────────────────────────────────────────────────────────────────────
  // Every connection succeeds normally for days leading up to expiry —
  // a candidate who only watches this number sees nothing wrong until
  // the deterministic deadline-driven failure actually lands.
  loadBalancerConnectionSuccessRatePercent: 99.95,

  // ── Per-cohort deadline risk (days remaining until THAT cohort's
  // certificate expires) — business invariant #5: "deadline risk must
  // be explicitly tracked by cohort." All three cohorts share the same
  // fleet-wide expiry deadline but carry independent rotation
  // capability/speed/dependency risk, so each gets its own tracked
  // field rather than one fleet-wide number hiding which specific
  // cohort is actually at risk. ─────────────────────────────────────────
  modernCohortDaysToExpiry: 3,
  criticalCohortDaysToExpiry: 3,
  legacyCohortDaysToExpiry: 3,

  // ── Per-cohort rotation status — authoritative for scoring +
  // success/acceptable conditions via finalStringEquals. "pending" /
  // "verified-rotated". Modern and Critical are "pending" until their
  // own new certificate is installed AND verified; Legacy additionally
  // requires its compatibility bridge + trust-bundle update before a
  // rotation can count as genuinely verified (never merely "the control
  // was flipped"). ──────────────────────────────────────────────────────
  modernCohortRotationStatus: "pending",
  criticalCohortRotationStatus: "pending",
  legacyCohortRotationStatus: "pending",

  // ── Fleet-wide connection outcome summary, authoritative for
  // completion conditions. "nominal" (no cohort currently rejecting
  // connections AND no validation-bypass trap active) / "expiry-
  // outage" (at least one cohort's certificate has genuinely expired
  // and is live-rejecting connections right now) / "premature-gap-
  // outage" (a candidate-caused sequencing mistake — old certificate
  // revoked before a cohort's new chain/trust bundle was verifiably
  // ready — is live-rejecting connections right now, even though no
  // calendar deadline has actually been missed) / "validation-
  // bypassed" (the Load Balancers are accepting every connection with
  // no genuine certificate validation at all — never "nominal",
  // however healthy the raw success-rate number looks). Scoring's
  // dataIntegrity dimension and completion's acceptableCondition both
  // key off this single authoritative field being exactly "nominal" —
  // never off the raw success-rate percentage, which the bypass trap
  // deliberately keeps looking healthy.
  fleetConnectionStatus: "nominal",

  // ── Historical/cumulative damage severity summary (non-resetting,
  // see numericWatchFields in definition.ts) ───────────────────────────
  // Cumulative count of External Client connections that were rejected
  // during this attempt because SOME certificate (expired OR a
  // premature-revocation gap) was not currently trusted. Zero is
  // healthy. This can only ever increase while a connection-rejecting
  // condition is actively happening — once a window of rejected
  // connections has occurred, that lost traffic is a real, permanent
  // historical fact about this attempt, never un-happened by a later
  // fix landing.
  cumulativeRejectedConnectionCount: 0,

  // ── Cumulative count of connections served by the Load Balancers
  // while validationBypassAll was engaged — i.e. connections accepted
  // with NO genuine certificate validation performed at all, regardless
  // of whether the presented certificate was expired, valid, or even
  // real. Zero is healthy. A real, counted security-policy violation
  // distinct from (and independent of) the expiry/outage mechanics —
  // never reset by later re-enabling standard validation.
  cumulativeValidationBypassedConnectionCount: 0,

  // ── Candidate-visible investigation/remediation state (state, not
  // controls) ──────────────────────────────────────────────────────────
  // Whether Legacy's trust-bundle update has been independently verified
  // as propagated to real Legacy clients (distinct from the raw
  // trustBundleUpdateStatus control, which only represents the
  // candidate's own declared intent) — read together with rules.ts's
  // sequencing gate. Mirrors the control 1:1 here since there is no
  // separate verification step beyond the control itself in this
  // scenario; retained as its own field for candidate-ui legibility and
  // because scoring reads the STATE field, not the control, keeping
  // scoring decoupled from control internals per every sibling
  // scenario's convention.
  legacyTrustBundleVerifiedStatus: "pending",

  // ── Severity-field summary (normal/warning/critical vocabulary only,
  // per SeverityFieldConfig), read by reliability's criticalTimeRatio
  // measure: time spent with a LIVE connection-rejecting condition on
  // any cohort, never time spent merely "deadline is close but nothing
  // has failed yet." ────────────────────────────────────────────────────
  fleetConnectionSeverity: "normal",
};
