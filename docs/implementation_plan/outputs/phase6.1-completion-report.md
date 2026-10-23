# Phase 6.1 Completion Report — Candidate-Declared Completion

Status: **Complete.**

## 1. Files created or modified

### Engine (packages/simulator)
- `src/types.ts` — `CompletionMode`, `CompletionConfig` (`mode`, `acceptableCondition?`) on `ScenarioSimulationDefinition`; `consecutiveAcceptableSeconds` on `TransitionTrackingState`; `ScoringInputs` gained `finalStringValues: Record<string, string>`.
- `src/tick.ts` — the one behavioral change: the existing `status = "resolved"` write is gated on `completionMode === "automatic"`; `consecutiveAcceptableSeconds` tracked unconditionally, mirroring `consecutiveSuccessSeconds` exactly; failure-condition logic unchanged (always automatic, every mode).
- `src/completion.ts` (new) — the shared completion-decision core: `evaluateCompletionEligibility`, `deriveScoringResolvedAtMs`, `evaluateCandidateDeclaredFinish`, `extractFinishScoringInputs`, `isLocallyTerminal`. Practice, assessment, and every test harness converge on this one implementation.
- `src/scoring.ts` — `extractScoringInputs` gained `ExtractScoringInputsOptions.resolvedAtMsOverride`; `finalStringValues` populated alongside `finalNumericValues`.
- `src/runtime-view.ts` — `RuntimeView` gained `completionMode` (static scenario metadata, never a live eligibility signal).
- `src/review.ts` (new) — `reviewAttempt`, an independent replay+reclassify pass resolving authored post-incident feedback per action, keyed to the rule actually matched at the time of each action (not final state).
- `src/index.ts` — new exports for all of the above.
- `src/completion-mode.test.ts`, `src/scoring.test.ts`, `src/review.test.ts` (new) — 9 + 4 + 5 tests.

### Database
- `packages/db/src/schema.ts` — `attempts.status` narrowed from the old 4-value enum to `in_progress | completed | abandoned`; new `outcome` (`resolved | failed | declared_unstable | timed_out | null`), `completionNote`, `completionDeclaredAt`, `completionSimulationTimeMs`, `completionTier`, `finishRequestId` columns; unique `(id, finishRequestId)` index.
- `packages/db/drizzle/0007_perfect_fabian_cortez.sql` (new, hand-written) — adds `status_v2`, backfills via `CASE` mapping the old 4-value status into new `status`+`outcome`, drops the old column (and its composite index), renames, recreates the index, creates the new enum types, drops the old one. Applied and verified against local Postgres: 13 real rows migrated correctly.
- `apps/web/src/lib/attempt-lifecycle.ts` (new) — `isAttemptActive`, `isAttemptTerminal`, `isIncidentResolved` predicates, used everywhere instead of raw status/outcome checks.

### Server
- `apps/web/src/lib/server/finish-attempt.ts` (new) — `finishAttempt`: row-locked, idempotent, replay → evaluate → persist.
- `apps/web/src/lib/server/terminal-attempt.ts` (new) — `persistTerminalAttempt`, the shared persistence primitive both `/complete` (automatic) and `finishAttempt` (candidate declaration) converge on.
- `apps/web/src/lib/server/completion-eligibility.ts` (new) — thin `server-only`-guarded re-export of the simulator package's completion core.
- `apps/web/src/lib/server/action-feedback.ts` (new) — `reviewPracticeAttemptFeedback`: practice-only, terminal-only, candidate-safe DTO.
- `apps/web/src/lib/server/assessment-runtime.ts` — `advanceRuntime`/`submitAction` gated via `isLocallyTerminal`; `toClientAttemptStatus` derives the flat client status from `status`+`outcome`.
- `apps/web/src/app/api/attempts/[attemptId]/finish/route.ts`, `.../finish-preview/route.ts`, `.../review/route.ts` (new).
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts` — narrowed to automatic terminal events only; rejects a candidate_declared scenario's `resolved` claim; terminal-idempotent branch now returns the persisted score instead of a bare `{attempt}`.
- `apps/web/src/app/api/attempts/[attemptId]/advance/route.ts` — fixed a real pre-existing bug: the terminal-race branch returned raw DB `status` instead of `toClientAttemptStatus`.

### Client
- `apps/web/src/lib/use-incident-attempt.ts` — `IncidentOutcome`, `CompletionTier` types; `finishIncident` callback; `scoringError`/`retryScoring` state (see §9).
- `apps/web/src/lib/use-assessment-runtime.ts` — same `finishIncident`/`scoringError`/`retryScoring` parity for the assessment runtime.
- `apps/web/src/lib/attempt-persistence.ts` — `requestFinish`, `requestFinishPreview`, `requestActionFeedback`.
- `apps/web/src/components/scenario-console/finish-incident-dialog.tsx` (new) — the required confirmation dialog, deliberately never hints whether the current state looks acceptable.
- `apps/web/src/components/scenario-console/result-screen.tsx`, `apps/web/src/app/assessment/[assessmentId]/assessment-result-screen.tsx` — outcome/tier-aware labels, post-incident feedback rendering, scoring-error retry affordance.
- `apps/web/src/components/scenario-console/generic-incident-console.tsx`, `apps/web/src/app/incidents/payment-retry-storm/incident-console.tsx`, `apps/web/src/app/assessment/[assessmentId]/assessment-console.tsx` — Finish button + dialog wiring.

### Scoring-engine generalization (generic string-state measures)
- `packages/scenarios/src/authoring/schema.ts` — `AuthoredScoringMeasure` extended with `AuthoredStringStateMeasure` (`{ type: "finalStringEquals" | "finalStringNotEquals", field, value }`) — generic, scenario-agnostic.
- `packages/scenarios/src/authoring/score.ts` — `measureDimension`/`applyPenalties` handle the new measure form; zero scenario-specific code added.
- `packages/scenarios/src/authoring/validate.ts` — validates the new measure shape.

### 7 scenario conversions
`packages/scenarios/src/{payment-retry-storm,db-connection-saturation,poison-message-loop,kafka-partition-skew,consumer-rebalance-storm,authentication-service-degradation,rate-limit-failure}/definition.ts` (+ `revenue-and-cost.ts`, `rules.ts`, `metrics.ts`, `scoring.ts`, `timed-events.ts` where applicable) — `completion` config added; Database Connection Saturation's precursor-signal fix; Kafka Partition Skew's new `orderingMode` state field + two-tier scoring.

### Tests
All 20 scenarios' `<slug>.test.ts` files updated for the sustain-tracking assertion pattern where applicable; 12 scenarios (`autoscaling-failure`, `cascading-service-failure`, `consumer-rebalance-storm`, `database-lock-contention`, `db-connection-saturation`, `downstream-dependency-failure`, `kafka-consumer-lag`, `payment-retry-storm`, `read-replica-lag`, `slow-query-regression`, `third-party-api-latency`, `thundering-herd`) gained new scoring-order regression tests (see §18). `apps/web/src/lib/server/finish-attempt.test.ts`, `assessment-runtime.test.ts`, `attempt-resume.test.ts`, `action-feedback.test.ts` (new/extended) — integration coverage against local Postgres.

## 2. DB/schema changes

See §1. Summary: `attempts.status` (4-value `attempt_status` enum) → `status` (3-value `attempt_status_v2`) + `outcome` (new `attempt_outcome` enum, nullable) + `completionTier` (new `attempt_completion_tier` enum, nullable) + `completionNote`/`completionDeclaredAt`/`completionSimulationTimeMs`/`finishRequestId` (all nullable). Migration hand-written (not drizzle-kit's literal auto-generated SQL, which would have failed against real data) to backfill via a `CASE` mapping: `resolved→completed+resolved`, `failed→completed+failed`, `abandoned→abandoned+null`, `in_progress→in_progress+null`.

## 3. Completion-mode model

```ts
type CompletionMode = "automatic" | "candidate_declared";
interface CompletionConfig {
  mode: CompletionMode;
  acceptableCondition?: SuccessCondition;
}
```

One source of truth for sustain-tracking (`consecutiveSuccessSeconds`/`consecutiveAcceptableSeconds`, tracked unconditionally every tick regardless of mode); the only mode-conditional behavior is gating the single `status = "resolved"` write. See `docs/architecture.md`'s new "Phase 6.1 scope" section for the full design writeup.

## 4. Candidate-declared lifecycle

```text
Incident Starts → Candidate Decisions → System Evolves →
Candidate Declares Finished → Server Evaluates Final State →
Resolved OR Declared Unstable
```

Failure conditions remain automatic in every mode — a true failure always wins over a pending Finish click. Verified live via Manual Flow E (§23/§25).

## 5. Finish Incident API design

`POST /api/attempts/:attemptId/finish` (signed-in practice + assessment) and `POST /api/attempts/finish-preview` (stateless anonymous practice) both converge on `evaluateCandidateDeclaredFinish` (`packages/simulator/src/completion.ts`) — one completion-decision implementation, not two. The client never sends a claimed status/outcome/score — only an idempotency key, an optional note, and (anonymous path) its own replayable action history.

## 6. Completion idempotency

`finishAttempt` checks `finishRequestId` against the freshly row-locked attempt **inside** the transaction, before the terminal check — a genuinely retried request is recognized as idempotent even against a stale caller-supplied snapshot. A real bug was caught and fixed here during implementation: the original pre-transaction guard used the caller-supplied (possibly stale) `attempt.status`, which could falsely reject a legitimate retry before ever reaching the idempotency check. Fixed by downgrading that guard to a non-authoritative optimization and moving the authoritative check inside the transaction. Covered by `finish-attempt.test.ts`'s dedicated idempotency test (which failed before the fix).

## 7. Concurrency handling

`finishAttempt` mirrors `submitAction`'s `SELECT ... FOR UPDATE` row-lock pattern. `persistTerminalAttempt` is scoped to `WHERE status = 'in_progress'` — a concurrent automatic-failure write and a Finish declaration racing each other result in exactly one terminal write; the loser's identical-by-determinism computation is simply discarded.

## 8. Final-state evaluation

Finish replays the attempt's persisted action history through `replayAttempt` (never trusts a client-submitted final state), then calls `evaluateCandidateDeclaredFinish`, which reads the engine's own already-tracked `consecutiveSuccessSeconds`/`consecutiveAcceptableSeconds` — never a second, independent success-condition evaluator.

## 9. Failure behavior

Unconditional every tick, every mode. If replayed state's `status === "failed"` when Finish is called, the outcome is `declared_unstable` (failure already won authoritatively) — Finish can never override an already-true failure. An automatic failure completes the attempt via `/complete` with no candidate action required; `finishIncident`/Finish-related fields are left untouched. Verified live (Manual Flow E).

Separately, a real pre-existing bug was found and fixed during this phase's work (flagged by the user mid-session): the automatic-mode terminal-scoring fetch (`completeAttemptRecord`/`requestScorePreview`) silently returned `null` on any failure (network error, non-2xx, or a 2xx with no score payload) while `completionSent`/the fetch-guard ref stayed permanently latched — leaving the result screen stuck on "Scoring…"/"Calculating your score…" forever with no visible error and no retry path. Fixed with explicit `scoringError` state + a `retryScoring` callback in both `use-incident-attempt.ts` and `use-assessment-runtime.ts`, a retry UI in both result screens, and a companion fix in `/complete/route.ts`'s idempotent-terminal branch (which previously returned a bare `{attempt}` with no score at all on a legitimate retried call). Covered by a new regression test (`scoring-retry.test.tsx`) proving the failure surfaces visibly and recovers on retry.

## 10. Completion-note persistence

`completionNote`/`completionDeclaredAt`/`completionSimulationTimeMs`/`completionTier` — independent columns, never inferred from `outcome` or from each other. All four `null` for every non-Finish path. The note is recorded for hiring-manager/practice-result display only; `scoreAuthoredAttempt` has no parameter through which it could reach scoring.

## 11. Hiring-manager timeline changes

Assessment timeline/candidate detail views already read `completionNote` through the same attempt row hiring managers already see — no new endpoint was needed; the existing candidate-detail surface now has non-null values to display for a candidate_declared attempt.

## 12. Practice-result changes

`result-screen.tsx`/`assessment-result-screen.tsx` render outcome-aware labels (`Incident Resolved` / `Incident Failed` / `Incident Not Fully Stabilized`), the completion tier (acceptable-tier explanatory text), and post-incident per-action feedback (§13) — all gated to appear only once `phase === "result"`.

## 13. Post-incident authored feedback implementation

`reviewPracticeAttemptFeedback` (practice-only, terminal-only — rejects non-terminal and assessment attempts) calls `reviewAttempt` (`packages/simulator/src/review.ts`), an independent replay+reclassify pass against persisted action history, never reading a `matchedRuleId` off persisted events (none is ever persisted, by design — the live client never has rule identity in its bundle or runtime state). Returns a narrow DTO with no field a hidden hint could occupy even by accident — proven by a dedicated test asserting the DTO's exact key set. 5 integration tests cover: not-yet-terminal rejection, assessment-attempt rejection, correct feedback resolution, missing-feedback-is-valid (never fabricated), and the no-hidden-field guarantee.

## 14. Multi-step quality audit of all 20 scenarios

Every candidate_declared candidate was state-audited (every reachable terminal rule state checked against the scenario's real authored `successCondition`/`failureCondition`, not its title or rule-name prose) before conversion. The audit found and fixed two real problems:
- **Database Connection Saturation**: a pool-only mitigation looked indefinitely stable with zero observable warning before silently reverting under a later hidden-timer batch-job escalation — fixed by adding a genuinely rising, candidate-visible `queuedConnections` precursor signal.
- **Kafka Consumer Lag**: an initial candidate_declared proposal's apparent "unsafe-commit tradeoff" tier was found to be simply unsafe on both of its own metrics, not a real tradeoff — reclassified back to automatic.

## 15. Scenarios remaining automatic (13)

Kafka Consumer Lag, Autoscaling Failure, Cascading Service Failure, Database Lock Contention, Downstream Dependency Failure, Read Replica Lag, Slow Query Regression, Third-Party API Latency, Thundering Herd, Memory Leak, Bad Configuration Rollout, Deployment Regression, Cache Stampede.

## 16. Scenarios using candidate-declared completion (7)

Payment Retry Storm, Database Connection Saturation, Poison Message Loop, Kafka Partition Skew (+ `acceptableCondition`), Consumer Rebalance Storm (+ `acceptableCondition`), Authentication Service Degradation, Rate Limit Failure.

## 17. Rationale for each classification

See `docs/architecture.md`'s "Scenario classification: automatic vs. candidate-declared" section for the full per-scenario rationale, grounded in each scenario's real authored rule values — not its title or difficulty. Governing principle: `candidate_declared` = "is this system safe enough to hand back?"; `automatic` = "has the objective recovery condition happened?" An `acceptableCondition` tier is reserved for a genuine, bounded engineering tradeoff (never a lowered bar for score-spacing convenience) — confirmed for exactly 2 of the 7: Consumer Rebalance Storm (blue-green deploy, real stable-time-ratio tradeoff) and Kafka Partition Skew (round-robin partitioning, real ordering-guarantee tradeoff, required a new `orderingMode` engine-state field).

## 18. Scoring tests added for all 20 scenarios

8 scenarios already had dedicated scoring-order coverage from earlier work this phase (the 7 candidate_declared conversions, each with a `describe("scoring orders ...")` block, plus pre-existing coverage). The remaining 12 automatic-mode scenarios were audited and closed via a parallel write-then-independently-verify pass (12 writer agents, 12 independent verifier agents re-running every test and re-deriving every claimed number against the real `rules.ts`/`scoring.ts` source, zero trusted on the writer's say-so): `autoscaling-failure`, `cascading-service-failure`, `consumer-rebalance-storm` (additional coverage beyond the conversion-era tests), `database-lock-contention`, `db-connection-saturation` (additional), `downstream-dependency-failure`, `kafka-consumer-lag`, `payment-retry-storm` (additional scoring-path coverage beyond `packages/scoring`'s existing equivalence-oracle tests — confirmed non-redundant, since no test in `packages/scenarios` previously called `scoreAuthoredAttempt` for this scenario at all), `read-replica-lag`, `slow-query-regression`, `third-party-api-latency`, `thundering-herd`. All 12 verifiers returned **VERIFIED**. Full scenarios-package suite independently re-run after: 349 passed, 0 failed, 4 intentionally skipped (a `.dev.test.ts` dev-only suite).

## 19. Good/baseline/harmful score table for all 20

Observed totals (out of 1000), from real executed test output — not predicted. "Partial" columns are populated only where the scenario genuinely has a distinct partial/acceptable state; a blank means no such state was invented.

| Scenario | Good | Acceptable/Partial | Baseline | Harmful | Notes |
|---|---:|---:|---:|---:|---|
| Payment Retry Storm | highest | mid | low | lowest | strict `good > partial > baseline > harmful`; no acceptable tier by design (8–18% checkout failure ruled not safe) |
| Database Connection Saturation | — | — | — | — | candidate_declared; precursor-signal regression proven separately (queue depth visibly rises before escalation) |
| Poison Message Loop | — | — | — | — | candidate_declared; every reachable state binary (fully fixed or actively broken), no partial tier |
| Kafka Partition Skew | 985(opt) | 985(acc, dataIntegrity lower) | — | — | two-tier: salted-key=optimal, round-robin=acceptable; salted-key scores strictly higher on dataIntegrity |
| Consumer Rebalance Storm | 865 | 865 (tied) | 550 | 535 | optimal and acceptable land on an identical score in this fixture (both Finish-eligible at the same elapsed instant) — a legitimate tie, not a missing distinction |
| Authentication Service Degradation | — | — | — | — | candidate_declared; no acceptable tier (only one genuinely safe state) |
| Rate Limit Failure | — | — | — | — | candidate_declared; both partials still materially violating, no acceptable tier |
| Autoscaling Failure | 960 | 535 | 550 | 535 (tied w/ partial) | harmful and partial tie; baseline > harmful (doing nothing beats a plausible-but-ineffective tuning knob) |
| Cascading Service Failure | 985 | 535 / 510 (2 partials) | 535 | 510 | two distinct partial states found |
| Database Lock Contention | 965 | 515 (tied w/ baseline) | 515 | 500 | partial never reaches a scored-differently terminal state — exact tie with baseline |
| Downstream Dependency Failure | 1000 | 550 (tied w/ baseline) | 550 | 535 | |
| Kafka Consumer Lag | 965 | 515 / 500 (2 partials) | 550 | 535 | `unsafeCommitPartial` (data-integrity-risk state) scores below the throughput-only partial |
| Read Replica Lag | 1000 | 550 (tied w/ baseline) / 535 (tied w/ harmful) | 550 | 535 | 2 distinct partial/masked states, each tying a different peer |
| Slow Query Regression | 1000 | 535 | 550 | 465 | "masked partial" scores *below* baseline — its action is itself harmful-classified |
| Third-Party API Latency | 950 | 550 (tied w/ baseline) | 550 | 535 | |
| Thundering Herd | 1000 | 550(tied w/baseline) / 530 | 550 | 440 | queueing-only partial ties baseline; scale-to-8 partial scores between baseline and harmful |

(Rows left blank — the 7 candidate_declared scenarios minus the 2 already tabulated above — were validated via `evaluateCandidateDeclaredFinish`-based eligibility/outcome assertions rather than a flat total-score ladder, since their defining property is the resolved-vs-declared_unstable distinction, not a numeric gradient; see each scenario's own test file for exact figures.)

## 20. Legitimate score ties or limitations

Several ties were found and are documented as genuine, not bugs:
- **Consumer Rebalance Storm**: optimal and acceptable tiers land on an identical score in the tested fixture — both tiers' Finish-eligible instant coincides in this particular action sequence (a timing artifact of the specific test, not a design flaw — the tiers remain structurally distinguishable via `completionTier`).
- **Database Lock Contention, Downstream Dependency Failure, Third-Party API Latency, Thundering Herd (queueing-only), Read Replica Lag (small-batch)**: a partial/degraded state that never crosses either the success or failure bar scores identically to a baseline that fails — because `terminalOverrides.unresolved` and `terminalOverrides.failed` both zero `recovery`/`reliability` the same way, and no other dimension happens to differentiate them at the tested duration. Flagged, not silently smoothed over — genuine current limitation of the terminal-override mechanism, not manipulated for prettier spacing.
- **Autoscaling Failure, Slow Query Regression**: a "partial" action that is itself harmful-classified can score *below* baseline — correctly reflecting that doing nothing beats a plausible-but-counterproductive action, the opposite of a naive `good > partial > baseline > harmful` assumption.

## 21. Total tests

- `packages/simulator`: 38 (6 new this phase: `completion-mode.test.ts` 9, `scoring.test.ts` 4, `review.test.ts` 5, plus extensions).
- `packages/scenarios`: 352 passed, 4 skipped (includes `payment-retry-storm/action-feedback.test.ts`, added after the initial score-table pass, proving real authored feedback resolves correctly against a built-in scenario).
- `packages/db`: 8.
- `packages/scoring`: 23.
- `apps/web`: 238 (includes `action-feedback.test.ts`, added after the initial pass, covering the practice-only/terminal-only leak-boundary gates and the no-hidden-field DTO guarantee).
- **Total: 659 passing, 4 intentionally skipped, 0 failing** — re-verified fresh immediately before this report's final numbers were recorded (not taken from any single subagent's self-report, and re-run again after the post-incident-feedback test additions to confirm the updated totals).

## 22. typecheck/lint/test/build/seed results

All five commands re-run fresh immediately before finalizing this report, independently of any subagent's self-report:

```text
pnpm typecheck      — clean, 0 errors, all 5 packages
pnpm lint           — clean, 0 errors, all 5 packages
pnpm test           — 659 passed, 4 skipped, 0 failed, all 5 packages
pnpm build          — next build succeeded; all /api/attempts/* routes
                        (including the 3 new finish/finish-preview/review
                        routes) present in the route manifest
pnpm db:seed        — "Seed complete (20 built-in scenario(s))."
```

## 23. Manual Flow A — Multi-Step Database Incident

Verified via a combination of live browser interaction and the dedicated precursor-signal regression test (`db-connection-saturation-launch.test.ts`: "a scaled-pool-only candidate sees queuedConnections visibly rising before the batch job fully engages"). Live session confirmed: incident starts, architecture/metrics render live, Connection Pool control panel opens, incident timeline accumulates system events, Finish Incident control is present and functional for this candidate_declared scenario.

## 24. Manual Flow B — Finish Too Early

Fully verified live, twice. First run: incident allowed to run past the 60s failure-sustain window before clicking Finish — correctly resulted in automatic failure (`INCIDENT FAILED`) winning over the pending Finish click (this is actually Flow E's invariant, confirmed as a side effect). Second run: Finish clicked 13 seconds after incident start, well before any sustain window completes — result: **"INCIDENT NOT FULLY STABILIZED — You ended the incident while important reliability conditions were still degraded,"** `Time to Declaration: 00:13`, score 550/1000 with `Recovery: 0/300` and `Reliability: 0/150` correctly zeroed while `Customer Impact`, `Data Integrity`, `Cost Efficiency`, `Operational Efficiency` retained full credit. The confirmation dialog (step 3 in the spec) appeared before any state change — a casual single click does not end the incident. Post-Finish, only "Try Again" / "Back to Incidents" / "View Attempt History" are available — no path back to editing.

## 25. Manual Flow C — Wait and Observe

Verified structurally: `numberOfHarmfulChanges` (`packages/simulator/src/simulate.ts`) only increments inside the action-application code path, gated on a classified `outcome === "harmful"` — there is no code path by which elapsed time alone, with zero candidate actions, can increment it. Confirmed empirically too: every scenario's "baseline"/no-action test case across the full 349-test scenario suite shows `numberOfHarmfulChanges: 0`.

## 26. Manual Flow D — Assessment Privacy

Covered by `assessment-runtime.test.ts`'s "hidden data in runtime payloads" suite: `RuntimeView`'s exact key set is asserted (`architecture`, `controls`, `state`, `events`, `status`, `incidentStartMs`, `completionMode`) — a type-level guarantee that rules/conditions/scoring/sustain-tracking state have no field to occupy, not just a string-absence check. `completionMode` itself was confirmed safe to expose (static metadata, never a live eligibility signal) as part of this phase's assessment-parity work.

## 27. Manual Flow E — Failure Before Done

Verified live: an incident left running past its failure-sustain window auto-completed as `failed` with no candidate action, and the subsequent Finish click attempt correctly could not retroactively change that outcome (confirmed via `finish-attempt.test.ts`'s "terminal failure race" test — a failure that already became authoritative before Finish is never overridden — and corroborated live in the browser session, §24).

## 28. Manual Flow F — Scoring Review

Not run as a separate numbered pass with its own write-up — its substance (good/baseline/harmful/acceptable scores for all 20 scenarios, flagged ties, flagged limitations, no silent score manipulation) is exactly what §19/§20 already deliver, derived from the same real executed test output. Folded in rather than duplicated. This is the one explicit, acknowledged deviation from the spec's literal structure — see §29.

## 29. Deviations

- **Manual Flow F was folded into §19/§20** rather than written up as its own section, since the spec's Flow F ("run good/baseline/harmful for all 20 scenarios, record scores, flag suspicious ties") is substantively identical to the score-table work already required by report items #18–20. Producing a second, separately-formatted pass over the same data would have been redundant, not more thorough.
- **This report was drafted across two passes by two different working sessions** (a long-running background investigation/fix pass, and this primary session's own verification and documentation pass) rather than written in one continuous sitting. Every claim was independently re-checked against the filesystem/test runner before being accepted into this report (see "A note on process" below and the live spot-checks in this session: re-ran `pnpm -r test` end to end, re-ran `assessment-runtime.test.ts` and `consumer-rebalance-storm.test.ts` directly and read the actual source of the Consumer Rebalance Storm tie assertion rather than trusting the number in isolation) — but the report itself is a synthesis, not a single author's unbroken narrative, and is flagged as such for transparency.
- **The database migration (`0007_perfect_fabian_cortez.sql`) was hand-written**, not drizzle-kit's literal auto-generated output — the generated SQL would have attempted a direct enum-type `ALTER COLUMN` that fails against real data carrying the old enum's values. This is a deviation from the normal drizzle-kit workflow, not from the spec, but worth naming since a future migration reviewer should not assume every migration file in this phase was mechanically generated.
- **`ActionClassificationRule`/`AuthoredActionClassification` gained `id`/`feedback` as optional fields**, not required ones. Only Payment Retry Storm's classification rules currently author real `feedback` text; the other 19 scenarios' classification rules have no `id`/`feedback` at all yet (which is valid — missing feedback is an explicitly supported state, not a gap to close before this phase can be called done). A future phase authoring feedback for more scenarios is expected, not a backlog item this phase left incomplete.

## 30. Product/UX concerns

- **Several scenarios have no legitimate partial/acceptable scoring tier at all** (Database Connection Saturation, Poison Message Loop, Authentication Service Degradation, Rate Limit Failure) — by design, per the state audit, not an oversight. Worth the product team's awareness: candidates attempting these four scenarios experience a starker "fully fixed vs. still broken" grading curve than scenarios with a genuine middle tier. This is the correct call per the audit, but it does mean these four scenarios reward decisive full fixes more than partial credit for real-but-incomplete mitigation — worth knowing if candidate feedback later suggests these feel unusually punishing.
- **The terminal-override tie limitation (§20) is a real, currently-unaddressed scoring-fidelity gap**, not specific to Phase 6.1: any unresolved/failed attempt scores recovery and reliability as flat zero regardless of how close it got, so a near-miss and a complete non-attempt can score identically on those two dimensions. This predates this phase and affects automatic-mode scenarios too; Phase 6.1 did not introduce it, but the new candidate_declared scenarios make it slightly more visible (a declared_unstable outcome one second short of the acceptable bar scores identically to never having tried). Worth a future phase considering a graduated "how close did you get" measure instead of a binary terminal override, if finer scoring resolution becomes a priority.
- **Post-incident feedback (§13) is practice-only by explicit binding decision** — a candidate who only ever takes assessments never sees the educational "what happened afterward" explanations, even after their assessment is scored and reviewed by a hiring manager. This was an explicit, deliberate choice (not an oversight) to keep educational content scoped to practice until an assessment-review experience is explicitly designed, but it means the feature's actual reach today is limited to the subset of usage that is practice rather than assessment — worth the product team knowing this is the current boundary, should assessment-side demand for it emerge.
- **The `acceptableCondition` tier exists for exactly 2 of 20 scenarios.** This is a direct, intended consequence of the audit's strict standard (a genuine, bounded, named engineering tradeoff — never a lowered bar for score-spacing), not evidence the feature is underused. Future scenario authors should expect most scenarios to legitimately have zero acceptable tiers, and should resist the temptation to invent one just because the completion model supports it.

---

## A note on process

This phase's remaining-scenario scoring-test work (§18) and the browser-verified manual flows (§23–27) were completed via, respectively, a 25-agent parallel write-and-independently-verify workflow and direct live interaction — per the user's explicit instruction to treat all subagent output as untrusted until independently re-run against the filesystem and test runner. Every number in §19's table, every VERIFIED verdict, and every validation command in §22 was re-executed by the primary session itself, not accepted from a subagent's self-report.
