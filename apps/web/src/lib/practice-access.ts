export type PracticeAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "paid_scenario_locked" };

/**
 * The single centralized answer to "may this user practice-play this
 * scenario right now?" — isomorphic (client and server both import this
 * exact function; apps/web/src/lib/server/practice-access.ts re-exports
 * it for server-only call sites) so the library UI's lock state and the
 * API route's enforcement can never drift apart.
 *
 * Per docs/implementation_plan/phase6.md's Access Model: no billing or
 * entitlement system exists yet (Phase 6 scope). Free scenarios are
 * always playable, including anonymous/signed-out candidates. Paid
 * scenarios are locked for everyone in practice mode — signed in or not
 * — until a real personal-entitlement system exists. Do not invent a
 * dummy/fake entitlement to unblock testing; a locked paid scenario
 * staying locked is the correct, intended behavior right now.
 *
 * This function answers PRACTICE access only. Company-assigned
 * assessment attempts never call this — assessment entitlement comes
 * from a valid assessment assignment, a completely separate
 * authorization path, unaffected by whether the underlying scenario is
 * paid. A candidate completing a paid scenario through an assessment
 * still cannot independently start that same scenario in practice mode
 * afterward.
 *
 * `devUnlockPaid` is the one deliberate exception: a local-development-only
 * convenience (see apps/web/src/lib/server/dev-unlock.ts) that lets a
 * developer running the app on localhost play paid scenarios without a
 * real entitlement system. It is never derived here — callers compute it
 * from an env flag gated to non-production + localhost requests, so this
 * function itself has no notion of environment.
 */
export function evaluatePracticeAccess(
  scenario: { isFree: boolean },
  opts?: { devUnlockPaid?: boolean },
): PracticeAccessResult {
  if (scenario.isFree) return { allowed: true };
  if (opts?.devUnlockPaid) return { allowed: true };
  return { allowed: false, reason: "paid_scenario_locked" };
}
