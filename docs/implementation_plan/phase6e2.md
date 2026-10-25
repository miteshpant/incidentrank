# IncidentRank — Phase 6E.2 Batch Script

## Scope

Implement and verify exactly these five Phase 6E scenarios:

```text
86 Runaway Cloud Spend During Healthy Traffic
87 Cross-Region Replication Cost Explosion
88 Overprovisioned Resilience During Low-Risk Period
89 Expensive Retry and Logging Amplification
90 Model Feature Freshness Degradation
```

Do not begin Phase 6E.3.

Phase 6E.1 is approved.

Current baseline:

```text
85 built-in scenarios
3 free
82 paid
```

Expected after this batch:

```text
90 built-in scenarios
3 free
87 paid
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
→ Staff/Senior Staff/Principal review gate
```

---

# 1. Batch Purpose

This batch must prove IncidentRank can evaluate:

```text
cost efficiency
resource economics
quality vs cost
freshness vs spend
risk appetite
safe rightsizing
internal data quality
```

without falling back to:

```text
find bottleneck
→ scale service
→ wait
```

Cost Efficiency must be a **first-class judgment axis** in this batch, not decorative.

---

# 2. Alternate Strong Path Planning Constraint

Phase 6E strategy target:

```text
at least 12 of 20 scenarios
support more than one defensible strong strategy
```

Current after 6E.1:

```text
1 of 5
```

Therefore scenarios 86–100 need at least:

```text
11 of 15
```

genuine alternate strong paths.

For this batch, target:

```text
at least 4 of 5 scenarios
with real alternate strong strategies
```

Do not force fake alternatives.

Prefer natural tradeoffs such as:

```text
cost vs resilience
regional vs global optimization
quality vs cost
staged vs immediate rightsizing
cache-heavy vs compute-heavy optimization
freshness vs serving quality
```

---

# 3. Binding Author-Side Control Usage Audit

Before any author reports DONE, provide:

| Control | Referenced in rules.ts | Exercised by tests | Action classification/feedback | Notes |
|---|---|---|---|---|

Every control must:

```text
participate in real rule logic
be exercised by tests
have classification/feedback where meaningful
```

Dead control:

```text
wire it into a legitimate mechanic
or
remove it
```

Independent verifier repeats the audit from scratch.

Any dead control found by verifier:

```text
REJECT
```

---

# 4. Duplicate-Mechanism Audit

Compare each scenario against all existing 85 built-ins.

Return:

```text
Closest existing scenarios:
Distinct root mechanism:
Distinct dominant mitigation:
Distinct judgment axis:
Why this is not a reskin:
```

Redesign if root mechanism + dominant mitigation are materially duplicated.

Pay special attention to:

```text
#86 vs autoscaling / API traffic / capacity scenarios
#87 vs cross-region latency / replication backlog / cache invalidation
#88 vs autoscaling failure / capacity exhaustion / regional failover
#89 vs retry storm / observability / dependency cascade scenarios
#90 vs data pipeline freshness / ML/data scenarios already present
```

---

# 5. Scenario 86 — Runaway Cloud Spend During Healthy Traffic

Slug:

```text
runaway-cloud-spend-during-healthy-traffic
```

Difficulty:

```text
senior_staff
```

## Architecture

Suggested:

```text
Clients
  ↓
API
  ↓
Autoscaler
  ↓
Worker Fleet
  ↓
Database
  ↓
Object Store
```

Optional:

```text
Cache
```

only if it creates a real economic tradeoff.

## Incident

The system is healthy.

Customer-facing:

```text
latency healthy
error rate healthy
throughput healthy
```

But infrastructure cost has increased dramatically after a recent deployment/config change.

Possible causes:

- autoscaler target changed
- worker utilization collapsed
- cache effectiveness decreased
- per-request compute work increased
- storage/egress grew
- unnecessary replicas remain active

The candidate must optimize cost **without manufacturing an outage**.

## Business invariants

```text
Customer SLOs must remain within the authored bound.

Critical redundancy may not be removed below the stated safety floor.

Rightsizing may occur gradually.

A temporary small latency increase may be acceptable if still inside SLO.

Cost reduction is a primary objective, not a secondary bonus.
```

## Candidate-visible metrics

Suggested:

```text
request latency
error rate
worker utilization
instance count
cost per minute
cost per request
database utilization
cache hit ratio if modeled
headroom
```

## Controls

Potential:

- autoscaler target utilization
- min replicas
- max replicas
- worker size/class
- cache policy
- request batching
- warm-pool size
- idle-capacity policy

Keep only controls with real authored consequences.

## Required design

At least two legitimate strong approaches, for example:

```text
A. gradual rightsizing + preserve redundancy

B. increase utilization via batching/caching + reduce fleet size later
```

Both should be safe but differ materially on:

```text
Cost Efficiency
Operational Efficiency
possibly Customer Impact
```

## Unsafe path

Aggressive cost-cutting should be able to:

```text
look economically excellent
while
destroying resilience/headroom
```

That path must not score as safe.

## Completion

Likely candidate-declared.

Safe handback requires:

```text
cost materially reduced
customer SLO intact
resilience floor preserved
```

---

# 6. Scenario 87 — Cross-Region Replication Cost Explosion

Slug:

```text
cross-region-replication-cost-explosion
```

Difficulty:

```text
senior_staff
```

## Architecture

Suggested:

```text
US Region
EU Region
APAC Region
   ↓
Replication Layer
   ↓
Primary Data Store
Archive / Object Storage
```

## Incident

A replication-policy change sharply increases:

```text
cross-region transfer
replication fan-out
storage duplication
```

Freshness improves, but cost explodes.

No outage exists.

Candidate must reason about:

```text
durability
freshness
regional recovery objective
egress cost
business-critical dataset classes
```

## Business invariants

```text
Critical data must retain the authored durability guarantee.

Freshness requirements differ by dataset class.

Not all data requires full active replication to every region.

A cost optimization must not silently weaken disaster-recovery guarantees below policy.

Archived/low-priority data may use slower replication where explicitly allowed.
```

## Controls

Potential:

- replication factor by class
- sync vs async replication
- region fan-out
- compression
- archive replication mode
- replication frequency
- critical-data pinning
- transfer batching

## Required alternate strategies

At least two, for example:

```text
A. reduce replication scope for low-priority data

B. preserve scope but move selected classes to async/batched replication
```

Both must satisfy durability/freshness bounds differently.

## Historical consequence

If the candidate weakens durability and an authored failure window occurs, record a real historical exposure/risk consequence.

Do not make this purely a current-state cost puzzle.

---

# 7. Scenario 88 — Overprovisioned Resilience During Low-Risk Period

Slug:

```text
overprovisioned-resilience-during-low-risk-period
```

Difficulty:

```text
staff
```

## Architecture

Suggested:

```text
Global Router
   ↓
Service Fleet
   ↓
Multi-AZ Capacity
   ↓
Database Primary
   ↓
Read Replicas
```

## Incident

Nothing is broken.

The platform is running with expensive resilience settings designed for a known high-risk period that has now ended.

Candidate must decide what can safely be reduced.

This is intentionally proactive and cost-oriented.

## Business invariants

```text
Minimum redundancy floor must be preserved.

Single-zone failure tolerance may not be removed if policy requires it.

Peak-event-only capacity may be reduced after the event.

Risk posture may be lowered only to the stated operating baseline.

Cost savings are valuable, but not at the expense of mandatory resilience.
```

## Controls

Potential:

- replica count
- warm capacity
- multi-AZ mode
- failover reserve
- standby fleet
- database replica class
- backup frequency
- prewarmed cache capacity

## Required alternate strategies

Prefer two legitimate approaches:

```text
A. reduce compute/standby capacity first

B. reduce data-plane overprovisioning while preserving compute headroom
```

Both should preserve the same mandatory resilience floor with different cost/risk tradeoffs.

## Unsafe path

A "minimum cost" configuration should violate the resilience floor while appearing healthy right now.

This is important:

```text
green dashboard
≠
safe operating posture
```

---

# 8. Scenario 89 — Expensive Retry and Logging Amplification

Slug:

```text
expensive-retry-and-logging-amplification
```

Difficulty:

```text
senior_staff
```

## Architecture

Suggested:

```text
API
 ↓
Worker
 ↓
External Dependency

API / Worker
 ↓
Logging + Telemetry Pipeline
 ↓
Log Store
```

## Incident

No major outage exists.

A recent config/deploy causes:

```text
higher retry frequency
verbose logging
duplicate telemetry
large payload logging
```

System health remains acceptable, but:

```text
logging cost
telemetry ingestion cost
dependency request cost
storage cost
```

rise dramatically.

Candidate must determine where observability is valuable vs wasteful.

## Business invariants

```text
Security/audit-required logs must remain intact.

Operational debugging signal must remain sufficient.

Retries must preserve correctness and bounded reliability.

Duplicate/noisy logs may be reduced.

Cost reduction must not blind operators or violate audit requirements.
```

## Controls

Potential:

- retry count
- retry ownership
- logging level
- sampling rate
- payload logging mode
- telemetry duplication
- retention mode
- dependency backoff

## Required alternate strategies

At least two legitimate:

```text
A. reduce retry amplification while preserving logging detail

B. preserve retries but aggressively reduce redundant/noisy telemetry
```

A third hybrid path may exist.

They should differ meaningfully on:

```text
Cost Efficiency
Reliability
Operational Efficiency
```

## Unsafe path

Turning off required logs completely should look cheap and healthy but violate audit/operational invariants.

---

# 9. Scenario 90 — Model Feature Freshness Degradation

Slug:

```text
model-feature-freshness-degradation
```

Difficulty:

```text
principal
```

This is the first major Phase 6E internal ML/data flagship.

## Architecture

Suggested:

```text
Source Data
   ↓
Feature Pipeline
   ↓
Feature Store
   ↓
Model Serving
   ↓
Decision API
```

Optional:

```text
Fallback Feature Store
Offline Snapshot
```

only if load-bearing.

## Incident

Model-serving uptime remains healthy.

But feature freshness degrades.

The model continues returning responses successfully while decision quality worsens.

Candidate must recognize:

```text
availability is green
but
decision quality is degrading
```

## Business invariants

```text
Decision quality must remain above the authored safety/business threshold.

Serving stale features beyond the allowed bound is not acceptable even if latency is perfect.

A bounded fallback model or feature set may be preferable to using stale high-quality features.

Model-serving uptime is not the primary objective.

Critical decisions may need to be delayed or downgraded rather than made from untrusted features.
```

## Candidate-visible metrics

Suggested:

```text
feature freshness age
feature pipeline lag
feature-store availability
model-serving latency
decision-quality proxy
fallback usage
critical-decision volume
stale-feature percentage
```

## Controls

Potential:

- feature fallback mode
- model routing
- stale-feature cutoff
- critical-decision hold
- pipeline priority
- feature refresh policy
- offline snapshot use
- model quality tier

## Required alternate strategies

At least two legitimate strong strategies:

```text
A. switch to lower-quality but fresh fallback features/model

B. hold critical decisions while allowing lower-risk traffic to continue with bounded stale data
```

Potential third:

```text
prioritize critical feature refresh classes
```

if semantics support it.

## Principal-level requirement

The candidate must reason about:

```text
decision quality
freshness
business risk
not just uptime
```

A candidate who maximizes serving availability while continuing to use dangerously stale features should fail.

## Historical consequence

If stale features are used for critical decisions, record a cumulative bad-decision exposure count or equivalent non-resetting consequence.

---

# 10. Cost-Efficiency Scoring Requirement

At least 4 of these 5 scenarios must make **Cost Efficiency materially important**.

For those scenarios:

```text
two technically safe paths
must differ meaningfully on cost
```

Do not let Cost Efficiency become a decorative 10-point variation.

Target meaningful differentials where semantics support them.

But do not distort the generic scorer or invent scenario-specific scoring code.

Use only the existing six dimensions:

```text
Recovery                 300
Customer Impact          200
Data Integrity           200
Reliability              150
Cost Efficiency          100
Operational Efficiency    50
```

---

# 11. Scoring Interpretation

For cost-primary scenarios:

```text
safe but wasteful
may still resolve
but should score lower

safe and economically efficient
should score higher
```

For #90:

```text
Data Integrity / Reliability / Customer Impact
should reflect decision-quality risk

Cost Efficiency may still matter
but must not dominate model-quality safety
```

Do not reinterpret a dimension inconsistently within one scenario.

---

# 12. Batch Complexity Requirements

Across scenarios 86–90:

```text
all 5 multi-step or policy-sequenced

at least 4 with genuine alternate strong paths

at least 4 where Cost Efficiency materially differentiates safe paths

at least 3 with no central "scale X → overload Y" mechanic

at least 2 where availability remains healthy through most of the scenario

at least 2 with historical/cumulative consequence

at least 4 with legitimate degraded-but-safe states

at least 3 with explicit policy/risk constraints
```

Do not fabricate behavior to hit quotas.

Document honest deviations.

---

# 13. Completion Modes

Audit individually.

Do not force all five candidate-declared.

Use candidate-declared when:

```text
safe handback requires judgment about cost/risk/quality
```

Use automatic only if terminal success is genuinely objective.

For candidate-declared scenarios define:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

only where each tier is real.

---

# 14. Immediate-Finish Audit

For every candidate-declared scenario:

```text
trigger incident
zero actions
Finish
```

Expected default:

```text
declared_unstable
```

For proactive/no-outage scenarios (#86/#88), ensure "everything looks green" does not accidentally make zero-action Finish safe if the cost/risk condition remains materially unacceptable.

---

# 15. Historical / Irreversible Consequence

Where applicable, model distinct history.

Potential:

```text
#87 durability exposure during weak replication

#89 required audit-log loss / observability blind window

#90 critical decisions made on stale features
```

Fixing current configuration must not erase what already happened.

---

# 16. Timeline Causality

Keep the Phase 6D.4 / 6E.1 clarity requirement.

Timeline events should clearly identify:

```text
external progression
candidate action consequence
elapsed recovery
cost accumulation
freshness degradation
historical consequence
```

Especially for #86/#88:

Avoid implying an "incident outage" when the system is actually healthy but economically unsafe.

---

# 17. Architecture

Use flat architecture first.

No grouping unless live readability actually fails.

Report for each:

```text
node count
edge count
flat readability verdict
```

No speculative shared architecture work.

---

# 18. Action Feedback

100% meaningful classification coverage.

Feedback should explain:

```text
what changed
why cost moved
what safety/resilience was preserved or weakened
what quality/freshness changed
what tradeoff was accepted
what remains unresolved
```

Avoid generic praise/blame.

---

# 19. Author Self-Verification

Before DONE, every author provides evidence for:

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
cost-efficiency sanity audit
alternate-path proof where claimed
```

---

# 20. Independent Verifier Contract

Each verifier inspects actual files and runs tests.

Return VERIFIED or REJECTED with evidence for:

1. all required files exist
2. definition validates
3. difficulty correct
4. architecture readable
5. duplicate audit credible
6. every control used
7. every control tested
8. no dead controls
9. business invariants candidate-visible
10. scenario not a Phase 6D reskin
11. cost dimension genuinely matters where claimed
12. alternate strong path real where claimed
13. unsafe cost-cutting path actually unsafe
14. historical damage non-resetting where claimed
15. completion mode justified
16. immediate Finish safe
17. scoring paths exact
18. harmful path harmful
19. feedback coverage complete
20. determinism passes
21. timeline causality clear
22. Staff/Senior Staff/Principal level justified
23. random control-mashing is not enough

Any dead control, fake alternate path, or decorative cost mechanic:

```text
REJECT
```

---

# 21. Fix-Agent Rule

If rejected:

```text
use fresh scoped fix-agent
not original author
```

Then:

```text
orchestrator re-grep
scenario test rerun
verifier re-check
```

before shared wiring.

---

# 22. Manual QA Priority

Run live QA for at least:

```text
86 Runaway Cloud Spend During Healthy Traffic
87 Cross-Region Replication Cost Explosion
89 Expensive Retry and Logging Amplification
90 Model Feature Freshness Degradation
```

Also run #88 if time/flow permits; otherwise its test evidence must be especially strong.

Verify:

- architecture readable
- business invariants visible
- no-outage scenarios feel intentionally different from outage scenarios
- cost metrics are legible
- alternate paths feel genuinely different
- unsafe cost-cutting path can look green while being unsafe
- historical consequences persist
- Finish semantics correct
- feedback post-incident only

---

# 23. Manual Cost QA

For #86/#87/#89, explicitly test:

```text
safe but expensive
safe and cost-efficient
unsafe minimum-cost
```

Report actual cost metrics and final scores.

The candidate should be able to see:

```text
"cheapest"
is not always
"best"
```

and:

```text
"safe"
is not always
"economically optimal"
```

---

# 24. Manual ML/Data QA — #90

For Model Feature Freshness Degradation test:

```text
1. zero-action availability-green baseline
2. continue-serving-stale harmful path
3. fresh-but-lower-quality fallback path
4. hold-critical-decisions safe degraded path
5. alternate strong path
6. recovery to fully fresh state if authored
```

Confirm:

```text
serving uptime can remain green
while
decision quality makes the incident unsafe
```

This is a core Phase 6E product claim.

---

# 25. Exact Scoring Report Requirement

For every scenario return exact executed:

```text
optimal
alternate optimal/strong
acceptable
baseline
harmful
unsafe minimum-cost path if distinct
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

No:

```text
—
see test file
below baseline
>700
```

---

# 26. Score Sanity Audit

Every author must verify:

```text
safe-but-wasteful < safe-and-efficient where intended

unsafe-minimum-cost cannot win overall

green availability + broken resilience/quality cannot resolve as safe

acceptable does not accidentally dominate optimal without explicit semantic reason

alternate strategies score according to real tradeoffs

historical damage cannot be erased by a later config fix
```

Any tier/score divergence must be explained with exact six-dimension evidence before the batch report is submitted.

---

# 27. Catalog Wiring

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
90 built-in scenarios
3 free
87 paid
```

---

# 28. Validation

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
Seed complete (90 built-in scenario(s)).
```

---

# 29. Phase 6E.2 Completion Report

Return:

1. exact scenarios 86–90
2. files created/modified
3. duplicate-mechanism audit
4. difficulty classifications
5. architecture node/edge counts
6. flat-readability verdict
7. author control-usage audit tables
8. verifier dead-control audit
9. completion modes
10. unsafe/acceptable/optimal states
11. business invariants
12. cost-primary objective per scenario
13. historical-damage model
14. multi-step/policy path
15. sequencing audit
16. pressure-transfer audit or explicit N/A
17. recovery-lag audit or explicit N/A
18. timeline-causality audit
19. tempting unsafe paths
20. legitimate degraded modes
21. alternate strong paths
22. updated Phase 6E alternate-path running count
23. immediate-Finish audit
24. exact scoring tables for all 5
25. cost-efficiency discrimination audit
26. suspicious-score investigations
27. feedback coverage
28. test count per scenario
29. verifier verdicts
30. fix-agent changes if any
31. orchestrator verification
32. manual QA #86
33. manual QA #87
34. manual QA #89
35. manual QA #90
36. optional/manual QA #88
37. package tests
38. full test count
39. typecheck
40. lint
41. build
42. seed
43. deviations
44. product/UX concerns
45. Staff/Senior Staff/Principal quality assessment
46. Phase 6E thematic-diversity assessment
47. alternate-path target status

---

# 30. Alternate-Path Target Status

At end of batch calculate:

```text
Phase 6E alternate-path scenarios so far
out of
10 completed scenarios
```

Current baseline before 6E.2:

```text
1 / 5
```

Desired after this batch:

```text
at least 5 / 10
```

Prefer:

```text
6 / 10
```

if the scenarios genuinely support it.

Do not fake alternatives to hit the number.

If fewer than 5/10 after 6E.2, explicitly calculate what 6E.3/6E.4 must achieve to preserve the overall 12/20 goal.

---

# 31. Stop Condition

Phase 6E.2 is complete only when:

```text
90 built-in scenarios exist
3 free
87 paid
scenarios 86–90 fully authored
all independently verified
control audit clean
cost-primary mechanics proven
manual QA complete for priority scenarios
exact scoring evidence complete
all tests green
seed reports 90
alternate-path running count recorded
```

Stop.

Do not begin Phase 6E.3 until this report is reviewed.

---

# Final Quality Bar

By the end of this batch, IncidentRank should be able to test questions like:

```text
The system is healthy — why is this still an incident?

Which cost is waste and which cost is buying necessary safety?

Can I reduce spend without destroying resilience?

Should I accept slightly worse latency to save substantially more money?

Is a fresh lower-quality model safer than a stale high-quality model?

When does "green uptime" hide a bad business outcome?
```

If those questions are not necessary to succeed, Phase 6E.2 has not achieved its purpose.
