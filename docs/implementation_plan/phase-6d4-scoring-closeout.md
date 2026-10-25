# IncidentRank — Phase 6D.4 Scoring Closeout

## Scope

This is a narrow scoring/reporting closeout only for Phase 6D.4.

Do not redesign scenarios 76–80 unless the scoring investigation proves a real logic defect.

Do not begin Phase 6E / scenarios 81–100.

Phase 6D.4 is functionally strong, but formal approval is blocked by incomplete or suspicious scoring evidence in the completion report.

The required closeout concerns:

```text
#76 Backfill Overwhelms Production
#77 Multi-Service Memory Pressure Incident
#78 Global Feature Rollout Incident
#80 Cascading Failure Across Shared Platform
```

Scenario #79 does not need reopening unless a regression is exposed by shared scoring changes.

## 1. Investigate #76 Suspicious “Optimal = 350” Path

The Phase 6D.4 report currently lists:

```text
#76 Backfill Overwhelms Production

Optimal:
875 (fast)
350 (medium-strong, slower)

Acceptable:
870

Baseline:
370

Harmful:
280 unmanaged concurrency
300 skip-mark-complete scarred
```

This is suspicious because an allegedly OPTIMAL path scores 350, below the no-action baseline of 370.

Do not explain this away without executing the real path.

Determine exactly which of these is true:

### A. Report-labeling defect
The 350 path is not actually an OPTIMAL completion state and was mislabeled in the report.

### B. Scoring defect
The path truly reaches `completionTier="optimal"` but the declarative scoring assigns a below-baseline score incorrectly.

### C. Authored-state defect
The scenario's `successCondition` is admitting a state that should not actually qualify as optimal.

### D. Legitimate exceptional tradeoff
The state is genuinely optimal under completion semantics despite a lower score than baseline.

Option D requires an unusually strong semantic justification and must explain:

```text
why the no-action baseline is operationally worse
despite receiving more points

why the completed state is still correctly called OPTIMAL

which scoring dimension intentionally dominates the discrepancy
```

Do not accept D merely because "time/cost was worse."

### Required evidence for #76

Execute and report:

```text
baseline
acceptable
fast optimal
the reported 350 path
unmanaged-concurrency harmful
skip-mark-complete scarred
```

For each return:

```text
outcome
completionTier
total score

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency

final state name / matched rule state
```

If the 350 path is mislabeled:
- correct the completion report
- add/adjust test coverage so the label cannot drift again

If it is a real scoring or success-condition defect:
- fix the smallest correct layer
- add regression tests
- do not rebalance unrelated scenario scoring

## 2. Close #77 Missing Baseline Score

The report currently omits the actual baseline score for:

```text
#77 Multi-Service Memory Pressure Incident
```

Execute the real zero-action baseline through the generic scorer.

Report:

```text
outcome
completionTier
total score

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency
```

Also reconfirm exact totals for:

```text
primary optimal — field-set fix
alternate optimal — aggregation-concurrency fix
acceptable — partial-response mode
historical-churn-scarred recovery
```

The closeout must contain an exact numeric baseline.

No:

```text
—
N/A
see test file
```

unless there truly is no executable baseline, which would itself require explanation.

## 3. Close #78 Missing Harmful Score

The report currently gives no exact harmful score for:

```text
#78 Global Feature Rollout Incident
```

The scenario explicitly contains an unsafe path:

```text
rollback before repair
```

That path must be executed and reported.

At minimum capture:

```text
baseline
acceptable dual-write-contained
optimal rollback+shim
optimal halt+repair
rollback-before-repair unsafe path
```

For rollback-before-repair report:

```text
outcome
completionTier
total score

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency

historical incompatible-write count
unreadable/read-correctness violation field(s)
```

If another clearly harmful path exists, report it too.

An unsafe path returning `declared_unstable` still has a score and must be included.

## 4. Produce Exact #80 Flagship Scoring Evidence

The Phase 6D.4 report is too vague for the hardest scenario in the catalog.

Current report language includes:

```text
optimal >700
acceptable lower than optimal
baseline 380
harmful —
```

Replace this with exact executed evidence.

For:

```text
#80 Cascading Failure Across Shared Platform
```

execute and report exact totals for:

1. zero-action full-cascade baseline
2. primary optimal — full isolation + root-first restoration
3. alternate optimal — bounded retry + deprioritization
4. acceptable — drained but deliberately isolated
5. wrong-root / loudest-product mitigation
6. premature all-at-once restoration
7. worker-scaling-before-DB-protection trap, if distinct from #5/#6
8. any explicit correctness/security-violating path if present

For each path return:

```text
outcome
completionTier
total score

Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency

final state / matched authored rule state
```

### Mandatory #80 breakdowns

The closeout must include full six-dimension breakdowns for at least:

```text
baseline
acceptable
primary optimal
alternate optimal
wrong-root harmful
premature-restoration harmful
```

### #80 sanity assertions

Explicitly prove:

```text
optimal > acceptable > baseline

wrong-root path does not accidentally score near optimal

premature restoration is materially penalized

high availability with shared-platform correctness/reliability damage
does not score as safe

historical damage cannot be erased merely by fixing current configuration
```

If any assertion fails, investigate and fix before approval.

## 5. Correct Retrospective Documentation Error

The Phase 6D retrospective currently refers to:

```text
#69 Search Platform Cascade (Phase 6D.1)
```

Correct it to:

```text
#69 Search Platform Cascade (Phase 6D.2)
```

This is report-only unless the incorrect label exists elsewhere.

## 6. Scoring Evidence Standard

For this closeout, do not rely on:

```text
relative ordering only
writer self-report
comments
static inspection alone
```

Execute the paths through the real generic scoring/runtime code.

Temporary instrumentation is allowed only if it is removed afterward and `git diff` confirms no debug artifact remains.

Prefer permanent assertions where the evidence reveals a gap in regression coverage.

## 7. Do Not Broadly Rebalance Scoring

This closeout is not permission to tune numbers until they "look nice."

Only change scoring when one of these is demonstrated:

```text
completion tier contradicts actual safety

harmful path scores implausibly high

optimal path scores below baseline due to incorrect authored measure/band

historical damage is not penalized as intended

an important invariant is missing from generic declarative scoring config
```

Any scoring change must be:

```text
scenario-local
declarative
generic-scorer-compatible
covered by regression tests
```

No scenario-specific scoring code.

## 8. Validation Requirements

If the work is report-only:

Run at least the relevant scenario tests:

```text
#76 test file
#77 test file
#78 test file
#80 test file
```

and state explicitly that no code/scoring logic changed.

If any production/scenario/scoring code changes are made, run:

```text
pnpm --filter @incidentrank/scenarios test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Required:

```text
0 failing tests
```

Expected seed remains:

```text
Seed complete (80 built-in scenario(s)).
```

## 9. Required Closeout Addendum Format

Return a concise:

```text
Phase 6D.4 Scoring Closeout Addendum
```

with exactly these sections:

### 1. #76 investigation
- root cause of the 350 "optimal" report
- whether report, scoring, or success condition was wrong
- exact executed score table
- changes made
- regression tests added/updated

### 2. #77 baseline closure
- exact baseline total
- six-dimension breakdown
- reconfirmed optimal / alternate / acceptable / scarred totals

### 3. #78 harmful-path closure
- rollback-before-repair exact score
- six-dimension breakdown
- outcome/completion tier
- historical/correctness fields
- any other harmful score

### 4. #80 flagship scoring table
- exact totals for all required paths
- six-dimension breakdowns
- final state names
- sanity assertions

### 5. Documentation correction
- confirm #69 corrected from 6D.1 → 6D.2

### 6. Files changed
- report-only vs logic/scoring/test changes

### 7. Validation
- scenario tests
- full tests if code changed
- typecheck/lint/build/seed if required

### 8. Final recommendation

One of:

```text
PHASE 6D.4 READY FOR APPROVAL
```

or:

```text
PHASE 6D.4 STILL BLOCKED
```

with exact blocker.

## 10. Stop Condition

Do not begin Phase 6E.

This closeout is complete only when:

```text
#76 suspicious 350 path is fully explained or fixed

#77 exact baseline score is recorded

#78 exact unsafe rollback-before-repair score is recorded

#80 exact flagship scoring evidence is recorded

#69 retrospective batch label is corrected

all required tests are green
```

Stop and return the addendum for review.
