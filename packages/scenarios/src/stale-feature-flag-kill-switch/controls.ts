import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Each is a toggle a candidate flips to signal "I looked here." None of
// these change component health, revenue loss, or cost — they only
// advance `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Mirrors
// the reference incident's investigation-control pattern exactly (the
// engine has no separate "investigation action" primitive).
export const INSPECT_FLAG_AUDIT_LOG_KEY = "inspectFlagAuditLog";
export const INSPECT_LEGACY_ENGINE_LOGS_KEY = "inspectLegacyEngineLogs";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The unrelated, seemingly-safe flag the on-call engineer actually
// touched — flipping it is what woke the dormant stale flag's dead code
// path up in the first place.
export const REVERT_UNRELATED_FLAG_KEY = "newCheckoutLayoutFlagEnabled";
// The classic reflex remediation: restart the service. Plausible,
// non-harmful, but does not touch the stale flag state at all.
export const RESTART_CHECKOUT_SERVICE_KEY = "restartCheckoutService";
// The real fix: explicitly flip off the stale flag itself — the one
// nobody remembered was still wired into a live code path.
export const DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY = "legacyPricingEngineKillSwitchEnabled";

export const controls: ControlDefinition[] = [
  { key: INSPECT_FLAG_AUDIT_LOG_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_LEGACY_ENGINE_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: REVERT_UNRELATED_FLAG_KEY, allowedValues: [false, true], initialValue: true },
  { key: RESTART_CHECKOUT_SERVICE_KEY, allowedValues: [false, true], initialValue: false },
  { key: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, allowedValues: [false, true], initialValue: false },
];
