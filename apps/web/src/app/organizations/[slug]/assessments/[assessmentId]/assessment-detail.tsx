import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgAssessment } from "@/lib/server/assessment-access";
import { db } from "@/lib/server/db";
import { formatNumber } from "@/lib/format";
import { InviteCandidateForm } from "./invite-candidate-form";
import { AssessmentStatusControls } from "./assessment-status-controls";
import { CandidateRow } from "./candidate-row";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  started: "Started",
  completed: "Completed",
};

const ATTEMPT_OUTCOME_LABEL: Record<string, string> = {
  resolved: "Resolved",
  failed: "Failed",
  in_progress: "In Progress",
  abandoned: "Abandoned",
};

interface AssessmentDetailProps {
  slug: string;
  assessmentId: string;
}

export async function AssessmentDetail({ slug, assessmentId }: AssessmentDetailProps) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects this route; unreachable in practice.

  const result = await loadOrgAssessment(slug, assessmentId, user);
  if (!result.ok) notFound();

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, result.assessment.scenarioId),
  });

  const candidates = await db.query.assessmentCandidates.findMany({
    where: (table, { eq }) => eq(table.assessmentId, assessmentId),
    with: { user: true, attempt: true },
    orderBy: (table, { desc }) => [desc(table.invitedAt)],
  });

  // Results table ordering: completed first, score descending, recovery
  // time ascending, revenue loss ascending — an assessment results table,
  // not a gamified leaderboard, per the Phase 4 spec.
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aCompleted = a.status === "completed" ? 1 : 0;
    const bCompleted = b.status === "completed" ? 1 : 0;
    if (aCompleted !== bCompleted) return bCompleted - aCompleted;

    const aScore = a.attempt?.score ?? -1;
    const bScore = b.attempt?.score ?? -1;
    if (aScore !== bScore) return bScore - aScore;

    const aRecovery = a.attempt?.recoveryTimeMs ?? Number.MAX_SAFE_INTEGER;
    const bRecovery = b.attempt?.recoveryTimeMs ?? Number.MAX_SAFE_INTEGER;
    if (aRecovery !== bRecovery) return aRecovery - bRecovery;

    const aRevenue = a.attempt?.revenueLossUsd ?? Number.MAX_SAFE_INTEGER;
    const bRevenue = b.attempt?.revenueLossUsd ?? Number.MAX_SAFE_INTEGER;
    return aRevenue - bRevenue;
  });

  const canManage = canMutate(result.membership.role);

  return (
    <>
      <Link
        href={`/organizations/${slug}`}
        className="font-mono text-xs text-muted hover:text-foreground"
      >
        ← Back to organization
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {result.assessment.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {scenario?.name ?? "Unknown scenario"} · v{result.assessment.scenarioVersion} ·{" "}
            created {result.assessment.createdAt.toLocaleDateString()}
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted">
          {STATUS_LABEL[result.assessment.status] ?? result.assessment.status}
        </span>
      </div>

      {canManage && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <AssessmentStatusControls
            slug={slug}
            assessmentId={assessmentId}
            status={result.assessment.status}
          />
        </div>
      )}

      {canManage && result.assessment.status !== "closed" && (
        <div className="mt-6">
          <InviteCandidateForm slug={slug} assessmentId={assessmentId} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Candidates
        </h2>
        {sortedCandidates.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No candidates invited yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Candidate</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((candidate) => {
                  const displayName = candidate.user?.displayName ?? candidate.email;
                  const href =
                    candidate.status === "completed"
                      ? `/organizations/${slug}/assessments/${assessmentId}/candidates/${candidate.id}`
                      : null;

                  return (
                    <CandidateRow key={candidate.id} href={href}>
                      <td className="py-3 pr-4">
                        <span>{displayName}</span>
                        {candidate.user && (
                          <span className="ml-2 font-mono text-xs text-muted">
                            {candidate.email}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {CANDIDATE_STATUS_LABEL[candidate.status] ?? candidate.status}
                      </td>
                      <td className="py-3 pr-4 font-mono">
                        {candidate.attempt?.score !== undefined &&
                        candidate.attempt?.score !== null
                          ? formatNumber(candidate.attempt.score)
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {candidate.attempt
                          ? (ATTEMPT_OUTCOME_LABEL[candidate.attempt.status] ??
                            candidate.attempt.status)
                          : "—"}
                      </td>
                    </CandidateRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
