# IncidentRank — Phase 6B.1 Cleanup

## Goal

Close the three follow-ups from the Phase 6B review before Phase 6C begins:

1. make the full web test suite green
2. remove the confusing immediate-1000/1000 Cross-Region Latency path
3. complete the literal manual post-incident feedback QA across at least 5 scenarios

This is a **cleanup phase only**.

Do not begin scenarios 41–60.

---

# 1. Scope

Phase 6B is approved.

This cleanup should be intentionally small and surgical.

Do not change:

- scenario-library architecture
- scoring-engine architecture
- entitlement model
- billing
- scenario count
- category taxonomy
- candidate-declared core lifecycle
- post-incident feedback leak boundary
- assessment runtime architecture

Only address the three items below.

---

# 2. Fix the failing web test

Current failing test:

```text
apps/web/src/app/incidents/[slug]/page.test.tsx
```

Observed failure:

```text
headers() was called outside a request scope
```

The failure originates from the route reaching:

```text
isDevUnlockPaidScenarios(...)
```

which reads Next.js request headers.

The production implementation is not known to be broken; this is a test-harness issue.

## Required fix

Keep the production behavior unchanged.

Prefer fixing the unit-test environment by mocking/stubbing the relevant `next/headers` dependency or the narrow server helper boundary.

Do NOT remove the host check from `dev-unlock.ts`.

Do NOT weaken:

```text
DEV_UNLOCK_PAID_SCENARIOS=true
AND NODE_ENV !== production
AND host is localhost
```

Do NOT globally mock `next/headers` in a way that could hide unrelated route bugs.

Prefer the narrowest test-safe approach.

---

# 3. Required tests for dev unlock

Preserve and/or add coverage proving:

```text
production
→ never unlocked

non-production + flag absent
→ locked

non-production + flag true + non-localhost
→ locked

non-production + flag true + localhost
→ unlocked
```

The repaired `[slug]/page.test.tsx` must pass.

Then run the complete web package tests, not just that one file.

Target:

```text
0 failing web tests
```

---

# 4. Cross-Region Latency Spike problem

Current behavior permits a candidate to:

```text
start incident
→ make zero changes
→ immediately Finish
→ resolve acceptable
→ score approximately 1000/1000
```

The report explains why this is technically consistent:

- the initial synchronous strategy preserves correctness
- it still falls within the current acceptable latency threshold
- almost no time has elapsed
- no costly or harmful changes occurred

However, this is poor assessment/product behavior.

A candidate should not obtain a perfect score simply by clicking Finish immediately before they have had a meaningful opportunity to observe the incident.

This is NOT a request to force an action.

Observation itself may be the correct engineering decision.

The scenario should test:

> Do you recognize that waiting is safe right now, and do you observe long enough to establish that judgment?

not:

> Can you click Finish faster than the next timed event?

---

# 5. Preserve the "patient strategy"

Do NOT remove the legitimate patient/synchronous strategy.

It remains a valid engineering approach.

The scenario must still allow a candidate to decide:

```text
keep strong consistency
accept increased latency
observe system behavior
hand back once stability is demonstrated
```

This may remain:

```text
completionTier = acceptable
```

The alternative faster strategy may remain:

```text
completionTier = optimal
```

if the current scenario semantics support that distinction.

---

# 6. Add a meaningful sustain requirement

Preferred fix:

The patient strategy should require a meaningful period of sustained acceptable state before Finish can resolve.

Do not require the candidate to wait until the hidden second-wave event.

Do not use an arbitrary 3.5-minute timer merely because that event exists.

Instead, define a realistic observation/stability window.

Recommended range:

```text
30–60 simulated seconds
```

Choose the value based on the scenario's existing timing scale.

Example:

```text
acceptableCondition:
  latency within bounded patient-strategy range
  payment consistency preserved
  no unsafe regional state
  sustainedSeconds: 45
```

Then:

```text
Finish at 5 seconds
→ declared_unstable

Finish after 45+ seconds of stable patient behavior
→ resolved / acceptable
```

This preserves:

```text
waiting is a legitimate action
```

while eliminating:

```text
instant perfect score
```

---

# 7. Do not require configuration churn

Do NOT add a rule such as:

```text
candidate must make at least one change
```

That would be wrong.

A good incident responder may correctly conclude:

> The current consistency-first state is safe. I should observe rather than introduce additional change.

So the requirement is:

```text
meaningful observation
```

not:

```text
mandatory action
```

---

# 8. Cross-Region scoring

After adding the sustain requirement, rerun actual scoring.

Expected behavior:

### Immediate Finish

```text
outcome = declared_unstable
```

Recovery and Reliability should receive unresolved treatment according to the existing scoring configuration.

### Patient strategy after sustain

```text
outcome = resolved
completionTier = acceptable
```

It should earn a strong score, but review whether 1000/1000 remains appropriate.

A safe-but-imperfect strategy should generally not outscore an optimal strategy unless there is a strong scenario-specific reason.

Prefer:

```text
optimal > acceptable
```

for this scenario.

Do not insert an arbitrary point penalty just to create separation.

Use real modeled tradeoffs such as:

- customer latency
- reliability
- operational efficiency
- infrastructure cost

where appropriate.

---

# 9. Cross-Region tests

Add/update concrete regression tests for:

```text
zero-action immediate Finish
→ declared_unstable
```

```text
zero-action patient strategy
→ remains stable for required sustain interval
→ Finish
→ resolved + acceptable
```

```text
optimal mitigation
→ Finish
→ resolved + optimal
```

```text
optimal score > acceptable score
```

where supported by the scenario's actual scoring semantics.

Also verify:

```text
waiting alone
→ does not count as harmful action
```

and:

```text
second-wave unsafe state
→ cannot Finish as acceptable
```

---

# 10. Fairness audit

Explicitly answer in the completion report:

> What observable information tells the candidate that waiting is reasonable?

and:

> What observable information later tells them the patient strategy may no longer be sufficient?

The answer must come from candidate-visible metrics/state.

Do not rely on knowledge of hidden `timed-events.ts`.

---

# 11. Manual post-incident feedback QA

Phase 6B structurally verified the feedback system, but did not literally perform the requested mixed-action review flow across 5 scenarios.

Complete that now.

Choose at least 5 scenarios across different categories.

Recommended set:

```text
Missing Database Index
Message Retry Storm
Hot Database Partition
Duplicate Event Processing
Split-Brain Incident
```

You may substitute scenarios if needed, but cover at least 4 categories.

---

# 12. Required feedback flow per scenario

For each selected scenario:

1. start a practice attempt
2. take at least one beneficial action
3. take at least one harmful action
4. where available, take one neutral/ineffective action
5. finish or otherwise terminal the incident
6. open post-incident review
7. verify each action gets the correct authored feedback
8. verify explanation matches the actual rule that matched at action time
9. verify no feedback was visible during active play
10. verify no hidden rule identity is leaked

Record the actual feedback titles in the completion report.

Do not reproduce huge amounts of prose; just enough to prove the right rule matched.

---

# 13. Feedback correctness

Specifically validate that feedback is based on:

```text
state at the time of the action
```

not:

```text
final incident state
```

This was a core Phase 6.1 design requirement.

At least one manual flow should use an action whose classification would differ if evaluated later in the incident.

Verify that review still reports the classification/feedback appropriate to the original action-time state.

---

# 14. Assessment feedback remains unavailable

As a regression check:

Use one assessment attempt and confirm:

```text
no authored educational feedback appears
```

even after completion.

Do not change this product rule.

---

# 15. Full regression validation

After all fixes:

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:seed
```

If the root scripts truly do not exist, run the equivalent complete commands across all packages and document them.

The important requirement is:

```text
0 failing tests
```

Do not accept a "pre-existing failure" after this cleanup.

The purpose of 6B.1 is to enter Phase 6C with a fully green baseline.

---

# 16. Expected catalog state

No scenarios added or removed.

Final catalog remains:

```text
40 built-in scenarios
3 free
37 paid
```

Seed must still report:

```text
Seed complete (40 built-in scenario(s)).
```

---

# 17. Do not change completion classifications

Do not revisit all 40 completion modes in this phase.

Only modify Cross-Region Latency Spike as needed for the sustain/fairness correction.

No mass tuning.

---

# 18. Do not redesign scoring

The known unresolved/failed terminal-override scoring limitation remains out of scope.

Do not introduce a new scoring architecture here.

Only make Cross-Region scoring changes that naturally follow from correcting its completion semantics.

---

# 19. Completion report

Return:

1. files modified
2. failing test root cause
3. exact test-harness fix
4. confirmation dev-unlock production protections remain intact
5. full web-test result
6. Cross-Region old behavior
7. Cross-Region corrected behavior
8. acceptable sustain duration chosen and rationale
9. candidate-visible evidence supporting patient observation
10. candidate-visible evidence indicating later deterioration
11. immediate-Finish result
12. patient-strategy result
13. optimal-strategy result
14. actual scores for those three paths
15. score comparison/rationale
16. Cross-Region regression tests added
17. five manual feedback scenarios used
18. beneficial feedback observed per scenario
19. harmful feedback observed per scenario
20. neutral feedback observed where available
21. proof feedback matched action-time state
22. proof no feedback leaked during active practice
23. proof assessment feedback remains unavailable
24. total test count
25. typecheck result
26. lint result
27. test result
28. build result
29. seed result
30. deviations
31. remaining concerns

---

# 20. Stop condition

When all of the following are true:

```text
full test suite green
Cross-Region immediate-Finish exploit removed
patient/no-action strategy still legitimately supported
5-scenario manual feedback QA complete
40 scenarios still seeded
```

Phase 6B.1 is complete.

Stop.

Do not begin Phase 6C until the completion report is reviewed.