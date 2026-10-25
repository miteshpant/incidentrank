import "server-only";
import { and, eq } from "drizzle-orm";
import {
  assessmentCandidates,
  attemptActionChanges,
  attemptActionGroups,
  attemptEvents,
  attempts,
  type Attempt,
  type Scenario,
} from "@incidentrank/db";
import {
  createInitialState,
  extractScoringInputs,
  isLocallyTerminal,
  isValidControlValue,
  replayAttempt,
  simulate,
  toRuntimeView,
  type ControlValue,
  type ReplayActionGroup,
  type RuntimeView,
  type ScenarioSimulationDefinition,
  type SimulationEvent,
  type SimulationState,
} from "@incidentrank/simulator";
import { db } from "./db";
import { resolveSimulationDefinition } from "./scenario-registry";
import { persistTerminalAttempt } from "./terminal-attempt";

/**
 * The maximum amount of simulation time a single advance request may add,
 * regardless of how much real wall-clock time has actually elapsed since
 * `runtimeAnchoredAt`. Bounds the cost of one request (an extremely stale
 * anchor — e.g. a server outage, or a deliberately delayed request —
 * never forces an unbounded number of ticks in one call) without
 * changing correctness: a single long absence is simply caught up over
 * several advance calls instead of one.
 */
const MAX_ADVANCE_MS_PER_REQUEST = 30_000;

/** How many times advanceRuntime retries after losing the optimistic-concurrency race before giving up and returning the current (fresher) state as-is. */
const MAX_ADVANCE_RETRIES = 2;

export type AssessmentRuntimeAttempt = Attempt & { scenario: Scenario };

/**
 * The client-facing combined status shape — "in_progress" while active,
 * otherwise the terminal outcome, or "abandoned". This is distinct from
 * the DB's own status/outcome split (see apps/web/src/lib/
 * attempt-lifecycle.ts): the client only ever needs one flat value to
 * decide what to render, never the lifecycle/outcome distinction itself.
 */
export type ClientAttemptStatus =
  | "in_progress"
  | "resolved"
  | "failed"
  | "declared_unstable"
  | "timed_out"
  | "abandoned";

export function toClientAttemptStatus(attempt: Pick<Attempt, "status" | "outcome">): ClientAttemptStatus {
  if (attempt.status === "in_progress") return "in_progress";
  if (attempt.status === "abandoned") return "abandoned";
  // status === "completed": outcome is always set per the schema invariant.
  return attempt.outcome!;
}

export type LoadOwnedAssessmentAttemptResult =
  | { ok: true; attempt: AssessmentRuntimeAttempt }
  | { ok: false; status: 404 | 403 };

/**
 * Authorizes access to the server-authoritative assessment runtime.
 * Per the Phase 5.1 spec, this is deliberately identity-based — the
 * signed-in user must be the exact user bound to this attempt's
 * `assessment_candidates` row, and that row's `attemptId` must be the
 * exact attempt requested — never organization membership. An
 * organization's hiring managers can view results (loadOrgCandidate) but
 * can never reach this function, so they structurally cannot operate a
 * candidate's live incident.
 *
 * Also rejects practice attempts outright: the server-authoritative
 * runtime applies only to `attemptType: "assessment"` attempts, per the
 * spec's explicit scope — practice and author preview keep the existing
 * client-side simulation path untouched.
 */
export async function loadOwnedAssessmentAttempt(
  attemptId: string,
  userId: string,
): Promise<LoadOwnedAssessmentAttemptResult> {
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });
  if (!attempt) return { ok: false, status: 404 };
  if (attempt.attemptType !== "assessment" || !attempt.assessmentId) {
    return { ok: false, status: 404 };
  }

  const candidate = await db.query.assessmentCandidates.findFirst({
    where: and(
      eq(assessmentCandidates.assessmentId, attempt.assessmentId),
      eq(assessmentCandidates.userId, userId),
    ),
  });
  if (!candidate || candidate.attemptId !== attemptId) {
    return { ok: false, status: 403 };
  }

  return { ok: true, attempt };
}

async function loadScenarioDefinition(
  attempt: AssessmentRuntimeAttempt,
): Promise<ScenarioSimulationDefinition | null> {
  return resolveSimulationDefinition(attempt.scenario, attempt.scenarioVersion);
}

async function nextEventSequence(attemptId: string): Promise<number> {
  const rows = await db.query.attemptEvents.findMany({
    where: eq(attemptEvents.attemptId, attemptId),
    columns: { sequence: true },
  });
  return rows.reduce((max, row) => Math.max(max, row.sequence + 1), 0);
}

export interface RuntimeActionGroup {
  id: string;
  elapsedMs: number;
  reasoning: string | null;
  changes: Array<{ controlKey: string; previousValue: unknown; newValue: unknown }>;
}

/** The candidate's own action-group history — always candidate-safe, since it is only the candidate's own decisions and their own reasoning. */
async function loadActionGroupHistory(attemptId: string): Promise<RuntimeActionGroup[]> {
  const groups = await db.query.attemptActionGroups.findMany({
    where: eq(attemptActionGroups.attemptId, attemptId),
    orderBy: (table, { asc }) => [asc(table.sequence)],
    with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
  });
  return groups.map((group) => ({
    id: group.id,
    elapsedMs: group.elapsedMs,
    reasoning: group.reasoning,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      previousValue: change.previousValueJson,
      newValue: change.newValueJson,
    })),
  }));
}

/** Reconstructs current engine state (replay to the given checkpoint) without mutating anything. */
async function reconstructState(
  scenario: ScenarioSimulationDefinition,
  attemptId: string,
  elapsedMs: number,
): Promise<{ state: SimulationState; events: SimulationEvent[] }> {
  const groups = await db.query.attemptActionGroups.findMany({
    where: eq(attemptActionGroups.attemptId, attemptId),
    orderBy: (table, { asc }) => [asc(table.sequence)],
    with: { changes: { orderBy: (table, { asc }) => [asc(table.sequence)] } },
  });

  const replayGroups: ReplayActionGroup[] = groups.map((group) => ({
    elapsedMs: group.elapsedMs,
    changes: group.changes.map((change) => ({
      controlKey: change.controlKey,
      value: change.newValueJson as ControlValue,
    })),
  }));

  if (replayGroups.length === 0 && elapsedMs === 0) {
    return { state: createInitialState(scenario), events: [] };
  }

  return replayAttempt({ scenario, elapsedMs, actionGroups: replayGroups });
}

export type BootstrapRuntimeResult =
  | {
      ok: true;
      attemptStatus: ClientAttemptStatus;
      isPaused: boolean;
      view: RuntimeView;
      actionGroups: RuntimeActionGroup[];
      nextEventSequence: number;
    }
  | { ok: false; reason: "scenario_version_unresolvable" };

/**
 * The read-only bootstrap/resume payload: reconstructs current state via
 * deterministic replay (never a client-trusted elapsedMs) and projects it
 * to the candidate-safe RuntimeView. Used both for the initial mount of
 * an assessment console and for a refresh/return visit — there is no
 * separate "resume" code path in Phase 5.1, since every mount is simply a
 * fresh bootstrap against server-held authoritative state.
 */
export async function bootstrapRuntime(
  attempt: AssessmentRuntimeAttempt,
): Promise<BootstrapRuntimeResult> {
  const scenario = await loadScenarioDefinition(attempt);
  if (!scenario) return { ok: false, reason: "scenario_version_unresolvable" };

  const elapsedMs = attempt.lastSimulationTimeMs ?? 0;
  const { state, events } = await reconstructState(scenario, attempt.id, elapsedMs);
  const [eventSeq, actionGroups] = await Promise.all([
    nextEventSequence(attempt.id),
    loadActionGroupHistory(attempt.id),
  ]);

  return {
    ok: true,
    attemptStatus: toClientAttemptStatus(attempt),
    isPaused: attempt.runtimeAnchoredAt === null,
    view: toRuntimeView(scenario, state, events),
    actionGroups,
    nextEventSequence: eventSeq,
  };
}

async function persistNewEvents(
  attemptId: string,
  events: SimulationEvent[],
  startSequence: number,
): Promise<void> {
  if (events.length === 0) return;
  await db
    .insert(attemptEvents)
    .values(
      events.map((event, index) => ({
        attemptId,
        sequence: startSequence + index,
        elapsedMs: event.timestampMs,
        type: event.type,
        message: event.message,
        metadataJson: event.metadata ?? null,
      })),
    )
    .onConflictDoNothing();
}

async function rereadAttempt(attemptId: string): Promise<AssessmentRuntimeAttempt | null> {
  const fresh = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });
  return fresh ?? null;
}

export type AdvanceRuntimeResult =
  | {
      ok: true;
      attemptStatus: ClientAttemptStatus;
      isPaused: boolean;
      view: RuntimeView;
    }
  | { ok: false; reason: "scenario_version_unresolvable" }
  | { ok: false; reason: "terminal" };

/**
 * Server-authoritative time advancement. Never trusts a client-supplied
 * elapsed time — the server computes the delta from its own stored
 * `runtimeAnchoredAt` wall-clock anchor, capped at
 * MAX_ADVANCE_MS_PER_REQUEST, so a candidate manipulating their browser
 * clock or request payload cannot fast-forward (or rewind) the incident.
 * A null anchor means the runtime clock is paused (briefing not yet
 * acknowledged, or a candidate away from the console) — advancing is a
 * pure no-op in that case, matching Phase 4.1's "simulation time pauses
 * while the console is not actively running" policy exactly, just
 * enforced server-side instead of by the client simply not ticking.
 *
 * Uses the attempt's `runtimeVersion` optimistic-concurrency token: the
 * write that applies a computed delta only succeeds
 * `WHERE runtime_version = <value read at the start of this attempt>`.
 * If another concurrent advance/action request already won and moved
 * `runtimeVersion` forward, this call's write affects zero rows; it then
 * re-reads the attempt and retries against the fresh row (bounded by
 * MAX_ADVANCE_RETRIES) rather than silently double-applying a delta or
 * moving elapsed time backwards.
 */
export async function advanceRuntime(
  attemptId: string,
  attempt: AssessmentRuntimeAttempt,
): Promise<AdvanceRuntimeResult> {
  let current = attempt;
  for (let attemptNumber = 0; attemptNumber <= MAX_ADVANCE_RETRIES; attemptNumber += 1) {
    const result = await tryAdvanceOnce(attemptId, current);
    if (result.outcome === "done") return result.value;

    const fresh = await rereadAttempt(attemptId);
    if (!fresh) return { ok: false, reason: "terminal" };
    current = fresh;
  }

  // Exhausted retries under sustained contention — return the latest
  // known-good state rather than erroring, since reconstructState is
  // always safe to call and never itself mutates anything.
  const scenario = await loadScenarioDefinition(current);
  if (!scenario) return { ok: false, reason: "scenario_version_unresolvable" };
  const elapsedMs = current.lastSimulationTimeMs ?? 0;
  const { state, events } = await reconstructState(scenario, attemptId, elapsedMs);
  return {
    ok: true,
    attemptStatus: toClientAttemptStatus(current),
    isPaused: current.runtimeAnchoredAt === null,
    view: toRuntimeView(scenario, state, events),
  };
}

type TryAdvanceResult =
  | { outcome: "done"; value: AdvanceRuntimeResult }
  | { outcome: "retry" };

async function tryAdvanceOnce(
  attemptId: string,
  attempt: AssessmentRuntimeAttempt,
): Promise<TryAdvanceResult> {
  if (attempt.status !== "in_progress") {
    return { outcome: "done", value: { ok: false, reason: "terminal" } };
  }

  const scenario = await loadScenarioDefinition(attempt);
  if (!scenario) {
    return { outcome: "done", value: { ok: false, reason: "scenario_version_unresolvable" } };
  }

  if (attempt.runtimeAnchoredAt === null) {
    const elapsedMs = attempt.lastSimulationTimeMs ?? 0;
    const { state, events } = await reconstructState(scenario, attemptId, elapsedMs);
    return {
      outcome: "done",
      value: {
        ok: true,
        attemptStatus: toClientAttemptStatus(attempt),
        isPaused: true,
        view: toRuntimeView(scenario, state, events),
      },
    };
  }

  const now = new Date();
  const wallClockDeltaMs = Math.max(0, now.getTime() - attempt.runtimeAnchoredAt.getTime());
  const deltaMs = Math.min(wallClockDeltaMs, MAX_ADVANCE_MS_PER_REQUEST);

  const previousElapsedMs = attempt.lastSimulationTimeMs ?? 0;
  const targetElapsedMs = previousElapsedMs + deltaMs;

  const { state, events } = await reconstructState(scenario, attemptId, targetElapsedMs);
  // Phase 6.1: a candidate_declared scenario's sustained success never
  // auto-terminates the assessment runtime either — only an explicit
  // Finish declaration (POST .../finish, same completion-decision core as
  // practice) can produce a resolved outcome. The engine keeps tracking
  // sustain state every tick regardless (tick.ts's own gate); only the
  // auto-resolve WRITE this function would otherwise persist is gated.
  const completionMode = scenario.completion?.mode ?? "automatic";
  const isTerminal = isLocallyTerminal(state, completionMode);

  const [updated] = await db
    .update(attempts)
    .set({
      lastSimulationTimeMs: targetElapsedMs,
      runtimeAnchoredAt: isTerminal ? null : now,
      runtimeVersion: attempt.runtimeVersion + 1,
    })
    .where(and(eq(attempts.id, attemptId), eq(attempts.runtimeVersion, attempt.runtimeVersion)))
    .returning();

  if (!updated) {
    return { outcome: "retry" };
  }

  const eventSeq = await nextEventSequence(attemptId);
  await persistNewEvents(attemptId, events, eventSeq);

  if (isTerminal) {
    // isLocallyTerminal is only ever true here via a genuine automatic
    // FAILURE (Phase 7.1: the engine never auto-writes "resolved" for
    // any completion mode) — state.status is therefore always "failed"
    // at this point, never "resolved".
    await persistTerminalAttempt(db, attempt, extractScoringInputs(scenario, state), state, {
      outcome: state.status as "failed",
    });
  }

  return {
    outcome: "done",
    value: {
      ok: true,
      attemptStatus: toClientAttemptStatus(updated),
      isPaused: updated.runtimeAnchoredAt === null,
      view: toRuntimeView(scenario, state, events),
    },
  };
}

/** Starts (or resumes) the server runtime clock — the only way elapsed time advances between now and the next pause. */
export async function resumeRuntimeClock(attemptId: string): Promise<void> {
  await db
    .update(attempts)
    .set({ runtimeAnchoredAt: new Date() })
    .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")));
}

/** Pauses the server runtime clock (candidate navigates away / tab hidden). Idempotent. */
export async function pauseRuntimeClock(attemptId: string): Promise<void> {
  await db
    .update(attempts)
    .set({ runtimeAnchoredAt: null })
    .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")));
}

export type SubmitActionChange = { controlKey: string; value: ControlValue };

export type SubmitActionResult =
  | {
      ok: true;
      attemptStatus: ClientAttemptStatus;
      isPaused: boolean;
      view: RuntimeView;
      actionGroups: RuntimeActionGroup[];
    }
  | { ok: false; reason: "scenario_version_unresolvable" }
  | { ok: false; reason: "terminal" }
  | { ok: false; reason: "invalid_control"; controlKey: string }
  | { ok: false; reason: "invalid_value"; controlKey: string }
  | { ok: false; reason: "empty_changes" };

/**
 * Applies a candidate's submitted control changes through the same
 * authoritative server-side engine (never a second simulation
 * implementation — packages/simulator's simulate() is the only place
 * behavior is computed).
 *
 * Idempotency and race-safety both derive from one transaction: sequence
 * assignment, the action-group insert (carrying the unique
 * `clientRequestId`), its changes, and the attempt's `runtimeVersion`
 * bump all happen inside a single DB transaction, serialized by
 * Postgres's own row-level locking on the attempt row (`SELECT ... FOR
 * UPDATE`) for the duration of the transaction. Two concurrent
 * submissions for the same attempt — a double-click, two open tabs, or a
 * network retry — therefore cannot both read the same "next sequence"
 * value and race to insert it: the second transaction blocks on the
 * row lock until the first commits, then sees the first's effects. A
 * retried submission carrying the same `clientRequestId` hits the
 * `attempt_action_groups` unique (attemptId, clientRequestId) constraint
 * inside that same transaction and is treated as "already applied"
 * rather than applied a second time.
 */
export async function submitAction(
  attempt: AssessmentRuntimeAttempt,
  clientRequestId: string,
  changes: SubmitActionChange[],
  reasoning: string | null,
): Promise<SubmitActionResult> {
  if (attempt.status !== "in_progress") {
    return { ok: false, reason: "terminal" };
  }
  if (changes.length === 0) {
    return { ok: false, reason: "empty_changes" };
  }

  const scenario = await loadScenarioDefinition(attempt);
  if (!scenario) return { ok: false, reason: "scenario_version_unresolvable" };

  for (const change of changes) {
    const control = scenario.controls.find((c) => c.key === change.controlKey);
    if (!control) return { ok: false, reason: "invalid_control", controlKey: change.controlKey };
    if (!isValidControlValue(scenario.controls, change.controlKey, change.value)) {
      return { ok: false, reason: "invalid_value", controlKey: change.controlKey };
    }
  }

  const outcome = await db.transaction(async (tx) => {
    // Row lock for the duration of this transaction: any concurrent
    // submitAction/advanceRuntime call against the same attempt blocks
    // here until this transaction commits or rolls back.
    const [lockedAttempt] = await tx
      .select()
      .from(attempts)
      .where(eq(attempts.id, attempt.id))
      .for("update");
    if (!lockedAttempt || lockedAttempt.status !== "in_progress") {
      return { kind: "terminal" as const };
    }

    const existingGroup = await tx.query.attemptActionGroups.findFirst({
      where: and(
        eq(attemptActionGroups.attemptId, attempt.id),
        eq(attemptActionGroups.clientRequestId, clientRequestId),
      ),
    });
    if (existingGroup) {
      return { kind: "already_applied" as const, lockedAttempt };
    }

    const elapsedMs = lockedAttempt.lastSimulationTimeMs ?? 0;
    const { state: currentState } = await reconstructState(scenario, attempt.id, elapsedMs);

    let workingState = currentState;
    const appliedEvents: SimulationEvent[] = [];
    let actionSeq = 0;
    const groupChanges: Array<{
      controlKey: string;
      previousValue: ControlValue;
      newValue: ControlValue;
    }> = [];

    for (const change of changes) {
      const previousValue = workingState.controlValues[change.controlKey];
      if (previousValue === change.value) continue;

      actionSeq += 1;
      const result = simulate(
        scenario,
        workingState,
        {
          id: `assessment-action-${attempt.id}-${clientRequestId}-${actionSeq}`,
          timestampMs: workingState.simulationTimeMs,
          controlKey: change.controlKey,
          value: change.value,
        },
        0,
      );
      workingState = result.state;
      appliedEvents.push(...result.events);
      groupChanges.push({ controlKey: change.controlKey, previousValue, newValue: change.value });
    }

    if (groupChanges.length === 0) {
      return { kind: "no_op" as const, state: currentState };
    }

    const existingGroups = await tx.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
      columns: { id: true },
    });
    const sequence = existingGroups.length;

    const [group] = await tx
      .insert(attemptActionGroups)
      .values({
        attemptId: attempt.id,
        sequence,
        elapsedMs,
        reasoning,
        clientRequestId,
      })
      .returning();
    if (!group) throw new Error("Failed to persist action group");

    await tx.insert(attemptActionChanges).values(
      groupChanges.map((change, index) => ({
        actionGroupId: group.id,
        sequence: index,
        controlKey: change.controlKey,
        previousValueJson: change.previousValue,
        newValueJson: change.newValue,
      })),
    );

    const eventRows = await tx.query.attemptEvents.findMany({
      where: eq(attemptEvents.attemptId, attempt.id),
      columns: { sequence: true },
    });
    const eventSeqStart = eventRows.reduce((max, row) => Math.max(max, row.sequence + 1), 0);
    if (appliedEvents.length > 0) {
      await tx
        .insert(attemptEvents)
        .values(
          appliedEvents.map((event, index) => ({
            attemptId: attempt.id,
            sequence: eventSeqStart + index,
            elapsedMs: event.timestampMs,
            type: event.type,
            message: event.message,
            metadataJson: event.metadata ?? null,
          })),
        )
        .onConflictDoNothing();
    }

    // Phase 6.1: same candidate_declared gate as tryAdvanceOnce above —
    // an applied action may make the success/acceptable condition
    // sustained-true, but only an explicit Finish declaration may
    // persist a resolved outcome.
    const isTerminal = isLocallyTerminal(workingState, scenario.completion?.mode ?? "automatic");

    await tx
      .update(attempts)
      .set({
        runtimeVersion: lockedAttempt.runtimeVersion + 1,
        runtimeAnchoredAt: isTerminal ? null : lockedAttempt.runtimeAnchoredAt,
      })
      .where(eq(attempts.id, attempt.id));

    return {
      kind: "applied" as const,
      state: workingState,
      events: appliedEvents,
      isTerminal,
      lockedAttempt,
    };
  });

  if (outcome.kind === "terminal") {
    return { ok: false, reason: "terminal" };
  }

  if (outcome.kind === "already_applied") {
    const elapsedMs = outcome.lockedAttempt.lastSimulationTimeMs ?? 0;
    const [{ state, events }, actionGroups] = await Promise.all([
      reconstructState(scenario, attempt.id, elapsedMs),
      loadActionGroupHistory(attempt.id),
    ]);
    return {
      ok: true,
      attemptStatus: toClientAttemptStatus(outcome.lockedAttempt),
      isPaused: outcome.lockedAttempt.runtimeAnchoredAt === null,
      view: toRuntimeView(scenario, state, events),
      actionGroups,
    };
  }

  if (outcome.kind === "no_op") {
    const actionGroups = await loadActionGroupHistory(attempt.id);
    return {
      ok: true,
      attemptStatus: toClientAttemptStatus(attempt),
      isPaused: attempt.runtimeAnchoredAt === null,
      view: toRuntimeView(scenario, outcome.state, []),
      actionGroups,
    };
  }

  if (outcome.isTerminal) {
    // Same reasoning as tryAdvanceOnce's identical call: isTerminal here
    // can only mean an automatic FAILURE (Phase 7.1) — submitAction
    // never auto-writes "resolved" either.
    await persistTerminalAttempt(
      db,
      attempt,
      extractScoringInputs(scenario, outcome.state),
      outcome.state,
      { outcome: outcome.state.status as "failed" },
    );
  }

  const actionGroups = await loadActionGroupHistory(attempt.id);

  return {
    ok: true,
    attemptStatus: outcome.isTerminal
      ? (outcome.state.status === "resolved" ? "resolved" : "failed")
      : toClientAttemptStatus(attempt),
    isPaused: outcome.isTerminal ? true : outcome.lockedAttempt.runtimeAnchoredAt === null,
    view: toRuntimeView(scenario, outcome.state, outcome.events),
    actionGroups,
  };
}
