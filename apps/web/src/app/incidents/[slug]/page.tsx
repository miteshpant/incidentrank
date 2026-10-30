import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import {
  evaluatePracticeAccess,
  type IncidentPassAccessState,
  type PaidEntitlementState,
} from "@/lib/practice-access";
import { isDevUnlockPaidScenarios } from "@/lib/server/dev-unlock";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getActiveScenarioBySlug } from "@/lib/server/scenario-registry";
import { getScenarioPassAccess } from "@/lib/server/pass-access";
import { evaluatePaidPracticeEntitlement } from "@/lib/server/stripe/entitlements";
import { db } from "@/lib/server/db";
import { GenericIncidentConsole } from "@/components/scenario-console/generic-incident-console";
import { LockedScenarioScreen } from "@/components/scenario-console/locked-scenario-screen";

// Per-scenario, per-request routing decision (unknown slug -> notFound(),
// locked vs. playable) — never a meaningful static/prerendered version,
// same reasoning as organizations/[slug]/page.tsx's own `instant = false`.
export const instant = false;

/**
 * The generic practice route for every built-in scenario except Payment
 * Retry Storm, which keeps its own hand-written route/components
 * unchanged (apps/web/src/app/incidents/payment-retry-storm) per the
 * Phase 6 promotion contract: "adding scenario #21 requires no new
 * route/component." A paid scenario renders a locked state instead of
 * the console — see practice-access.ts; the console component is never
 * even mounted for a locked scenario, so the local simulator never runs
 * for a scenario the candidate isn't entitled to practice-play.
 */
export default async function ScenarioPracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry) notFound();

  const devUnlockPaid = await isDevUnlockPaidScenarios();

  // Phase 10F: persisted scenarios.is_free is authoritative, not the
  // compiled definition literal — lets a free incident rotate without a
  // code deploy. getActiveScenarioBySlug is already scoped to
  // ownershipType="incidentrank" (see its own doc comment), so this can
  // never read a different organization's row for a colliding slug.
  // Resolved once, before any gating below, so the short-circuit at the
  // next `if` and the final evaluatePracticeAccess call can never
  // disagree about whether this scenario is free.
  const isFree = (await getActiveScenarioBySlug(slug))?.isFree ?? entry.definition.isFree;

  let paidEntitlementState: PaidEntitlementState = null;
  let incidentPassState: IncidentPassAccessState | null = null;
  let availablePassId: string | undefined;
  if (!devUnlockPaid && !isFree) {
    const user = await getOrCreateCurrentUser();
    const scenarioRow = user ? await getActiveScenarioBySlug(slug) : null;
    if (user && scenarioRow) {
      // A candidate resuming (refresh/revisit) an already-in-progress,
      // pass-funded attempt must never be locked out: by the time an
      // attempt exists, its funding pass is already "consumed" (not
      // available/bound), so the pass-state check below would otherwise
      // show the locked screen on every refresh. Mirrors the same
      // existing-attempt-first ordering fix already applied to
      // POST /api/attempts/route.ts for this exact regression class.
      const existingAttempt = await db.query.attempts.findFirst({
        where: and(
          eq(attempts.userId, user.id),
          eq(attempts.scenarioId, scenarioRow.id),
          eq(attempts.attemptType, "practice"),
          eq(attempts.status, "in_progress"),
        ),
      });
      if (existingAttempt) {
        return (
          <GenericIncidentConsole
            scenario={entry.definition}
            simulation={entry.definition.simulation}
            candidateUI={entry.candidateUI}
          />
        );
      }

      // Phase 9: Pro/Founding takes precedence over the Incident Pass —
      // when a paid entitlement already grants access, the pass must
      // never be looked up/bound/consumed at all (phase9.md §31/§50).
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
  if (!access.allowed) {
    return (
      <LockedScenarioScreen
        scenario={entry.definition}
        access={access}
        availablePassId={availablePassId}
      />
    );
  }

  return (
    <GenericIncidentConsole
      scenario={entry.definition}
      simulation={entry.definition.simulation}
      candidateUI={entry.candidateUI}
    />
  );
}
