# IncidentRank — Phase 6D.4 Batch Script

## Scope

Implement and verify exactly these five Phase 6D scenarios:

```text
76 Backfill Overwhelms Production
77 Multi-Service Memory Pressure Incident
78 Global Feature Rollout Incident
79 Capacity Exhaustion During Peak Event
80 Cascading Failure Across Shared Platform
```

Do not begin Phase 6E / scenarios 81–100.

Phase 6D.1, 6D.2, and 6D.3 are approved.

Current baseline:

```text
75 built-in scenarios
3 free
72 paid

difficulty metadata:
beginner
intermediate
senior
staff
senior_staff
principal
```

Expected after this batch:

```text
80 built-in scenarios
3 free
77 paid
```

Use the established workflow:

```text
5 parallel scenario authors
→ 5 independent verifiers
→ orchestrator filesystem verification
→ fresh fix-agent where needed
→ re-verification
→ shared catalog/index wiring
→ batch-wide validation
→ live manual QA
→ Principal-level review gate
```

## 1. Binding Author-Side Control Usage Audit

Keep the Phase 6D.3 process improvement.

Before any author reports DONE, they must produce a complete table:

| Control | Referenced in rules.ts | Exercised by tests | Action classification/feedback | Notes |
|---|---|---|---|---|

Every defined control must:
1. participate in real rule logic
2. be exercised by at least one test
3. have action classification/feedback where meaningful

If a control is dead, wire it into a real mechanic or remove it.

Independent verifiers must repeat the audit from scratch.

Any dead control found by verifier = REJECT.

## 2. Duplicate-Mechanism Audit

Before coding, compare each scenario against all existing 75 built-ins.

Return:

```text
Closest existing scenarios:
Distinct root failure mechanism:
Distinct dominant mitigation:
Distinct Staff/Principal judgment:
Why this is not a reskin:
```

Redesign if root mechanism + dominant mitigation are materially duplicated.

Pay particular attention to:

```text
#76 vs schema migration / data pipeline / backpressure scenarios
#77 vs memory leak / large payload regression / API traffic pressure scenarios
#78 vs deployment regression / partial rollout regression / schema migration
#79 vs API traffic spike / regional failover overload / autoscaling failure
#80 vs cascading service failure / dependency timeout cascade / shared-platform incidents
```

## 3. Architecture Constraint

Use the current flat ArchitectureNode / ArchitectureEdge representation first.

Do not add grouping unless this batch finally demonstrates a real readability failure.

For each scenario record:

```text
node count
edge count
flat readability verdict
```

If flat architecture genuinely fails, return a design note before changing shared types:

```text
Problem:
Affected scenario:
Exact candidate misunderstanding:
Why labeling/layout is insufficient:
Smallest generic extension:
Backward compatibility:
UI impact:
Tests needed:
```

No worker may modify shared architecture types.

## 4. Scenario 76 — Backfill Overwhelms Production

Slug:

```text
backfill-overwhelms-production
```

Difficulty:

```text
senior_staff
```

Suggested architecture:

```text
Production Clients
      ↓
Application API
      ↓
Primary Database
      ↑
Backfill Workers
      ↑
Backfill Queue / Coordinator
```

Optional Read Replica only if materially useful.

Incident: a large historical backfill competes with live customer traffic. Simply shutting it off forever is not necessarily optimal.

Business invariants:

```text
Customer writes must remain correct and available within the authored SLO.
Backfill may slow or pause temporarily.
Historical rows must not be skipped or silently marked complete.
The migration deadline matters, but never outranks production correctness.
A resumed backfill must remain within a safe production resource budget.
```

Potential controls:
- backfill concurrency
- chunk size
- scheduling window
- DB priority
- pause/resume
- statement timeout
- replica-read usage
- queue dispatch rate

Strong path:

```text
contain DB pressure
→ protect live workload
→ reshape backfill pressure
→ observe recovery
→ resume at a safe rate
```

Pressure transfer and recovery lag are required.

Likely safe degraded state:

```text
production healthy
backfill slowed/paused
queue bounded
migration delayed but safe
```

## 5. Scenario 77 — Multi-Service Memory Pressure Incident

Slug:

```text
multi-service-memory-pressure-incident
```

Difficulty:

```text
senior_staff
```

Architecture:

```text
Clients
  ↓
Gateway
  ↓
API Service
  ↓
Aggregator
  ├─ Dependency A
  ├─ Dependency B
  └─ Dependency C
```

Incident: a payload/data-shape change increases memory across multiple services. One downstream service begins GC thrashing first, but the true source is upstream amplification / oversized aggregation behavior.

Business invariants:

```text
Customer requests may return reduced enrichment if necessary.
The service fleet must not enter restart/OOM churn.
Payload truncation may only occur within explicit correctness bounds.
Scaling a symptom service is not a durable fix if upstream amplification remains active.
```

Potential controls:
- payload field set / response enrichment
- aggregation concurrency
- max response size
- API concurrency
- dependency fan-out
- cache policy
- worker count
- partial response mode

Tempting path: scale the first crashing service. It should give temporary relief without durable recovery.

Recovery lag required.

Alternate strong paths encouraged.

## 6. Scenario 78 — Global Feature Rollout Incident

Slug:

```text
global-feature-rollout-incident
```

Difficulty:

```text
principal
```

Architecture:

```text
Global Clients
      ↓
Traffic Router
      ↓
Feature Flag Platform
      ↓
US Service Fleet
EU Service Fleet
APAC Service Fleet
      ↓
Shared Data Store
```

Incident: a global feature rollout causes a region-dependent correctness problem and writes state that may remain incompatible after rollback.

Business invariants:

```text
Correctly-written existing customer state must remain readable after rollback.
A regional rollout may be halted independently.
Global rollback may not discard or hide already-written incompatible data.
The shared data store must not contain mutually incompatible active representations without an explicit compatibility strategy.
Correctness outranks rollout velocity.
```

Potential controls:
- rollout percentage by region
- feature flag by region
- write format / compatibility mode
- rollback
- migration repair
- traffic cohort
- data-read compatibility
- rollout pause

Historical damage and sequencing are required.

At least two strong strategies if semantics support them:
- regional rollback + repair
- global rollback + compatibility
- forward-fix + staged continuation

## 7. Scenario 79 — Capacity Exhaustion During Peak Event

Slug:

```text
capacity-exhaustion-during-peak-event
```

Difficulty:

```text
principal
```

This should be one of IncidentRank's flagship scenarios.

Architecture:

```text
Clients
   ↓
Edge / CDN
   ↓
API Fleet
   ↓
Cache
   ↓
Database
   ↓
Async Queue / Workers
```

Target 8–12 meaningful nodes if additional business-critical/optional subsystems are needed.

Incident: traffic is legitimate and expected. It cannot simply be blocked.

Possible progression:

```text
Edge/API pressure rises
→ cache effectiveness drops
→ DB approaches saturation
→ async backlog grows
→ optional features worsen
→ global success declines
```

Business invariants:

```text
Critical purchase/transaction traffic must remain available as long as safely possible.
Optional personalization/search/enrichment may be degraded or disabled.
The database must not be pushed into collapse.
Accepted async work must remain durable.
Traffic shedding must be policy-based.
A bounded queue backlog is acceptable if demonstrably draining.
```

Potential controls:
- traffic class priority
- load shedding
- API concurrency
- cache strategy
- DB connection budget
- optional feature disable
- async deferral
- worker concurrency
- regional routing
- admission control

Required:
- at least 3 meaningful interventions for a strong path
- at least 3 real pressure-transfer mechanics
- recovery lag across at least 2 subsystems
- a legitimate degraded-but-safe state
- at least 2 materially distinct strong strategies

The key question is:

```text
What do I intentionally sacrifice to protect the business-critical path?
```

## 8. Scenario 80 — Cascading Failure Across Shared Platform

Slug:

```text
cascading-failure-across-shared-platform
```

Difficulty:

```text
principal
```

This should be the hardest scenario in the current IncidentRank catalog.

Architecture:

```text
Product A
Product B
Product C
   ↓
Shared Gateway
   ↓
Shared Identity
   ↓
Shared Metadata
   ↓
Shared Messaging
   ↓
Shared Database
```

Target 10–15 meaningful components if load-bearing additions are needed.

Incident: a problem begins in one shared dependency and propagates across several products. The loudest failing product must not necessarily be the root cause.

Candidate must determine:
- true root failure domain
- which product is amplifying the incident
- which shared dependency to protect first
- which product/traffic to isolate
- recovery ordering
- restoration ordering

Business invariants:

```text
A single product must not exhaust shared-platform capacity for every product.
Critical identity correctness must be preserved.
Shared metadata/database durability must not be traded away for short-term availability.
Products may be intentionally degraded or isolated to protect the platform.
Recovery of the root dependency does not mean downstream backlogs and retry pressure have already cleared.
```

Potential controls:
- product-specific isolation
- product priority
- gateway admission
- retry policy by product
- messaging consumer concurrency
- metadata read/write policy
- DB connection budget
- shared dependency circuit breaker
- product restoration order
- async workload deferral

No single action may resolve the incident.

Strong path should roughly require:

```text
identify root/shared failure
→ isolate amplifier
→ protect shared dependency
→ drain/contain secondary backlog
→ observe recovery
→ restore products in deliberate order
```

Required:
- multiple subsystem recovery lags
- strong sequencing
- same eventual controls / different order → different safety outcome
- at least 2 legitimate strong approaches if possible
- wrong-root/loudest-product trap
- unsafe early restoration trap

If the scenario can be solved by clicking the control associated with the reddest metric, redesign it.

## 9. Batch Complexity Requirements

Across 76–80:

```text
all 5 multi-step
at least 4 sequencing-sensitive
all 5 contain pressure transfer
all 5 contain recovery lag
at least 3 contain historical/cumulative damage or irreversible consequence
at least 4 contain legitimate degraded-but-safe states
at least 4 support alternate strong paths
#79 and #80 require at least 3 meaningful interventions for strong resolution
```

Do not fabricate behavior to satisfy counts. Document honest deviations.

## 10. Timeline Causality Clarity

Carry forward the 6D.3 UX observation.

Timeline text should make clear whether an event is:
- external incident progression
- candidate-action consequence
- elapsed recovery behavior

Prefer clearer authored wording over new shared event types.

Verifier must inspect this for all five.

## 11. Completion Modes

Audit after authoring.

Do not force candidate_declared.

For candidate-declared scenarios, define whole-system:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

No fake acceptable tiers.

## 12. Immediate-Finish Audit

For every candidate-declared scenario:

```text
incident triggered
zero actions
Finish
```

Expected: `declared_unstable`, unless an explicitly justified observation-only sustained-stability strategy exists.

## 13. Historical Damage Doctrine

Where applicable:

```text
root cause fixed
≠
damage erased
```

Separate:
- current health
- historical damage
- recoverable backlog
- irreversible consequence

Tests must prove non-reset behavior where claimed.

## 14. Pressure Transfer

Every scenario must have real authored transfer with measurable consequences.

Examples:

```text
#76 backfill concurrency → DB locks
#77 scale symptom service → memory pressure persists/transfers
#78 rollback/traffic movement → incompatible state/read pressure
#79 concurrency/worker/cache choices → DB/queue/regional pressure
#80 consumer/product scaling → shared DB/messaging/gateway pressure
```

## 15. Recovery Lag

All five should model lagging recovery where semantically appropriate:

```text
#76 DB pressure / backfill queue stabilization
#77 GC/in-flight heap decay
#78 data repair / regional compatibility convergence
#79 queue drain / cache warmup / DB recovery
#80 backlog drain / DB pressure / product restoration
```

No instant whole-system green after one good action.

## 16. Scoring

Use only the shared six dimensions:

```text
Recovery                 300
Customer Impact          200
Data Integrity           200
Reliability              150
Cost Efficiency          100
Operational Efficiency    50
                         ----
                         1000
```

For every scenario report exact executed:
- optimal
- acceptable if real
- baseline
- harmful
- alternate strong path(s)

No "see test file."

## 17. Score Sanity Audit

Each author must verify:
- harmful < baseline where harmful is truly worse
- correctness/security-violating availability path heavily penalized
- acceptable does not dominate optimal without reason
- zero-action baseline not suspiciously high
- alternate strategies score according to tradeoffs
- fixing current config after historical damage cannot restore near-perfect score improperly

Any tie must be justified.

## 18. Action Feedback

100% coverage for meaningful action-classification rules.

Feedback should explain:
- what changed
- what improved
- where pressure moved
- what invariant was protected/violated
- what historical consequence was created
- what remains unresolved

## 19. Author Self-Verification

Before DONE, every author must provide evidence for:

```text
scenario tests
definition validation
control-usage audit
dead-control grep
classification/feedback coverage
scoring path execution
immediate-Finish behavior
determinism
duplicate-mechanism audit
timeline causality wording
Principal-level acceptance test
```

## 20. Independent Verifier Contract

Each verifier must inspect actual files and run tests.

Return VERIFIED or REJECTED with evidence for:

1. all required files exist
2. definition validates
3. metadata/difficulty correct
4. architecture readable
5. duplicate audit credible
6. every control used
7. every control tested
8. no dead controls
9. business invariants candidate-visible
10. multi-step behavior genuine
11. sequencing real where claimed
12. pressure transfer real
13. recovery lag real
14. historical damage non-resetting where claimed
15. completion mode justified
16. immediate Finish safe
17. scoring paths execute
18. harmful path harmful
19. alternate path real
20. feedback coverage complete
21. determinism passes
22. timeline causality clear
23. scenario genuinely Senior Staff/Principal
24. random control-mashing is not enough

Any dead control or fake complexity = REJECT.

## 21. Fix-Agent Rule

If rejected, use a fresh scoped fix-agent, not the original author.

Then orchestrator must re-grep, re-run scenario tests, and re-run verifier checks before shared wiring.

## 22. Manual QA

Run live browser QA for all five:

```text
A. Backfill Overwhelms Production
B. Multi-Service Memory Pressure Incident
C. Global Feature Rollout Incident
D. Capacity Exhaustion During Peak Event
E. Cascading Failure Across Shared Platform
```

Verify:
- architecture readable
- business invariants visible
- first mitigation not magical
- pressure transfer observable
- sequencing observable
- recovery lag visible
- historical damage correct
- safe degraded modes work
- harmful availability-maximizing path fails correctly
- Finish semantics correct
- post-incident feedback only
- timeline causality understandable

## 23. Flagship QA — Scenario 79

Live test at least:

```text
1. zero-action baseline
2. naive capacity/concurrency escalation
3. safe degraded-mode path
4. one alternate strong path
5. premature restore / pressure-transfer trap if authored
```

Confirm candidate must preserve business-critical traffic rather than maximize total throughput.

## 24. Flagship QA — Scenario 80

Live test at least:

```text
1. zero-action baseline
2. wrong-root-cause / loudest-product mitigation
3. correct first containment
4. secondary pressure transfer
5. backlog/recovery lag
6. correct restoration order
7. unsafe restoration order
8. alternate strong path
```

Confirm fixing the root dependency does NOT instantly restore the full platform.

## 25. Catalog Wiring

Authors/verifiers must not touch:
- `packages/scenarios/src/library/catalog.ts`
- `packages/scenarios/src/index.ts`
- shared simulator
- shared scoring
- shared architecture types

Only orchestrator wires after verification.

Expected:

```text
80 built-in scenarios
3 free
77 paid
```

## 26. Validation

Run:

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

Required: 0 failing tests.

Expected seed:

```text
Seed complete (80 built-in scenario(s)).
```

## 27. Phase 6D.4 Completion Report

Return:

1. exact scenarios 76–80
2. files created/modified
3. duplicate-mechanism audit per scenario
4. difficulty classifications
5. architecture node/edge counts
6. flat-readability verdict
7. whether architecture grouping is finally justified
8. author control-usage audit tables
9. verifier dead-control audit
10. completion modes
11. unsafe/acceptable/optimal states
12. business invariants
13. historical-damage model
14. multi-step path
15. sequencing audit
16. pressure-transfer audit
17. recovery-lag audit
18. timeline-causality audit
19. tempting unsafe paths
20. legitimate degraded modes
21. alternate strong paths
22. immediate-Finish audit
23. exact scoring table for all 5
24. suspicious-score investigations
25. feedback coverage
26. test count per scenario
27. verifier verdicts
28. fix-agent changes if any
29. orchestrator verification
30. Manual QA #76
31. Manual QA #77
32. Manual QA #78
33. Flagship QA #79
34. Flagship QA #80
35. package tests
36. full test count
37. typecheck
38. lint
39. build
40. seed
41. deviations
42. product/UX concerns
43. Senior Staff/Principal quality assessment
44. recurring authoring-process issues
45. Phase 6D overall quality assessment across scenarios 61–80

## 28. Phase 6D Overall Review

Because this is the final 6D batch, include a retrospective across scenarios 61–80:

```text
How many Principal?
How many Senior Staff?
How many Staff?
How many candidate_declared?
How many automatic?
How many have acceptable tiers?
How many have historical-damage mechanics?
How many are sequencing-sensitive?
How many support alternate strong paths?
How many required architecture grouping?
How many verifier rejections occurred across 6D.1–6D.4?
How many dead controls occurred before/after the author-side audit?
```

Also identify:

```text
Top 5 strongest scenarios in Phase 6D
Top 3 scenarios needing future polish
Any repeated mechanism/theme becoming overrepresented
Any content gap to prioritize in scenarios 81–100
```

Do not begin those scenarios yet.

## 29. Stop Condition

Phase 6D is complete only when:

```text
80 built-in scenarios exist
3 free
77 paid
scenarios 76–80 fully authored
all 5 independently verified
all 5 manually QA'd
#79 flagship QA complete
#80 flagship QA complete
control audit clean
all tests green
seed reports 80
Phase 6D retrospective complete
```

Stop.

Do not begin Phase 6E / scenarios 81–100 until the Phase 6D.4 completion report is reviewed.

## Final Quality Bar

Scenario 79 should make the candidate think:

```text
What do I intentionally sacrifice to protect the business-critical path?
```

Scenario 80 should make the candidate think:

```text
Which failure is actually causal?
Which product is amplifying the incident?
What shared dependency must I protect first?
What pressure remains after the root cause is fixed?
What can I restore safely now?
What must wait?
```

If those questions are not necessary to succeed, the scenarios are not yet Principal-level enough.
