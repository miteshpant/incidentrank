import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getActiveScenarioBySlug } from "@/lib/server/scenario-registry";
import { evaluatePracticeAccess } from "@/lib/server/practice-access";
import { isDevUnlockPaidScenariosRequest } from "@/lib/server/dev-unlock";
import { getScenarioPassAccess } from "@/lib/server/pass-access";
import { consumeIncidentPass, findPassForScenario } from "@/lib/server/incident-passes";
import { evaluatePaidPracticeEntitlement } from "@/lib/server/stripe/entitlements";

interface CreateAttemptBody {
  scenarioSlug?: unknown;
}

export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateAttemptBody
    | null;
  const scenarioSlug = body?.scenarioSlug;
  if (typeof scenarioSlug !== "string") {
    return NextResponse.json(
      { error: "scenarioSlug is required" },
      { status: 400 },
    );
  }

  const scenario = await getActiveScenarioBySlug(scenarioSlug);
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  }

  // Idempotent: a candidate who already has an in-progress practice
  // attempt for this exact scenario gets that attempt back instead of a
  // silent duplicate — acknowledging the briefing again after a
  // navigate-away/refresh must resume the existing attempt, never orphan
  // it behind an unreachable second row (see attempt-resume.test.ts's
  // "no duplicate attempt" coverage for the equivalent assessment-side
  // guarantee this mirrors). Deliberately checked BEFORE the access/pass
  // evaluation below: once a pass-funded attempt is in progress, the
  // funding pass is already "consumed" (not available/bound), so an
  // access check running first would incorrectly 403 a legitimate
  // resume — Phase 8 regression, see "resuming... does not consume a
  // second pass" in route.test.ts.
  const existing = await db.query.attempts.findFirst({
    where: and(
      eq(attempts.userId, user.id),
      eq(attempts.scenarioId, scenario.id),
      eq(attempts.attemptType, "practice"),
      eq(attempts.status, "in_progress"),
    ),
  });
  if (existing) {
    return NextResponse.json({ attempt: existing });
  }

  const devUnlockPaid = isDevUnlockPaidScenariosRequest(request.headers.get("host"));
  // Phase 10F: persisted scenarios.is_free is now authoritative — lets a
  // free incident rotate without a code deploy. `scenario` here is
  // already scoped to ownershipType="incidentrank" by
  // getActiveScenarioBySlug, so this can never read a different
  // organization's row for a colliding slug. Falls back to false (not
  // the code literal) if is_free is somehow null, matching every other
  // resolution's existing "unknown → locked" default.
  const isFree = scenario.isFree ?? false;

  // Phase 9: Pro/Founding takes precedence over the Incident Pass — when
  // a paid entitlement already grants access, the pass must never be
  // looked up/bound/consumed at all (phase9.md §31/§50), enforced here
  // regardless of what the client claims, same as the pass check below.
  const paidEntitlementState =
    !devUnlockPaid && !isFree ? await evaluatePaidPracticeEntitlement(user.id) : null;

  // Phase 8: a direct API call must enforce the exact same Incident Pass
  // rule the UI shows — the pass-state lookup happens here regardless of
  // what the client claims, never trusting a client-supplied "I have a
  // pass" flag (docs/implementation_plan/
  // phase8_admin_promotional_access_referrals.md §13's "direct API
  // attempts must enforce the same rule").
  const passAccess =
    !devUnlockPaid && !isFree && !paidEntitlementState
      ? await getScenarioPassAccess(user.id, scenario.id)
      : null;

  const access = evaluatePracticeAccess(
    { isFree },
    { devUnlockPaid, paidEntitlementState, incidentPassState: passAccess?.state ?? null },
  );
  if (!access.allowed) {
    return NextResponse.json(
      { error: "This scenario is not available in practice mode without an entitlement." },
      { status: 403 },
    );
  }

  // Phase 8: pass consumption and attempt creation happen atomically in
  // one transaction — "pass consumed" and "attempt created with this
  // pass linked" must never be observable as two separate states (docs/
  // implementation_plan/phase8_admin_promotional_access_referrals.md
  // §29's "Pass consumption / attempt start" transaction boundary). A
  // concurrent loser (another request already consumed this exact pass
  // first) is an expected, clean conflict — not a server error — so it
  // rolls the transaction back and surfaces as 409, creating no attempt
  // row at all for the loser.
  const PASS_ALREADY_CONSUMED = Symbol("pass_already_consumed");
  let attempt;
  try {
    attempt = await db.transaction(async (tx) => {
      let incidentPassId: string | null = null;

      if (access.allowed && access.mode === "incident_pass_bound_here") {
        const pass = await findPassForScenario(user.id, scenario.id);
        if (!pass) {
          throw new Error("Expected a pass bound to this scenario but found none");
        }
        const consumeResult = await consumeIncidentPass(tx, {
          passId: pass.id,
          userId: user.id,
          scenarioId: scenario.id,
        });
        if (!consumeResult.ok) {
          throw PASS_ALREADY_CONSUMED;
        }
        incidentPassId = consumeResult.pass.id;
      }

      const [created] = await tx
        .insert(attempts)
        .values({
          userId: user.id,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          attemptType: "practice",
          status: "in_progress",
          incidentPassId,
        })
        .returning();
      if (!created) throw new Error("Failed to create attempt");
      return created;
    });
  } catch (error) {
    if (error === PASS_ALREADY_CONSUMED) {
      return NextResponse.json(
        { error: "This Incident Pass has already been used to start an attempt." },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ attempt });
}

export async function GET(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scenarioSlug = new URL(request.url).searchParams.get("scenarioSlug");

  // Scoped lookup used by the practice console on mount to discover
  // whether the candidate already has an in-progress attempt for this
  // exact scenario (resume flow) — distinct from the unscoped history
  // list below.
  if (scenarioSlug) {
    const scenario = await getActiveScenarioBySlug(scenarioSlug);
    if (!scenario) {
      return NextResponse.json({ attempt: null });
    }
    const existing = await db.query.attempts.findFirst({
      where: and(
        eq(attempts.userId, user.id),
        eq(attempts.scenarioId, scenario.id),
        eq(attempts.attemptType, "practice"),
        eq(attempts.status, "in_progress"),
      ),
    });
    return NextResponse.json({ attempt: existing ?? null });
  }

  const rows = await db.query.attempts.findMany({
    where: eq(attempts.userId, user.id),
    orderBy: [desc(attempts.createdAt)],
    with: { scenario: true },
  });

  return NextResponse.json({ attempts: rows });
}
