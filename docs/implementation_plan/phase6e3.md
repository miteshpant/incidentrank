# Phase 6E.3 Implementation Prompt

You are implementing **IncidentRank Phase 6E.3 only**.

Use the existing repository as the source of truth. Read the relevant planning/specification files first, including:

- `docs/implementation_plan/phase6e3.md` if present
- `docs/implementation_plan/phase-6e-strategy-spec.md` or the current Phase 6E strategy spec
- the Phase 6E.2 completion/closeout report
- the implementation patterns established by scenarios 81–90
- the existing scenario authoring schema, engine, scorer, catalog, and tests

Do **not** begin Phase 6E.4.

## Primary objective

Implement the next Phase 6E batch, expected to cover **scenarios 91–95**, using the exact scenario names, slugs, difficulty levels, goals, and thematic requirements defined by the repository's current Phase 6E.3 plan/spec.

Do not invent replacements if the plan already specifies them.

The goal is not merely to add five scenarios. The goal is to preserve and extend the quality bar established by Phase 6E.2 while continuing the Phase 6E strategic pivot away from repetitive infrastructure-scaling incidents.

---

## Phase 6E.2 baseline you must preserve

Phase 6E.2 closed with:

- 90 built-in scenarios seeded
- scenarios 86–90 complete
- 0 dead controls across 38 controls
- 5/5 scenarios with genuine alternate strong paths
- Phase 6E alternate-path running count: **6/10**
- 213 new scenario tests in the batch
- all scenario package tests green
- typecheck, lint, build, and seed green
- no central `scale X -> overload Y` mechanic in any of scenarios 86–90
- strong use of cost, policy, correctness, observability, risk, and decision-quality tradeoffs
- one real verifier-found state-machine gap in #90 that required a post-verification fix

The overall Phase 6E target is at least **12 of 20** scenarios with genuine alternate strong paths by scenario 100.

That means scenarios 91–100 need at least **6 of the remaining 10** to have genuine alternate strong paths.

Do not force fake alternate paths simply to hit the number.

---

## Required design principles

### 1. Avoid mechanic repetition

Do not fall back to the old dominant pattern:

> find bottleneck -> scale service -> wait

A scenario may contain capacity or scaling controls if genuinely required by its domain, but the central judgment must not merely repeat that pattern unless the Phase 6E.3 strategy explicitly requires it.

For every scenario, perform a duplicate-mechanism audit against the closest existing scenarios.

Document:

- closest comparators
- distinct root mechanism
- distinct dominant mitigation
- distinct judgment axis

Also compare against **sibling scenarios in the same 6E.3 batch**, not just older incidents.

Phase 6E.2 identified sibling-batch adjacency as a process gap; fix that process here.

---

### 2. Alternate strong paths

Prefer scenarios that naturally support more than one strong engineering strategy.

For each scenario, explicitly determine whether a genuine alternate strong path exists.

A genuine alternate path must differ materially in mechanism or judgment, not merely:

- the same controls in a different order
- equivalent values with cosmetic differences
- identical final states with renamed labels

If a scenario legitimately has only one strong path, say so.

Track the Phase 6E running total after this batch.

---

### 3. Default-value path completeness

Phase 6E.2 scenario #90 exposed a rule-table completeness bug:

A legitimate safe strategy could regress into a baseline rule after elapsed time solely because one control remained at its default value and no terminal rule covered that combination.

For every scenario in 6E.3:

- audit every meaningful terminal path where one or more controls remain at defaults
- test safe combinations both with explicitly changed controls and untouched defaults
- inspect first-match-wins rule ordering
- ensure elapsed-time progression cannot cause a safe state to fall through into an unrelated unsafe/baseline state
- add permanent regression tests for any gap found

Do not assume "candidate didn't touch this control" means the combination is unreachable.

---

### 4. Control-usage discipline

Every exposed control must participate in real scenario mechanics.

For every control:

- referenced in `rules.ts`
- exercised by tests
- classified with feedback
- materially affects state, scoring, safety, cost, timing, policy, or another real outcome

If a control is dead:

- remove it, or
- give it a real mechanic

Do not keep decorative controls.

Run an independent dead-control audit after authoring.

Target: **0 dead controls**.

---

### 5. Scoring integrity

Use only the existing scoring engine and supported dimensions unless the repository plan explicitly authorizes an engine change.

Do not distort the generic scorer to make a scenario fit.

Be especially careful with cost-reduction scenarios.

Phase 6E.2 established an engine limitation:

`costIncreaseRatio` compares peak cost against baseline and is structurally unable to reward cost reductions when the incident begins in an already-inflated cost state and all safe actions only reduce cost.

If Phase 6E.3 contains cost-reduction scenarios:

- do not pretend `costIncreaseRatio` discriminates if it does not
- use an honest existing generic mechanism if appropriate
- document the limitation
- do not add scenario-specific scorer hacks
- do not modify the scoring engine unless the Phase 6E.3 plan explicitly scopes that change

Also avoid the #88 weakness where two materially different optimal paths have different live economics but byte-identical scoring if meaningful differentiation can be represented honestly with the existing scorer.

Investigate suspicious scores.

In particular:

- OPTIMAL should generally score above ACCEPTABLE
- an unsafe minimum-cost path must not become attractive overall merely because costEfficiency is high
- strong alternate paths may score differently if their real tradeoffs differ
- do not artificially equalize distinct paths

---

### 6. Unsafe but tempting paths

Each scenario should contain at least one meaningful trap where appropriate.

The best traps look locally attractive.

Examples of the pattern, not mandatory mechanics:

- cheaper but violates a hidden safety/policy floor
- restores availability but damages correctness
- reduces operational noise but destroys auditability
- improves latency but increases irreversible risk
- looks green now but creates future exposure
- preserves uptime while degrading decision quality

Avoid cartoonishly bad controls where the negative consequence is obvious before the candidate has to reason.

---

### 7. Legitimate degraded modes

Where the domain supports it, include a genuine degraded-but-safe state.

An ACCEPTABLE state must be:

- meaningfully safer than baseline
- genuinely operationally defensible
- materially distinct from OPTIMAL
- not just "almost optimal"

Do not force an ACCEPTABLE tier where the underlying incident is truly binary.

---

### 8. Historical/non-resetting consequences

When a candidate action causes irreversible or historically meaningful damage, model it using the existing peak/history pattern.

Examples:

- cumulative exposure
- cumulative stale decisions
- cumulative blind-window time
- failed-drill count
- policy breach duration

Prove via tests that:

- the live state can recover
- the historical peak/cumulative consequence does not reset

Do not fake historical damage by simply leaving the current state permanently degraded.

---

### 9. Recovery lag and sequencing

Audit both independently.

A recovery lag exists only if the system genuinely needs elapsed time to settle, drain, propagate, recover, reconcile, or converge.

A sequencing trap exists only if order materially matters.

Do not manufacture either one.

For each scenario explicitly report:

- sequencing: real / N/A
- recovery lag: real / N/A
- why

If elapsed time exists, test intermediate windows and terminal windows.

---

### 10. Timeline causality clarity

Timeline events must make causality legible.

Phase 6E.2 found the #90 pattern especially effective:

- `EXTERNAL PROGRESSION:`
- `HISTORICAL CONSEQUENCE:`
- `CANDIDATE-ACTION CONSEQUENCE:`

Use explicit causality labeling where it improves clarity and fits the existing UI conventions.

At minimum, the candidate must be able to distinguish:

- external incident progression
- consequences of their own actions
- delayed/historical effects
- drills/simulations versus real outages
- policy/economic signals versus availability failures

Do not write ambiguous timeline prose.

---

## Scenario implementation requirements

For each scenario, follow the repository's established file structure and authoring conventions.

Expected pattern, unless the current repo schema differs:

- `architecture.ts`
- `controls.ts`
- `metrics.ts`
- `timed-events.ts`
- `rules.ts`
- `revenue-and-cost.ts`
- `action-classifications.ts`
- `scoring.ts`
- `definition.ts`
- `candidate-ui.ts`
- root scenario file
- scenario test file

Do not modify shared engine/schema/type files unless the Phase 6E.3 plan explicitly requires it.

Do not allow author agents or verifier agents to edit shared catalog/index wiring.

Shared registration/wiring should be done only after each scenario is independently verified.

---

## Per-scenario required audit

For each of scenarios 91–95, produce and verify:

1. exact slug
2. exact name
3. difficulty
4. architecture node count
5. architecture edge count
6. flat-readability verdict
7. closest-scenario duplicate audit
8. sibling-batch duplicate audit
9. control count
10. dead-control audit
11. completion mode
12. immediate-Finish behavior
13. UNSAFE state(s)
14. ACCEPTABLE state(s), if legitimate
15. OPTIMAL state(s)
16. business invariants
17. primary judgment axis
18. tempting unsafe path
19. alternate strong path status
20. sequencing audit
21. recovery-lag audit
22. pressure-transfer audit
23. historical-damage model, if applicable
24. timeline-causality audit
25. feedback coverage
26. exact scoring evidence for baseline / harmful / acceptable / optimal paths
27. suspicious-score investigation
28. test count
29. verifier verdict
30. any post-verification fixes

---

## Testing requirements

Each scenario must have strong automated coverage.

Tests must cover, where applicable:

- initial/baseline state
- immediate Finish before meaningful action
- safe path
- alternate safe path
- acceptable path
- optimal path
- unsafe tempting path
- historical damage persistence
- elapsed-time transitions
- default-control combinations
- rule-order/fallthrough hazards
- feedback coverage
- action classifications
- cost/revenue behavior
- completion eligibility
- candidate-declared Finish outcome
- non-resetting peak metrics
- no accidental automatic success
- no accidental optimal state through random control mashing

Use Monte Carlo/random-control stress tests only when they add real value; do not add them as ceremony.

---

## Independent verification

Each scenario must be reviewed by a verifier who did not author it.

The verifier must independently:

- read the actual scenario files
- read the named comparator scenarios directly
- re-run the dead-control audit
- inspect rule ordering
- test alternate paths
- inspect default-value combinations
- check the unsafe trap
- verify completion eligibility
- inspect scoring
- verify feedback coverage
- look for state-machine gaps
- reject the scenario if a legitimate candidate strategy can silently regress due to missing rule coverage

A verifier must not simply accept the author's audit tables.

If rejected:

1. document the exact defect
2. use a fresh, scoped fix agent
3. make the smallest correct fix
4. add permanent regression coverage
5. independently re-verify after the fix

---

## Manual QA

Follow the Phase 6E.3 plan's required manual-QA priorities.

For priority scenarios, test in the real UI:

- briefing/invariants
- architecture readability
- controls
- live metrics
- timeline causality
- unsafe trap
- safe path
- Finish behavior
- result-screen scoring
- historical peak values where applicable

Manual QA must confirm product behavior, not just implementation correctness.

If a scenario is explicitly optional for manual QA in the plan and is skipped, compensate with especially strong automated/verifier evidence and document the deviation.

---

## Shared wiring

After all five scenarios are independently verified:

- update `packages/scenarios/src/index.ts`
- update `packages/scenarios/src/library/catalog.ts`
- preserve comment-delimited organization used by prior batches
- verify catalog count
- verify free/paid counts
- seed the database

Do not let parallel authoring agents touch these shared files.

---

## Final validation matrix

Run and report:

```bash
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test

pnpm typecheck
pnpm lint
pnpm build

pnpm --filter @incidentrank/db db:seed
```

Also run the relevant full tests required by the current implementation plan.

If unrelated known flaky tests fail:

- verify them independently
- do not misattribute them to this batch
- document exact evidence
- do not hide real regressions behind the word "flaky"

Expected seed trajectory after a five-scenario 6E.3 batch:

**95 built-in scenarios**

Do not claim 95 if the repository plan defines a different scenario count or if registration is incomplete.

---

## Phase 6E.3 completion report

At the end, produce a detailed completion report modeled after the Phase 6E.2 report.

Include:

- exact scenarios 91–95
- files created/modified
- duplicate-mechanism audits
- sibling-batch adjacency audit
- difficulties
- architecture counts
- control audits
- verifier dead-control audits
- completion modes
- unsafe / acceptable / optimal states
- business invariants
- thematic objective per scenario
- historical-damage model
- multi-step/policy paths
- sequencing audit
- pressure-transfer audit
- recovery-lag audit
- timeline-causality audit
- tempting unsafe paths
- legitimate degraded modes
- alternate strong paths
- updated Phase 6E alternate-path running count
- immediate-Finish audit
- exact scoring tables
- scoring-differentiation audit
- suspicious-score investigations
- feedback coverage
- test count
- verifier verdicts
- fix-agent changes
- orchestrator verification
- manual QA
- package tests
- full tests
- typecheck
- lint
- build
- seed
- deviations
- product/UX concerns
- difficulty-quality assessment
- Phase 6E thematic-diversity assessment
- alternate-path target status

---

## Stop condition

Stop when:

- all Phase 6E.3 scenarios are fully implemented
- all are independently verified
- all required fixes are complete
- all required validation is green or clearly documented if an unrelated pre-existing flake occurs
- the database seed count matches the expected post-batch count
- the Phase 6E alternate-path running count is updated
- the Phase 6E.3 completion report is written

**Do not begin Phase 6E.4.**
