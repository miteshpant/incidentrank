import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAssessmentAttempt, submitAction } from "@/lib/server/assessment-runtime";
import type { ControlValue } from "@incidentrank/simulator";

interface ActionChangeBody {
  controlKey?: unknown;
  value?: unknown;
}

interface SubmitActionBody {
  actionRequestId?: unknown;
  changes?: unknown;
  reasoning?: unknown;
}

function isValidControlValueShape(value: unknown): value is ControlValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isValidChange(value: unknown): value is { controlKey: string; value: ControlValue } {
  const change = value as ActionChangeBody;
  return typeof change.controlKey === "string" && isValidControlValueShape(change.value);
}

/**
 * Candidate action submission (Phase 5.1): the server reconstructs
 * authoritative current state, validates the requested control/value
 * against the scenario's own control definitions, applies the change
 * through packages/simulator's simulate() — the only place scenario
 * behavior is ever computed — and returns the resulting candidate-safe
 * state. Never accepts or trusts a client-supplied elapsed time or
 * resulting state.
 *
 * `actionRequestId` is a client-generated idempotency key, not the
 * reasoning text or a timestamp (both of which are unsuitable identity:
 * reasoning can legitimately repeat, and a timestamp does not survive a
 * genuine retry of the exact same logical request). A resubmission
 * carrying the same key is treated as already-applied — see
 * submitAction's transactional uniqueness guarantee.
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
  const owned = await loadOwnedAssessmentAttempt(attemptId, user.id);
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 404 ? "Not found" : "Forbidden" },
      { status: owned.status },
    );
  }

  const body = (await request.json().catch(() => null)) as SubmitActionBody | null;

  if (
    typeof body?.actionRequestId !== "string" ||
    body.actionRequestId.trim().length === 0 ||
    !Array.isArray(body.changes) ||
    body.changes.length === 0 ||
    !body.changes.every(isValidChange)
  ) {
    return NextResponse.json({ error: "Invalid action payload" }, { status: 400 });
  }

  const reasoning =
    typeof body.reasoning === "string" && body.reasoning.trim().length > 0
      ? body.reasoning
      : null;

  const result = await submitAction(
    owned.attempt,
    body.actionRequestId,
    body.changes,
    reasoning,
  );

  if (!result.ok) {
    if (result.reason === "terminal") {
      return NextResponse.json({ error: "This attempt has already finished" }, { status: 409 });
    }
    if (result.reason === "invalid_control" || result.reason === "invalid_value") {
      return NextResponse.json(
        { error: `Invalid control or value: ${result.controlKey}` },
        { status: 400 },
      );
    }
    if (result.reason === "empty_changes") {
      return NextResponse.json({ error: "No changes submitted" }, { status: 400 });
    }
    console.error(`Failed to submit action for attempt ${attemptId}: ${result.reason}`);
    return NextResponse.json(
      { error: "We couldn't apply that change. Your existing attempt has not been changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attemptStatus: result.attemptStatus,
    isPaused: result.isPaused,
    runtime: result.view,
    actionGroups: result.actionGroups,
  });
}
