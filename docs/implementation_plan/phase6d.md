# IncidentRank — Phase 6D: Principal / Senior Staff System Design Incidents, Scenarios 61–80

## Status

Phase 6C is complete with:

- 60 built-in scenarios
- 18 new candidate-declared and 2 automatic scenarios in the Phase 6C batch
- fully green validation baseline
- server-authoritative assessment runtime
- deterministic authored scenario engine
- candidate-declared completion
- multi-step incident handling
- generic declarative scoring
- post-incident authored feedback
- generic catalog/runtime resolution

Phase 6D intentionally raises the level.

This is not just “another 20 incidents.”

The purpose of Phase 6D is to prove that IncidentRank can evaluate **Principal / Senior Staff-level system design and production judgment** across large, interacting distributed systems.

After this phase:

```text
80 built-in scenarios
3 free
77 paid
```

Do not begin scenarios 81–100.

---

# 1. Phase 6D Goal

Build 20 complex incidents where the candidate must reason about:

- multiple services
- multiple failure domains
- multiple independently healthy-looking subsystems
- sequencing of mitigations
- blast-radius containment
- dependency graphs
- multi-region behavior
- data ownership
- consistency boundaries
- asynchronous recovery
- partial availability
- backpressure across tiers
- load-shedding strategy
- migration safety
- rollout strategy
- operational risk
- business-critical vs degradable traffic
- correctness vs availability vs latency
- short-term mitigation vs long-term stabilization

These are not intended to test whether someone knows a particular product.

They should test:

> Can this engineer form a correct mental model of a complex production system, identify the real failure domain, choose safe interventions, sequence them correctly, and know when the system is safe enough to hand back?

---

# 2. Level Target

Primary audience:

```text
Senior Staff
Principal
Senior Principal
Distinguished-adjacent
```

A small number may be strong Staff-level incidents, but the batch should skew materially harder than Phase 6C.

Target distribution:

```text
Staff:          2–4
Senior Staff:   8–10
Principal:      8–10
```

Difficulty must come from **system interaction and judgment**, not from:

- more controls
- larger numbers
- longer timers
- obscure terminology

---

# 3. Complex-System Doctrine

Phase 6D systems may contain:

```text
8–15 logical components
3–6 independently observable subsystems
multiple regions / queues / stores / dependency classes
multiple valid mitigation paths
multiple simultaneous failure modes
```

This is allowed by the current architecture.

The engine still remains:

```text
Candidate action
    ↓
Authored deterministic rule
    ↓
Authored consequences
    ↓
State across multiple components
    ↓
Candidate observes
    ↓
Next action
```

Do NOT turn IncidentRank into:

- infrastructure emulation
- stochastic simulation
- capacity-planning math
- arbitrary script execution
- freeform terminal operations

Complexity should come from the **state graph**, not from simulation physics.

---

# 4. Principal-Level Scenario Contract

Most Phase 6D scenarios should require at least 3 of these:

1. identify the true bottleneck behind a misleading symptom
2. distinguish local from systemic failure
3. sequence 2–4 interventions correctly
4. preserve correctness while degrading functionality
5. choose which traffic/work to sacrifice
6. isolate blast radius
7. reason across regions or failure domains
8. avoid transferring pressure to another tier
9. account for recovery lag after mitigation
10. choose between containment and restoration
11. recognize that “green dashboard” does not mean safe
12. know when to stop changing the system
13. preserve a critical business invariant
14. intentionally accept a bounded degraded mode
15. reject an apparently-good but structurally unsafe recovery

A Principal-level scenario should rarely be solvable by one change.

---

# 5. Phase 6D Scenario List

Implement exactly these 20 scenarios.

---

## 61. Multi-Region Payment Platform Degradation

Category:

```text
Complex Distributed Systems
```

Difficulty:

```text
Principal
```

Architecture:

```text
Clients
  ↓
Global Traffic Manager
  ├─ US Region
  │    ├─ Payment API
  │    ├─ Risk Service
  │    ├─ Ledger
  │    └─ Event Publisher
  │
  └─ EU Region
       ├─ Payment API
       ├─ Risk Service
       ├─ Ledger Replica
       └─ Event Publisher

Shared:
  Fraud Provider
  Settlement Pipeline
```

Incident:

EU experiences dependency degradation while cross-region ledger replication begins lagging. Traffic shifting toward US improves availability but increases ledger/settlement pressure.

Candidate must balance:

- payment availability
- ledger correctness
- cross-region lag
- risk checks
- settlement backlog
- regional traffic

Potential decisions:

- route only selected traffic
- degrade optional risk enrichment
- preserve mandatory authorization
- throttle high-risk traffic
- isolate EU writes
- protect settlement pipeline
- delay non-critical events

Must require multi-stage stabilization.

---

## 62. Global Checkout Brownout

Difficulty:

```text
Principal
```

Architecture:

```text
Web / Mobile
     ↓
Checkout Orchestrator
 ├─ Cart
 ├─ Pricing
 ├─ Inventory
 ├─ Promotions
 ├─ Tax
 ├─ Payment
 └─ Order Service
```

Incident:

No single service is completely down.

Three dependencies simultaneously degrade moderately, producing catastrophic end-to-end latency.

Candidate must reason about critical path vs optional enrichment.

Controls:

- dependency inclusion
- partial checkout mode
- timeout budgets
- retries
- concurrency
- fallback pricing/tax modes
- promotion disable
- inventory reservation strategy

Strong path likely involves sacrificing non-critical functionality while preserving correctness.

---

## 63. Multi-Tenant Control Plane Overload

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Tenant APIs
   ↓
Control Plane
 ├─ Scheduler
 ├─ Config Service
 ├─ Policy Engine
 ├─ Metadata DB
 └─ Worker Fleet

Tenants A–N
```

Incident:

One very large tenant creates a burst of configuration activity that overloads the shared control plane.

Data-plane traffic remains healthy initially.

Candidate must protect:

- small tenants
- control-plane durability
- config convergence
- worker fleet
- metadata DB

Controls:

- tenant quotas
- priority
- queue partitioning
- worker concurrency
- write batching
- dedicated lane
- config propagation

This must test **control plane vs data plane reasoning**.

---

## 64. Regional Failover Causes Global Overload

Difficulty:

```text
Principal
```

Architecture:

```text
Region A
Region B
Region C
   ↓
Global Load Routing

Each region:
API → Cache → DB → Dependencies
```

Incident:

Region A fails.

The automatic failover sends too much traffic into B and C, which are healthy but lack enough spare capacity.

Candidate must decide:

- how much traffic to fail over
- what traffic to shed
- which endpoints to degrade
- whether to restore A partially
- whether to protect B/C from cascading failure

The obvious “send all traffic elsewhere” path must be harmful.

---

## 65. Cross-Service Retry Amplification

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Client
 ↓
Gateway
 ↓
Service A
 ↓
Service B
 ↓
Service C
 ↓
External Provider
```

Every layer has independently authored retry behavior.

Incident:

The external provider degrades slightly.

Retries across four layers create exponential amplification.

Candidate must reason about:

- retry ownership
- timeout budgets
- circuit breaking
- request cancellation
- concurrency
- pressure transfer

This must be materially deeper than Payment Retry Storm.

---

## 66. Ledger Reconciliation Divergence

Difficulty:

```text
Principal
```

Architecture:

```text
Transaction API
   ↓
Operational Ledger
   ↓
Event Stream
   ↓
Settlement Ledger
   ↓
Reconciliation Service
```

Incident:

The online ledger remains available, but the settlement ledger diverges because an event-delivery/reconciliation path is dropping or duplicating a subset of entries.

Signals:

- online success
- ledger divergence
- missing entries
- duplicate settlement entries
- reconciliation backlog
- event lag

Candidate must prioritize correctness over superficial availability.

Past damage may be irreversible within the attempt.

---

## 67. Hot Shard + Replica Lag + Failover Risk

Difficulty:

```text
Principal
```

Architecture:

```text
API
 ↓
Shard Router
 ├─ Shard 1 Primary → Replica
 ├─ Shard 2 Primary → Replica
 ├─ Shard 3 Primary → Replica
 └─ Shard 4 Primary → Replica
```

Incident:

One shard becomes hot while its replica simultaneously falls behind.

Failing over too aggressively risks stale writes; scaling only the API increases pressure.

Candidate must combine:

- hot-shard relief
- traffic routing
- tenant throttling
- replica protection
- failover judgment

No single control should solve it.

---

## 68. Event Platform Partial Outage

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Producers
 ↓
Event Gateway
 ↓
Kafka-like Broker
 ├─ Topic A
 ├─ Topic B
 └─ Topic C
 ↓
Consumer Fleets
 ↓
Databases / APIs
```

Incident:

One broker partition class is degraded, one consumer group is lagging, and retries from another consumer are increasing broker load.

Candidate must determine what to isolate vs scale.

Must include:

- producer backpressure
- topic prioritization
- consumer isolation
- retry policy
- downstream DB pressure

---

## 69. Search Platform Cascade

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Clients
 ↓
Search API
 ↓
Query Coordinator
 ├─ Index Cluster A
 ├─ Index Cluster B
 ├─ Ranking Service
 └─ Feature Store
```

Incident:

Ranking latency increases.

Query coordinators hold requests open, index connections rise, feature-store load spikes, and overall search collapses.

Candidate should be able to degrade ranking quality to preserve core search.

This tests **feature degradation as blast-radius containment**.

---

## 70. API Migration Dual-Write Failure

Difficulty:

```text
Principal
```

Architecture:

```text
Clients
 ↓
API Gateway
 ↓
Migration Layer
 ├─ Legacy Service → Legacy DB
 └─ New Service    → New DB
```

Incident:

During migration, dual writes begin partially failing.

Reads may come from either system.

Candidate must reason about:

- source of truth
- write authority
- rollback
- shadow traffic
- dual-write disable
- reconciliation
- read routing

Healthy availability with divergent state must not count as safe.

---

## 71. Schema Migration Under Live Traffic

Difficulty:

```text
Principal
```

Architecture:

```text
Old App Version
New App Version
      ↓
Shared Database
```

Incident:

A schema migration is only partially compatible with the mixed-version application fleet.

Signals:

- write failures by version
- incompatible rows
- migration progress
- DB locks
- rollout percentage
- queue/retry behavior

Candidate must sequence:

- rollout
- schema compatibility
- backfill
- feature flag
- rollback

This should test **expand/contract migration reasoning** without naming it as the answer.

---

## 72. Cache Invalidation Across Regions

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Global API
 ├─ US Cache
 ├─ EU Cache
 └─ APAC Cache
       ↓
Origin Store
       ↓
Invalidation Stream
```

Incident:

Invalidation delivery is delayed in one region and duplicated in another.

Candidate sees inconsistent customer behavior.

Must reason about:

- stale-read tolerance
- bypassing cache
- origin protection
- regional isolation
- invalidation replay
- TTL

---

## 73. Identity Platform Degradation

Difficulty:

```text
Principal
```

Architecture:

```text
Clients
 ↓
API Gateway
 ↓
Authentication
 ├─ Session Store
 ├─ Token Verification
 ├─ MFA Provider
 ├─ Risk Engine
 └─ User Directory
```

Incident:

MFA provider degrades while session-store pressure rises and token verification remains healthy.

Candidate must preserve security while maintaining as much availability as allowed by business policy.

Unsafe auth bypass must look operationally tempting but remain invalid.

---

## 74. Authorization Policy Rollout Failure

Difficulty:

```text
Principal
```

Architecture:

```text
Requests
 ↓
Gateway
 ↓
Policy Decision Point
 ├─ Policy Store
 ├─ Identity Context
 └─ Resource Metadata
```

Incident:

A policy rollout causes selective false-denies and some stale policy caches.

Candidate must reason about:

- rollback
- cache invalidation
- policy version pinning
- fail-open vs fail-closed
- critical-resource protection
- staged rollout

Security/correctness must remain first-class.

---

## 75. Data Pipeline Freshness Collapse

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Sources
 ↓
Ingestion
 ↓
Stream Processing
 ↓
Warehouse
 ↓
Serving Layer / Reports
```

Incident:

Ingestion is healthy but processing falls behind.

Scaling processors increases warehouse contention.

Candidate must decide:

- what to throttle
- which datasets get priority
- batch size
- processor concurrency
- warehouse protection
- freshness SLO tradeoffs

---

## 76. Backfill Overwhelms Production

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Production Traffic
       ↓
    Database
       ↑
Historical Backfill Workers
```

Incident:

A large backfill competes with live traffic.

Stopping it entirely protects customers but violates a migration deadline; scaling DB may help but increases cost and may not fix locks.

Candidate must manage:

- backfill concurrency
- scheduling
- DB priority
- chunk size
- pause/resume
- live traffic protection

---

## 77. Multi-Service Memory Pressure Incident

Difficulty:

```text
Senior Staff
```

Architecture:

```text
Gateway
 ↓
API Service
 ↓
Aggregator
 ↓
3 Dependencies
```

Incident:

A payload/data-shape change increases memory across multiple services.

One service begins GC thrashing first, but the true source is upstream amplification.

Candidate must distinguish:

- symptom service
- source service
- payload behavior
- concurrency
- caching

Scaling the first crashing service should provide temporary relief but not durable recovery.

---

## 78. Global Feature Rollout Incident

Difficulty:

```text
Principal
```

Architecture:

```text
Global Traffic
 ↓
Feature Flag Platform
 ↓
Services in US / EU / APAC
 ↓
Shared Data Store
```

Incident:

A feature rollout causes a region-dependent correctness problem.

Candidate must reason about:

- rollout cohorts
- regional rollback
- global rollback
- data written by new version
- compatibility after rollback
- staged containment

Rollback may not automatically undo already-written incompatible state.

---

## 79. Capacity Exhaustion During Peak Event

Difficulty:

```text
Principal
```

Architecture:

```text
Clients
 ↓
Edge
 ↓
API Fleet
 ↓
Cache
 ↓
Database
 ↓
Async Processing
```

Incident:

Traffic is genuinely expected and cannot simply be blocked.

Multiple tiers approach capacity at different times.

Candidate must decide:

- critical vs optional traffic
- load shedding
- cache protection
- DB protection
- async deferral
- concurrency
- regional routing

This should feel like operating a major production event, not fixing a single outage.

---

## 80. Cascading Failure Across Shared Platform

Difficulty:

```text
Principal
```

Architecture:

```text
Product A ─┐
Product B ─┼→ Shared Gateway
Product C ─┘       ↓
             Shared Identity
                  ↓
             Shared Metadata
                  ↓
             Shared Messaging
                  ↓
             Shared Database
```

Incident:

A failure begins in one shared platform dependency and propagates across multiple products.

Candidate must determine:

- which shared dependency is root cause
- which products to protect
- which traffic to shed
- whether to isolate one product
- dependency ordering for recovery
- when to restore traffic

This should be one of IncidentRank's hardest scenarios.

No single “fix root cause” action should immediately restore the platform; recovery must propagate through multiple stages.

---

# 6. Complex Architecture Presentation

Phase 6D may require architecture diagrams with more nodes than previous phases.

Use the current generic architecture representation first.

If readability becomes poor, extend the generic architecture descriptor only if necessary.

Any UI enhancement must remain reusable.

Possible generic additions, only if genuinely needed:

- logical groups / bounded contexts
- region containers
- dependency grouping
- critical-path highlighting
- collapsible subsystem groups

Do not create scenario-specific diagrams/components.

---

# 7. Multi-Subsystem State

A scenario may model many state fields.

That is acceptable.

Prefer state organized conceptually around:

```text
availability
latency
backlog
correctness
capacity
regional health
dependency health
data integrity
customer impact
```

Avoid hundreds of meaningless metrics.

Candidate must be able to form a mental model.

Typical target:

```text
8–16 visible metrics
```

for Principal scenarios.

Not all internal state needs to be visible.

---

# 8. Information Hierarchy

Principal-level difficulty must not come from hiding basic information.

Candidate should receive:

- system architecture
- business invariants
- key service health
- meaningful metrics
- timeline events
- operational controls

Difficulty comes from interpreting the signals and making tradeoffs.

Do not create puzzle-box ambiguity.

---

# 9. Business Invariants

Every Principal/Senior Staff scenario must explicitly identify 1–3 important business invariants.

Examples:

```text
Ledger writes must never diverge between authoritative systems.
Payment authorization cannot bypass mandatory fraud checks.
Catalog reads may tolerate 60 seconds of staleness.
One tenant must not consume more than 30% of shared control-plane capacity.
```

Candidate should not need to guess business requirements.

---

# 10. Sequencing Matters

At least 12 of 20 scenarios should include action-order sensitivity.

Example:

```text
wrong:
fail over replica
→ then fence old primary

correct:
fence old primary
→ verify
→ promote replica
```

But sequencing must be based on understandable system semantics, not hidden rule ordering.

Tests should explicitly cover:

```text
safe sequence
unsafe sequence
```

where relevant.

---

# 11. Pressure Transfer

At least 10 scenarios should intentionally contain pressure transfer.

Examples:

```text
scale consumers
→ DB overload

shift traffic regions
→ surviving region overload

disable cache
→ origin overload

increase retries
→ dependency amplification

fail over writes
→ replication/correctness risk
```

Candidate should be rewarded for reasoning about downstream effects.

---

# 12. Recovery Lag

At least 8 scenarios should model:

```text
mitigation applied
≠
system instantly healthy
```

Examples:

- queue drain
- replication catch-up
- cache warming
- reconciliation
- connection drain
- backfill reduction
- retry storm decay

Candidate must observe recovery rather than assume it.

---

# 13. Completion Modes

Audit each scenario individually.

Expect many Phase 6D scenarios to be `candidate_declared`, but do not force it.

Binding rule remains:

```text
candidate_declared
= candidate must decide whether the overall system is safe to hand back

automatic
= objective recovery is unambiguous
```

For candidate-declared scenarios classify:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

Not every scenario needs ACCEPTABLE.

---

# 14. Principal-Level Acceptable States

Acceptable states may include:

- one region intentionally read-only
- optional features disabled
- low-priority events deferred
- selected tenants throttled
- degraded ranking quality
- reduced freshness
- bounded stale reads
- backfill paused
- lower availability protecting correctness

Only if operationally safe.

---

# 15. No Instant-Finish Exploits

Every candidate-declared scenario must test:

```text
zero-action immediate Finish
```

No scenario should resolve instantly unless there is a very strong explicitly documented reason.

Observation-only strategies may be valid but should require sustained stability.

---

# 16. Alternate Strong Strategies

At least 8 Phase 6D scenarios should support more than one defensible resolution approach.

Different strategies may optimize:

- availability
- correctness
- cost
- customer impact
- speed
- operational simplicity

They do not need identical scores.

---

# 17. Scoring

Keep the six generic dimensions:

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

Do not create Principal-specific scorer logic.

Use scenario state/config to make these dimensions meaningful.

---

# 18. Action Feedback

Every meaningful action classification should include authored feedback.

Principal-level feedback should explain system consequences, e.g.:

> Moving all EU traffic to US restored regional availability but pushed the surviving ledger above its safe write capacity, increasing settlement lag.

Avoid:

> Wrong answer.

---

# 19. Duplicate-Mechanism Audit

Before authoring every Phase 6D scenario compare it with all existing 60 scenarios.

If root failure mode + dominant mitigation are effectively the same:

```text
redesign
or
replace
```

Do not inflate the catalog with reskins.

---

# 20. Scenario Tests

Every scenario must include:

## Definition
- validates
- metadata complete
- UI valid
- scoring valid

## Runtime
- incident trigger
- baseline
- strong path
- harmful path
- delayed consequence
- recovery lag
- failure path

## Multi-step
- first mitigation
- secondary consequence
- second mitigation

## Sequencing
Where relevant:
- correct order
- unsafe order

## Scoring
- optimal
- baseline
- harmful
- acceptable if real
- alternate strong path if real

## Completion
For candidate-declared:
- immediate Finish
- unsafe Finish
- acceptable Finish
- optimal Finish
- automatic failure still wins

## Determinism
Same action history + same simulated time:
- same state
- same events
- same score

---

# 21. Gated Execution Plan

Do not author 20 simultaneously.

## 6D.1 — Global and platform incidents

```text
61 Multi-Region Payment Platform Degradation
62 Global Checkout Brownout
63 Multi-Tenant Control Plane Overload
64 Regional Failover Causes Global Overload
65 Cross-Service Retry Amplification
```

Review emphasis:

- architecture readability
- multi-subsystem reasoning
- pressure transfer
- action sequencing

---

## 6D.2 — Data and event correctness

```text
66 Ledger Reconciliation Divergence
67 Hot Shard + Replica Lag + Failover Risk
68 Event Platform Partial Outage
69 Search Platform Cascade
70 API Migration Dual-Write Failure
```

Review emphasis:

- correctness
- source of truth
- irreversible damage
- recovery lag

---

## 6D.3 — Migration / identity / data platform

```text
71 Schema Migration Under Live Traffic
72 Cache Invalidation Across Regions
73 Identity Platform Degradation
74 Authorization Policy Rollout Failure
75 Data Pipeline Freshness Collapse
```

Review emphasis:

- sequencing
- security
- compatibility
- degraded modes

---

## 6D.4 — Peak-load and cross-platform incidents

```text
76 Backfill Overwhelms Production
77 Multi-Service Memory Pressure Incident
78 Global Feature Rollout Incident
79 Capacity Exhaustion During Peak Event
80 Cascading Failure Across Shared Platform
```

Review emphasis:

- Principal-level judgment
- blast-radius containment
- multi-stage recovery
- alternate strong paths

---

# 22. Workflow

For each batch:

```text
5 author agents
    ↓
5 independent verifier agents
    ↓
primary/orchestrator filesystem verification
    ↓
batch-wide tests
    ↓
Principal-level design audit
    ↓
approve batch
```

Shared files remain orchestrator-owned.

---

# 23. Principal-Level Design Audit

Before approving each scenario answer:

1. What is the misleading first symptom?
2. What is the actual root failure domain?
3. What is the first reasonable mitigation?
4. What pressure/risk does that mitigation transfer?
5. What must the candidate observe next?
6. What second or third intervention may be required?
7. What business invariant could be violated?
8. What is a tempting but unsafe path?
9. What is a legitimate degraded-but-safe state?
10. What makes the scenario Senior Staff/Principal rather than Senior?
11. Could this be solved by randomly trying controls?
12. Is the candidate given enough information to reason correctly?

If #11 is yes, redesign it.

---

# 24. Manual QA Priority Scenarios

Run live browser QA for at least:

A. Multi-Region Payment Platform Degradation  
B. Regional Failover Causes Global Overload  
C. Ledger Reconciliation Divergence  
D. API Migration Dual-Write Failure  
E. Identity Platform Degradation  
F. Cascading Failure Across Shared Platform

For each verify:

- architecture is understandable
- multiple subsystems visibly interact
- first mitigation does not magically solve everything
- delayed/recovery behavior is observable
- correctness gates work
- Finish semantics work

---

# 25. Manual Feedback QA

At least 5 scenarios across at least 4 categories.

Include:

- beneficial action
- harmful action
- neutral/ineffective action where available
- multi-step action sequence
- result review
- action-time-state feedback correctness

No feedback during active play.

---

# 26. Assessment QA

Run at least:

- one Principal candidate-declared Phase 6D scenario
- one automatic scenario (Phase 6D if any; otherwise existing automatic scenario)

Verify live:

- paid assignment
- invite
- hidden rules
- actions/reasoning persistence
- Finish
- automatic failure
- company timeline
- completion note
- no candidate educational feedback

---

# 27. Catalog and Access Tests

After Phase 6D:

```text
80 scenarios
3 free
77 paid
```

Verify:

- unique slugs
- valid definitions
- valid UI
- valid scoring
- practice lock
- dev unlock
- assessment override
- generic resolution

---

# 28. Full Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:seed
```

Required:

```text
0 failing tests
```

Seed:

```text
Seed complete (80 built-in scenario(s)).
```

---

# 29. Completion Report

Return:

1. files created/modified
2. final catalog count
3. exact scenarios 61–80
4. duplicate-mechanism audit
5. difficulty distribution
6. complexity distribution
7. architecture/component counts
8. completion-mode classification
9. acceptable-tier scenarios
10. immediate-Finish audit
11. business invariants per scenario
12. multi-step audit
13. sequencing-sensitive scenarios
14. pressure-transfer scenarios
15. recovery-lag scenarios
16. correctness/integrity scenarios
17. security/identity scenarios
18. alternate strong paths
19. generic engine changes
20. generic UI changes
21. justification for shared changes
22. authored feedback coverage
23. leak-boundary verification
24. scoring table
25. suspicious score investigations
26. legitimate scoring limitations
27. per-scenario test counts
28. catalog tests
29. access-control verification
30. assessment override
31. Manual QA A
32. Manual QA B
33. Manual QA C
34. Manual QA D
35. Manual QA E
36. Manual QA F
37. feedback QA
38. assessment QA
39. total test count
40. typecheck
41. lint
42. tests
43. build
44. seed
45. deviations
46. product/UX concerns
47. Principal-level quality assessment

---

# 30. Stop Condition

Phase 6D is complete only when:

```text
80 built-in scenarios exist
3 free
77 paid
all tests green
20 new complex scenarios fully authored
Principal/Senior Staff audit complete
manual QA complete
assessment QA complete
seed reports 80
```

Stop.

Do not begin Phase 6E / scenarios 81–100.

---

# Final Principle

Phase 6D should make IncidentRank feel materially different from a conventional coding assessment.

A Principal candidate should need to think:

```text
What failure domain am I actually looking at?

Which subsystem is causing the symptom, and which is merely suffering from it?

What will my mitigation overload next?

What should I intentionally degrade?

Which customer traffic is critical?

What correctness invariant must never be violated?

What state is irreversible?

What must recover before I restore traffic?

Am I containing the incident, or actually resolving it?

If I hand this system back now, what can still go wrong?
```

If a scenario does not provoke questions like these, it probably does not belong in Phase 6D.
