import { NextResponse } from "next/server";
import type { ScoringInputs } from "@incidentrank/simulator";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { scoreAuthoredAttempt } from "@incidentrank/scenarios/authoring";
import { evaluatePracticeAccess } from "@/lib/server/practice-access";
import { isDevUnlockPaidScenariosRequest } from "@/lib/server/dev-unlock";

interface ScorePreviewBody {
  scenarioSlug?: unknown;
  scoringInputs?: unknown;
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

/**
 * Stateless, unauthenticated scoring for anonymous practice attempts —
 * the one exception to "every scored attempt has an attempts row,"
 * because anonymous practice attempts are never persisted at all (see
 * apps/web/src/lib/use-incident-attempt.ts). No attempt is created or
 * modified here; this is a pure function of (scenarioSlug,
 * scoringInputs) -> score, scoped to built-in FREE scenarios only (the
 * only scenarios anonymous users may ever practice-play at all — see
 * practice-access.ts). The browser never computes a score itself for
 * any scenario, built-in or authored, signed in or anonymous — this
 * endpoint exists so anonymous candidates still get a fully scored
 * result without that rule ever being broken.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ScorePreviewBody | null;

  if (typeof body?.scenarioSlug !== "string" || !isValidScoringInputs(body.scoringInputs)) {
    return NextResponse.json({ error: "Invalid score preview payload" }, { status: 400 });
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

  const result = scoreAuthoredAttempt(entry.scoring, body.scoringInputs);
  return NextResponse.json({ score: { total: result.total, breakdown: result.breakdown } });
}
