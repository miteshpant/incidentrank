# IncidentRank — Phase 6E.1 Scoring Closeout

## Scope

This is a narrow scoring/reporting closeout for **Phase 6E.1**.

Do not redesign scenarios 81–85 unless the scoring investigation proves a real defect.

Do not begin Phase 6E.2.

Phase 6E.1 is functionally strong and conditionally approved, but formal approval is blocked by one scoring inconsistency/evidence gap in:

```text
#84 Abuse-Prevention False Positive Storm
```

There is also one planning constraint to carry forward for future Phase 6E batches.

---

# 1. Investigate #84 Tier/Score Inconsistency

The Phase 6E.1 completion report currently lists:

```text
#84 Abuse-Prevention False Positive Storm

Optimal:
980 rollback
750 patched forward-fix

Acceptable:
810

Baseline:
350

Harmful:
— (globally-disabled detection path)
```

The suspicious point is:

```text
patched forward-fix = OPTIMAL at 750
acceptable state = 810
```

A state classified as OPTIMAL scoring 60 points below an ACCEPTABLE state is not automatically impossible, but it requires exact evidence and a strong semantic explanation.

Do not justify this from prose alone.

Execute the real authored paths through the generic scoring/runtime code.

Determine exactly which of these is true:

### A. Completion-tier defect
The patched forward-fix should not actually be `optimal`; it should be `acceptable`.

### B. Scoring defect
The patched forward-fix is correctly `optimal`, but the declarative scoring under-rewards it.

### C. Acceptable-state scoring defect
The acceptable state is over-scored relative to its actual safety/recovery quality.

### D. Intentional tier/score divergence
The patched forward-fix is genuinely fully safe/optimal for handback while still receiving fewer points because it imposes a legitimate, meaningful operational/customer/cost penalty that the acceptable state does not.

Option D is allowed only if the exact six-dimension breakdown makes the distinction coherent.

Do not accept:

```text
"they are different strategies"
```

as sufficient explanation.

---

# 2. Required #84 Executed Paths

Execute and report exact results for:

```text
1. rollback optimal
2. patched forward-fix currently labeled optimal
3. acceptable state
4. zero-action baseline
5. global-disable / detection-disabled harmful path
6. unreliable-exemption harmful path
```

If the scenario contains another clearly material harmful/security-violating path, include it too.

For every path return:

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

final authored incident state
```

Do not provide:

```text
—
relative ordering only
"below baseline"
"see test file"
```

All required paths must have exact numeric evidence.

---

# 3. Core Question to Answer

Explicitly answer:

> Why does the patched forward-fix qualify as OPTIMAL while scoring below the ACCEPTABLE state?

The answer must identify:

```text
which dimension(s) create the 60-point difference

what real candidate/system tradeoff those dimensions represent

why that tradeoff does NOT make the state merely ACCEPTABLE

why the acceptable state still deserves a higher numeric score, if that remains intentional
```

If that answer is not semantically convincing, fix the smallest correct layer.

---

# 4. Security Correctness Sanity Checks

Because #84 is a security/abuse-prevention scenario, explicitly prove:

```text
global-disable detection path
→ improves false-positive/customer metrics
→ allows real abuse
→ remains unsafe
→ scores materially below safe tiers
```

Also prove:

```text
unreliable exemption
→ cannot be considered safe merely because legitimate traffic recovers
```

If historical abuse exposure exists, prove it cannot be erased merely by restoring the current policy.

---

# 5. Fix Rules

If a defect is found:

Use the smallest scenario-local correction.

Permitted:

```text
definition success/acceptable condition change
scenario-local declarative scoring-band change
rule-state correction
test correction if report/test label was wrong
```

Not permitted:

```text
generic scorer changes
new scenario-specific scorer
broad rebalancing of unrelated paths
changing numbers merely so ordering looks prettier
```

Any production/scenario logic or scoring change must receive permanent regression coverage.

---

# 6. Reporting Defect vs. Product Defect

If the implementation is already correct and the original report merely omitted/mislabeled evidence:

```text
state that explicitly
```

Then correct the completion report and add a permanent test only if the current test suite does not already prevent the reporting mistake from recurring.

Do not change working scenario logic unnecessarily.

---

# 7. Exact Closeout Table

The addendum must contain a single exact table in this form:

| Path | Outcome | Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency | Final State |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|

Rows required:

```text
rollback optimal
patched forward-fix
acceptable
baseline
global-disable harmful
unreliable-exemption harmful
```

---

# 8. Validation

If this is report-only:

Run at least the repository's direct test invocation for:

```text
abuse-prevention-false-positive-storm.test.ts
```

If any scenario/scoring/logic code changes:

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
Seed complete (85 built-in scenario(s)).
```

Do not modify catalog counts.

---

# 9. Correct Phase 6E.1 Completion Report

Update the Phase 6E.1 completion report so #84's row contains exact numeric values for:

```text
rollback optimal
patched forward-fix
acceptable
baseline
global-disable harmful
unreliable-exemption harmful
```

Remove any `—` placeholder.

If tier labels change as part of the fix, update:

```text
unsafe/acceptable/optimal audit
alternate strong-path section
score sanity section
quality assessment
```

so the report is internally consistent.

---

# 10. Phase 6E Alternate-Path Planning Constraint

Do not begin 6E.2 in this closeout.

But record this planning constraint at the end of the addendum:

Phase 6E strategy target:

```text
at least 12 of 20 scenarios
support more than one defensible strong strategy
```

Current 6E.1 result:

```text
1 of 5
```

Therefore scenarios 86–100 need at least:

```text
11 of the remaining 15
```

to have genuine alternate strong paths if the original Phase 6E target is to be met.

Do not force fake alternatives.

Instead, 6E.2–6E.4 batch designs should deliberately favor scenarios that naturally admit choices such as:

```text
cost vs resilience
rollback vs forward-fix
regional vs global strategy
quality vs cost
staged vs immediate action
containment vs controlled continuation
```

This is a planning note only.

Do not author scenarios 86–100 as part of this closeout.

---

# 11. Required Closeout Addendum Format

Return:

```text
Phase 6E.1 Scoring Closeout Addendum
```

with these sections:

## 1. #84 root cause
- reporting defect / tier defect / scoring defect / intentional divergence
- exact explanation

## 2. Exact #84 score table
- all six required paths
- full six-dimension breakdowns

## 3. Tier-vs-score explanation
- direct answer to why OPTIMAL may or may not score below ACCEPTABLE

## 4. Security sanity checks
- global-disable
- unreliable exemption
- historical security consequence

## 5. Changes made
- code
- scoring
- tests
- documentation

## 6. Validation
- scenario tests
- full validation if code changed

## 7. Alternate-path planning note
- current 1/5
- remaining requirement 11/15
- no fake alternatives

## 8. Final recommendation

Exactly one of:

```text
PHASE 6E.1 READY FOR APPROVAL
```

or:

```text
PHASE 6E.1 STILL BLOCKED
```

with the exact remaining blocker.

---

# 12. Stop Condition

Do not begin Phase 6E.2.

This closeout is complete only when:

```text
#84 patched-forward-fix tier/score discrepancy is fully explained or fixed

global-disable harmful score is exact

unreliable-exemption harmful score is exact

Phase 6E.1 completion report has no scoring placeholders for #84

required tests are green

alternate-path planning constraint is recorded
```

Stop and return the addendum for review.
