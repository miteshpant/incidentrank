import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // Investigation toggles are deliberately neutral — they never mutate
  // health/revenue/cost, so they must never count as a beneficial or
  // harmful configuration change either. They exist purely to drive the
  // authored diagnosisPath value in rules.ts.
  { controlKey: INSPECT_CORS_POLICY_DIFF_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY, valueEquals: true, outcome: "neutral" },
  { controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY, valueEquals: true, outcome: "neutral" },

  {
    controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
    valueEquals: "allowlist-partners",
    whenTriggerEquals: { corsHardeningLive: true },
    outcome: "beneficial",
    feedback: {
      title: "Correct fix: allowlist the partner origins",
      explanation:
        "The hardening change correctly tightened CORS to internal origins only — it just never accounted for legitimate third-party partner callers. Explicitly allowlisting the known partner origins restores their access without reopening the API to the entire internet.",
    },
  },
  {
    controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
    valueEquals: "wildcard-open",
    whenTriggerEquals: { corsHardeningLive: true },
    outcome: "harmful",
    feedback: {
      title: "Security regression: wildcard CORS",
      explanation:
        "Setting Access-Control-Allow-Origin to allow any origin does make the partner error rate drop, but it also readmits every attacker-controlled origin on the internet — a strictly worse security posture than the original pre-hardening policy, not a fix.",
    },
  },
  {
    controlKey: ROTATE_PARTNER_API_KEYS_KEY,
    valueEquals: true,
    whenTriggerEquals: { corsHardeningLive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but unrelated: rotating partner API keys",
      explanation:
        "The browser rejects the preflight request before any API key is ever read by the server — the partner's credentials were never the problem, so rotating them changes nothing.",
    },
  },
  {
    controlKey: RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
    valueEquals: true,
    whenTriggerEquals: { corsHardeningLive: true },
    outcome: "neutral",
    feedback: {
      title: "Plausible but unrelated: restarting the integration service",
      explanation:
        "The partner integration service process was never unhealthy — the browser's own CORS preflight check rejects the request before it ever reaches the service, so a restart has no effect.",
    },
  },
];
