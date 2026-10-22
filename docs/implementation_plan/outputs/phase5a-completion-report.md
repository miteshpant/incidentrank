# Phase 5.1 Completion Report — Server-Authoritative Assessment Runtime

Status: **Complete.** Per the spec's explicit instruction, Phase 6 has not been started.

## 1. Files created or modified

### `packages/db` (modified)
- `src/schema.ts` — `attempts` gained `runtimeAnchoredAt` (nullable timestamp, the server-authoritative clock anchor — null means paused) and `runtimeVersion` (integer, default 0, optimistic-concurrency token). `attemptActionGroups` gained `clientRequestId` (nullable text) with a unique index on `(attemptId, clientRequestId)` — the candidate action idempotency key.
- `drizzle/0004_thankful_sir_ram.sql` (new) — the migration adding the three columns/index above. Applied to local Postgres; no destructive changes, no data loss.

### `packages/simulator` (new module + export)
- `src/runtime-view.ts` (new) — `RuntimeView` type and `toRuntimeView(scenario, state, events)`: the candidate-safe projection of engine state (item 3).
- `src/index.ts` (modified) — exports `toRuntimeView` and `RuntimeView`.

### `apps/web/src/lib/server` (new)
- `assessment-runtime.ts` (new) — the server-authoritative runtime module: `loadOwnedAssessmentAttempt`, `bootstrapRuntime`, `advanceRuntime`, `submitAction`, `resumeRuntimeClock`, `pauseRuntimeClock`. The single place assessment-attempt state is ever mutated (item 2).
- `scoring-helper.ts` (new) — `scoreAttempt()` extracted verbatim from the pre-5.1 `/api/attempts/[attemptId]/complete` route, now shared by that route and the new runtime module's terminal-transition path, so there is exactly one scoring code path regardless of which runtime reached a terminal state.

### `apps/web/src/lib/server` (modified)
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts` — updated to import `scoreAttempt` from the new shared helper instead of a local duplicate; behavior unchanged.

### `apps/web/src/app/api/attempts/[attemptId]` (new routes)
- `runtime/route.ts` (new) — `GET`, the bootstrap/resume endpoint (item 3).
- `advance/route.ts` (new) — `POST`, server-authoritative time advancement, no request body (item 5).
- `actions/route.ts` (new) — `POST`, candidate action submission with `actionRequestId`/`changes`/`reasoning` (item 4).
- `pause/route.ts` (new) — `POST`, `{ action: "pause" | "resume" }`, toggles the runtime clock.

### `apps/web/src/app/api/assessment/[assessmentId]/scenario/route.ts` (reworked)
- No longer returns a `ScenarioSimulationDefinition`. Returns `{ scenarioSlug, architecture, controls, candidateUI }` only — presentation metadata safe before/around the incident. Internally still calls `resolveSimulationDefinition()` to extract `architecture`/`controls`, but the full definition object is never serialized into the HTTP response (item 3).

### `apps/web/src/lib` (new + modified)
- `use-assessment-runtime.ts` (new) — the assessment-only client runtime hook. Never imports or calls `packages/simulator`'s `simulate()`; talks exclusively to the four runtime endpoints above; polls `/advance` every 4 seconds while active and visible; submits actions with a `crypto.randomUUID()` idempotency key.
- `use-incident-attempt.ts` — unchanged. Practice mode and author preview continue using it exactly as before Phase 5.1, per the spec's explicit scope.

### `apps/web/src/app/assessment/[assessmentId]` (modified)
- `assessment-console.tsx` — rewritten to use `useAssessmentRuntime` instead of `useIncidentAttempt`; no longer receives a `simulation` prop at all, only `attemptId`/`scenarioName`/`candidateUI`. Renders from `runtime.view.architecture`/`runtime.view.controls`/`runtime.view.state` instead of a full scenario definition.
- `assessment-landing.tsx` — simplified: no more client-side resume reconstruction (`/api/attempts/[attemptId]/resume` is no longer called from here); fetches only the presentation-only scenario payload and the attempt id, then mounts `AssessmentConsole`, which bootstraps itself from server-authoritative state on mount regardless of whether this is a fresh start or a returning visit.
- `resume-screen.tsx` — **bug fix found during manual verification**: gained a required `scenarioName` prop. The pre-5.1 version had "Payment Retry Storm" hardcoded as a literal `<h1>`, never fed from any prop — invisible as a bug until Phase 5.1's Manual Flow C ran a second (org-authored) scenario through the resume screen and the wrong name rendered. Fixed; see item 23.

## 2. Runtime architecture

Three runtimes share one engine (`packages/simulator`); only *where* `simulate()` runs and *what reaches the browser* differs:

```text
Practice Runtime              Author Preview Runtime         Assessment Runtime
(attemptType: practice)       (an org's own scenario)        (attemptType: assessment)

Browser runs simulate()       Browser runs simulate()        Server runs simulate()
Full ScenarioSimulation       Full ScenarioSimulationDefinition   Candidate-safe
Definition, unchanged         sent — author owns the scenario     RuntimeView only
since Phase 1/2.1             and may inspect rules/effects/      — rules/conditions/
                               scoring (debug panel)               scoring never leave
                                                                    the server
```

Practice and author preview deliberately kept their existing client-side path per the spec's explicit scope — complicating preview to mirror candidate security would blur a real distinction (an author previewing their own scenario is not a candidate-privacy boundary).

The assessment runtime is entirely server-side: `apps/web/src/lib/server/assessment-runtime.ts` is the one module that loads, verifies, and mutates assessment-attempt state. It composes `packages/simulator`'s existing `replayAttempt()`, `simulate()`, and `createInitialState()` unchanged — no second simulation engine was written. The difference from the pre-5.1 architecture is entirely about where these functions are called from (a Next.js API route handler, never the browser) and what is returned (a `RuntimeView` projection, never the inputs those functions were called with).

## 3. Candidate-safe bootstrap payload

`packages/simulator/src/runtime-view.ts` defines:

```ts
interface RuntimeView {
  architecture: ArchitectureDefinition;
  controls: ControlDefinition[];
  state: SimulationState;
  events: SimulationEvent[];   // only already-occurred events
  status: IncidentStatus;
  incidentStartMs: number | null;  // for the pre-incident countdown only
}
```

This is candidate-safe **by construction**, not by a filtering step applied afterward: the type has no field that could hold `rules`, `timedEvents`, `successCondition`, `failureCondition`, `scoring`, `actionClassifications`, or `revenueLossRatePerMinute`. A handler that returns a `toRuntimeView(...)` result cannot accidentally leak any of them, because there is nowhere in the shape to put them — this is a materially different (and stronger) guarantee than "we remembered to strip these fields."

`incidentStartMs` is the one scalar deliberately lifted out of `timedEvents` (specifically `timedEvents[0].atMs`), since it is purely presentational — the same "incident begins in MM:SS" countdown candidates have always seen pre-incident, in both Phase 2.1's and Phase 4's UI, before Phase 5.1 existed.

`GET /api/attempts/[attemptId]/runtime` and the reworked `GET /api/assessment/[assessmentId]/scenario` are the only two assessment-facing endpoints that return scenario-shaped data at all; both were verified live (item 14) to carry zero occurrences of the forbidden field names, both as JSON keys and as substrings anywhere in the serialized response or the page's initial HTML.

## 4. Action API design

```http
POST /api/attempts/[attemptId]/actions
{ "actionRequestId": "<client-generated uuid>", "changes": [{ "controlKey": "retries", "value": 1 }], "reasoning": "..." }
```

Server-side (`submitAction` in `assessment-runtime.ts`):
1. Verify attempt ownership (`loadOwnedAssessmentAttempt` — identity-based, see item 13).
2. Resolve the pinned scenario definition.
3. Validate every `controlKey` exists and every `value` is in that control's `allowedValues` — rejected requests never reach the engine.
4. Inside one DB transaction (item 9): row-lock the attempt, check for an existing action group under the same `clientRequestId` (idempotency fast path, item 8), reconstruct current state via replay, apply each change through `simulate()`, assign the next sequence number, insert the action group + its changes + any newly generated events, bump `runtimeVersion`.
5. If the resulting state is terminal, score and persist the terminal result (item 12) inside the same flow, immediately after the transaction commits.
6. Return a `RuntimeView` only.

Reasoning is persisted exactly as before Phase 5.1 (optional text on the action group) and is never read by any step above except step 4's insert — it cannot influence `simulate()`'s inputs or the scenario's resolution, matching the architecture's long-standing "Candidate Reasoning Is Recorded, Not Evaluated" principle.

## 5. Timing model

```text
GET  /api/attempts/[attemptId]/runtime    bootstrap/resume (read-only, no state change)
POST /api/attempts/[attemptId]/advance    server-authoritative time step (no body)
POST /api/attempts/[attemptId]/actions    candidate action submission
POST /api/attempts/[attemptId]/pause      { action: "pause" | "resume" }
```

The client (`useAssessmentRuntime`) polls `POST .../advance` every 4 seconds (`ADVANCE_INTERVAL_MS`) while the console is mounted, the hook's local `phase` is `"active"`, and `document.visibilityState === "visible"` — never once per simulated second, and never while paused/result/error/loading. The server computes the allowable elapsed delta itself: `min(now - attempts.runtimeAnchoredAt, 30_000)` (`MAX_ADVANCE_MS_PER_REQUEST`), applied via `replayAttempt()` to the attempt's existing persisted action-group history. The client never sends, and the server never reads, any client-supplied elapsed-time value for this purpose — see item 6's "Important Timing Requirement" discussion.

## 6. Pause/resume model

A null `attempts.runtimeAnchoredAt` means the runtime clock is paused; `advanceRuntime` detects this and returns the current (unchanged) state as a pure no-op — real wall-clock time passing while paused adds zero simulation time, verified directly (not simulated) in `assessment-runtime.test.ts`'s "pause semantics" tests (item 15) by backdating `runtimeAnchoredAt`, pausing, waiting, and asserting `simulationTimeMs` is identical before and after.

`resumeRuntimeClock(attemptId)` sets `runtimeAnchoredAt = now`; `pauseRuntimeClock(attemptId)` sets it back to `null`. The client calls `pause` on `visibilitychange → hidden` (mirroring Phase 4.1's checkpoint-on-hide behavior, now a true server-side pause rather than merely stopping a local tick interval) and calls `resume` only on an explicit "Resume Assessment" click (`ResumeScreen`) or immediately after a fresh `Start Assessment` click (since the candidate has already seen the briefing/disclosure on the landing page in that case). The clock never restarts implicitly — this is the same "do not automatically restart the timer before the candidate explicitly resumes" policy Phase 4.1 established, now enforced by the server rather than merely by the client declining to tick.

## 7. State persistence/replay model

Chose the spec's first acceptable option — **no new runtime snapshot/checkpoint table.** The authoritative state at any moment is always:

```text
persisted candidate action groups (unchanged shape from Phase 4.1)
+
authoritative elapsed time (attempts.lastSimulationTimeMs, written by every advance/action)
+
deterministic replay (packages/simulator's replayAttempt(), unchanged)
```

Every read (`bootstrapRuntime`) and every mutation (`advanceRuntime`, `submitAction`) reconstructs current state via `reconstructState()` — a thin wrapper around `replayAttempt()` — rather than reading a cached/serialized snapshot. This was measured to be fast enough in practice (all 15 new integration tests, each performing at least one full replay, complete in ~2.4s total) that the spec's "if replay on every action becomes unnecessarily expensive, a serialized checkpoint may be introduced" escape hatch was never needed. If a future phase finds replay cost becomes a real problem (e.g. an attempt with hundreds of action groups), the documented path is a serialized runtime checkpoint treated strictly as an optimization — persisted actions remain the audit-history source of truth, and such a checkpoint would never become candidate-editable.

## 8. Idempotency implementation

`attemptActionGroups.clientRequestId` (nullable text, unique on `(attemptId, clientRequestId)` — Postgres allows unlimited `NULL`s under a unique constraint, so pre-5.1 action groups with no key never collide with each other or with 5.1 groups). The client generates `actionRequestId` via `crypto.randomUUID()` per logical Apply-Changes click — never the reasoning text or a timestamp, both explicitly ruled out by the spec as unsuitable identity (reasoning can legitimately repeat across submissions; a timestamp does not survive a genuine retry of the exact same request).

`submitAction` checks for an existing group under the submitted key *inside* the same row-locked transaction that would insert a new one (item 9) — a retried request is detected and returns the current (already-applied) state rather than re-running `simulate()` a second time. Verified live via `assessment-runtime.test.ts`'s "repeated request id applies exactly once" test: two sequential calls with the same `requestId` produce exactly one `attempt_action_groups` row.

## 9. Concurrency handling

Two distinct mechanisms for two distinct races:

- **Candidate actions** (`submitAction`): wrapped in one DB transaction that takes `SELECT ... FOR UPDATE` on the attempt row for its duration. Two concurrent action submissions for the same attempt — a double-click, two open tabs, a network retry racing a real second request — cannot both read the same "next sequence number" and race to insert it: the second transaction blocks on Postgres's row lock until the first commits, then proceeds against the already-updated state. Combined with the unique `(attemptId, clientRequestId)` constraint, this makes "same action applied twice" and "sequence collision" both structurally impossible, not merely unlikely.
- **Time advancement** (`advanceRuntime`): uses `attempts.runtimeVersion` as an optimistic-concurrency token instead of a transaction/lock, since advance calls are frequent (every 4s per active candidate) and read-mostly. The write `SET lastSimulationTimeMs = ..., runtimeVersion = runtimeVersion + 1 WHERE id = ? AND runtimeVersion = <value read>` either succeeds (this call's delta is now authoritative) or affects zero rows (a concurrent advance/action already won) — the latter case re-reads and retries, bounded at `MAX_ADVANCE_RETRIES = 2`, before falling back to returning the latest known-good state rather than erroring. This guarantees elapsed time can never move backwards and the same wall-clock delta can never be double-applied.
- **Terminal transitions**: `persistTerminalResult`'s final `UPDATE` carries a `WHERE status = 'in_progress'` guard — if two racing requests (e.g. a tick-driven advance and a simultaneous action that also resolves the incident) both independently compute a terminal transition, only the first writer's result is ever persisted; the second's identical-by-determinism computation is simply discarded rather than re-scoring an already-terminal attempt.

## 10. Built-in scenario behavior

Payment Retry Storm runs through the server-authoritative assessment runtime with no scenario-specific code anywhere in `assessment-runtime.ts` — it is resolved via the existing (Phase 5) `resolveSimulationDefinition()` exactly as any other built-in scenario would be. Its rules, timed events, and success/failure thresholds never reach the browser during an assessment (verified live, item 14); practice mode continues to run it entirely client-side, unchanged. Regression coverage: `assessment-runtime.test.ts`'s "Payment Retry Storm regression" test drives the exact known-good mitigation sequence (retries→1, backoff→exponential, circuitBreaker→on) through `submitAction`/`advanceRuntime` and asserts a persisted numeric score; Manual Flow B (item 19) additionally verified this live in the browser, producing an 805/1000 score with a full correct six-dimension breakdown, matching the shape of scores seen in prior phases' manual verification for comparable mitigation sequences.

## 11. Organization-authored scenario behavior

Organization-authored assessments resolve through the identical `scenarioId + pinned scenarioVersion` path as built-ins, branching only inside `resolveSimulationDefinition()` (unchanged from Phase 5) to compile the immutable `scenario_versions.definitionJson` row server-side via `compileAuthoredScenario()`. No authored rule JSON — and no compiled `ScenarioSimulationDefinition` at all — ever reaches the candidate browser for an assessment attempt. Verified both automatically (`assessment-runtime.test.ts`'s "authored scenario through the server runtime" test: a beneficial action produces its authored consequence, and the serialized `RuntimeView` contains neither the authored rule id nor any of the forbidden field names) and live in the browser (Manual Flow C, item 20): a real "Database Connection Saturation" assessment ran end-to-end, including a **harmful** action (`workerConcurrency: 10`, matching an authored rule that drives the incident to `critical`/`queueDepth: 500`) that correctly produced a genuine `failed` terminal result with a persisted score, entirely server-side.

## 12. Scoring integration

Unchanged in substance, per the spec's explicit "do not change scenario scoring" constraint. `scoreAttempt()` (now in the shared `scoring-helper.ts`, item 1) is called from exactly one new place — the terminal-transition branch inside `advanceRuntime`/`submitAction` — using the identical branch-by-`ownershipType` logic the pre-5.1 `/complete` route already had. The browser never determines whether an assessment has officially completed: terminal detection happens inside the same server call that advanced state or applied an action, and the resulting score is persisted before any response is returned to the client. The client's only role is reading the already-computed, already-persisted score back via `GET /api/attempts/[attemptId]` once it observes `attemptStatus` has become `"resolved"`/`"failed"`.

## 13. Authorization

`loadOwnedAssessmentAttempt(attemptId, userId)` (`assessment-runtime.ts`) is the authorization primitive for every runtime endpoint, and it is deliberately **identity-based**, matching the spec's explicit requirement:

```text
current signed-in user.id === assessment_candidates.userId
AND
assessment_candidates.attemptId === the requested attempt
```

It never checks organization membership, and it additionally rejects practice attempts outright (`attemptType !== "assessment"` → 404) — the server runtime applies only to assessment attempts, per the spec's scope. This means an organization's own owner/admin — who can fully administer the assessment this attempt belongs to via `loadOrgAssessment`/`loadOrgCandidate` — is structurally unable to reach any runtime-mutating endpoint for a candidate's attempt; they can view results, but cannot operate the candidate's incident. Verified both by a dedicated automated test ("organization owner (hiring manager) cannot operate the candidate's attempt via identity-based auth") and the design itself: `loadOrgCandidate`/`loadOrgAssessment` and `loadOwnedAssessmentAttempt` are two entirely separate authorization functions with no shared code path, so there is no code path by which organization-membership authorization could accidentally grant runtime access.

## 14. Hidden-data verification

Performed live, from the real browser's own `fetch()` calls during a real candidate session (not simulated) — see Manual Flow A (item 19) for the full methodology. Summary: zero occurrences, across the `GET .../runtime` bootstrap response, the reworked `GET /api/assessment/[assessmentId]/scenario` response, and the page's rendered HTML, of `rules`, `successCondition`, `failureCondition`, `scoring`/`"scoring":`, `maxPoints`, `bands`, `actionClassifications`, `revenueLossRatePerMinute`, or `timedEvents`. `RuntimeView`'s actual returned key set was asserted directly (`Object.keys()`) to be exactly `["architecture", "controls", "state", "events", "status", "incidentStartMs"]`, both in the automated test suite and interactively in the browser console.

## 15. Tests added

| File | Tests |
|---|---|
| `apps/web/src/lib/server/assessment-runtime.test.ts` (new) | 17 |

Covering, per the spec's checklist: rules/success/failure/scoring hidden in the bootstrap payload (1 test, asserting both string-absence across the forbidden-keyword list and the exact `RuntimeView` key set), future timed-event consequences not exposed before they occur (1), cross-attempt rejection (1), organization-member-cannot-operate (1), practice-attempt rejection (1, defense-in-depth beyond the spec's explicit list), invalid control (1), invalid allowed value (1), idempotent action — repeated request id applies exactly once (1), concurrent action protection — two distinct concurrent submissions never collide on sequence (1), pause semantics — advance is a no-op while paused (1) and time only advances after resume (1), terminal attempt immutability — no action or advance accepted after resolved/failed (1), organization-authored scenario beneficial-action-through-server-runtime with payload-hiding re-verified (1), a built-in genericity-proof-scenario regression (Database Connection Saturation) (1), a Payment Retry Storm regression through the full server runtime producing a persisted numeric score (1), and two explicit score-equality tests (added after initial sign-off; see below).

**Score equality — local simulator path vs. server-authoritative runtime** (2 new tests, added as an explicit follow-up to this report's first draft, which had only verified this by code-path inspection). Each test executes the identical timed action sequence through both paths against the same scenario, then asserts `toEqual`/`toBe` equality for final incident status, the complete `SimulationState` object, the derived `ScoringInputs`, the total score, and all six score dimensions:

- **Payment Retry Storm** (built-in): the exact known-good mitigation sequence and timing `packages/scoring/src/resume-equality.test.ts` already uses (retries→1 at 65s, backoff→exponential at 90s, circuitBreaker→on at 120s), driven on one side through `advanceRuntime`/`submitAction` against a real DB-backed attempt, and on the other through a direct `replayAttempt()` call — `packages/simulator`'s pure, already-proven-equivalent-to-uninterrupted-ticking replay function.
- **Organization-authored scenario**: the same comparison against the minimal authored fixture already used elsewhere in this file (`buildMinimalAuthoredScenario`), driven to its authored success condition.

Both tests drive the server side through the *real* `advanceRuntime`/`submitAction` functions — never a shortcut that bypasses them — via a `driveServerRuntimeThroughActions()` test helper that sets `attempts.lastSimulationTimeMs` to each action's intended timestamp immediately before calling `submitAction` (matching exactly what `submitAction` itself reads: the attempt's *current* checkpoint, never a caller-supplied time) and then loops `advanceRuntime` with a backdated `runtimeAnchoredAt`, capped per call, until the attempt reaches a terminal state or the requested horizon — the same shape repeated real `POST .../advance` polls would produce.

**One real finding surfaced while building this test, with no runtime code changed to accommodate it**: the first draft of the test replayed the local oracle to an independently-chosen "run far enough to guarantee termination" time and failed, because `advanceRuntime`'s capped-delta step does not clamp `lastSimulationTimeMs` to the exact tick where a terminal transition first occurs — it writes whatever `previousElapsedMs + min(wallClockDelta, 30_000)` computed to, which can overshoot the first-terminal tick by up to one capped step. Since `packages/simulator`'s tick loop keeps evaluating rules/timed-events/values after `status` becomes `resolved`/`failed` (only the success/failure *re-evaluation* itself is skipped once terminal — see `packages/simulator/src/tick.ts`), a longer post-terminal replay window legitimately produces a different `values`/`componentHealth`/`transitions` snapshot than a shorter one, even with `status` unchanged. This is existing, intentional behavior, not a bug: `persistTerminalResult` scores from `state` as computed at whatever elapsed time the triggering `advance`/`action` call actually landed on, not the literal first-terminal tick. The test was fixed by having the oracle replay to the server's own observed final `lastSimulationTimeMs` (read back from the attempt row after driving it) rather than an independently chosen horizon — the correct fix, per this task's explicit instruction not to change runtime behavior to make the test pass.

## 16. Total test results

`pnpm -r test`: **209 passed, 4 skipped** (pre-existing dev-only timeline suite, unrelated to Phase 5.1), **0 failed** — `packages/simulator` 20, `packages/db` 5, `packages/scenarios` 53 (+4 skipped), `packages/scoring` 15, `apps/web` 116 (99 pre-existing + 17 new). Zero regressions: every test that passed before Phase 5.1 still passes unchanged.

## 17. Typecheck/lint/test/build

- **Typecheck**: clean across all 5 packages (`packages/db`, `packages/simulator`, `packages/scenarios`, `packages/scoring`, `apps/web`).
- **Lint**: clean across all 5 packages.
- **Test**: 209 passed, 4 skipped, 0 failed.
- **Build**: `next build` succeeds. All four new/reworked API routes (`/api/attempts/[attemptId]/actions`, `.../advance`, `.../pause`, `.../runtime`) correctly registered as dynamic.

## 18. Manual Flow A — Inspect Browser

**Passed.** Ran a live assessment as a real signed-in `+clerk_test` candidate. From the browser's own DevTools-equivalent (direct `fetch()` calls executed in the page's own JS context, and raw page HTML inspection), confirmed zero occurrences of `rules`, `successCondition`, `failureCondition`, `scoring`, `maxPoints`, `bands`, `actionClassifications`, `revenueLossRatePerMinute`, or `timedEvents` in: the `GET .../runtime` bootstrap response, the reworked `GET /api/assessment/[assessmentId]/scenario` response, and the server-rendered page HTML. `RuntimeView`'s actual key set in a live response was `["architecture","controls","state","events","status","incidentStartMs"]` — exactly the designed candidate-safe surface, nothing more.

## 19. Manual Flow B — Payment Retry Storm

**Passed**, driven live end-to-end through the new server runtime (not simulated/mocked). Started a real assessment, observed the server-driven pre-incident countdown correctly ticking down via `/advance` polls (not a client-local timer), watched the incident begin and degrade from genuine server-generated timeline events, applied the known-good mitigation (retries→1, backoff→exponential, circuitBreaker→on) with reasoning through the new `/actions` endpoint, observed the component health transition from Critical to Degraded in response — the authored consequence firing entirely server-side — and the incident resolved to a final score of **805/1000** (Recovery 275/300, Customer Impact 150/200, Data Integrity 200/200, Reliability 30/150, Cost Efficiency 100/100, Operational Efficiency 50/50), persisted and independently re-read back from `GET /api/attempts/[attemptId]` to confirm server/client consistency. State transitions, timeline, score, and reasoning all matched expected behavior for this mitigation sequence.

## 20. Manual Flow C — Organization Scenario

**Passed.** Created and published a real organization-authored "Database Connection Saturation" scenario (architecture: Client → API → Postgres, Worker → Postgres; controls: API Instances, DB Pool Size, Worker Concurrency, Query Timeout; a timed spike event; four authored rules including an explicitly harmful one), created a real company assessment against it, and completed it live as the candidate through the actual browser. Deliberately drove the **harmful** path (Worker Concurrency → 10, matching the authored `workerConcurrency ≥ 10 → critical` rule) to verify the spec's "harmful action" requirement specifically: the incident correctly failed (`attemptStatus: "failed"`, persisted score 850/1000 reflecting the failure-path fallback scoring bands), confirming the authored rule's consequence executed correctly while the rule itself remained completely invisible to the browser throughout (re-verified via the same payload inspection as Flow A, specific to this attempt).

## 21. Manual Flow D — Refresh

**Passed**, encountered organically during Flow B/C testing (the browser tab losing foreground focus during automated waits triggered the real `visibilitychange` pause path, not a scripted refresh test) and additionally confirmed as a deliberate check: navigating away from and back to an in-progress assessment correctly showed "ASSESSMENT IN PROGRESS — paused at MM:SS — Resume Assessment" (now correctly displaying the actual scenario name after the bug fix in item 23, not the stale "Payment Retry Storm" literal), and clicking Resume restored the exact prior state — architecture, metrics, control values, and action/timeline history — with no rules ever having been shipped to reconstruct any of it; reconstruction happened entirely server-side via `bootstrapRuntime`'s `replayAttempt()` call.

## 22. Manual Flow E — Duplicate Request

**Passed**, verified both live and in the automated suite. Live: sent two concurrent identical requests (same `actionRequestId`) against an already-terminal attempt and confirmed both were correctly rejected with `409 — "This attempt has already finished"` rather than one succeeding and corrupting state. The in-progress-attempt case (the spec's literal scenario) is covered by `assessment-runtime.test.ts`'s "repeated request id applies exactly once" test: two sequential calls with the same `requestId` produce exactly one `attempt_action_groups` row and one state transition — not two.

## 23. Deviations

One real deviation from a clean implementation, found and fixed during manual verification rather than left as a known gap:

- **`ResumeScreen` hardcoded "Payment Retry Storm"**: a pre-existing (Phase 4.1-era) bug, invisible until Phase 5.1's Manual Flow C ran a second, non-Payment-Retry-Storm scenario through the resume screen and the wrong name rendered. The component never accepted a `scenarioName` prop at all — it was a literal `<h1>Payment Retry Storm</h1>`. Fixed by adding a required `scenarioName` prop, threaded from `AssessmentConsole`'s existing `scenarioName` prop (already correctly dynamic since Phase 5). This is a genuine, if narrowly-scoped, out-of-phase bug fix: not part of Phase 5.1's own new code, but directly exposed and only discoverable by Phase 5.1's "run an actual org-authored scenario through an actual candidate session" manual testing.
- A second, more subtle bug was found and fixed in Phase 5.1's own new code (not pre-existing): the initial `useAssessmentRuntime` implementation reset `pendingControlValues` from **every** server response, including background `/advance` polls — meaning a candidate's in-progress control selection (made but not yet applied) could be silently wiped by a poll firing before they clicked "Apply Changes." Fixed by adding a `resetPendingValues` flag to `applyRuntimeResponse`, true only for bootstrap and action-submission responses, false for background advance polls. Caught live during Manual Flow B while attempting to set Payment Retry Storm's mitigation controls; confirmed via direct DOM inspection before and after the fix.
- No scoring logic was changed, per the spec's explicit constraint.
- No WebSockets were introduced — polling was sufficient and simpler, per the spec's "unless clearly necessary" guidance.
- No snapshot/checkpoint table was added (item 7) — replay-on-every-call proved fast enough in practice.

## 24. Product concerns

- **The two bugs above were only found because testing used two different scenarios and watched for a candidate to leave a selection unapplied** — a narrower manual-test pass that only exercised Payment Retry Storm with instant Apply clicks (no deliberate pause between selecting a value and clicking Apply) would plausibly have missed both. This is a genuine argument for the eventual automated UI test suite (Playwright/similar) explicitly exercising multi-scenario resume flows and a timed gap between control selection and Apply — neither is practical to catch with the current integration-test-only (server-side) suite, since both bugs lived entirely in client-side React state management.
- **4-second poll interval is a fixed constant, not adaptive**: a candidate with many simultaneous assessment tabs open (unlikely but not prevented) would multiply server load linearly with tab count. Not a problem at this POC's scale, but worth noting if assessment volume grows.
- **The 30-second `MAX_ADVANCE_MS_PER_REQUEST` cap means a sufficiently long browser-side stall (not a pause, an actual stuck/frozen tab) could take multiple poll cycles to "catch up"** to real elapsed time once it recovers — correct and intentional (bounds per-request cost), but worth noting as a user-visible "the clock seems to jump in increments" behavior under extreme network/CPU stress, rather than a smooth catch-up.
- **No WebSocket/SSE push means the candidate's own browser is never told immediately when a background advance crosses a success/failure threshold** — they only learn on the next poll, up to 4 seconds later. This is an acceptable, deliberate latency tradeoff per the spec's "WebSockets unless clearly necessary" guidance, but is a real (small) UX difference from a hypothetical instantly-reactive console.
