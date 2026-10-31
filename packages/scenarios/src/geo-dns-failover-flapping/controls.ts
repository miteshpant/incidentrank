import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Toggles a candidate flips to signal "I looked here." None of these
// change component health, revenue loss, or cost — they only advance
// `investigation*Done`-style state keys that the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Same
// pattern as the reference incident's investigation controls: the
// engine has no separate "investigation action" primitive, so all of
// an investigation control's actual behavior comes from how the rule
// table and action-classification table treat these specific keys.
export const INSPECT_HEALTH_CHECK_LOGS_KEY = "inspectHealthCheckLogs";
export const INSPECT_REGION_LATENCY_HISTORY_KEY = "inspectRegionLatencyHistory";
export const INSPECT_DNS_FAILOVER_HISTORY_KEY = "inspectDnsFailoverHistory";

// ── Remediation controls (state-mutating) ──────────────────────────────
// The real root cause: the health checker fails a region over to its
// sibling after a single slow probe, and fails it back the instant one
// probe looks fast again — the hysteresis (confirmation count) is too
// thin for transient latency blips. Correct fix is a combination of
// raising HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY (more consecutive
// bad probes required before flipping) and loosening
// HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY (so a single blip doesn't even
// count as "bad"). Either alone only partially damps the flap; both
// together stop it.
export const HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY = "healthCheckFailureStreakRequired";
export const HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY = "healthCheckLatencyToleranceMs";

// Plausible-but-inferior remediation: manually pin DNS to one region
// instead of fixing the health-check sensitivity. This does stop the
// flapping (the candidate will see the symptom disappear), but it is
// not the real fix — it silently disables automated failover entirely,
// leaving the business with zero protection if that single pinned
// region has a genuine outage later. Classified "neutral", not
// "harmful" (it doesn't make the CURRENT incident worse), per the
// authoring rule that a plausible wrong turn without active harm stays
// neutral.
export const FORCE_PIN_REGION_KEY = "forcePinRegion";

export const controls: ControlDefinition[] = [
  { key: INSPECT_HEALTH_CHECK_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_REGION_LATENCY_HISTORY_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_DNS_FAILOVER_HISTORY_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
    allowedValues: [1, 2, 3, 5],
    initialValue: 1,
  },
  {
    key: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
    allowedValues: [150, 300, 600, 1_200],
    initialValue: 150,
  },
  { key: FORCE_PIN_REGION_KEY, allowedValues: [false, true], initialValue: false },
];
