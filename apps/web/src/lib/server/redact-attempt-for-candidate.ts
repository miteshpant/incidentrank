import "server-only";
import type { Attempt } from "@incidentrank/db";

/**
 * The single candidate-facing projection of an `Attempt` row — shared by
 * every surface a candidate can reach (GET /api/attempts/[attemptId],
 * POST .../finish, the practice attempt-detail page, the assessment
 * result screen). Company-assessment candidates must never receive
 * evaluation-derived results (docs/implementation_plan/
 * phase7.action.md's "Company-assessment candidates must not see
 * evaluation results"): total score, any of the six dimension scores,
 * completion tier, outcome, completion note, final-state details,
 * revenue-loss details, peak metrics, or action tallies. Practice
 * attempts keep the existing, fully unredacted experience.
 *
 * A discriminated union, not a partially-nulled `Attempt` — an
 * assessment-safe view that merely set every restricted field to
 * `undefined`/`null` would still let a caller recover the shape (and
 * risk a future field being added to `Attempt` without anyone
 * remembering to redact it here). The assessment branch instead lists
 * only what IS safe to expose, so a new column on `attempts` is
 * redacted by default rather than leaked by omission.
 */
export type CandidateSafeAttemptView =
  | (Omit<Attempt, "attemptType"> & { attemptType: "practice" })
  | {
      attemptType: "assessment";
      id: string;
      status: Attempt["status"];
      startedAt: Attempt["startedAt"];
      completedAt: Attempt["completedAt"];
      submitted: boolean;
    };

export function redactAttemptForCandidate(attempt: Attempt): CandidateSafeAttemptView {
  if (attempt.attemptType === "assessment") {
    return {
      attemptType: "assessment",
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      submitted: attempt.status === "completed",
    };
  }

  return { ...attempt, attemptType: "practice" };
}
