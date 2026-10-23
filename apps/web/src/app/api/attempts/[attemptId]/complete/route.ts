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
 * state (success for an automatic-mode scenario, or failure for any
 * scenario, any completion mode) with no candidate decision involved.
 * This is distinct from POST /api/attempts/[attemptId]/finish, which
 * represents an explicit candidate "I'm done" declaration — see
 * docs/implementation_plan/phase6.1.md's "Candidate completion is a
 * final assessment decision, not a hint request" and
 * apps/web/src/lib/server/finish-attempt.ts's docblock for the full
 * distinction. Both converge on the shared persistTerminalAttempt
 * primitive for the actual row mutation.
 *
 * Guard: a candidate_declared scenario's sustained success must NEVER be
 * persisted as "resolved" through this route — only Finish may do that.
 * This route may still persist an automatic failure for a
 * candidate_declared scenario (failure remains unconditional in every
 * mode), but never a client-claimed "resolved" for one.
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

  const isCandidateDeclared = (scenario.completion?.mode ?? "automatic") === "candidate_declared";
  if (isCandidateDeclared && body.status === "resolved") {
    // A candidate_declared scenario's sustained success is never
    // auto-converted into "resolved" by this route, regardless of what
    // the client claims — only an explicit Finish declaration
    // (POST .../finish) may do that. The client-local engine for such a
    // scenario cannot even reach status==="resolved" on its own (see
    // packages/simulator/src/tick.ts's completion-mode gate), so a
    // request claiming otherwise is either a stale/buggy client or a
    // direct API call attempting to bypass Finish.
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
