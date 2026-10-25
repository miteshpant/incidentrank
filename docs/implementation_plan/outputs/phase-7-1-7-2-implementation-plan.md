# Phase 7.1 + 7.2 — Product Integrity & 100/100 Solvability

## Context

The 100-scenario content catalog is complete and approved (Phase 6E closeout). This phase shifts from content authoring to product integrity. Exhaustive reconnaissance this session confirmed two **currently active defects**, not hypothetical hardening:

1. **17 scenarios auto-finish successfully with zero candidate action.** `packages/simulator/src/tick.ts` defaults every scenario's `completion.mode` to `"automatic"` and, under that mode, writes `status = "resolved"` itself the instant `successCondition` sustains — no Finish click involved. 3 scenarios declare this explicitly; 14 more get it as the implicit default (no `completion` field authored at all). For these 17, the "Finish Incident" button doesn't even exist in the DOM today (`generic-incident-console.tsx` / `assessment-console.tsx` wrap it in `completionMode === "candidate_declared"`).

2. **Company-assessment candidates currently see their full score, six-dimension breakdown, and completion tier.** This is the live, intended data flow today across **four** independent surfaces: `GET /api/attempts/[attemptId]/route.ts` (returns the raw unredacted row), `POST .../finish/route.ts` (returns `{outcome, completionTier, score}` unconditionally — the single route serving both practice and assessment Finish), `use-assessment-runtime.ts` → `AssessmentResultScreen` (consumes and renders the GET response), and `attempts/[attemptId]/attempt-detail.tsx` (an independent server-component fetch rendering the same unredacted row). `attemptType`/`assessmentId` already exist as plain columns on `attempts` — no join needed — so every fix is a response/serialization concern, not a schema or query change.

Secondary gaps: no persistent way to re-read the briefing once an incident starts; all 100 scenarios' `description` is one flat string (several, including #100, embed "(1)...(6)..." invariants inline with no structure, rendered via a bare `<p>`); and there is no proof every one of the 100 scenarios is actually winnable through the real engine — the existing catalog-wide test (`catalog.test.ts`) is pure shape validation with zero engine replay.

**Intended outcome:** success never auto-finishes for any scenario (failure still can, unconditionally); Finish Incident is available universally once an incident starts; assessment candidates receive a neutral "submitted" confirmation and nothing else; a persistent Incident Brief is reachable mid-incident in both practice and assessment; briefings render structured lists instead of wall-of-text; and a generic, data-driven 100/100 golden-path harness proves every scenario deterministically solvable through the real `replayAttempt` → `evaluateCandidateDeclaredFinish` pipeline.

---

## 1. Completion-mode normalization (foundational — do first)

**`packages/simulator/src/tick.ts`** (~line 148-160): delete the `else if (completionMode === "automatic" && ...) { status = "resolved"; ... }` branch entirely. The failure branch above it is untouched (automatic failure stays unconditional, every mode, per spec §27). Do **not** flip the `?? "automatic"` default or touch the `CompletionMode` type — `isLocallyTerminal` (`packages/simulator/src/completion.ts`) already encodes correct per-mode terminal semantics and needs no change once `tick.ts` can never write `"resolved"` automatically. This keeps the blast radius to one engine file for the core behavior change; `completion.mode` remains present as an inert, backward-compatible field on all 100 scenario definitions — no scenario-content files are touched.

**Five lockstep files**, all currently branching on `completionMode === "candidate_declared"`/`"automatic"` for the now-dead success distinction — remove the gate in each so behavior is universal:
- `apps/web/src/components/scenario-console/generic-incident-console.tsx` — `canFinish` computation and the two JSX wrappers around the Finish panel/dialog drop the `completionMode === "candidate_declared"` condition, collapsing to `incidentStarted && !isTerminal`.
- `apps/web/src/app/assessment/[assessmentId]/assessment-console.tsx` — identical pattern.
- `apps/web/src/lib/server/finish-attempt.ts` — delete the step-3 guard (`if ((scenario.completion?.mode ?? "automatic") !== "candidate_declared") return {ok:false, reason:"not_candidate_declared"}`) and the now-dead `"not_candidate_declared"` member of `FinishAttemptResult`.
- `apps/web/src/app/api/attempts/finish-preview/route.ts` — same guard, same removal.
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts` (~line 121-138) — confirmed: `isCandidateDeclared && body.status === "resolved"` currently rejects a client-claimed `"resolved"` only for candidate_declared scenarios. Change to reject a client-claimed `"resolved"` **unconditionally** (drop the `isCandidateDeclared &&` qualifier) — no scenario can legitimately reach automatic success anymore, so this route must never accept a resolved claim from any client, in any mode. Failure claims (`body.status === "failed"`) remain accepted as today.

Also remove the now-dead `"not_candidate_declared"` error-branch handling in `apps/web/src/app/api/attempts/[attemptId]/finish/route.ts` (~line 67-72) and the equivalent in `finish-preview/route.ts`.

`apps/web/src/lib/server/assessment-runtime.ts` and `apps/web/src/lib/use-incident-attempt.ts` need **no change** — both already call `isLocallyTerminal(state, completionMode)` generically and never branch on the mode themselves for success.

### Required migration: 17 scenario test files

Confirmed directly: scenarios without `candidate_declared` today have `.test.ts` files asserting `expect(state.status).toBe("resolved")` straight off a raw `simulate()`/`runScenario()` call (e.g. `autoscaling-failure.test.ts:84`, `memory-leak.test.ts:84,154-155`). After the `tick.ts` fix, `state.status` can never reach `"resolved"` this way — these assertions must be converted to go through `evaluateCandidateDeclaredFinish(simulation, state)` and assert `.outcome === "resolved"` instead, matching the pattern the other 83 scenario test files already use. Affected files (pattern is identical across all 17 — fix once per file, not a design decision): `cache-eviction-storm`, `distributed-coordination-failure`, `cache-node-failure`, `autoscaling-failure`, `bad-configuration-rollout`, `cache-revalidation-herd`, `cache-stampede`, `cascading-service-failure`, `database-lock-contention`, `deployment-regression`, `downstream-dependency-failure`, `kafka-consumer-lag`, `memory-leak`, `read-replica-lag`, `slow-query-regression`, `third-party-api-latency`, `thundering-herd` — each at `packages/scenarios/src/<slug>.test.ts`. This is required, not optional: `pnpm --filter @incidentrank/scenarios test` fails without it.

---

## 2. Assessment score-privacy redaction (second priority — real security defect)

**New shared helper**: `apps/web/src/lib/server/redact-attempt-for-candidate.ts`, exporting `redactAttemptForCandidate(attempt: Attempt): CandidateSafeAttemptView`. For `attemptType === "practice"`, returns the full existing shape unchanged. For `attemptType === "assessment"`, returns only `{ attemptType: "assessment", id, status, startedAt, completedAt, submitted: boolean }` — explicitly stripping `outcome`, `completionTier`, `score` + all 6 dimension scores, `completionNote`, `recoveryTimeMs`, `revenueLossUsd`, peaks, action tallies, and `finalStateJson`. `outcome` is deliberately redacted too (not just score/tier) — exposing a three-way resolved/failed/declared_unstable signal still leaks a pass/fail verdict, contradicting spec §9's "equivalent to: Assessment submitted successfully."

Plug in at all four confirmed surfaces:
1. `apps/web/src/app/api/attempts/[attemptId]/route.ts` — wrap the response in `redactAttemptForCandidate(attempt)`; the query stays unchanged (needs full columns to redact from).
2. `apps/web/src/app/api/attempts/[attemptId]/finish/route.ts` (~line 80-84) — branch on `owned.attempt.attemptType`: assessment → `{ submitted: true }`; practice → today's `{outcome, completionTier, score}` unchanged. This is the most important single fix — it's the direct response to the Finish action itself.
3. `apps/web/src/app/attempts/[attemptId]/attempt-detail.tsx` — server component, not an API response; add an `attempt.attemptType === "assessment"` branch rendering a neutral "this was a company assessment — results are available to the hiring organization" message instead of today's unconditional score/dimension JSX.
4. `apps/web/src/lib/use-assessment-runtime.ts` (~line 238-281) — once surface #1 is redacted, `data.attempt.score` becomes `undefined` for assessment attempts, and the existing `score == null` fallback would incorrectly show a scoring-error retry UI. Add an attemptType/`submitted`-aware branch that sets a clean "submitted" terminal state without depending on `score` presence, and update `AssessmentResultScreen` (`apps/web/src/app/assessment/[assessmentId]/assessment-result-screen.tsx`, ~line 121-161) to render a neutral submitted-confirmation branch instead of assuming `serverScore` will arrive.

Out of scope, confirmed and verified not to need changes: `evaluatePracticeAccess` (a deliberately separate, scenario-shape-minimal authorization path unrelated to assessment identity) and `score-preview`/`finish-preview` (unauthenticated, free-scenario-only, structurally unreachable from the assessment flow — `use-assessment-runtime.ts` never calls them).

**`persistTerminalResult` cleanup** (`apps/web/src/lib/server/assessment-runtime.ts`, ~line 223-283): delete this inline duplicate entirely; replace its two call sites (~line 440 in `tryAdvanceOnce`, ~line 694 in `submitAction`) with `persistTerminalAttempt(db, attempt, extractScoringInputs(scenario, state), state, { outcome: state.status as "resolved" | "failed" })`, reusing the shared primitive from `apps/web/src/lib/server/terminal-attempt.ts`. This also fixes a latent bug: the shared function's `assessmentCandidates` sync correctly checks `attemptType === "assessment" && assessmentId`, while the inline duplicate only checked `assessmentId` presence. No test changes expected in `assessment-runtime.test.ts` — confirmed no test asserts on the inline function's specific (narrower) field-omission behavior.

---

## 3. Incident Brief + briefing readability

**Incident Brief** — new `apps/web/src/components/scenario-console/incident-brief.tsx`, a slide-in drawer (not a blocking modal, so metrics stay visible) triggered by a small persistent button near `IncidentHeader`. Extract a shared `BriefingContent` presentational component (`apps/web/src/components/scenario-console/briefing-content.tsx`) that both the existing `GenericBriefingScreen` (pre-Acknowledge) and the new `IncidentBrief` (post-start) render — `GenericBriefingScreen` becomes a thin wrapper of `BriefingContent` + Acknowledge button + sign-in nudge. This directly satisfies spec §6/§29 ("same source of truth, no duplicated text").

Wiring into practice (`generic-incident-console.tsx`) needs no new data — `scenario`/`simulation.architecture` are already in scope at the live-console render branch. **Wiring into assessment is larger than it first appears**: the assessment flow currently fetches only `scenarioName`/`difficulty`/`estimatedMinutes` pre-start and architecture/controls post-start — `description` is never fetched at all, pre- or post-Acknowledge. Required: add `description` (and `library` for skills/category) to `loadCandidateSafeScenarioMeta` in `apps/web/src/app/api/assessment/[assessmentId]/route.ts`, thread it through `AssessmentPreview`/`AssessmentConsoleProps`, and also render it on the pre-start assessment landing screen (`assessment-landing.tsx`, ~line 195-240) which today shows no description at all — needed to satisfy spec §24's "briefing visible" for assessments specifically.

**Briefing readability** — pure rendering-layer fix, no schema change, no scenario-content-file edits. New `apps/web/src/lib/format-scenario-description.ts` exporting `parseScenarioDescription(description: string): DescriptionSegment[]`, splitting on the `(\d+)` numbered-clause pattern already present in ~32 of the 100 descriptions (confirmed by direct inspection of #100 and two others) into `{intro, items[]}` list segments plus leading/trailing paragraph segments; descriptions with no `(N)` markers (the other ~68) fall through unchanged as a single paragraph. Render via `StructuredDescription` (`apps/web/src/components/scenario-console/structured-description.tsx`), used in place of the current bare `<p>{scenario.description}</p>` in `briefing-screen.tsx` and in the new `BriefingContent`/`IncidentBrief`. Zero content-file edits needed anywhere — the #100 regression test (spec §30) asserts the parser produces 6 distinct list items plus intro/trailing paragraphs from #100's existing, unmodified description text.

---

## 4. Phase 7.2 — 100/100 golden-path harness

**Fixtures**: one file per scenario at `packages/scenarios/src/golden-paths/<slug>.ts`, exporting a typed `ScenarioGoldenPath` constant (`{scenarioSlug, actions: {atMs, controlKey, value}[], finishAtMs, expectedOutcome: "resolved", expectedCompletionTier}`), plus a `registry.ts` aggregating all 100 into `GOLDEN_PATHS: Record<string, ScenarioGoldenPath>` — mirroring the existing `catalog.ts` per-scenario-file convention. This directory is never re-exported from `packages/scenarios/src/index.ts`'s public surface, structurally guaranteeing candidate bundles never see golden solutions (spec §13).

**Authoring strategy — extraction, not hand-authoring.** Confirmed directly (`cache-node-failure.test.ts`, `autoscaling-failure.test.ts`, and others): every scenario's own `.test.ts` already defines a `{atMs, controlKey, value}[]` action array for its "good path"/optimal test case — a byte-for-byte structural match to `ScenarioGoldenPath.actions`. For each of the 100 scenarios, extract that existing, already-passing action array and its known-correct timing into `golden-paths/<slug>.ts` rather than designing a new solution from scratch; confirm `expectedCompletionTier` from what that test already asserts (optimal vs. acceptable). This is per-scenario extraction + spot-verification, not 100 new designs.

**Generic runner** `packages/scenarios/src/golden-paths/catalog.golden.test.ts`: iterate `listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)`, look up each slug in `GOLDEN_PATHS`, convert `actions` → `ReplayActionGroup[]` (one group per action — `replayAttempt` sorts and applies strictly by `elapsedMs` regardless of grouping), call `replayAttempt({scenario: entry.definition.simulation, elapsedMs: goldenPath.finishAtMs, actionGroups})` → `evaluateCandidateDeclaredFinish(entry.definition.simulation, state)`, assert outcome/tier match. Zero scenario-specific branching in the runner itself — `entry.definition.simulation` is available directly and synchronously (confirmed via `resolveSimulationDefinition` in `scenario-registry.ts`: for built-ins it's simply `entry.definition.simulation`, no compile/DB step).

Three companion files, same registry, separate for clear failure attribution:
- `immediate-finish.golden.test.ts` (spec §16): zero actions, immediate Finish, assert `declared_unstable` for all 100 (with a documented-exceptions allowlist structure, expected empty).
- `no-auto-finish.golden.test.ts` (spec §17): replay each golden path to its safe state, advance one more tick-equivalent window, assert still `in_progress`/not terminal, then replay through `finishAtMs` and assert resolved — the core regression test for the new doctrine.
- `deterministic-replay.golden.test.ts` (spec §18/§19): run the full `replayAttempt → evaluateCandidateDeclaredFinish → extractFinishScoringInputs → scoreAuthoredAttempt` chain twice per golden path, assert deep-equality of outcome/tier/score/breakdown/state between runs.

Representative alternate-path regression (spec §20) reuses each named scenario's own existing scenario-level tests unchanged (no new catalog-wide fixture needed) — just confirm they still pass after step 1's `tick.ts` change: `#84`, `#90`, `#94`, `#98`, `#99`, `#100`.

---

## Phased execution order

1. Completion-mode fix (`tick.ts` + 5 lockstep files) + 17-scenario test migration — foundational, smallest isolated change, everything else depends on it.
2. Assessment score-privacy redaction + `persistTerminalResult` cleanup — independent, highest-severity, ships as soon as step 1's tests are green.
3. Incident Brief + briefing readability — independent UX work, naturally follows.
4. Golden-path harness — last, since its "no auto-finish" assertions are only meaningful once step 1 has landed, and extraction benefits from the fresh 17-scenario test-file familiarity from step 1.

## Key reused utilities (no new engine primitives needed)

- `packages/simulator/src/replay.ts` — `replayAttempt`
- `packages/simulator/src/completion.ts` — `isLocallyTerminal`, `evaluateCandidateDeclaredFinish`, `evaluateCompletionEligibility`, `extractFinishScoringInputs`
- `apps/web/src/lib/server/terminal-attempt.ts` — `persistTerminalAttempt`
- `packages/scenarios/src/library/` — `BUILT_IN_SCENARIO_CATALOG`, `listBuiltInScenarioEntries`, `getBuiltInScenarioEntry`
- `apps/web/src/lib/server/load-owned-attempt.ts` — `loadOwnedAttempt` (unchanged; redaction happens after, not inside)
- `apps/web/src/lib/server/finish-attempt.test.ts` — existing pattern to mirror for the golden-path harness ("test the shared server-authoritative function directly, no DB/HTTP")

## Verification

```
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test      # 17 migrated tests + new golden-paths/*.golden.test.ts, expect 100/100/100/0/0

pnpm --filter @incidentrank/web typecheck       # (or the actual web package name)
pnpm --filter @incidentrank/web lint
pnpm --filter @incidentrank/web test            # finish-attempt.test.ts, assessment-runtime.test.ts, new redaction negative-tests

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed          # expect "Seed complete (100 built-in scenario(s))."
```

Manual browser checks:
- Acknowledge an automatic-mode scenario (e.g. `cache-eviction-storm`), drive it to a safe state, confirm it does **not** auto-finish and the Finish Incident button is now visible; click Finish and confirm a correct `resolved`/`declared_unstable` result.
- Complete a company-assessment attempt and confirm the result screen shows only a neutral "submitted" confirmation — no score, tier, or breakdown anywhere, including via `/attempts/{attemptId}` if navigated directly.
- Mid-incident in both practice and assessment, open the new Incident Brief and confirm it shows the same content as the pre-Acknowledge briefing.
- Open scenario #100's briefing (pre- and post-Acknowledge) and confirm its six business invariants render as a numbered list, not one paragraph.
