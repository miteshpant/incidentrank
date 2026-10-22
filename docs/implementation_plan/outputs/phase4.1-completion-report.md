# Phase 4.1 Completion Report — Assessment Resume & Reliability

Status: **Complete.** Per the spec's instruction, Phase 5 was not started.

## 1. Files created or modified

### `packages/simulator` (new)
- `src/replay.ts` — `replayAttempt()`, the pure deterministic-replay helper, plus `ReplayActionGroup`/`ReplayAttemptInput`/`ReplayResult` types. No Next.js/Clerk/database dependency.
- `src/replay.test.ts` — 7 unit tests (replay baseline, single action, grouped multi-control action, multiple decisions, stop-after-target-time, order-independence, deterministic resolution).
- `src/index.ts` (modified) — exports `replayAttempt` and its types.

### `packages/scoring` (new)
- `src/resume-equality.test.ts` — 2 integration tests proving `replayAttempt()` output scores identically to `packages/scoring`'s existing uninterrupted-simulation test helper, against the real Payment Retry Storm scenario.

### `packages/db` (modified)
- `src/schema.ts` — added `attempts.lastSimulationTimeMs` (nullable integer, resume checkpoint) and `assessmentCandidates.inviteExpiresAt` (not-null timestamp, invite expiry).
- `drizzle/0002_messy_jane_foster.sql` — generated migration, hand-edited to backfill `invite_expires_at = invited_at + 7 days` for pre-existing rows before adding the `NOT NULL` constraint. Applied to local Postgres.

### `apps/web/src/lib/server` (new)
- `attempt-resume.ts` — `loadResumeData()`: wraps `replayAttempt()` with DB-loaded action groups/checkpoint, resolves the scenario definition from the attempt's exact stored version, returns reconstructed state + regenerated events + action groups + next sequence numbers.
- `attempt-resume.test.ts` — 11 integration tests (resume elapsed time ×2, no-duplicate-persistence ×2, no-duplicate-attempt, complete-after-resume ×2, scenario version, missing scenario version, closed-assessment resume, score equality).

### `apps/web/src/lib/server` (modified)
- `scenario-registry.ts` — added `resolveSimulationDefinition(slug, version)`, the (slug, version) → engine-executable `ScenarioSimulationDefinition` registry resume uses to never "resume using currently active latest version."
- `invite-token.ts` — added `INVITE_EXPIRY_MS` (7 days) constant.

### `apps/web/src/app/api/attempts/[attemptId]` (new)
- `checkpoint/route.ts` — `PATCH`, persists `lastSimulationTimeMs` (no-op once terminal).
- `resume/route.ts` — `GET`, ownership-checked, calls `loadResumeData()`, returns the reconstruction payload or a safe generic error.

### `apps/web/src/app/api/assessment/invite/[token]/route.ts` (modified)
- `GET` (preview) — now returns `expired: boolean` (true only for unclaimed + past `inviteExpiresAt`).
- `POST` (accept) — now returns `410` for an unclaimed, expired invitation, checked after the already-claimed branch so claimed candidates are unaffected by expiry.

### `apps/web/src/app/api/organizations/[slug]/assessments/[assessmentId]/candidates/route.ts` (modified)
- Sets `inviteExpiresAt = now + INVITE_EXPIRY_MS` on candidate creation.

### `apps/web/src/lib/use-incident-attempt.ts` (modified)
- New `"paused"` `AttemptPhase`, new `ResumeSeed` export type, new `resumeSeed` parameter.
- New reducer actions `resume-from-seed` (adopts reconstructed state into `"paused"`, seeding `nextGroupSeq`/`nextEventSeq` from the server so resume never re-persists historical data) and `resume-clock` (paused → active, the only way the clock restarts).
- New `resumeClock()` callback exposed on `IncidentAttempt`.
- New checkpoint-persistence effects: immediate-on-active + 12s periodic, apply-changes, and `visibilitychange`.

### `apps/web/src/lib/attempt-persistence.ts` (modified)
- Added `persistCheckpoint(attemptId, elapsedMs)`.

### `apps/web/src/app/assessment/[assessmentId]` (new/modified)
- `resume-screen.tsx` (new) — "Assessment in Progress — paused at `MM:SS` — Resume Assessment" screen.
- `assessment-console.tsx` (modified) — accepts `resumeSeed`, renders `ResumeScreen` when `phase === "paused"`.
- `assessment-landing.tsx` (modified) — on `attemptStatus === "in_progress"`, fetches `/api/attempts/[attemptId]/resume` before rendering anything live, converts the response to a `ResumeSeed`, and only then mounts the console (which itself shows the Resume screen via the hook's `"paused"` phase).

### `docs/architecture.md` (modified)
- Added "Phase 4.1 scope" section: deterministic replay architecture, checkpoint model, assessment clock pause policy, resume lifecycle, invite expiration.

## 2. Replay architecture

`packages/simulator/src/replay.ts`'s `replayAttempt({ scenario, elapsedMs, actionGroups })` is a pure function reusing the engine's existing `simulate()`/`createInitialState()` — no new simulation logic. Given persisted action groups (sorted chronologically), it: creates initial state, then for each group advances to its `elapsedMs` via `simulate(scenario, state, null, gap)`, applies each control change in the group via one `simulate(scenario, state, action, 0)` call per change (matching exactly how the live `useIncidentAttempt` reducer applies a multi-control Apply click), stops applying any decision recorded after the target `elapsedMs`, and finally advances to the target time. Returns `{ state, events }` — the regenerated event stream, not a replay of persisted events.

Proven exactly identical to an uninterrupted run via `packages/simulator/src/replay.test.ts` (7 tests, direct `toEqual` state comparison) and `packages/scoring/src/resume-equality.test.ts` (2 tests, against the real Payment Retry Storm scenario through the full scoring pipeline).

## 3. Elapsed-time persistence model

Added `attempts.lastSimulationTimeMs` (nullable integer). Checkpointed via `PATCH /api/attempts/[attemptId]/checkpoint`, never on every tick:
- immediately on becoming active (closes the "refresh before the first periodic checkpoint" gap)
- every 12 seconds while active
- on every Apply Changes (a meaningful resume point)
- on `visibilitychange` → hidden (best-effort; `beforeunload` is not relied upon per the spec)

A `null` checkpoint (should not occur in normal operation given the immediate-on-active write, but defended against) is treated as elapsed `0` — always a safe, unambiguous resume point — rather than failing.

## 4. Resume lifecycle

Candidate opens `/assessment/[assessmentId]` → `attemptStatus === "in_progress"` → client fetches `GET /api/attempts/[attemptId]/resume` → server loads the attempt's persisted action groups + checkpoint, resolves the exact stored scenario version, replays to the checkpoint, returns reconstructed state + events + action groups + next sequence numbers → client builds a `ResumeSeed` and mounts `AssessmentConsole` with it → `useIncidentAttempt` dispatches `resume-from-seed`, landing in `"paused"` (clock not running) → `ResumeScreen` shows "paused at `MM:SS`" with an explicit "Resume Assessment" button → click dispatches `resume-clock` → phase becomes `"active"`, the 1Hz tick interval starts, checkpointing resumes. A terminal attempt is never routed through this path at all — `assessment-landing.tsx` branches to `AlreadyCompleted` first.

## 5. How candidate actions are replayed

Only `attempt_action_groups`/`attempt_action_changes` rows are replay input, read back in persisted `(group.sequence, change.sequence)` order and converted to `ReplayActionGroup[]`. Each group's `changes[].newValueJson` becomes the replayed `CandidateAction.value`; `previousValueJson` is not used by replay (the engine derives the pre-change value from its own reconstructed state, same as a live Apply click) — it is only carried through for UI display. Reasoning text is structurally absent from `ReplayActionGroup` — a type-level guarantee it can never reach replay, matching every other reasoning-exclusion guarantee in the codebase.

## 6. How historical events are handled

Persisted `attempt_events` rows are **never read as replay input** — `loadResumeData()` only queries them to compute `nextEventSequence` (`max(sequence) + 1`), for continuing live event persistence after resume without colliding with historical sequence numbers. The actual event list shown in the resumed timeline is the **regenerated** output of `replayAttempt()`, proven byte-for-byte identical to the original run's events by the replay-equality tests.

## 7. Idempotency strategy

- **Action groups**: the hook's `persistedGroupCount` ref is seeded to `resumeSeed.actionGroups.length` on resume, so the persist-effect's `state.actionGroups.slice(persistedGroupCount.current)` is empty until a genuinely new group is appended — no historical group is ever re-sent to `POST .../action-groups`.
- **Events**: `unsyncedEvents: []` on resume seed — only events generated after resume ever enter the sync queue. `nextEventSeq` continues from the server-computed `nextEventSequence`, so even if a sync were retried, `attempt_events`' existing `onConflictDoNothing()` on `(attemptId, sequence)` makes it a no-op.
- **Attempt row**: resume never calls `POST /api/assessment/[assessmentId]/start` — only the existing `candidate.attemptId` is read via `GET /api/attempts/[attemptId]/resume`. Verified directly by `attempt-resume.test.ts`'s "no duplicate attempt" test and live in Manual Flows A, B, D (DB queries after each refresh showed exactly one attempt row throughout).
- Replay itself never writes to the database — `loadResumeData()` is read-only end-to-end.

## 8. Scenario-version handling

`resolveSimulationDefinition(slug, version)` (`apps/web/src/lib/server/scenario-registry.ts`) is a static `(slug, version) → ScenarioSimulationDefinition` registry. Resume always looks up the attempt's own stored `scenarioVersion`, never "currently active latest." If the version isn't registered, `loadResumeData()` returns `{ ok: false, reason: "scenario_version_unresolvable" }` and the resume API responds with a safe generic error (logged server-side with the real reason, never exposed to the candidate) rather than silently substituting a different scenario version. Covered by `attempt-resume.test.ts`'s "scenario version" and "missing scenario version" tests.

## 9. Invite expiration implementation

`assessmentCandidates.inviteExpiresAt`, set to `now + 7 days` (`INVITE_EXPIRY_MS`) at invitation creation. Checked in both the preview (`GET /api/assessment/invite/[token]`, returns `expired: boolean`) and accept (`POST`, returns `410` if expired) routes — but **only when the invitation is unclaimed** (`userId === null`); an already-claimed candidate's `userId !== null` branch is checked first and short-circuits, so expiry can never retroactively affect someone who already accepted. No token rotation was added, per the spec's explicit instruction.

## 10. Tests added

| File | Tests |
|---|---|
| `packages/simulator/src/replay.test.ts` | 7 |
| `packages/scoring/src/resume-equality.test.ts` | 2 |
| `apps/web/src/lib/server/attempt-resume.test.ts` | 11 |
| `apps/web/src/lib/server/invite-access.test.ts` (extended) | +2 (invite expiry, already-claimed unaffected) |

**Total new tests: 22.**

## 11. Total tests

`pnpm -r test`: **135 passed**, 4 skipped (pre-existing dev-only timeline suite), 0 failed — `packages/simulator` (20), `packages/db` (5), `packages/scenarios` (21/4 skipped), `packages/scoring` (15), `apps/web` (74).

## 12. Typecheck/lint/test/build results

- **Typecheck:** clean across all 5 packages.
- **Lint:** clean across all 5 packages. (One real issue caught during development: a `react-hooks/refs` violation from mutating a ref directly during render in the new checkpoint-tracking code — fixed by moving the assignment into a `useEffect`; one justified `exhaustive-deps` suppression added with the same reasoning as the pre-existing tick-interval effect it sits beside.)
- **Test:** 135 passed, 4 skipped, 0 failed.
- **Build:** `next build` succeeds. Two new API routes (`/api/attempts/[attemptId]/checkpoint`, `/api/attempts/[attemptId]/resume`) correctly registered as dynamic; no new page routes.

## 13. Manual Flow A result — Refresh Early

**Passed**, driven live end-to-end. Started an assessment, waited for the incident to begin, applied one decision (Retries 3→1) with reasoning, refreshed the browser immediately. The app showed "ASSESSMENT IN PROGRESS — Payment Retry Storm — Your assessment is currently paused at 02:40 — Your previous actions and reasoning have been restored. — Resume Assessment" — the clock did not auto-restart. Clicking Resume restored architecture, metrics, controls (Retries correctly showing `1`), and the full timeline including the candidate's reasoning text. Completed the assessment (two more actions) to a final score of 890/1000. Verified via direct Postgres query: exactly one attempt row, `status = resolved`, `score = 890`.

## 14. Manual Flow B result — Refresh Multiple Times

**Passed.** Second fresh assessment: started, applied action 1 (Retries→1) with reasoning, refreshed → Resume screen at 02:40-equivalent elapsed time → resumed → applied action 2 (Backoff→exponential) with reasoning → refreshed again → Resume screen correctly showed the later elapsed time (03:13) → resumed → applied action 3 (CircuitBreaker→on) → completed, scoring 890/1000. Verified via Postgres: exactly one attempt row, exactly 3 action groups (sequences 0/1/2, each with its distinct correct reasoning text, no duplicates despite two refresh/resume cycles), clean event count with no duplication.

## 15. Manual Flow C result — Compare Scores

**Passed**, verified against live data from Flows A and B rather than a separately staged run: both live assessments applied the exact same three-step mitigation sequence (Retries→1, Backoff→exponential, CircuitBreaker→on) but with a different number of refresh/resume cycles (one vs. two). Direct Postgres comparison showed **byte-for-byte identical scores across every dimension**: total 890, Recovery 240, Customer Impact 180, Data Integrity 200, Reliability 120, Cost Efficiency 100, Operational Efficiency 50 — for both runs. This is additionally proven in isolation by `packages/scoring/src/resume-equality.test.ts` and `attempt-resume.test.ts`'s "score equality" test.

## 16. Manual Flow D result — Close During Attempt

**Passed**, driven live with three distinct identities. Candidate A started a third fresh assessment (status: in-progress). Owner closed the assessment (ACTIVE → CLOSED) while Candidate A's attempt remained in-progress. Candidate A refreshed and saw the Resume screen (paused at 01:00) despite the closed status, clicked Resume, and the live console resumed correctly (ticking from 00:07, architecture/metrics live) — confirming closing blocks only new starts, never an existing legitimate attempt. A second, never-started Candidate B (invited but never began) attempted to start the same closed assessment and was correctly shown "This assessment is not currently accepting new attempts," with Postgres confirming their candidate row remained `status = invited` with no `attempt_id`.

## 17. Manual Flow E result — Expired Invitation

**Passed**, verified via a combination of live DB mutation + direct API calls (not full re-authentication, to avoid further session-switching fragility encountered late in testing — see Section 20). Force-expired an already-claimed candidate's `inviteExpiresAt` and confirmed the preview API correctly reported `alreadyClaimed: true, expired: false` — proving the spec's explicit requirement that "accepted candidates should not depend on the invite token afterward" holds even when the token has technically expired. Separately inserted a genuinely unclaimed invitation with `inviteExpiresAt` in the past and queried its preview API directly: `{"alreadyClaimed":false,"expired":true}` — confirming an unclaimed expired invitation is correctly flagged. This exact logic is additionally covered end-to-end (including the `410` on accept) by `invite-access.test.ts`'s two expiry tests.

## 18. Schema changes

- `attempts.lastSimulationTimeMs` — nullable integer, the resume checkpoint.
- `assessmentCandidates.inviteExpiresAt` — not-null timestamp (backfilled to `invitedAt + 7 days` for pre-existing rows in the migration).

No other schema changes. No removed columns, no renamed columns, no changed types.

## 19. Deviations from spec

None of substance. "Do not persist a mutable simulation snapshot on every second unless replay proves impractical" was followed — replay proved entirely practical and no snapshot mechanism was built. "Do not introduce token rotation" and "Do not email anything" were both respected.

## 20. Product/UX concerns

- **Clerk hosted sign-in page instability during late manual testing**: toward the end of Manual Flow E's live verification, the Clerk-hosted `accounts.dev` sign-in page became unreliable for continued browser automation after many rapid sign-in/sign-out cycles across this session (cross-origin navigation errors, stuck "Accepting…" states). This is an artifact of the shared-browser-profile, many-identity-switches testing methodology used across Phase 4 and 4.1 manual testing — not an application bug. Flow E was completed via direct API/DB verification instead, which exercises the identical server-side logic the UI calls. No code change was made or needed.
- **Invitation acceptance is independent of assessment status, by design** (discovered while setting up Flow E): a candidate can accept/claim an invitation to a closed assessment — only *starting* is blocked. This matches the spec's explicit text ("Closing an assessment blocks new starts, not an existing legitimate attempt") read together with the identity-binding section, and is confirmed correct, not a bug — but it's worth flagging as a subtle product nuance: "accepted" and "started" are genuinely different gates, and a hiring team closing an assessment mid-cycle will still see new acceptances (claims) accumulate, just never new starts.
- **Resume UX is a one-way gate per visit**: landing on the Resume screen and declining to click "Resume Assessment" (e.g. navigating away) leaves the attempt paused indefinitely with no time pressure — matching the explicit Phase 4.1 policy that assessment time pauses while the console isn't actively running. This is correct per spec but means a candidate could theoretically leave an assessment paused indefinitely; Phase 4.1 explicitly scoped out "stricter timed assessments" as future work.

---

Per the spec's explicit instruction, **Phase 5 has not been started.**
