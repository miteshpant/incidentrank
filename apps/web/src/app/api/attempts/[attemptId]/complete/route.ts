import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessmentCandidates, attempts } from "@incidentrank/db";
import type { ScoringInputs } from "@incidentrank/simulator";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { scoreAttempt } from "@/lib/server/scoring-helper";

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

  if (owned.attempt.status !== "in_progress") {
    // Already completed — attempts are immutable once terminal.
    return NextResponse.json({ attempt: owned.attempt });
  }

  const body = (await request.json().catch(() => null)) as
    | CompleteAttemptBody
    | null;

  if (
    (body?.status !== "resolved" && body?.status !== "failed") ||
    !isValidScoringInputs(body.scoringInputs)
  ) {
    return NextResponse.json(
      { error: "Invalid completion payload" },
      { status: 400 },
    );
  }

  const inputs = body.scoringInputs;
  const result = await scoreAttempt(owned.attempt, inputs);

  const recoveryTimeMs =
    inputs.incidentStartedAtMs !== null &&
    (inputs.resolvedAtMs !== null || inputs.failedAtMs !== null)
      ? (inputs.resolvedAtMs ?? inputs.failedAtMs ?? 0) -
        inputs.incidentStartedAtMs
      : null;

  const [updated] = await db
    .update(attempts)
    .set({
      status: body.status,
      completedAt: new Date(),
      incidentStartedAt: inputs.incidentStartedAtMs
        ? new Date(owned.attempt.startedAt.getTime() + inputs.incidentStartedAtMs)
        : null,

      score: result.total,
      recoveryScore: result.breakdown.recovery,
      customerImpactScore: result.breakdown.customerImpact,
      dataIntegrityScore: result.breakdown.dataIntegrity,
      reliabilityScore: result.breakdown.reliability,
      costEfficiencyScore: result.breakdown.costEfficiency,
      operationalEfficiencyScore: result.breakdown.operationalEfficiency,

      recoveryTimeMs,
      revenueLossUsd: inputs.revenueLossUsd,

      peakSeverityRank: inputs.peakSeverityRank,
      peakInfrastructureCostUsd: inputs.peakMonthlyInfrastructureCostUsd,
      peakKafkaLagMessages: inputs.peakNumericValues.kafkaLagMessages ?? 0,

      numberOfConfigurationChanges: inputs.numberOfConfigurationChanges,
      numberOfBeneficialChanges: inputs.numberOfBeneficialChanges,
      numberOfHarmfulChanges: inputs.numberOfHarmfulChanges,

      finalStateJson: body.finalState ?? null,
    })
    .where(eq(attempts.id, attemptId))
    .returning();

  if (owned.attempt.attemptType === "assessment" && owned.attempt.assessmentId) {
    await db
      .update(assessmentCandidates)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assessmentCandidates.attemptId, attemptId));
  }

  return NextResponse.json({ attempt: updated, score: result });
}
