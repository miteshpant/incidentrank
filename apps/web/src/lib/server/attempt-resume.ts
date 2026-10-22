import "server-only";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import {
  replayAttempt,
  type ReplayActionGroup,
  type SimulationState,
  type SimulationEvent,
} from "@incidentrank/simulator";
import { db } from "./db";
import { resolveSimulationDefinition } from "./scenario-registry";

export interface ResumeActionGroup {
  id: string;
  elapsedMs: number;
  reasoning: string | null;
  changes: Array<{ controlKey: string; previousValue: unknown; newValue: unknown }>;
}

export type LoadResumeDataResult =
  | {
      ok: true;
      state: SimulationState;
      events: SimulationEvent[];
      actionGroups: ResumeActionGroup[];
      nextActionGroupSequence: number;
      nextEventSequence: number;
    }
  | { ok: false; reason: "attempt_not_found" | "scenario_version_unresolvable" };

/**
 * Reconstructs an in-progress attempt's current engine state by replaying
 * its persisted action groups (packages/simulator's replayAttempt) to its
 * last persisted elapsed-time checkpoint. Candidate actions are the only
 * replay input — persisted system events are returned for timeline
 * display only, never replayed as commands, per docs/architecture.md.
 *
 * Always resolves the scenario definition from the exact scenarioId/
 * scenarioVersion stored on the attempt (never "currently active
 * latest"). If that version cannot be resolved, fails safely rather than
 * running a different scenario.
 */
export async function loadResumeData(
  attemptId: string,
): Promise<LoadResumeDataResult> {
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: {
      scenario: true,
      actionGroups: {
        orderBy: (table, { asc }) => [asc(table.sequence)],
        with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
      },
    },
  });

  if (!attempt) {
    return { ok: false, reason: "attempt_not_found" };
  }

  const definition = await resolveSimulationDefinition(
    attempt.scenario,
    attempt.scenarioVersion,
  );
  if (!definition) {
    return { ok: false, reason: "scenario_version_unresolvable" };
  }

  // A null checkpoint means no periodic/apply-changes/visibility
  // checkpoint has landed yet (e.g. a refresh in the first instant after
  // starting, before the immediate on-active checkpoint's response
  // arrived) — 0 is always a safe, valid resume point: the very start of
  // the incident, never corrupted or ambiguous data.
  const elapsedMs = attempt.lastSimulationTimeMs ?? 0;

  const replayGroups: ReplayActionGroup[] = attempt.actionGroups.map((group) => ({
    elapsedMs: group.elapsedMs,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      value: change.newValueJson as string | number | boolean,
    })),
  }));

  const replayed = replayAttempt({
    scenario: definition,
    elapsedMs,
    actionGroups: replayGroups,
  });

  const actionGroups: ResumeActionGroup[] = attempt.actionGroups.map((group) => ({
    id: group.id,
    elapsedMs: group.elapsedMs,
    reasoning: group.reasoning,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      previousValue: change.previousValueJson,
      newValue: change.newValueJson,
    })),
  }));

  return {
    ok: true,
    state: replayed.state,
    events: replayed.events,
    actionGroups,
    nextActionGroupSequence: attempt.actionGroups.length,
    // Event sequence numbers are independent of replay (regenerated
    // events are not re-persisted) — the next live sequence simply
    // continues past whatever was already stored.
    nextEventSequence: await countPersistedEvents(attemptId),
  };
}

async function countPersistedEvents(attemptId: string): Promise<number> {
  const rows = await db.query.attemptEvents.findMany({
    where: (table, { eq: eqFn }) => eqFn(table.attemptId, attemptId),
    columns: { sequence: true },
  });
  return rows.reduce((max, row) => Math.max(max, row.sequence + 1), 0);
}
