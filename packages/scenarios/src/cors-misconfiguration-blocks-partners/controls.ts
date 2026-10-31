import type { ControlDefinition } from "@incidentrank/simulator";

// ── Investigation controls (non-destructive) ───────────────────────────
// Toggles a candidate flips to signal "I looked here." None of these
// change component health, revenue loss, or cost — they only advance
// `investigation*Done` state keys, which the rule table reads to
// determine the authored `diagnosisPath` value (see rules.ts). Mirrors
// the reference incident's investigation-control pattern exactly.
export const INSPECT_CORS_POLICY_DIFF_KEY = "inspectCorsPolicyDiff";
export const INSPECT_PARTNER_ERROR_LOGS_KEY = "inspectPartnerErrorLogs";
export const INSPECT_PREFLIGHT_RESPONSES_KEY = "inspectPreflightResponses";

// ── Remediation controls (state-mutating) ──────────────────────────────
// corsAllowedOriginsMode is the central control: the security-hardening
// change that caused the incident set it to "strict-internal-only"
// (blocks every third-party partner origin, including the legitimate
// ones). The correct fix is "allowlist-partners" — re-admit the known
// partner origins by name while keeping the hardening everywhere else.
// "wildcard-open" is a plausible-but-dangerous overcorrection: it "fixes"
// the symptom by reflecting Access-Control-Allow-Origin: * (or echoing
// the request Origin), which also re-admits every attacker-controlled
// origin — a worse security posture than the ORIGINAL pre-incident
// policy, not just an incomplete fix.
export const CORS_ALLOWED_ORIGINS_MODE_KEY = "corsAllowedOriginsMode";
export const ROTATE_PARTNER_API_KEYS_KEY = "rotatePartnerApiKeys";
export const RESTART_PARTNER_INTEGRATION_SERVICE_KEY = "restartPartnerIntegrationService";

export const controls: ControlDefinition[] = [
  { key: INSPECT_CORS_POLICY_DIFF_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_PARTNER_ERROR_LOGS_KEY, allowedValues: [false, true], initialValue: false },
  { key: INSPECT_PREFLIGHT_RESPONSES_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: CORS_ALLOWED_ORIGINS_MODE_KEY,
    allowedValues: ["strict-internal-only", "allowlist-partners", "wildcard-open"],
    initialValue: "strict-internal-only",
  },
  { key: ROTATE_PARTNER_API_KEYS_KEY, allowedValues: [false, true], initialValue: false },
  {
    key: RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
