# IncidentRank — Phase 6E.3 Scoring Closeout

## Scope

This is a narrow scoring/tier closeout for **Phase 6E.3**.

Do not redesign scenarios 91–95 unless the investigation proves a real defect.

Do not begin Phase 6E.4.

Phase 6E.3 is functionally strong and conditionally approved, but formal approval is blocked by four tier/score divergences and one reporting error in the completion report.

Investigate exactly these scenarios:

```text
#91 Training Pipeline Produces Corrupted Model Artifact
#93 Data Lineage Break During ETL Migration
#94 ML Inference Cost vs Quality Incident
#95 Data Retention Policy Misconfiguration
```

#92 does not need reopening unless a shared scoring change causes a regression.

---

# 1. Known Tier/Score Divergences

The completion report currently contains these exact values:

```text
#91
Optimal Path B: 805
Acceptable:     825

#93
Optimal Path B: 945
Acceptable:     955

#94
Optimal Path A: 750
Acceptable:     930

#95
Optimal Path B: 945
Acceptable:     950
```

The report later claims:

```text
OPTIMAL > ACCEPTABLE
```

for these scenarios, which is mathematically false for the lower-scoring optimal paths.

This closeout must determine whether each divergence is:

### A. Tier defect
The lower-scoring "optimal" path should actually be `acceptable`.

### B. Scoring defect
The path is correctly `optimal`, but scoring under-rewards it.

### C. Acceptable-state scoring defect
The acceptable path is over-scored.

### D. Intentional tier/score divergence
The optimal path is genuinely a fully safe/correct end-state but scores lower because of real elapsed-time, customer-impact, cost, or operational penalties.

Option D is allowed only with exact six-dimension evidence.

Do not accept:

```text
"they are different strategies"
```

as sufficient explanation.

---

# 2. Required #91 Investigation

Scenario:

```text
Training Pipeline Produces Corrupted Model Artifact
```

Compare exactly:

```text
Optimal Path A:
rollback-last-known-good-full = 895

Optimal Path B:
hold-for-retrain fully validated = 805

Acceptable:
rollback-last-known-good-weak-gate = 825
```

For all three execute and report:

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

final authored state
```

Then answer:

```text
Why is hold-for-retrain fully validated OPTIMAL
while scoring 20 points below the ACCEPTABLE weak-gate rollback?
```

Explicitly identify:

```text
which dimensions create the difference
what real system tradeoff they represent
why hold-for-retrain is still fully correct/safe
why weak-gate remains only acceptable
```

Also report:

```text
baseline
lineage-destruction harmful
keep-serving harmful
```

with exact totals so the full ordering remains visible.

If the tier/score divergence is intentional, add or confirm permanent regression coverage proving the intended relationship.

---

# 3. Required #93 Investigation

Scenario:

```text
Data Lineage Break During ETL Migration
```

Compare exactly:

```text
Optimal Path A:
staged-per-source = 985

Optimal Path B:
dual-write-reconcile = 945

Acceptable:
staged-window1 = 955
```

This creates:

```text
Optimal Path B 945
<
Acceptable 955
```

Execute and report exact six-dimension breakdowns for:

```text
staged-per-source optimal
dual-write-reconcile optimal
staged-window1 acceptable
baseline
global-flip harmful
```

Then answer:

```text
Why does a fully completed dual-write reconciliation qualify as OPTIMAL
while a still-in-progress staged window scores 10 points higher?
```

Pay special attention to:

```text
Cost Efficiency
Data Integrity
Recovery
Operational Efficiency
```

because #93 already uses explicit ongoing dual-compute cost and auditability scoring.

If the divergence is intentional, prove:

```text
dual-write-reconcile reaches a strictly stronger end-state
while paying a legitimate economic/operational price
```

If that cannot be defended, fix the smallest correct layer.

---

# 4. Required #94 Investigation — Highest Priority

Scenario:

```text
ML Inference Cost vs Quality Incident
```

This is the most suspicious divergence.

Current values:

```text
Optimal quality-tiering = 950

Optimal classifier-fix = 750

Acceptable blanket-large-model = 930
```

So:

```text
classifier-fix optimal
is 180 points below
acceptable blanket-large-model
```

This requires the same rigor as the previous #84 closeout.

Execute and report exact six-dimension breakdowns for:

```text
quality-tiering optimal
classifier-fix optimal
blanket-large-model acceptable
baseline
blanket-small-model harmful
any other major unsafe path
```

Then answer directly:

> Why does the classifier-fix path qualify as OPTIMAL while scoring 180 points below the ACCEPTABLE blanket-large-model path?

The explanation must identify:

```text
which dimensions create the 180-point gap

what real candidate/system tradeoff causes the gap

why classifier-fix is still fully correct/safe

why blanket-large-model is only acceptable

why the score difference is intentional rather than a scoring bug
```

If the explanation depends on:

```text
rollout time
quality exposure
customer/business impact
reliability
cost
```

quantify each dimension.

Also verify that:

```text
blanket-large-model
does not accidentally receive near-perfect scoring
while leaving a material unresolved quality/cost problem
```

If #94's acceptable path is economically expensive but operationally safe, ensure the scoring/tier semantics clearly encode:

```text
safe workaround
vs
durable root-cause repair
```

---

# 5. Required #95 Investigation

Scenario:

```text
Data Retention Policy Misconfiguration
```

Compare:

```text
Optimal Path A:
direct correction = 970

Optimal Path B:
audited+validated = 945

Acceptable:
draining-window1-direct = 950
```

So:

```text
audited+validated optimal 945
<
acceptable 950
```

Execute and report exact six-dimension breakdowns for:

```text
direct optimal
audited+validated optimal
draining-window1 acceptable
baseline
panic-pause-all harmful
legal-hold-breach harmful if distinct
```

Then answer:

```text
Why does the audited+validated fully recovered state score below
the still-draining acceptable state?
```

Pay special attention to:

```text
Cost Efficiency
Recovery
Data Integrity
Reliability
```

because the authored distinction appears to be ongoing validation/audit cost.

If intentional, prove:

```text
the end-state is fully compliant/correct
but more expensive operationally
```

If not, fix the tier or scoring.

---

# 6. Exact Evidence Table Requirement

For each of #91/#93/#94/#95, provide a table:

| Path | Outcome | Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency | Final State |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|

No placeholders.

Do not use:

```text
—
>700
below baseline
see test file
```

---

# 7. Tier-vs-Score Doctrine

Use this interpretation consistently:

```text
completion tier
=
quality/safety/correctness of the handback state

score
=
how well the candidate reached that state across
speed, impact, integrity, reliability, cost, and operational efficiency
```

Therefore:

```text
OPTIMAL may score below ACCEPTABLE
```

only when the optimal state is truly stronger in end-state correctness/safety but incurred legitimate penalties reaching it.

Do not allow this doctrine to become an excuse for arbitrary scoring.

Every divergence must have:

```text
a specific dimension-level explanation
a real authored tradeoff
permanent regression coverage
```

---

# 8. Reporting Error Correction

The Phase 6E.3 completion report currently states false inequalities such as:

```text
OPTIMAL (895/805) > ACCEPTABLE (825)
OPTIMAL (985/945) > ACCEPTABLE (955)
OPTIMAL (970/945) > ACCEPTABLE (950)
```

Correct §26 so it no longer claims mathematically false total ordering.

If divergences remain intentional, use wording like:

```text
Primary optimal path scores above acceptable.
Alternate optimal path scores below acceptable for an explicitly-audited reason:
<dimension-level explanation>.
```

For #94, state the 180-point divergence explicitly.

Do not hide it.

---

# 9. Regression-Test Requirement

For every intentional divergence that remains after investigation, ensure the test suite permanently asserts:

```text
completion tier
exact score or exact relative ordering
which dimensions cause the divergence
security/data/compliance correctness is never worse in the optimal state
```

The test must fail if a future edit accidentally changes:

```text
optimal → acceptable semantics

or

the divergence's intended dimension structure
```

If existing tests already cover all of this, cite the exact test names and do not add redundant tests.

---

# 10. Fix Rules

If a defect is found, use the smallest correct scenario-local change.

Permitted:

```text
definition success/acceptable condition change
scenario-local declarative scoring change
rule-state correction
derived scoring field correction
test/report label correction
```

Not permitted:

```text
generic scorer change
scenario-specific scorer
broad numeric rebalance across unrelated scenarios
changing scores merely so OPTIMAL always numerically beats ACCEPTABLE
```

Do not optimize for prettier ordering.

Optimize for semantic correctness.

---

# 11. Recheck #91 and #93 Prior Fixes

Because #91 and #93 already required fix-agents in this batch, this closeout must also confirm the scoring investigation does not reopen those fixed defects.

For #91 confirm:

```text
pre-sustained hold-for-retrain never falls through to healthy-default
```

For #93 confirm:

```text
cutoverAuditLog remains a real mechanic
and not dead after any scoring adjustment
```

No regression to the previously-fixed behavior.

---

# 12. Validation

If the investigation is report/test-only:

Run at minimum the four relevant scenario suites.

If any production/scenario/scoring logic changes:

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
Seed complete (95 built-in scenario(s)).
```

Do not alter catalog count.

---

# 13. Required Closeout Addendum Format

Return:

```text
Phase 6E.3 Scoring Closeout Addendum
```

with exactly these sections:

## 1. #91 investigation
- classification: A/B/C/D
- exact score table
- tier-vs-score explanation
- changes/tests

## 2. #93 investigation
- classification: A/B/C/D
- exact score table
- tier-vs-score explanation
- changes/tests

## 3. #94 investigation
- classification: A/B/C/D
- exact score table
- explicit 180-point-gap explanation
- changes/tests

## 4. #95 investigation
- classification: A/B/C/D
- exact score table
- tier-vs-score explanation
- changes/tests

## 5. Completion-report corrections
- false inequalities removed
- exact replacement wording

## 6. Regression coverage
- exact tests proving intentional divergences
- new tests if required

## 7. Prior-fix regression check
- #91 default-path gap remains fixed
- #93 cutoverAuditLog remains live

## 8. Files changed
- report-only vs test vs scenario/scoring changes

## 9. Validation
- scenario tests
- full validation if code changed

## 10. Final recommendation

Exactly one:

```text
PHASE 6E.3 READY FOR APPROVAL
```

or:

```text
PHASE 6E.3 STILL BLOCKED
```

with exact blocker.

---

# 14. Stop Condition

Do not begin Phase 6E.4.

This closeout is complete only when:

```text
#91 divergence is explained or fixed

#93 divergence is explained or fixed

#94 180-point divergence is explained or fixed

#95 divergence is explained or fixed

false inequality claims are removed from the completion report

intentional divergences have permanent regression coverage

#91/#93 prior fixes remain intact

required tests are green
```

Stop and return the addendum for review.
