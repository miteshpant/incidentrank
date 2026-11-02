import "server-only";
import { and, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import {
  evaluatePracticeAccess,
  type PracticeAccessResult,
  type IncidentPassAccessState,
  type PaidEntitlementState,
} from "@/lib/practice-access";
import { isDevUnlockPaidScenarios } from "./dev-unlock";
import { getOrCreateCurrentUser } from "./current-user";
import { isCurrentWeeklyChallenge } from "./weekly-challenge";
import { getScenarioPassAccess } from "./pass-access";
import { evaluatePaidPracticeEntitlement } from "./stripe/entitlements";
import { db } from "./db";
import type { ScenarioWithVersion } from "./scenario-registry";

export interface ResolvedPracticeAccess {
  access: PracticeAccessResult;
  /** True when the signed-in user already has an in-progress practice
   * attempt against this scenario — a resuming candidate must always be
   * let through regardless of `access`, matching page.tsx's existing
   * pass-funded-resume-after-consumption fix. */
  hasExistingInProgressAttempt: boolean;
  availablePassId?: string;
}

/**
 * The single centralized "may this request play this built-in scenario
 * right now?" resolver — extracted from apps/web/src/app/incidents/
 * [slug]/page.tsx so the page's own render-time gate and the simulation-
 * fetch API route (GET /api/incidents/[slug]/simulation) can never drift
 * apart, same discipline practice-access.ts's own doc comment calls out
 * for evaluatePracticeAccess itself ("the library UI's lock state and the
 * API route's enforcement can never drift apart").
 */
export async function resolveBuiltInScenarioPracticeAccess(
  scenarioForAccess: ScenarioWithVersion | null,
  codeIsFree: boolean,
): Promise<ResolvedPracticeAccess> {
  const devUnlockPaid = await isDevUnlockPaidScenarios();

  const persistedOrCodeIsFree = scenarioForAccess?.isFree ?? codeIsFree;
  const isFree =
    persistedOrCodeIsFree ||
    (scenarioForAccess ? await isCurrentWeeklyChallenge(scenarioForAccess.id) : false);

  let paidEntitlementState: PaidEntitlementState = null;
  let incidentPassState: IncidentPassAccessState | null = null;
  let availablePassId: string | undefined;

  if (!devUnlockPaid && !isFree) {
    const user = await getOrCreateCurrentUser();
    const scenarioRow = user ? scenarioForAccess : null;
    if (user && scenarioRow) {
      const existingAttempt = await db.query.attempts.findFirst({
        where: and(
          eq(attempts.userId, user.id),
          eq(attempts.scenarioId, scenarioRow.id),
          eq(attempts.attemptType, "practice"),
          eq(attempts.status, "in_progress"),
        ),
      });
      if (existingAttempt) {
        return {
          access: { allowed: true, mode: "free" },
          hasExistingInProgressAttempt: true,
        };
      }

      paidEntitlementState = await evaluatePaidPracticeEntitlement(user.id);
      if (!paidEntitlementState) {
        const passAccess = await getScenarioPassAccess(user.id, scenarioRow.id);
        incidentPassState = passAccess.state;
        availablePassId = passAccess.passId;
      }
    }
  }

  const access = evaluatePracticeAccess(
    { isFree },
    { devUnlockPaid, paidEntitlementState, incidentPassState },
  );

  return { access, hasExistingInProgressAttempt: false, availablePassId };
}
