# IncidentRank — Phase 6E.4 Batch Script

## Scope

Implement and verify exactly these five Phase 6E scenarios:

```text
96 Privacy Deletion Backlog
97 Audit Log Integrity Failure
98 Certificate Expiry Across Large Fleet
99 Emergency Capacity Reservation Decision
100 Enterprise-Wide Dependency Deprecation
```

Do not begin any post-100 scenario authoring automatically.

Phase 6E.1, 6E.2, and 6E.3 are approved.

Current baseline:

```text
95 built-in scenarios
3 free
92 paid
```

Expected after this batch:

```text
100 built-in scenarios
3 free
97 paid
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
→ Phase 6E closeout review
```

---

# 1. Batch Purpose

This final Phase 6E batch must prove IncidentRank can evaluate:

```text
privacy operations
auditability
long-horizon remediation
deadline risk
operational governance
proactive capacity planning
multi-team migration strategy
```

without turning every problem into an outage.

This batch should feel materially different from Phase 6D and from the earlier Phase 6E batches.

---

# 2. Alternate Strong Path Target

Current Phase 6E alternate-path count after 6E.3:

```text
11 of 15
```

Overall target:

```text
at least 12 of 20
```

So this batch needs only:

```text
1 of 5
```

to meet the minimum.

Do not force fake alternatives.

However, several scenarios here naturally should support multiple defensible strategies:

```text
#96 staged backlog burn-down vs priority-based deletion handling
#98 cohort-first vs dependency-first rotation strategy
#99 higher-cost reservation vs conservative reservation + fallback
#100 rollback/dual-support/staged migration strategy variants
```

Prefer genuine alternatives where the domain naturally supports them.

---

# 3. Binding Author Control Audit

Before DONE, every author must produce:

| Control | Referenced in rules.ts | Exercised by tests | Action classification/feedback | Notes |
|---|---|---|---|---|

Every control must:

```text
participate in real logic
be exercised in tests
have classification/feedback where meaningful
```

Dead control:

```text
wire it into a legitimate mechanic
or
remove it
```

Independent verifier repeats the audit.

Any dead control found by verifier:

```text
REJECT
```

---

# 4. Sibling-Batch Adjacency Audit

Carry forward the Phase 6E.3 process improvement.

Each author must compare its scenario against:

```text
all 95 pre-existing scenarios
AND
the other 4 scenarios in this same batch
```

Return:

```text
Closest prior scenarios:
Closest sibling scenario:
Distinct root mechanism:
Distinct dominant mitigation:
Distinct judgment axis:
Why this is not a reskin:
```

No sibling-batch adjacency should be discovered only by a verifier.

---

# 5. Scenario 96 — Privacy Deletion Backlog

Slug:

```text
privacy-deletion-backlog
```

Difficulty:

```text
senior_staff
```

## Architecture

Suggested:

```text
Deletion Requests
      ↓
Privacy API
      ↓
Workflow Queue
      ↓
Product Databases
Analytics Store
Backup Index
```

## Incident

User deletion requests are being accepted successfully, but downstream deletion execution is falling behind.

Availability is healthy.

The real risk is:

```text
deadline miss
incomplete deletion
cross-system inconsistency
false "completed" state
```

## Business invariants

```text
Accepted deletion requests must eventually complete across every required system.

A request must never be marked complete while required downstream stores remain undeleted.

Regulatory/policy deadlines matter and are candidate-visible.

Critical overdue requests may be prioritized.

Backups/indexes may have different allowed deletion semantics, but they must be explicitly tracked.
```

## Candidate-visible metrics

Suggested:

```text
deletion backlog
oldest request age
percent completed end-to-end
product DB completion
analytics-store completion
backup-index completion
deadline-risk count
false-complete count
```

## Controls

Potential:

- queue priority policy
- deletion worker allocation
- downstream system order
- retry policy
- completion-marking policy
- high-risk request priority
- backup/index processing mode

Keep only real controls.

## Strong judgment

Candidate must distinguish:

```text
request accepted
from
deletion actually completed
```

## Unsafe paths

Examples:

```text
mark complete early
skip analytics store
ignore backup/index obligations
prioritize only newest/easiest requests while oldest breach deadline
```

## Historical consequence

Required.

Examples:

```text
cumulative deadline-breached requests
cumulative false-completion count
```

These must not self-reset.

## Alternate strong paths

Encouraged:

```text
A. prioritize oldest/deadline-nearest requests first

B. prioritize high-risk/legal-class requests while keeping bounded SLA for the rest
```

if semantics support both honestly.

---

# 6. Scenario 97 — Audit Log Integrity Failure

Slug:

```text
audit-log-integrity-failure
```

Difficulty:

```text
principal
```

## Architecture

Suggested:

```text
Services
   ↓
Audit Logger
   ↓
Event Stream
   ↓
Immutable Store
   ↓
Compliance Reports
```

Optional:

```text
Reconciliation Worker
```

if needed.

## Incident

Application traffic is healthy.

But audit events are:

```text
missing
duplicated
out-of-order
or partially unverifiable
```

The platform remains "up" while evidence integrity is broken.

## Business invariants

```text
Audit evidence must be complete enough to establish who did what and when.

Duplicate events must not silently count as multiple real actions.

Missing events must not be fabricated.

Ordering may be reconstructed only from trustworthy evidence.

Immutable history must not be rewritten to make reports look clean.

A bounded reporting delay is acceptable if integrity is preserved.
```

## Candidate-visible metrics

Suggested:

```text
event completeness %
duplicate rate
ordering confidence
immutable-store append success
reconciliation backlog
report trust status
tamper-evidence status
```

## Controls

Potential:

- report publication mode
- reconciliation mode
- duplicate handling
- ordering reconstruction
- fallback evidence source
- ingestion pause
- immutable-store policy
- audit gap acknowledgement

## Principal-level requirement

The candidate must understand:

```text
availability of the application
≠
integrity of the audit trail
```

## Unsafe path

Publishing a "clean" compliance report by dropping unverifiable events should look operationally convenient but be unacceptable.

## Historical consequence

Required.

Examples:

```text
unverifiable-event count
incorrectly-certified-report count
```

No self-reset.

## Alternate strong paths

At least two if valid:

```text
A. pause report publication and reconcile

B. publish bounded "incomplete/unverified" status while repairing evidence
```

Both must preserve integrity.

---

# 7. Scenario 98 — Certificate Expiry Across Large Fleet

Slug:

```text
certificate-expiry-across-large-fleet
```

Difficulty:

```text
senior_staff
```

## Architecture

Suggested:

```text
Certificate Authority
      ↓
Secret Distribution
      ↓
Service Fleet
      ↓
Load Balancers
      ↓
External Clients
```

Potential cohorts:

```text
legacy cohort
modern cohort
critical cohort
```

## Incident

Certificates are approaching expiry across a large fleet.

Different cohorts have:

```text
different rotation capability
different rollout speed
different dependency risk
```

This should represent a multi-day operational remediation inside a normal play session.

## Business invariants

```text
No critical cohort may cross the expiry deadline.

New certificates must be verifiably installed before old certificates are withdrawn.

Legacy cohorts may require temporary overlap.

Broad validation bypass is not acceptable.

Deadline risk must be explicitly tracked by cohort.
```

## Multi-stage horizon

Use deterministic authored phases such as:

```text
T-72h
T-24h
T-6h
T-1h
expiry
```

No real wall-clock waiting.

## Controls

Potential:

- rotation order
- certificate overlap window
- cohort rollout mode
- old-cert revocation timing
- trust-bundle update
- load-balancer certificate mode
- legacy compatibility bridge

## Sequencing

Required.

Same eventual config in wrong order should be unsafe.

Example:

```text
revoke old cert
before
legacy cohort verifies new trust
```

## Alternate strong paths

Encouraged:

```text
A. modern cohorts first, legacy overlap last

B. critical cohorts first, then bulk fleet
```

provided both are operationally defensible.

---

# 8. Scenario 99 — Emergency Capacity Reservation Decision

Slug:

```text
emergency-capacity-reservation-decision
```

Difficulty:

```text
principal
```

This is a proactive decision scenario.

There may be no outage at incident start.

## Architecture

Suggested:

```text
Demand Forecasting
       ↓
Capacity Planner
       ↓
Region A
Region B
Region C
       ↓
Reserved Capacity
On-Demand Capacity
```

Optional:

```text
Critical Product Tier
Optional Product Tier
```

if needed.

## Incident

A major future event is approaching.

Demand forecast is uncertain.

Candidate must decide how much expensive reserved capacity to lock in before a deadline.

Tradeoffs:

```text
under-reserve
→ outage / business loss risk

over-reserve
→ major wasted spend

regional imbalance
→ hidden concentration risk
```

## Business invariants

```text
Critical workload must have enough protected capacity under the authored demand band.

Optional workload may use on-demand or be degraded.

Reservations have real cost and may be non-refundable.

Capacity concentration in one region must remain inside the stated resilience policy.

Forecast uncertainty must be treated explicitly, not ignored.
```

## Candidate-visible metrics

Suggested:

```text
forecast range
reservation cost
capacity by region
headroom under p50/p90/p99 demand
on-demand exposure
critical workload protection
wasted reserved capacity
```

## Controls

Potential:

- reserved capacity by region
- on-demand fallback policy
- optional-workload shedding
- forecast confidence threshold
- reservation timing
- regional balance
- contingency reserve

## Required alternate strong paths

At least two.

Examples:

```text
A. higher reservation, lower operational risk

B. moderate reservation + explicit on-demand fallback + optional workload degradation
```

Both safe, different economic profiles.

## Unsafe paths

```text
cheapest reservation that violates critical headroom

all reservation concentrated in one region

maximal reservation with no regard for waste may be safe but economically poor
```

## Completion

Likely candidate-declared.

This scenario should make Cost Efficiency and Reliability genuinely compete.

---

# 9. Scenario 100 — Enterprise-Wide Dependency Deprecation

Slug:

```text
enterprise-wide-dependency-deprecation
```

Difficulty:

```text
principal
```

This is the **Phase 6E flagship** and should be one of the strongest scenarios in the entire catalog.

## Architecture

Suggested:

```text
Product A
Product B
Product C
Product D
    ↓
Shared SDK
    ↓
Deprecated External API
    ↓
Replacement API
```

Potential:

```text
Compatibility Layer
Migration Coordinator
```

if load-bearing.

Target:

```text
8–12 meaningful nodes
```

Flat architecture first.

## Incident

A critical external dependency has a hard deprecation deadline.

Different products are at different migration stages:

```text
Product A migrated
Product B partially migrated
Product C blocked by compatibility issue
Product D untouched
```

The old API will stop working at a known deadline.

The candidate must plan and execute:

```text
migration order
temporary compatibility
dual support
testing
rollback
deadline-risk management
product prioritization
```

This is not a classic outage.

## Business invariants

```text
No critical product may remain dependent on the deprecated API past the hard deadline.

A product must not be marked migrated until compatibility and correctness checks pass.

Dual-support may be temporary but cannot become indefinite hidden debt.

A shared compatibility layer must not become a permanent single point of failure.

Migration order should reflect business criticality and technical dependency risk.

Deadline risk must remain candidate-visible.
```

## Multi-stage horizon

Required.

Represent the operational horizon as deterministic phases such as:

```text
T-30d
T-14d
T-7d
T-48h
T-12h
deadline
```

No wall-clock delay.

## Candidate-visible metrics

Suggested:

```text
products migrated
products verified
deprecated-API traffic %
replacement-API error rate
compatibility exceptions
deadline-risk count
dual-support cost
critical-product migration status
rollback readiness
```

## Controls

Potential:

- migration order
- product cohort
- compatibility mode
- dual-support mode
- replacement traffic percentage
- rollback readiness
- deprecation traffic block
- migration verification
- product freeze
- deadline escalation mode

Keep the control count understandable.

## Principal-level requirement

No single control or single product migration may resolve the scenario.

Strong path should require roughly:

```text
identify critical product/dependency ordering
→ establish compatibility/verification
→ migrate low-risk or prerequisite cohorts
→ handle blocked product
→ reduce deprecated-API traffic
→ verify rollback/fallback readiness
→ complete critical migrations before deadline
```

## Tempting unsafe paths

Required:

1. mark products migrated without verification
2. migrate all products at once
3. leave dual-support indefinitely
4. wait too long because current API is still healthy
5. force deadline cutover while a critical product remains incompatible

## Alternate strong paths

Required.

At least 2 materially distinct strategies, for example:

```text
A. compatibility-layer-first staged migration

B. product-by-product direct migration with targeted temporary dual-support
```

Potential third:

```text
critical-product-first vs dependency-prerequisite-first
```

if semantics genuinely support both.

## Historical consequence

Required.

Examples:

```text
missed verification count
deadline-risk exposure
failed forced-cutover count
compatibility-debt accumulated
```

## Recovery / lag

Required through:

```text
verification windows
traffic-drain windows
compatibility convergence
```

## Flagship acceptance test

If the candidate can solve this by:

```text
migrate everything
then click Finish
```

the scenario fails.

It must require real governance and sequencing judgment.

---

# 10. Long-Horizon Design Requirement

Scenarios 98–100 must use deterministic simulated time phases.

Preferred representation:

```text
T-minus checkpoints
deadline phases
migration windows
verification windows
```

Do not add new engine capability unless current timed events truly cannot represent it.

If a new generic primitive is genuinely required, return a design note before modifying shared engine types:

```text
Problem:
Why existing timed events fail:
Smallest generic extension:
Backward compatibility:
UI impact:
Tests:
```

No speculative shared work.

---

# 11. Compliance / Privacy Doctrine

For #96/#97:

Do not test legal trivia.

Candidate-facing briefing must state the actual policy/invariant.

The candidate is being tested on:

```text
operational judgment
completeness
auditability
deadline handling
evidence integrity
```

not memorization of GDPR/CCPA/SOX/HIPAA specifics.

---

# 12. Cost / Risk Doctrine

For #99 and potentially #100:

Two technically safe paths may differ materially on cost.

Use the fixed six scoring dimensions only:

```text
Recovery                 300
Customer Impact          200
Data Integrity           200
Reliability              150
Cost Efficiency          100
Operational Efficiency    50
```

Do not create new dimensions.

For #99, Cost Efficiency must be a real discriminator.

For #100, cost may matter but should not outweigh deadline/correctness risk.

---

# 13. Batch Complexity Requirements

Across 96–100:

```text
all 5 multi-step or policy-sequenced

at least 3 with genuine alternate strong paths

at least 3 with historical/cumulative consequence

at least 3 with simulated multi-stage/deadline progression

at least 4 where availability is not the primary objective

at least 3 with explicit governance/policy constraints

at least 2 with proactive/pre-outage decision-making

#100 requires at least 4 meaningful interventions for strong resolution
```

Do not fabricate behavior to satisfy counts.

Document honest deviations.

---

# 14. Completion Modes

Audit individually.

Likely all candidate-declared, but do not force.

For candidate-declared scenarios define real:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

where appropriate.

No fake acceptable tier.

---

# 15. Immediate-Finish Audit

For every candidate-declared scenario:

```text
trigger scenario
zero actions
Finish
```

Expected:

```text
declared_unstable
```

For proactive/no-outage scenarios (#98/#99/#100 early phases):

```text
green system
≠
safe handback
```

if deadline/risk remains unresolved.

---

# 16. Default-Value Path Completeness Audit

Carry forward the #90/#91 lesson.

For every scenario, authors and verifiers must explicitly test:

```text
meaningful candidate action combinations
performed before sustained/deadline triggers
```

and confirm they do not fall through to:

```text
healthy-default
baseline-default
unrelated state
```

Every meaningful control combination must map to an intentional authored state.

This is binding.

---

# 17. Timeline Causality Labels

Continue the standardized prefixes:

```text
EXTERNAL PROGRESSION:
HISTORICAL CONSEQUENCE:
CANDIDATE-ACTION CONSEQUENCE:
ELAPSED RECOVERY:
DEADLINE PROGRESSION:
```

Use them where appropriate.

For #98/#99/#100, deadline/milestone progression must be especially clear.

---

# 18. Action Feedback

100% meaningful coverage.

Feedback should explain:

```text
what changed
what invariant was preserved/violated
what deadline risk moved
what historical consequence was created
what remains incomplete
what tradeoff was accepted
```

No generic "good choice" feedback.

---

# 19. Score Integrity Requirement

Return exact executed scores for every scenario:

```text
primary optimal
alternate strong/optimal
acceptable
baseline
harmful
major deadline-miss or unsafe-policy path
```

For each significant path include:

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

No placeholders.

Any OPTIMAL-below-ACCEPTABLE divergence must be:

```text
explicitly investigated
dimension-by-dimension
permanently regression-tested
```

before the completion report is submitted.

Do not repeat the 6E.3 reporting mistake.

---

# 20. Independent Verifier Contract

Each verifier returns VERIFIED or REJECTED with evidence for:

1. all required files exist
2. definition validates
3. difficulty correct
4. architecture readable
5. prior-scenario duplicate audit credible
6. sibling-batch adjacency audit credible
7. every control used
8. every control tested
9. no dead controls
10. no default-value fallthrough gaps
11. business invariants visible
12. scenario is not an outage reskin
13. long-horizon mechanic real where claimed
14. deadline progression deterministic
15. historical consequence non-resetting
16. alternate path genuine where claimed
17. completion mode justified
18. immediate Finish safe
19. score evidence exact
20. harmful path harmful
21. any tier/score divergence explicitly justified
22. feedback coverage complete
23. determinism passes
24. difficulty justified
25. random control-mashing insufficient
26. no fake "green = safe" shortcut

Any dead control, false default path, fake alternate path, or hidden score inconsistency:

```text
REJECT
```

---

# 21. Fix-Agent Rule

If rejected:

```text
fresh scoped fix-agent
not original author
```

Then:

```text
orchestrator re-grep
scenario tests
verifier re-check
```

before wiring.

---

# 22. Manual QA Priority

Run live QA for:

```text
96 Privacy Deletion Backlog
97 Audit Log Integrity Failure
98 Certificate Expiry Across Large Fleet
99 Emergency Capacity Reservation Decision
100 Enterprise-Wide Dependency Deprecation
```

Because this is the final batch, QA all five.

Verify:

- architecture readable
- business invariants visible
- availability-green scenarios feel intentionally different
- deadline progression understandable
- historical consequences persist
- alternate strategies feel real
- Finish semantics correct
- timeline causality clear
- post-incident feedback only

---

# 23. Manual QA — #96

Test at least:

```text
1. zero-action backlog growth
2. oldest/deadline-risk prioritization
3. false-complete harmful path
4. incomplete downstream deletion path
5. strong recovery path
```

Confirm accepted requests are not mistaken for completed deletion.

---

# 24. Manual QA — #97

Test at least:

```text
1. zero-action application-green baseline
2. clean-report-by-dropping-evidence trap
3. reconciliation path
4. bounded unverified-report safe degraded path
5. full evidence-integrity recovery
```

Confirm:

```text
application availability can remain perfect
while
audit integrity makes the state unsafe
```

---

# 25. Manual QA — #98

Test at least:

```text
1. T-72h no-action
2. premature old-cert revocation
3. safe staged cohort rotation
4. alternate rotation order if authored
5. near-deadline recovery
6. deadline miss
```

Confirm the simulated time horizon is clear and deterministic.

---

# 26. Manual QA — #99

Test at least:

```text
1. under-reserve cheap path
2. over-reserve expensive-but-safe path
3. balanced reservation strong path
4. alternate safe strategy
5. regional concentration risk
```

Report:

```text
reservation cost
protected headroom
wasted capacity
final score
```

Candidate should experience:

```text
cheapest != safest
and
safest != most economically efficient
```

---

# 27. Flagship QA — #100

Test at least:

```text
1. T-30d zero-action baseline
2. mark-migrated-without-verification trap
3. migrate-all-at-once trap
4. compatibility-layer-first strong path
5. product-by-product direct migration strong path
6. dual-support debt trap
7. blocked critical product handling
8. near-deadline state
9. forced cutover with unresolved incompatibility
10. full successful migration before deadline
```

Confirm:

```text
no single action resolves the scenario

deadline risk remains visible

migration verification is mandatory

same final product count can be safe or unsafe depending on history/verification

dual-support cannot remain an indefinite hidden workaround
```

---

# 28. Catalog Wiring

Authors/verifiers must not touch:

```text
packages/scenarios/src/library/catalog.ts
packages/scenarios/src/index.ts
shared simulator
shared scoring
shared architecture types
```

Only orchestrator wires after verification.

Expected:

```text
100 built-in scenarios
3 free
97 paid
```

---

# 29. Validation

Run:

```text
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test
```

Then:

```text
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

Expected seed:

```text
Seed complete (100 built-in scenario(s)).
```

---

# 30. Phase 6E.4 Completion Report

Return:

1. exact scenarios 96–100
2. files created/modified
3. duplicate-mechanism audits
4. sibling-batch adjacency audits
5. difficulty classifications
6. architecture node/edge counts
7. flat-readability verdict
8. author control-usage audits
9. verifier dead-control audits
10. default-value path completeness audit
11. completion modes
12. unsafe/acceptable/optimal states
13. business invariants
14. primary judgment axis
15. historical-damage model
16. multi-step/policy paths
17. sequencing audit
18. recovery-lag audit
19. pressure-transfer audit or N/A
20. long-horizon/deadline audit
21. timeline-causality audit
22. tempting unsafe paths
23. legitimate degraded modes
24. alternate strong paths
25. final Phase 6E alternate-path count
26. immediate-Finish audit
27. exact scoring tables
28. suspicious-score investigations
29. feedback coverage
30. test count per scenario
31. verifier verdicts
32. fix-agent changes
33. orchestrator verification
34. Manual QA #96
35. Manual QA #97
36. Manual QA #98
37. Manual QA #99
38. Flagship QA #100
39. package tests
40. full test count
41. typecheck
42. lint
43. build
44. seed
45. deviations
46. product/UX concerns
47. difficulty-quality assessment
48. Phase 6E thematic-diversity assessment
49. recurring authoring-process issues
50. final Phase 6E quality assessment

---

# 31. Phase 6E Overall Review

Because this is the final Phase 6E batch, include a retrospective across scenarios 81–100.

Report:

```text
Total Principal
Total Senior Staff
Total Staff

candidate_declared count
automatic count

alternate strong-path count
historical-damage count
sequencing-sensitive count
multi-stage/deadline count

security scenarios
cost-primary scenarios
internal data/ML scenarios
compliance/privacy scenarios
proactive/no-outage scenarios

dead controls found before fix
dead controls remaining
verifier rejections
fix-agent dispatches
default-value path defects found
```

Also identify:

```text
Top 5 strongest Phase 6E scenarios
Top 3 needing future polish
Most repeated decision pattern
Most underrepresented decision pattern
Any new engine/UI need actually proven by scenarios 81–100
Any content gap remaining after 100 scenarios
```

---

# 32. Product-Level Acceptance Test

Before declaring Phase 6E complete, answer:

```text
If a candidate practices scenarios 61–100,
do they encounter genuinely different decision archetypes?

Or do they mostly learn:
find bottleneck → scale/throttle → wait?
```

Phase 6E succeeds only if the first answer is clearly true.

The final review should explicitly assess whether IncidentRank now evaluates:

```text
security policy
authorization
fraud/abuse risk
cost efficiency
data trust
ML operations
privacy/compliance
auditability
long-horizon remediation
proactive capacity planning
enterprise migration governance
```

using the same generic deterministic engine.

---

# 33. Stop Condition

Phase 6E is complete only when:

```text
100 built-in scenarios exist
3 free
97 paid

96–100 fully authored
all independently verified
all five manually QA'd
#100 flagship QA complete

control audits clean
default-value path audits clean
exact score evidence complete
all tier/score divergences explicitly justified
all tests green
seed reports 100

Phase 6E retrospective complete
product-level acceptance test answered
```

Stop.

Do not begin scenarios 101+ automatically.

---

# Final Quality Bar

Scenario 96 should make the candidate ask:

```text
Did the deletion actually complete everywhere, or did we only accept the request?
```

Scenario 97:

```text
Can I trust the evidence, not just the application uptime?
```

Scenario 98:

```text
What must be rotated now, and what must remain valid until verification catches up?
```

Scenario 99:

```text
How much resilience should I buy under uncertainty, and what am I willing to pay for it?
```

Scenario 100:

```text
What must migrate first?
What can remain on temporary compatibility?
What cannot cross the deadline?
What evidence proves a product is actually migrated?
When does a temporary workaround become dangerous debt?
```

If these questions are not necessary to succeed, the batch is not complete.
