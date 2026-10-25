# IncidentRank — 100 Scenario Release Closeout

## Scope

This is the final release-closeout gate for the 100-scenario content milestone.

Do not author scenario 101+.

Do not redesign scenarios 96–100 unless this closeout proves a real defect.

Phase 6E.4 is conditionally approved, but the 100-scenario milestone is not formally closed until these final evidence/infrastructure gaps are resolved.

Required closeout areas:

```text
1. complete missing scoring evidence for #96–#100
2. complete the live QA items that were skipped
3. resolve the recurring apps/web Vitest hook-timeout/concurrency issue
4. correct retrospective defect accounting
5. run one full clean validation pass
6. confirm seed remains exactly 100
```

After this closeout:

```text
stop scenario authoring
move to user stories / company-assessment / full-product QA
```

---

# 1. Complete Exact Scoring Evidence

The Phase 6E.4 completion report currently claims:

```text
exact score evidence complete
no placeholders
```

but §27 still contains `—` placeholders and incomplete six-dimension breakdowns.

That contradiction must be corrected.

For each of scenarios #96–#100, execute the required paths through the real generic runtime/scoring code and return exact numbers.

No placeholders.

Do not use:

```text
—
below baseline
>700
see test file
not Finished
```

If a path is not Finish-eligible, report its unresolved-snapshot score exactly.

---

# 2. Required #96 Scoring Closure

Scenario:

```text
Privacy Deletion Backlog
```

Execute and report exact totals for at least:

```text
1. primary strong path
2. alternate strong path
3. acceptable path if distinct
4. zero-action baseline
5. false-complete harmful path
6. incomplete-downstream-deletion harmful path
7. deadline-breach / bad-priority path if distinct
```

For every path:

```text
outcome
completionTier
total

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency

final authored state
```

Specifically fill the currently-missing baseline/harmful values.

---

# 3. Required #97 Scoring Closure

Scenario:

```text
Audit Log Integrity Failure
```

Execute and report exact totals for:

```text
1. stage-until-reconciled strong path
2. publish-with-unverified-flag + acknowledged-and-flagged alternate strong path
3. acceptable degraded path if distinct
4. zero-action / publish-as-is baseline
5. clean-report-by-dropping-unverifiable-evidence harmful path
6. any immutable-history rewrite/fabrication harmful path if authored
```

For every path include the full six-dimension breakdown.

Specifically close the currently-missing zero-action exact total.

If Path A/Path B truly tie at 795/795, prove the tie with exact breakdowns.

---

# 4. Required #98 Scoring Closure

Scenario:

```text
Certificate Expiry Across Large Fleet
```

Execute and report exact totals for:

```text
1. modern-first optimal
2. critical-first optimal
3. acceptable state if distinct
4. zero-action deadline-risk baseline
5. premature old-cert revocation trap
6. broad validation-bypass trap
7. deadline-miss path
```

For each report:

```text
outcome
completionTier
total
six dimensions
final state
```

The current report leaves premature revocation incomplete.

Close it.

Also explicitly state whether the two 975/975 optimal paths are byte-identical across all six dimensions or merely total-score ties.

---

# 5. Required #99 Scoring Closure

Scenario:

```text
Emergency Capacity Reservation Decision
```

Execute and report exact totals for:

```text
1. HIGH reservation path
2. MID + fallback + shedding balanced path
3. acceptable path if distinct
4. zero-action / under-reserve path
5. regional-concentration harmful path
6. maximal-reservation wasteful path
7. reservation-deadline-miss path
```

For each report:

```text
reservation cost
protected headroom
wasted capacity
outcome
completionTier
total
six dimensions
final state
```

This is the cost-primary flagship of the batch.

The scoring evidence must make:

```text
cheapest != safest
safest != most economically efficient
```

numerically explicit.

---

# 6. Required #100 Scoring Closure

Scenario:

```text
Enterprise-Wide Dependency Deprecation
```

This is the most important scoring closure.

The current report gives only partial breakdowns for Strategy A/B.

Execute and report exact values for:

```text
1. Strategy A — compatibility-layer-first
2. Strategy B — product-by-product direct migration
3. acceptable path if distinct
4. T-30d zero-action baseline
5. migrate-all-without-verification trap
6. forced cutover with unresolved incompatibility
7. indefinite dual-support debt path
8. deadline-miss path
9. mark-migrated-without-verification path if distinct
```

For every path report:

```text
outcome
completionTier
total

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency

final authored state
```

No partial rows.

For Strategy A and Strategy B, explicitly prove the Option D difference if it remains:

```text
which dimensions differ
why both are OPTIMAL
why Strategy B scores lower
what real cost/debt caused the difference
```

---

# 7. Live QA Completion Requirement

The Phase 6E.4 report disclosed that several required live-QA items were not independently re-run.

Because this is the 100-scenario milestone, complete those missing live checks now.

Do not substitute automated-test coverage for these specific live items.

---

# 8. Live QA #98 — Complete Missing Check

Run live:

```text
deadline miss
```

Verify:

```text
candidate-visible deadline phase
fleet state
rejected/bypassed connection history
Finish outcome
score
timeline causality
```

Capture exact observed values.

---

# 9. Live QA #99 — Complete Missing Checks

Run live:

```text
1. HIGH reservation expensive-but-safe path
2. regional concentration risk path
```

For HIGH path report:

```text
reservation cost
protected headroom
wasted capacity
final score
tier
```

For concentration-risk path report:

```text
region allocation
concentration status
critical workload protection
final score
tier/outcome
```

---

# 10. Live QA #100 — Complete Missing Flagship Checks

Run the live browser for all previously skipped flagship items:

```text
4. compatibility-layer-first strong path
5. product-by-product direct migration strong path
6. dual-support debt trap
8. near-deadline state
10. full successful migration before deadline
```

Do not skip these again.

For each capture:

```text
key controls/actions
deadline phase
product migration statuses
verification state
deprecated-API traffic %
compatibility/dual-support state
historical damage/debt
Finish outcome
completion tier
score
```

Also reconfirm:

```text
all 4 products "migrated"
without verification
still fails
```

The live strong paths and the live trap should demonstrate the contrast directly.

---

# 11. Vitest Hook-Timeout / Concurrency Fix

The default `pnpm test` gate is not currently green.

Two apps/web test files intermittently fail in `beforeAll`:

```text
apps/web/src/app/api/attempts/route.test.ts
apps/web/src/app/api/attempts/score-preview/route.test.ts
```

Observed pattern:

```text
beforeAll async dynamic import
→ imports route
→ route imports BUILT_IN_SCENARIO_CATALOG
→ catalog now evaluates 100 scenario modules
→ default multi-fork contention
→ 10-second hook timeout occasionally exceeded
```

Single-fork execution passes:

```text
33/33 test files
254/254 tests
```

This is now recurring test-infrastructure debt and should be fixed before formally closing the 100-scenario milestone.

---

# 12. Preferred Test-Infrastructure Fix Order

Investigate and apply the smallest legitimate fix.

Preferred order:

### Option A — isolate heavy module setup
Refactor the affected tests so their `beforeAll` does not repeatedly pay full catalog/module-evaluation cost under concurrent workers.

Examples may include:

```text
static import if semantically safe
shared test setup
narrow module mock
preloaded route dependency
```

Do not change runtime production behavior.

### Option B — targeted hook timeout
If the dynamic import genuinely and unavoidably takes longer under concurrency, set a targeted timeout for only these tests/hooks.

Do not globally hide slow tests with a huge timeout.

### Option C — test-pool configuration
If concurrent process contention is the demonstrated root cause and single-fork is the stable intended configuration for apps/web, make that configuration explicit for the relevant test scope.

Do not change the whole monorepo blindly.

---

# 13. Vitest Fix Acceptance Criteria

Whichever fix is chosen must demonstrate:

```text
default project test command passes
not merely an alternate single-fork command
```

Required evidence:

```text
run the two affected files repeatedly
run full apps/web test suite at least twice
run full pnpm test
```

Recommended bounded stress verification:

```text
10 repeated executions of the two affected files
```

or equivalent evidence showing the timeout no longer reproduces.

Do not mark fixed because it passed once.

---

# 14. Test-Infrastructure Guardrails

Do not:

```text
mock away scenario behavior needed by route tests
skip the failing tests
disable concurrency globally without evidence
raise global timeout indiscriminately
remove assertions
```

The fix must preserve test meaning.

If a test-only dependency boundary is introduced, document why.

---

# 15. Correct Retrospective Defect Accounting

The Phase 6E retrospective currently mixes:

```text
dead controls
default-value path defects
```

into one "Dead controls found before fix" total.

These are different defect classes.

Correct the retrospective to report them separately.

Required format:

```text
Dead controls found before fix:
Dead controls remaining after fix:

Default-value path defects reaching verification:
Default-value path defects self-caught by authors:
Default-value path defects remaining after fix:

Verifier rejections:
Fix-agent dispatches:
```

Do not combine unrelated categories into one count.

Also ensure any totals are internally arithmetically consistent with the batch reports.

---

# 16. Permanent Authoring-Process Recommendation

The recurring default-value path problem is now proven across multiple scenarios.

Add a standing recommendation to the final Phase 6E retrospective:

```text
Default-Value Path Completeness
```

must become a permanent scenario-authoring checklist item.

Minimum author-side audit:

```text
For every meaningful candidate control combination:
- test before sustained trigger
- test during sustained state
- test after deadline/recovery trigger where relevant
- confirm no fallthrough to healthy/default/unrelated state
```

This is process documentation only.

Do not build a new engine feature unless separately justified.

---

# 17. Final Full Validation

After all scoring/reporting/test-infrastructure/live-QA work is complete, run:

```text
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Required:

```text
0 failures
```

The default `pnpm test` command must now be green without needing a manual single-fork override.

Expected seed:

```text
Seed complete (100 built-in scenario(s)).
```

---

# 18. Catalog / Access Audit

Reconfirm after all changes:

```text
100 built-in scenarios
3 free
97 paid
```

No closeout work should add/remove scenarios.

No billing/access behavior changes are part of this closeout.

---

# 19. Required Release Closeout Report

Return:

```text
100 Scenario Release Closeout Report
```

with exactly these sections:

## 1. Scoring evidence closure
- complete #96 table
- complete #97 table
- complete #98 table
- complete #99 table
- complete #100 table
- no placeholders

## 2. Tier/score divergence audit
- every OPTIMAL-below-ACCEPTABLE case, if any
- exact dimension explanation
- regression coverage

## 3. Live QA completion
- #98 deadline miss
- #99 HIGH reservation
- #99 regional concentration
- #100 Strategy A
- #100 Strategy B
- #100 dual-support debt
- #100 near-deadline state
- #100 full successful migration
- #100 naive migrate-all trap reconfirmation

## 4. Vitest timeout root cause
- exact cause
- exact chosen fix
- files changed
- why test meaning is preserved

## 5. Vitest stability evidence
- repeated affected-file runs
- repeated apps/web suite runs
- default full `pnpm test`

## 6. Retrospective accounting correction
- dead controls
- default-value path defects
- verifier rejections
- fix-agent dispatches
- corrected totals

## 7. Permanent authoring checklist update
- Default-Value Path Completeness

## 8. Files changed
- scenario/test/report/test-infra files
- confirm no unrelated production behavior changes

## 9. Final validation
- scenarios tests
- monorepo tests
- typecheck
- lint
- build
- seed

## 10. Final catalog state
- 100 total
- 3 free
- 97 paid

## 11. Final recommendation

Exactly one:

```text
100 SCENARIO MILESTONE READY FOR APPROVAL
```

or:

```text
100 SCENARIO MILESTONE STILL BLOCKED
```

with exact blocker.

---

# 20. Final Stop Condition

The 100-scenario milestone is complete only when:

```text
all #96–#100 scoring tables are exact and complete

all skipped mandatory live-QA checks are run

default pnpm test is green

Vitest timeout issue is fixed or otherwise legitimately resolved in the default test path

retrospective defect accounting is corrected

Default-Value Path Completeness is recorded as a permanent checklist item

typecheck/lint/build/test all pass

seed reports exactly 100

catalog remains 3 free / 97 paid
```

Then stop.

Do not author scenario 101+.

The next phase after approval is:

```text
product-wide user stories
candidate workflows
company assessment workflows
authorization/privacy boundaries
invitation/email flows
attempt/replay/resume behavior
entitlement/access behavior
full end-to-end QA across all major product paths
```

That next phase should treat the 100-scenario catalog as content-complete and focus on product quality.
