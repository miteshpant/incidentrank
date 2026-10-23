import { NextResponse } from "next/server";
import type { ControlValue, ReplayActionGroup } from "@incidentrank/simulator";
import {
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  replayAttempt,
} from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { scoreAuthoredAttempt } from "@incidentrank/scenarios/authoring";
import { evaluatePracticeAccess } from "@/lib/server/practice-access";
import { isDevUnlockPaidScenariosRequest } from "@/lib/server/dev-unlock";

interface FinishPreviewActionGroup {
  elapsedMs?: unknown;
  changes?: unknown;
}

interface FinishPreviewBody {
  scenarioSlug?: unknown;
  elapsedMs?: unknown;
  actionGroups?: unknown;
  note?: unknown;
}

const MAX_NOTE_LENGTH = 1000;

function isValidControlValueShape(value: unknown): value is ControlValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isValidChange(value: unknown): value is { controlKey: string; value: ControlValue } {
  if (typeof value !== "object" || value === null) return false;
  const change = value as { controlKey?: unknown; value?: unknown };
  return typeof change.controlKey === "string" && isValidControlValueShape(change.value);
}

function isValidActionGroup(value: unknown): value is ReplayActionGroup {
  if (typeof value !== "object" || value === null) return false;
  const group = value as FinishPreviewActionGroup;
  return (
    typeof group.elapsedMs === "number" &&
    Array.isArray(group.changes) &&
    group.changes.every(isValidChange)
  );
}

/**
 * Stateless, unauthenticated Finish evaluation for anonymous practice
 * attempts — the candidate-declared-completion counterpart to
 * POST /api/attempts/[attemptId]/finish, for the one case with no
 * persisted attempt row to load (anonymous practice attempts are never
 * persisted at all — see apps/web/src/lib/use-incident-attempt.ts).
 *
 * Per the binding Phase 6.1 decision, this does NOT trust a client-
 * computed final state or ScoringInputs (unlike the older /score-preview
 * route) — the client sends only the replayable PUBLIC attempt history
 * (scenario slug/version, action groups, elapsed simulation time, an
 * optional note), and the server deterministically replays it through
 * the exact same packages/simulator engine every other runtime uses,
 * evaluates completion eligibility from that replayed state, and scores
 * it. Nothing is persisted; this is a pure function of the submitted
 * history. Scoped to built-in FREE scenarios only, matching the existing
 * anonymous-practice access boundary.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as FinishPreviewBody | null;

  if (
    typeof body?.scenarioSlug !== "string" ||
    typeof body.elapsedMs !== "number" ||
    !Array.isArray(body.actionGroups) ||
    !body.actionGroups.every(isValidActionGroup)
  ) {
    return NextResponse.json({ error: "Invalid finish preview payload" }, { status: 400 });
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "Invalid finish preview payload" }, { status: 400 });
  }
  if (typeof body.note === "string" && body.note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Completion note must be ${MAX_NOTE_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, body.scenarioSlug);
  if (!entry) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  }

  const devUnlockPaid = isDevUnlockPaidScenariosRequest(request.headers.get("host"));
  const access = evaluatePracticeAccess({ isFree: entry.definition.isFree }, { devUnlockPaid });
  if (!access.allowed) {
    return NextResponse.json(
      { error: "This scenario is not available in practice mode without an entitlement." },
      { status: 403 },
    );
  }

  const scenario = entry.definition.simulation;
  if ((scenario.completion?.mode ?? "automatic") !== "candidate_declared") {
    return NextResponse.json(
      { error: "This scenario does not support candidate-declared completion" },
      { status: 400 },
    );
  }

  const { state } = replayAttempt({
    scenario,
    elapsedMs: body.elapsedMs,
    actionGroups: body.actionGroups,
  });

  const finishResult = evaluateCandidateDeclaredFinish(scenario, state);
  const inputs = extractFinishScoringInputs(scenario, finishResult);
  const result = scoreAuthoredAttempt(entry.scoring, inputs);

  return NextResponse.json({
    outcome: finishResult.outcome,
    completionTier: finishResult.completionTier,
    score: { total: result.total, breakdown: result.breakdown },
  });
}
