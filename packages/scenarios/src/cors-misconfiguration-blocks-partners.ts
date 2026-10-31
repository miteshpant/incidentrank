import type { ScenarioDefinition } from "./types";
import {
  corsMisconfigurationBlocksPartnersSimulation,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
} from "./cors-misconfiguration-blocks-partners/definition";
import { corsMisconfigurationBlocksPartnersCandidateUI } from "./cors-misconfiguration-blocks-partners/candidate-ui";
import { CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING } from "./cors-misconfiguration-blocks-partners/scoring";

/**
 * A security-hardening change tightens CORS policy to internal origins
 * only — and silently breaks every legitimate third-party partner API
 * caller. Nothing is "broken" in the usual incident sense: the system is
 * doing exactly what the new policy says, and the internal web app (a
 * same-origin/already-allowlisted caller) stays completely healthy
 * throughout, which is the misleading signal. The fix that caused the
 * incident IS the incident — distinct from auth degradation (a
 * dependency failing), authz rollout failures (a policy engine bug),
 * cert expiry (an operational lapse), and privilege escalation (a
 * stale-cache security hole), none of which involve the hardening change
 * itself being the regression. The two most tempting fast fixes —
 * rotating partner API keys, or restarting the integration service — do
 * nothing, because the browser's CORS preflight check rejects the
 * request before either the API key or the service process is ever
 * involved. And the fastest-looking "fix" of all — opening CORS to any
 * origin — resolves every traffic metric while creating a strictly worse
 * security posture than the original policy, a trap the success
 * condition is explicitly authored to never reward.
 */
export const corsMisconfigurationBlocksPartners: ScenarioDefinition = {
  id: "cors-misconfiguration-blocks-partners",
  slug: "cors-misconfiguration-blocks-partners",
  version: 1,
  name: "CORS Misconfiguration Blocks Partner Integrations",
  description:
    "A security-hardening change tightens your CORS policy to internal origins only. Your own web app looks completely fine — but every legitimate third-party partner integration starts failing with browser preflight rejections. Rotating partner API keys does nothing. Restarting the integration service does nothing. Opening CORS to any origin 'fixes' the error rate but reopens your API to the entire internet. Diagnose why a legitimate security change broke a legitimate caller, and restore partner access without undoing the hardening.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: corsMisconfigurationBlocksPartnersSimulation,
  library: {
    category: "Security & Identity",
    tags: ["CORS", "Partner Integrations", "Security Hardening", "API Gateway", "Preflight"],
    primarySkill: "Diagnosing a security-vs-availability tradeoff where the fix is the incident",
    skills: [
      "Recognizing when a legitimate security change is the root cause",
      "Distinguishing browser-enforced CORS rejection from application-layer failures",
      "Rejecting a superficial fix that trades security for availability",
      "Scoping a remediation to the specific legitimate callers affected",
    ],
    shortDescription:
      "A CORS hardening change silently blocks legitimate partner API callers — the fix that caused the incident IS the incident.",
  },
};

export {
  corsMisconfigurationBlocksPartnersSimulation,
  corsMisconfigurationBlocksPartnersCandidateUI,
  CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
};
