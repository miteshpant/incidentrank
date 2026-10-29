import "server-only";

/**
 * Phase 10D (docs/implementation_plan/phasse10d.md §53). Single source of
 * truth for the "current" version of each legal/consent document —
 * acceptance checks always compare a stored acceptance's version string
 * against these constants, never a hardcoded literal at the call site.
 * Bumping a constant here immediately makes every prior acceptance at
 * that type "stale" (requires re-acceptance where the gate applies) —
 * see legal-acceptance.ts.
 *
 * LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA — see phase10d completion
 * report for the full list of unresolved attorney/business-input items.
 */

export const CURRENT_TERMS_VERSION = "2026-10-v1";
export const CURRENT_PRIVACY_VERSION = "2026-10-v1";
export const CURRENT_ASSESSMENT_NOTICE_VERSION = "2026-10-v1";
export const CURRENT_ORG_TERMS_VERSION = "2026-10-v1";

/**
 * The legal-acceptance gate (§28, confirmed product decision) applies
 * only to users created at or after this cutover — existing users from
 * before Phase 10D shipped are deliberately never retroactively gated.
 * Matches this codebase's every-flag-defaults-off convention
 * (feature-flags.ts): unset means "gate no one" (returns a far-future
 * date, never Date(0)) — the opposite default would retroactively gate
 * every pre-existing user/test-fixture in any environment that forgot
 * to configure this explicitly, which is exactly the regression this
 * default must not cause. A real rollout sets this explicitly to the
 * actual cutover instant before enabling the gate for real.
 */
export function legalAcceptanceGateCutoverAt(): Date {
  const raw = process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT;
  if (!raw) return new Date("9999-12-31T00:00:00Z");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date("9999-12-31T00:00:00Z");
  return parsed;
}
