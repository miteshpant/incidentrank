# Phase 6D.4 Scoring Closeout Addendum

Per docs/implementation_plan/phase-6d4-scoring-closeout.md §9. All evidence below was captured by executing the real paths through the generic simulator/scoring code (temporary `console.log` instrumentation, added and fully removed afterward — `git diff`/grep-confirmed no debug artifact remains in any file except where noted as a permanent regression test).

## 1. #76 investigation

**Root cause: Option A, report-labeling defect — confirmed, with one incidental real defect found and fixed during investigation.**

The "350" figure in the original Phase 6D.4 report came from `backfill-overwhelms-production.test.ts`'s `"alternate strong path (medium concurrency, slower)"` test. That test deliberately scores via `scoringInputsFromState()`, a helper that hardcodes `resolvedAtMs: null` — i.e. an **unresolved, never-Finished mid-simulation snapshot**, used only to prove `fastScore.breakdown.dataIntegrity === mediumScore.breakdown.dataIntegrity`. Neither 350 figure was ever a completion-tier score, and I mislabeled it as "Optimal" in my own report's scoring table by copying the test's informal label without checking that it never calls Finish.

When the medium-concurrency path is actually run through `evaluateCandidateDeclaredFinish` (the real completion path), it is Finish-eligible as **ACCEPTABLE** (not optimal — it is genuinely slower/less complete than the fast path), scoring **800**, well above the 370 baseline and consistent with every other acceptable-tier path in this scenario.

**Incidental real defect found and fixed (smallest correct layer, scenario-local):** while tracing why the "harmful (unmanaged concurrency)" scoring test's own comparator numbers didn't match my report either, I found that at `CONTENTION_ONSET_MS + 60_000` (80,000ms — past `SKIP_EXPOSURE_WINDOW_MS`=65,000ms but before `SUSTAINED_CONTENTION_MS`=200,000ms), the `skip-mark-complete-scarred-live-safe` rule's gate (`sustainedContention: false, skipExposureWindowElapsed: true, skipMarkComplete: false`) was satisfied by **any** untouched-skip-lever scenario reaching that time window — including the harmful-concurrency path, which never touches `SKIP_MARK_COMPLETE_KEY` at all. Because rule matching is first-match-wins and this rule was ordered before the real `high-concurrency-unmanaged-contention` pressure-transfer trap rule, the harmful-concurrency test was silently landing on the wrong incident state (`skip-mark-complete-scarred-live-safe` instead of `high-concurrency-unmanaged-contention`). This did not affect the test's pass/fail status (its only assertion was a `customerImpact` comparison, which happened to still hold), but the state label and underlying mechanic measured were wrong.

**Fix:** added `[BACKFILL_CONCURRENCY_KEY]: "low"` to `skip-mark-complete-scarred-live-safe`'s `controlEquals` gate in `rules.ts` — the real scarred-live-safe scenario never touches `backfillConcurrency` (it stays at its "low" default throughout), so this constraint is a no-op for the rule's own intended case and simply stops it from shadowing the pressure-transfer trap. No authored values were changed; this is a pure rule-matching-specificity fix, fully declarative and scenario-local.

### Exact executed score table (#76)

| Path | Outcome | Completion Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency | Final state |
|---|---|---|---|---|---|---|---|---|---|---|
| Baseline | `declared_unstable` | `null` | 370 | 0 | 200 | 70 | 0 | 100 | 0 | `baseline-sustained-contention` |
| Acceptable (paused) | `resolved` | `acceptable` | 870 | 300 | 160 | 160 | 150 | 100 | 0 | `paused-fully-stable` |
| Fast optimal | `resolved` | `optimal` | 875 | 300 | 110 | 200 | 150 | 80 | 35 | `fully-resumed-complete` |
| **The reported "350" path (medium concurrency), if actually Finished** | `resolved` | **`acceptable`** | **800** | 300 | 110 | 160 | 150 | 80 | 0 | `medium-concurrency-protected` |
| Unmanaged-concurrency harmful (corrected) | `declared_unstable` | `null` | 310 | 0 | 160 | 70 | 0 | 80 | 0 | `high-concurrency-unmanaged-contention` (was incorrectly `skip-mark-complete-scarred-live-safe` before the fix) |
| Skip-mark-complete scarred | `declared_unstable` | `null` | 300 | 0 | 200 | 0 | 0 | 100 | 0 | `skip-mark-complete-scarred-live-safe` |

The medium-concurrency path's own un-Finished snapshot score (350, via `scoringInputsFromState`) remains in the test suite as `FAST-STRONG SCORE`/`MEDIUM-STRONG SCORE` console output — it is correct for its narrow purpose (proving equal dataIntegrity credit between two safe strategies) and was never wrong; only my report's transcription of it as a completion-tier "Optimal" was wrong.

### Changes made

- `packages/scenarios/src/backfill-overwhelms-production/rules.ts`: added `[BACKFILL_CONCURRENCY_KEY]: "low"` to the `skip-mark-complete-scarred-live-safe` rule's `controlEquals` gate, plus an expanded doc comment explaining why.
- `packages/scenarios/src/backfill-overwhelms-production.test.ts`: added one regression assertion (`expect(harmful.transitions.incidentState).toBe("high-concurrency-unmanaged-contention")`) to the existing harmful-path scoring test, and replaced the removed temporary probe with one permanent test (`"medium-strong path, if actually Finished, is Finish-eligible ACCEPTABLE (not optimal)..."`) asserting `eligibility`, `outcome`, `completionTier`, and the exact Finish-based total (800), plus proving it scores strictly higher than its own unfinished snapshot.

### Regression tests added/updated

1. `backfill-overwhelms-production.test.ts` — harmful-path test now asserts the correct `incidentState`, guarding against the rule-ordering regression recurring.
2. `backfill-overwhelms-production.test.ts` — new dedicated test proving the medium-concurrency path is Finish-eligible ACCEPTABLE at exactly 800 points, closing the labeling gap permanently (not just in this report).

## 2. #77 baseline closure

**No code defect — the baseline score was already real, already asserted, and already passing (`expect(baselineScore.total).toBe(380)` at line 597 of the original test file). My original report simply omitted transcribing the executed value.** No changes were needed to scenario code or tests.

### Exact baseline total (#77)

| Field | Value |
|---|---|
| Total | **380** |
| Recovery | 0 |
| Customer Impact | 200 |
| Data Integrity | 30 |
| Reliability | 0 |
| Cost Efficiency | 100 |
| Operational Efficiency | 50 |
| Incident state | `dependency-a-gc-thrashing` |

### Reconfirmed exact totals (#77)

| Path | Outcome | Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency |
|---|---|---|---|---|---|---|---|---|---|
| Primary optimal (field-set fix) | `resolved` | `optimal` | 1000 | 300 | 200 | 200 | 150 | 100 | 50 |
| Alternate optimal (aggregation-concurrency fix) | `resolved` | `optimal` | 1000 | 300 | 200 | 200 | 150 | 100 | 50 |
| Acceptable (partial-response mode) | `resolved` | `acceptable` | 830 | 300 | 200 | 30 | 150 | 100 | 50 |
| Historical-churn-scarred recovery | `resolved` | `optimal` | 765 | 190 | 200 | 110 | 115 | 100 | 50 |

Note: the churn-scarred recovery reaches `completionTier: "optimal"` (the current configuration is genuinely clean) but still scores 765 — strictly below both the clean optimal (1000) and even the acceptable tier (830) — because historical restart-churn damage is never erased by the later fix. This is the scenario's score-sanity-audit proof working correctly, already asserted in the original test (`expect(churnScarredScore.total).toBeLessThan(acceptableScore.total)`).

## 3. #78 harmful-path closure

**No code defect — both the rollback-before-repair unsafe path and the "racing-repair" harmful path already existed as real, dedicated, passing scoring tests. My original report omitted transcribing their executed values.** No changes were needed to scenario code; the test file's temporary instrumentation was added and fully removed.

### Rollback-before-repair exact score (#78)

| Field | Value |
|---|---|
| Total | **415** |
| Recovery | 0 |
| Customer Impact | 160 |
| Data Integrity | 105 |
| Reliability | 0 |
| Cost Efficiency | 100 |
| Operational Efficiency | 50 |
| Outcome (if Finished) | `declared_unstable` |
| Completion Tier (if Finished) | `null` |
| Incident state | `rollback-no-repair-unreadable` |
| `alreadyIncompatibleWriteCount` | 980 (frozen — growth stopped, but not repaired) |
| `unreadableReadCount` | 540 (the real, measurable correctness gap) |

This genuinely scores better than true zero-action inaction (285) — a deliberate, already-documented design choice (rollback-without-repair IS safer than doing nothing, since it stops the backlog from growing further) — but still falls far short of optimal (1000) or acceptable (885), proving the premature-declare trap is about falling short of OPTIMAL, not about being worse than inaction.

### Other harmful path found (#78): "racing-repair"

| Field | Value |
|---|---|
| Total | **355** |
| Recovery | 0 |
| Customer Impact | 200 |
| Data Integrity | 25 |
| Reliability | 0 |
| Cost Efficiency | 80 |
| Operational Efficiency | 50 |
| Incident state | `racing-repair` |
| Comparator (baseline at same elapsed time) | 375 |

Engaging migration repair while the regression is still actively writing reconciles zero net records (`repairedRecordCount: 0`) and wastes real infrastructure cost, scoring strictly below the baseline comparator at the identical elapsed time.

## 4. #80 flagship scoring table

**No code defect — all 8 required paths already existed as real, dedicated tests with real passing assertions (optimal, acceptable, baseline, harmful, re-cascaded, alternate-strong-path, wrong-root, worker-scaling-pressure-transfer, and historical-damage-cannot-restore). My original report's "optimal >700 / acceptable lower / baseline 380 / harmful —" language was vague summarization of real, already-correct evidence, not a defect in the scenario itself.** No changes were needed to scenario code; the test file's temporary instrumentation was added and fully removed.

### Exact totals for all required paths (#80)

| # | Path | Outcome | Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency | Final state |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Zero-action full-cascade baseline | — (unresolved snapshot) | — | **380** | 0 | 200 | 30 | 0 | 100 | 50 | `full-cascade` |
| 2 | Primary optimal (full isolation + root-first restoration) | `resolved` | `optimal` | **870** | 300 | 200 | 200 | 40 | 80 | 50 | `optimal-recovered` |
| 3 | Alternate optimal (bounded retry + deprioritization) | `resolved` | `optimal` | **870** | 300 | 200 | 200 | 40 | 80 | 50 | `optimal-recovered` |
| 4 | Acceptable (drained but deliberately isolated) | `resolved` | `acceptable` | **840** | 300 | 200 | 170 | 40 | 80 | 50 | `acceptable-drained-isolated` |
| 5 | Wrong-root / loudest-product mitigation | — (unresolved snapshot) | — | **360** | 0 | 200 | 30 | 0 | 80 | 50 | `wrong-root-trap` |
| 6 | Premature all-at-once restoration | — (unresolved snapshot) | — | **328** | 0 | 200 | 10 | 0 | 80 | 38 | `re-cascaded` |
| 7 | Worker-scaling-before-DB-protection trap | — (unresolved snapshot) | — | **348** | 0 | 200 | 30 | 0 | 80 | 38 | `worker-scaling-pressure-transfer` |
| 8 | Harmful — identity fail-open (correctness/security-violating) | — (unresolved snapshot) | — | **338** | 0 | 200 | 0 | 0 | 100 | 38 | `identity-fail-open-violation` |

Paths 1 and 5–8 are measured via the scenario's own `scoringInputsFromState` (unresolved-snapshot) pattern, consistent with every other non-safe path in this file — none of these states are Finish-eligible (confirmed separately via `evaluateCompletionEligibility` returning `{eligible: false}` for the wrong-root and premature-restoration states in the existing test suite).

### #80 sanity assertions — all explicitly proven

- **optimal (870) > acceptable (840) > baseline (380)** — confirmed numerically above.
- **Wrong-root path (360) does not accidentally score near optimal** — confirmed: 360 is barely above baseline (380 is actually slightly higher at 5 seconds vs. the wrong-root trap's 1-second mark, both deep in UNSAFE territory, nowhere near optimal's 870).
- **Premature restoration is materially penalized** — confirmed: 328, below even the zero-action baseline (380), and Data Integrity crushed to 10/200.
- **High availability with shared-platform correctness/reliability damage does not score as safe** — confirmed directly by path 8 (identity fail-open): Customer Impact maxed relative to its band (200/200) while Data Integrity is floored at 0/200, total 338 — far below baseline (380) and nowhere near any safe tier.
- **Historical damage cannot be erased merely by fixing current configuration** — already proven by the existing, unmodified test `"historical damage: fixing the DB budget after exhaustion already occurred cannot improperly restore a near-perfect score at that same instant"`, which asserts `recovery`/`reliability` stay at their unresolved terminal override (0) even though peak connection-exhaustion damage is real and nonzero and current health has already recovered.

All assertions pass; no fix was required for #80.

## 5. Documentation correction

Confirmed: `docs/implementation_plan/outputs/phase6d.4-completion-report.md` §44 ("Top 3 scenarios needing future polish," item 3) previously read "#69 Search Platform Cascade (Phase 6D.1)" — corrected to "(Phase 6D.2)", matching the actual batch #69 was authored and fixed in. Searched all other output docs (`phase6d.1-completion-report.md` through `phase6d.3-completion-report.md`) for the same mislabel; no other instance was found — #69 is correctly attributed to 6D.2 everywhere else it is mentioned.

Also corrected the 6D.4 report's own #76 scoring-table row (§23 in that report) to remove the "350 (medium-strong, slower)" entry from the Optimal column and replace it with the corrected Acceptable-tier figure (800) and corrected harmful-path figure (310), each annotated pointing to this addendum.

## 6. Files changed

**Logic/scoring code changed:**
- `packages/scenarios/src/backfill-overwhelms-production/rules.ts` — one rule-gate fix (added a control constraint to `skip-mark-complete-scarred-live-safe`), fixing a rule-ordering/shadowing defect. No authored numeric values changed.

**Test code changed (regression coverage added, not just report evidence):**
- `packages/scenarios/src/backfill-overwhelms-production.test.ts` — one new assertion added to the existing harmful-path test; one new permanent test added proving the medium-concurrency path's real Finish-based tier and score.

**Report-only (no code or test changes, temporary instrumentation added and fully removed):**
- `packages/scenarios/src/multi-service-memory-pressure-incident.test.ts` — instrumented and reverted; confirmed clean via `grep -c PROBE` = 0.
- `packages/scenarios/src/global-feature-rollout-incident.test.ts` — instrumented and reverted; confirmed clean via `grep -c PROBE` = 0.
- `packages/scenarios/src/cascading-failure-across-shared-platform.test.ts` — instrumented and reverted; confirmed clean via `grep -c PROBE` = 0.

**Documentation changed:**
- `docs/implementation_plan/outputs/phase6d.4-completion-report.md` — corrected the #76 scoring-table row and the #69 batch-label error.
- `docs/implementation_plan/outputs/phase6d.4-scoring-closeout-addendum.md` — this document (new).

## 7. Validation

Per closeout §8, since production/scenario code changed (the #76 rules.ts fix), the full validation suite was run, not just the 4 scenario test files:

- `pnpm --filter @incidentrank/scenarios test` → **2293 passed, 4 skipped, 0 failed** (88 test files, 1 skipped file) — up from 2292 by exactly the 1 new permanent regression test added to #76.
- `pnpm typecheck` → **PASS** across all 5 workspace packages.
- `pnpm lint` → **PASS** across all 5 workspace packages, 0 errors/warnings.
- `pnpm test` (monorepo-wide) → **PASS on clean re-run**: simulator 38, scenarios 2293 (+4 skipped), db 8, scoring 23, apps/web 254 = **2616 total passing, 0 failed**. One transient run exhibited the same pre-existing hook-timeout flakiness in `attempts/route.test.ts`/`score-preview/route.test.ts` already flagged in the original 6D.4 report (now observed a third time across 6D.3/6D.4/this closeout) — both confirmed passing cleanly in isolation (10/10) and on the clean re-run; not a regression from this closeout's changes.
- `pnpm build` → **PASS**. Next.js production build compiled successfully.
- `pnpm --filter @incidentrank/db db:seed` → **`Seed complete (80 built-in scenario(s)).`** — unchanged, as expected (no scenario was added, removed, or re-wired).

## 8. Final recommendation

**PHASE 6D.4 READY FOR APPROVAL**

Summary: the #76 "350 optimal" figure was a genuine report-labeling defect (Option A) — the real path is Finish-eligible ACCEPTABLE at 800 points, not optimal. Investigating it surfaced one small, real, now-fixed rule-ordering defect (a dead-time-window shadowing bug) that mislabeled — but never mis-scored-as-passing — the harmful-concurrency path's incident state; this is now fixed with a scenario-local, declarative, one-line constraint plus a permanent regression test. #77's baseline, #78's harmful path, and #80's full flagship scoring table were all already real, already correctly implemented, and already covered by passing tests — the original report simply failed to transcribe their executed values, which is now corrected here with exact, instrumentation-verified evidence. All required sanity assertions for #80 (the hardest scenario in the catalog) pass. All tests are green, typecheck/lint/build/seed all pass, and the #69 batch-label documentation error is corrected.
