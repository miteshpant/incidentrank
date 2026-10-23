import "server-only";
import { eq } from "drizzle-orm";
import { attemptActionGroups, type Attempt, type Scenario } from "@incidentrank/db";
import {
  reviewAttempt,
  type ActionOutcome,
  type ReplayActionGroup,
} from "@incidentrank/simulator";
import { db } from "./db";
import { resolveSimulationDefinition } from "./scenario-registry";
import { isAttemptTerminal } from "@/lib/attempt-lifecycle";

export type ReviewableAttempt = Attempt & { scenario: Scenario };

/**
 * The candidate-safe DTO for one reviewed action change — deliberately
 * narrower than packages/simulator's ReviewActionChange. `feedback` is
 * the only field that may ever be null-but-present here; there is no
 * field here that could carry a matchedRuleId or any other hidden
 * authored-evaluator detail, by construction (the DTO simply has no such
 * field for it to occupy — mirrors RuntimeView's own "no field for
 * hidden data" guarantee).
 */
export interface ActionFeedbackChangeDTO {
  controlKey: string;
  previousValue: unknown;
  newValue: unknown;
  outcome: ActionOutcome;
  feedback: { title: string; explanation: string } | null;
}

export interface ActionFeedbackGroupDTO {
  elapsedMs: number;
  changes: ActionFeedbackChangeDTO[];
}

export type ActionFeedbackReviewResult =
  | { ok: true; actionGroups: ActionFeedbackGroupDTO[] }
  | { ok: false; reason: "not_practice" | "not_terminal" | "scenario_version_unresolvable" };

/**
 * Phase 6.1 "Post-Incident Practice Explanation": resolves per-action
 * authored feedback for a completed PRACTICE attempt only. Deliberately
 * excludes assessments entirely (even completed ones, even the
 * candidate's own view of their own assessment) — per the binding
 * decision, educational feedback is a practice feature, not an
 * assessment feature, until a future phase explicitly designs an
 * assessment-review experience for it. Also excludes any non-terminal
 * attempt — feedback is a post-completion reveal only, never available
 * mid-incident.
 *
 * Calls packages/simulator's reviewAttempt (a second, independent
 * classification pass against replayed state) rather than reading any
 * matchedRuleId off persisted events — matchedRuleId is never persisted
 * at all, by design, so the live client (which runs simulate() directly
 * during active practice) never has feedback text or rule identity in
 * its bundle or runtime state. See packages/simulator/src/review.ts's
 * doc comment and docs/implementation_plan/phase6.1.md.
 *
 * Returns only the narrow ActionFeedbackChangeDTO shape — there is no
 * field on this DTO a hidden hint could occupy even by accident.
 */
export async function reviewPracticeAttemptFeedback(
  attempt: ReviewableAttempt,
): Promise<ActionFeedbackReviewResult> {
  if (attempt.attemptType !== "practice") {
    return { ok: false, reason: "not_practice" };
  }
  if (!isAttemptTerminal(attempt)) {
    return { ok: false, reason: "not_terminal" };
  }

  const scenario = await resolveSimulationDefinition(attempt.scenario, attempt.scenarioVersion);
  if (!scenario) return { ok: false, reason: "scenario_version_unresolvable" };

  const groups = await db.query.attemptActionGroups.findMany({
    where: eq(attemptActionGroups.attemptId, attempt.id),
    orderBy: (table, { asc }) => [asc(table.sequence)],
    with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
  });
  const replayGroups: ReplayActionGroup[] = groups.map((group) => ({
    elapsedMs: group.elapsedMs,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      value: change.newValueJson as ReplayActionGroup["changes"][number]["value"],
    })),
  }));

  const elapsedMs = attempt.completionSimulationTimeMs ?? attempt.lastSimulationTimeMs ?? 0;
  const { actionGroups } = reviewAttempt(scenario, replayGroups, elapsedMs);

  return {
    ok: true,
    actionGroups: actionGroups.map((group) => ({
      elapsedMs: group.elapsedMs,
      changes: group.changes.map((change) => ({
        controlKey: change.controlKey,
        previousValue: change.previousValue,
        newValue: change.newValue,
        outcome: change.outcome,
        feedback: change.feedback,
      })),
    })),
  };
}
