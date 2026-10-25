import { NextResponse } from "next/server";
import type { ScoringInputs, SimulationState } from "@incidentrank/simulator";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { resolveSimulationDefinition } from "@/lib/server/scenario-registry";
import { persistTerminalAttempt } from "@/lib/server/terminal-attempt";
import { isAttemptActive } from "@/lib/attempt-lifecycle";

interface CompleteAttemptBody {
  status?: unknown;
  scoringInputs?: unknown;
  finalState?: unknown;
}

function isValidScoringInputs(value: unknown): value is ScoringInputs {
  if (typeof value !== "object" || value === null) return false;
  const inputs = value as Record<string, unknown>;
  return (
    "incidentStartedAtMs" in inputs &&
    "resolvedAtMs" in inputs &&
    "failedAtMs" in inputs &&
    typeof inputs.revenueLossUsd === "number"
  );
}

function isValidSimulationState(value: unknown): value is SimulationState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.simulationTimeMs === "number" &&
    typeof state.status === "string" &&
    typeof state.values === "object" &&
    state.values !== null
  );
}

/**
 * The AUTOMATIC completion path — the engine itself reached a terminal
 * FAILURE state with no candidate decision involved. This is distinct
 * from POST /api/attempts/[attemptId]/finish, which represents an
 * explicit candidate "I'm done" declaration — see
 * docs/implementation_plan/phase6.1.md's "Candidate completion is a
 * final assessment decision, not a hint request" and
 * apps/web/src/lib/server/finish-attempt.ts's docblock for the full
 * distinction. Both converge on the shared persistTerminalAttempt
 * primitive for the actual row mutation.
 *
 * Guard: per the Phase 7.1 doctrine ("the system may fail a candidate
 * automatically, but it must never pass a candidate automatically"), a
 * client-claimed "resolved" is rejected UNCONDITIONALLY through this
 * route, for every scenario — no completion mode may ever legitimately
 * reach automatic success (see packages/simulator/src/tick.ts, which
 * never auto-writes status="resolved" for any mode). A request claiming
 * otherwise is either a stale/buggy client or a direct API call
 * attempting to bypass Finish. A client-claimed "failed" remains
 * accepted, since automatic failure stays unconditional in every mode.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const owned = await loadOwnedAttempt(attemptId, user);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  if (!isAttemptActive(owned.attempt)) {
    // Already completed — attempts are immutable once terminal. Still
    // return the already-persisted score (not just a bare {attempt}): a
    // legitimate retried/duplicate call (e.g. a double-mounted effect)
    // must be able to recover the score it's waiting on, not be left
    // looking identical to an outright failure.
    return NextResponse.json({
      score:
        owned.attempt.score !== null
          ? {
              total: owned.attempt.score,
              breakdown: {
                recovery: owned.attempt.recoveryScore ?? 0,
                customerImpact: owned.attempt.customerImpactScore ?? 0,
                dataIntegrity: owned.attempt.dataIntegrityScore ?? 0,
                reliability: owned.attempt.reliabilityScore ?? 0,
                costEfficiency: owned.attempt.costEfficiencyScore ?? 0,
                operationalEfficiency: owned.attempt.operationalEfficiencyScore ?? 0,
              },
            }
          : null,
    });
  }

  const body = (await request.json().catch(() => null)) as
    | CompleteAttemptBody
    | null;

  if (
    (body?.status !== "resolved" && body?.status !== "failed") ||
    !isValidScoringInputs(body.scoringInputs) ||
    !isValidSimulationState(body.finalState)
  ) {
    return NextResponse.json(
      { error: "Invalid completion payload" },
      { status: 400 },
    );
  }

  const scenario = await resolveSimulationDefinition(
    owned.attempt.scenario,
    owned.attempt.scenarioVersion,
  );
  if (!scenario) {
    return NextResponse.json({ error: "Scenario version unresolvable" }, { status: 500 });
  }

  if (body.status === "resolved") {
    return NextResponse.json(
      {
        error:
          "This scenario requires an explicit Finish Incident declaration to resolve. Automatic completion cannot mark it resolved.",
      },
      { status: 400 },
    );
  }

  const inputs = body.scoringInputs;

  const result = await persistTerminalAttempt(db, owned.attempt, inputs, body.finalState, {
    outcome: body.status,
  });

  return NextResponse.json({ score: result });
}
