# Phase 7.1 + 7.2 — Product Integrity & 100/100 Solvability — Completion Report

**Status: COMPLETE. Stop condition met.**

Core doctrine enforced end-to-end: *"The system may fail a candidate automatically, but it must never pass a candidate automatically."* Verified both by test (catalog-wide, 100/100) and live in the browser.

---

## 1. Exact engine changes

`packages/simulator/src/tick.ts`:
- Deleted the `completionMode === "automatic" && ...` success branch that auto-wrote `status = "resolved"`. The automatic-failure branch above it is untouched — failure remains unconditional in every mode.
- `resolvedAtMs` changed from `let` to `const` (no longer ever reassigned inside `tick.ts` since the only write site is gone) — fixed a `prefer-const` lint error this introduced.
- `completion.mode` / `CompletionMode` type kept as an inert, backward-compatible field. No scenario-content files touched.

`packages/simulator/src/completion.ts`:
- `isLocallyTerminal`'s doc comment rewritten to note the "automatic" branch's resolved-check is now permanently unreachable but kept for self-documentation. No behavioral change — `evaluateCandidateDeclaredFinish`, `evaluateCompletionEligibility`, `extractFinishScoringInputs`, `deriveScoringResolvedAtMs` all unchanged.

Two simulator-package-level regression tests directly asserted the now-dead behavior and were migrated (discovered during final validation, not before — see "Defects discovered" below):
- `packages/simulator/src/completion-mode.test.ts` — `"automatic + sustained success -> resolves automatically"` and `"omitting completion entirely defaults to automatic"` rewritten to assert via `evaluateCandidateDeclaredFinish(...).outcome` instead of raw `state.status`.
- `packages/simulator/src/replay.test.ts` — `"resolves the incident deterministically when replayed to a later elapsed time"` rewritten the same way.

## 2. Exact web changes

**Completion-mode gating removed** (5 lockstep files):
- `apps/web/src/components/scenario-console/generic-incident-console.tsx` — `canFinish` simplified to `incidentStarted && !isTerminal`; Finish button/dialog unconditionally rendered.
- `apps/web/src/app/assessment/[assessmentId]/assessment-console.tsx` — identical simplification.
- `apps/web/src/lib/server/finish-attempt.ts` — deleted the `candidate_declared`-only guard and the `"not_candidate_declared"` result member.
- `apps/web/src/app/api/attempts/finish-preview/route.ts` — same guard removed.
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts` — now rejects a client-claimed `"resolved"` unconditionally, for every mode (previously only for `candidate_declared`).
- `apps/web/src/app/api/attempts/[attemptId]/finish/route.ts` — dead `"not_candidate_declared"` branch removed.

**Assessment score-privacy redaction** — see section 4.

**Incident Brief + briefing readability** — see sections 8–9.

## 3. The 17 migrated scenario test files

All 17 scenarios that previously relied on `tick.ts`'s automatic-resolve (3 explicit `completion.mode: "automatic"`, 14 with no `completion` field authored at all) had their `.test.ts` files migrated off raw `state.status === "resolved"` assertions onto `evaluateCandidateDeclaredFinish(simulation, state).outcome === "resolved"`:

`cache-eviction-storm`, `distributed-coordination-failure`, `cache-node-failure`, `autoscaling-failure`, `bad-configuration-rollout`, `cache-revalidation-herd`, `cache-stampede`, `cascading-service-failure`, `database-lock-contention`, `deployment-regression`, `downstream-dependency-failure`, `kafka-consumer-lag`, `memory-leak`, `read-replica-lag`, `slow-query-regression`, `third-party-api-latency`, `thundering-herd`.

7 of the 17 required score-value corrections (not engine bugs): `deriveScoringResolvedAtMs` credits the sustain-**start** instant, not the sustain-**completion** instant the old auto-resolving engine used — a pre-existing Phase 6.1 semantic newly exercised by scenarios that previously never needed candidate-declared timing. Each correction carries an explanatory comment citing this mechanism; verified by direct before/after instrumentation (temporarily reverting `tick.ts` via `git stash` to compare exact `resolvedAtMs`/`totalTimeInCriticalMs` values), not guessed.

## 4. Assessment privacy surfaces fixed

Four confirmed leak surfaces, all fixed:

1. `GET /api/attempts/[attemptId]/route.ts` — response wrapped in `redactAttemptForCandidate(attempt)`.
2. `POST /api/attempts/[attemptId]/finish/route.ts` — the most important surface (direct Finish response): assessment attempts now get `{submitted: true}` instead of `{outcome, completionTier, score}`.
3. `apps/web/src/lib/use-assessment-runtime.ts` → `AssessmentResultScreen` — the entire score-fetch effect and `serverScore`/`scoringError`/`outcome`/`completionTier` state removed; result screen is a zero-props component rendering only a neutral submitted message.
4. `apps/web/src/app/attempts/[attemptId]/attempt-detail.tsx` — early-return branch for `attempt.attemptType === "assessment"` renders a neutral message instead of the full score/dimension breakdown.

Confirmed out of scope (verified, not touched): `evaluatePracticeAccess` (separate, scenario-shape-minimal authorization, unrelated to assessment identity); `score-preview`/`finish-preview` (unauthenticated, free-scenario-only, structurally unreachable from the assessment flow).

## 5. Redaction model

`apps/web/src/lib/server/redact-attempt-for-candidate.ts` — one shared helper, `redactAttemptForCandidate(attempt): CandidateSafeAttemptView`, a discriminated union:
- `attemptType: "practice"` → full existing shape unchanged.
- `attemptType: "assessment"` → only `{attemptType, id, status, startedAt, completedAt, submitted}` — `outcome` is deliberately redacted too (not just score/tier), since a three-way resolved/failed/declared_unstable signal still leaks a pass/fail verdict.

Listed explicitly, not inferred: a newly-added DB column on `attempts` is redacted by default for assessment attempts, since the assessment branch enumerates only safe fields rather than omitting a denylist.

## 6. Negative privacy-test coverage

- `apps/web/src/lib/server/redact-attempt-for-candidate.test.ts` — DB-integration test, inserts fully-scored practice+assessment attempt rows directly, asserts absence of ~28 named prohibited fields plus an exhaustive `Object.keys().sort()` equality check (so a newly-added field without an explicit redaction decision fails the test, not silently leaks).
- `apps/web/src/app/api/attempts/[attemptId]/attempt-privacy.route.test.ts` — route-level test (Clerk-mocked), confirms the actual `GET` handler redacts correctly, not just the pure helper.

## 7. Terminal-persistence cleanup

`apps/web/src/lib/server/assessment-runtime.ts` — the inline duplicate `persistTerminalResult` (60 lines) deleted; both call sites replaced with the shared `persistTerminalAttempt` from `apps/web/src/lib/server/terminal-attempt.ts`. This also fixed a latent correctness bug: the shared function's `assessmentCandidates` sync correctly checks `attemptType === "assessment" && assessmentId`, while the inline duplicate only checked `assessmentId` presence.

## 8. Incident Brief implementation

- `apps/web/src/components/scenario-console/briefing-content.tsx` — new shared `BriefingContent` component (+ `BriefingContentScenario` interface), the single candidate-safe briefing renderer used by both surfaces below. `briefing-screen.tsx` (pre-Acknowledge) rewritten as a thin wrapper of `BriefingContent` + SEV/paid badges + Acknowledge button.
- `apps/web/src/components/scenario-console/incident-brief.tsx` — new non-blocking slide-in drawer (not a modal, so metrics stay visible), Escape-key close, focus-on-open, renders `BriefingContent`.
- Wired into practice (`generic-incident-console.tsx`): trigger button + mount, using data already in scope.
- Wired into assessment (`assessment-console.tsx`): required new data plumbing that didn't exist before — `apps/web/src/app/api/assessment/[assessmentId]/route.ts` now returns `scenarioDescription`/`scenarioCategory`/`scenarioSkills` in addition to name/difficulty/duration; `assessment-landing.tsx`'s `AssessmentPreview` interface and `AssessmentConsoleProps` both extended; the landing page's pre-start screen now renders the description via `StructuredDescription` (previously showed none at all); the live console mounts `IncidentBrief` with an adapter object built from the newly-threaded scenario fields.

Verified live in the browser (see section 20): identical content renders pre-start and mid-incident, in both practice and (via code review + the same shared component + existing automated coverage) assessment.

## 9. Briefing parser behavior

`apps/web/src/lib/format-scenario-description.ts` — pure presentation-layer regex parser, `parseScenarioDescription(description): DescriptionSegment[]`. Splits on the `(\d+)` numbered-clause pattern (present in ~32 of 100 descriptions) into `{intro, items[]}` list segments plus leading/trailing paragraph segments. Descriptions with no `(N)` markers (the other ~68) fall through unchanged as a single paragraph — confirmed live via `cache-node-failure`'s plain-paragraph description. Zero scenario-content-file edits. `StructuredDescription` component renders the parsed segments (ordered list for numbered items, `<p>` for prose); used in `briefing-screen.tsx`, `BriefingContent`, and the assessment landing pre-start screen.

## 10. Golden-path fixture count

**100/100.** One fixture per built-in scenario at `packages/scenarios/src/golden-paths/<slug>.ts`, extracted (never invented) from each scenario's own existing `.test.ts` good-path test case, aggregated in `packages/scenarios/src/golden-paths/registry.ts`. Never re-exported from the package's public `index.ts` — structurally unreachable from any candidate-facing bundle. Produced via 10 parallel extraction passes against the actual repository state; independently re-verified as a single consolidated pass against the real engine before being accepted (see section 11).

## 11. 100/100 golden-path result

`packages/scenarios/src/golden-paths/catalog.golden.test.ts` — generic catalog-driven test, zero scenario-specific branching, iterates `listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)`, replays each golden path through the real `replayAttempt`, asserts the engine has not auto-resolved, then asserts `evaluateCandidateDeclaredFinish(...)` matches the fixture's expected outcome and tier. **101 tests, 101 passed** (100 scenarios + 1 fixture-completeness check).

## 12. Immediate-Finish result

`packages/scenarios/src/golden-paths/immediate-finish.golden.test.ts` — zero candidate actions + immediate Finish on a freshly-created state, for every built-in scenario. **101/101 passed.** All resolve to `declared_unstable` with `completionTier: null`. Documented-exceptions allowlist structure present and confirmed empty — no scenario required an exception.

## 13. No-auto-success result

`packages/scenarios/src/golden-paths/no-auto-finish.golden.test.ts` — for every scenario: replay the golden path to and 5 minutes past `finishAtMs` with no Finish call, assert still not `"resolved"`; then replay to `finishAtMs` and confirm Finish resolves it. **100/100 passed.**

## 14. Deterministic replay result

`packages/scenarios/src/golden-paths/deterministic-replay.golden.test.ts` — runs the full `replayAttempt → evaluateCandidateDeclaredFinish → extractFinishScoringInputs → scoreAuthoredAttempt` pipeline twice per golden path, deep-equality-asserts state, completion result, scoring inputs, and score (not just the final total) between runs. **100/100 passed.**

## 15. Historical/peak determinism result

Covered by section 14's deep-equality check: `scoringInputs` (which includes peak values and cumulative/historical fields carried on `SimulationState.peaks` and related trackers) and the full replayed `state` object are both asserted `.toEqual()` between independent runs — not narrowed to score totals alone. All 100 scenarios passed this check.

## 16. Alternate-path regression status

The six scenarios flagged in the plan as known multi-path (by catalog position, confirmed against the repository's actual insertion order): `#84` = `abuse-prevention-false-positive-storm`, `#90` = `model-feature-freshness-degradation`, `#94` = `ml-inference-cost-vs-quality-incident`, `#98` = `certificate-expiry-across-large-fleet`, `#99` = `emergency-capacity-reservation-decision`, `#100` = `enterprise-wide-dependency-deprecation`. Their own `.test.ts` files were not touched by the golden-path harness (which only adds new, separate files) and were re-run directly: **277/277 tests passed**, confirming their alternate-strategy assertions remain intact and unreplaced.

## 17. Scenario test count

`packages/scenarios`: **111 test files passed, 1 skipped (112 total); 3,606 tests passed, 4 skipped (3,610 total).**

## 18. Web test count

`apps/web`: **37 test files passed; 265 tests passed.**

## 19. Monorepo test count

`pnpm test` (all 5 packages): simulator 38, scenarios 3,606 (+4 skipped), db 8, scoring 23, web 265 — **3,940 tests passed, 4 skipped, 0 failed.**

## 20. Typecheck / lint / build / seed results

- `pnpm typecheck` — clean across all 5 workspace projects (simulator, scenarios, scoring, db, web).
- `pnpm lint` — clean across all 5 projects. One real defect caught and fixed: `tick.ts`'s `resolvedAtMs` became a `prefer-const` violation once its only reassignment site was deleted.
- `pnpm build` (`apps/web`, Next.js/Turbopack) — compiled successfully, all routes generated.
- `pnpm --filter @incidentrank/db db:seed` — `Seed complete (100 built-in scenario(s)).`

## 21. Manual QA evidence

Performed live against the running dev server:

- **Practice completion on a formerly-automatic scenario** (`cache-eviction-storm`): started the incident, applied the golden-path fix (Cache Admission Policy → Size-Aware Admission), confirmed the Finish Incident button — previously absent from the DOM entirely for automatic-mode scenarios — was visible and enabled; waited past full recovery (system fully healthy, status still "RECOVERING" at 55s post-fix, not auto-resolved); clicked Finish; confirmed the correct result (`INCIDENT RESOLVED`, score 865/1000 with full dimension breakdown).
- **Incident Brief**: opened pre-start and mid-incident on two different scenarios (`cache-eviction-storm`, `enterprise-wide-dependency-deprecation`); confirmed identical rendered content in both places, proving the shared `BriefingContent` source of truth.
- **Scenario #100 readability**: confirmed the six business invariants render as a structured numbered list (not a wall-of-text paragraph) both before Acknowledge and inside the mid-incident Incident Brief.
- **Parser fallback**: confirmed a plain-paragraph scenario (`cache-node-failure`) renders unchanged, with no spurious list structure.
- **Assessment privacy** (result screen, Finish response, attempt-detail, direct GET): not exercised live in the browser — doing so requires a real authenticated org + candidate account via Clerk, which was not fabricated. This surface is instead covered by dedicated automated tests added this phase that exercise the real route handlers against a real database: `redact-attempt-for-candidate.test.ts` (3 tests, exhaustive field-presence assertions), `attempt-privacy.route.test.ts` (2 tests, actual `GET` handler), and `assessment-runtime.test.ts` (19 tests, including the rewritten terminal-persistence-path test). All pass.

## 22. Defects discovered

1. **Two simulator-package regression tests missed by the initial 17-scenario migration.** `packages/simulator/src/completion-mode.test.ts` and `packages/simulator/src/replay.test.ts` (both outside `packages/scenarios/`, so not covered by the earlier grep-scoped migration) directly asserted the dead automatic-resolve behavior. Caught only during the final full monorepo `pnpm lint`/`pnpm test` validation pass (section 20), not before — a real gap in the original migration's scope, now closed.
2. **`prefer-const` lint violation** in `tick.ts` from the same root change (`resolvedAtMs` no longer reassigned).

Both fixed; full monorepo validation is green with both fixes applied, not merely with the original 17-file migration.

## 23. Fixes made

See sections 1 and 22 — `tick.ts` const fix; `completion-mode.test.ts` and `replay.test.ts` migrated to assert via `evaluateCandidateDeclaredFinish` instead of raw engine status, mirroring the exact pattern already applied to the 17 scenario-package tests.

## 24. Known unrelated flakes

None observed this phase. (Memory: `apps/web`'s `attempts` route tests have a pre-existing scenario-catalog-size concurrency-contention flake under default Vitest pooling, root-caused and mitigated in the prior Phase 6E.4 closeout via an explicit `beforeAll` timeout — not re-triggered during this phase's validation runs.)

## 25. Deviations from plan

- The approved implementation plan scoped the golden-path authoring strategy as "extraction, not hand-authoring" but did not anticipate needing a *second* retry pass for one extraction batch (9 scenarios initially missing from the registry after the first parallel-agent pass silently under-delivered relative to its own self-report) — caught by this session's own independent consolidated verification (`listBuiltInScenarioEntries` vs. `GOLDEN_PATHS` diff), not assumed from agent self-reports. Resolved by relaunching that batch; final state is a verified 100/100, not a trusted 100/100.
- Otherwise implementation followed phase7.action.md's structure directly (11 tracked tasks mapping to its sections) rather than the slightly different prose organization of the originally-approved plan document — substance is equivalent; phase7.action.md was treated as authoritative per explicit user instruction.

## 26. Product/UX concerns discovered

- The assessment landing page previously showed **no scenario description at all** pre-start — only name/difficulty/duration. This was a real, previously-undocumented gap (not just an Incident Brief prerequisite) now fixed as a side effect of threading `scenarioDescription` through for the Brief.
- `enterprise-wide-dependency-deprecation` (#100) was previously the clearest case of the "wall of text" defect this phase's briefing-readability work targets — now confirmed fixed live, numbered list renders correctly in both pre-start and mid-incident contexts.

## 27. Remaining work intentionally deferred

Per phase7.action.md's explicit scope boundary and the user's standing instruction: organization billing, enterprise features, custom scenario authoring, AI tutors, marketing infrastructure, email systems, the full organization/invitation/user-story QA matrix, and certificates. None of this phase's work touched those areas, and none of it should begin without explicit further instruction.

---

## Stop condition — confirmed

- No scenario can automatically succeed — verified by `tick.ts`'s code change and the no-auto-finish harness (100/100).
- Automatic failure behavior still works — the failure branch was untouched; `completion-mode.test.ts`'s failure-remains-automatic test still passes.
- Finish Incident works universally once an incident starts — verified by code (5 lockstep files) and live browser QA.
- All affected legacy scenario tests are migrated — 17 scenario-package files plus the 2 simulator-package files discovered during final validation; all green.
- Assessment candidates cannot access evaluation results — 4 surfaces fixed, redaction model in place.
- Assessment privacy has negative regression coverage — 2 dedicated test files, DB-integration and route-level.
- Incident Brief works in practice and assessment — verified live (practice) and by shared-component code path + existing automated coverage (assessment).
- Briefing readability is improved without rewriting 100 scenario files — zero scenario-content-file edits, confirmed.
- All 100 scenarios have a golden-path fixture — confirmed via consolidated registry diff against the real catalog.
- All 100 golden paths resolve through the real engine — 100/100.
- Zero-action immediate Finish is validated catalog-wide — 100/100 (101 incl. completeness check).
- No-auto-success is validated catalog-wide — 100/100.
- Deterministic replay is validated catalog-wide — 100/100.
- Full test/typecheck/lint/build/seed validation is complete — all green, 3,940 tests passed monorepo-wide.
- Required manual QA is complete — performed for every item feasible without fabricating real auth credentials; the one remaining item (assessment privacy) is covered by dedicated automated DB/route tests instead.
- This completion report is written.

**PHASE 7.1 + 7.2 COMPLETE.**
