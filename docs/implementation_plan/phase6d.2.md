Proceed with **Phase 6D.2 only**.

Do not begin 6D.3.

Phase 6D.1 is approved. Keep the same execution discipline:

```text
5 parallel scenario authors
→ 5 independent verifiers
→ orchestrator filesystem verification
→ shared catalog wiring
→ batch-wide tests
→ Principal-level review gate
```

Before authoring, make one shared metadata improvement:

## A. Add Senior Staff / Principal difficulty metadata

The current engine ceiling is `staff`, which is no longer sufficient for Phase 6D content.

Extend difficulty metadata generically to support:

```text
beginner
intermediate
senior
staff
senior_staff
principal
```

Requirements:

- metadata/UI only
- no simulator behavior changes
- no scoring behavior changes
- no completion behavior changes
- backward compatible with all existing scenarios
- existing `staff` scenarios remain `staff`
- Phase 6D.1 scenarios should be updated to their intended level:
  - #61 Principal
  - #62 Principal
  - #63 Senior Staff
  - #64 Principal
  - #65 Senior Staff
- library filters/sorting/display must continue to work
- assessments must display the actual difficulty correctly
- add/update validation and regression tests

Do not overbuild a generic “level framework.” This is simply richer difficulty metadata.

Also, before starting 6D.2, record the exact executed scoring totals for #63 Multi-Tenant Control Plane Overload so the Phase 6D.1 report gap is closed.

---

# Phase 6D.2 scenarios

Implement exactly:

```text
66 Ledger Reconciliation Divergence
67 Hot Shard + Replica Lag + Failover Risk
68 Event Platform Partial Outage
69 Search Platform Cascade
70 API Migration Dual-Write Failure
```

These should be among the strongest correctness/data-integrity scenarios in the product so far.

---

# 1. Scenario 66 — Ledger Reconciliation Divergence

Slug:

```text
ledger-reconciliation-divergence
```

Difficulty:

```text
principal
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
      ↓
Exception / Repair Queue
```

Incident:

The customer-facing transaction path remains healthy, but a subset of financial events is:

- missing
- duplicated
- delayed

between the operational ledger and settlement ledger.

The incident must not look like a simple availability outage.

Candidate should observe:

- transaction API success remains high
- operational ledger remains healthy
- settlement divergence rises
- reconciliation backlog rises
- duplicate settlement entries may rise
- missing-entry count may rise
- event lag grows

Business invariants:

```text
The operational ledger is the authoritative transaction record.

Settlement must never invent or double-apply value.

A transaction acknowledged to the customer may not simply be discarded to make reconciliation metrics look healthy.

Historical financial divergence must be accounted for before the incident can be considered fully resolved.
```

Controls may include:

- settlement consumer pause/resume
- reconciliation mode
- duplicate suppression
- replay window
- event publishing mode
- repair queue priority
- settlement write concurrency

Principal-level requirements:

- candidate must distinguish live-traffic health from financial correctness
- a “pause everything” strategy may contain damage but leave backlog
- replaying blindly can duplicate settlement
- deleting/ignoring reconciliation exceptions must be harmful
- repairing historical divergence should have recovery lag

Support at least one bounded safe degraded state if genuinely defensible.

Potential acceptable state:

```text
new divergence stopped
historical reconciliation backlog remains bounded and draining
customer transaction correctness intact
```

Do not mark this resolved if new divergence is still accumulating.

---

# 2. Scenario 67 — Hot Shard + Replica Lag + Failover Risk

Slug:

```text
hot-shard-replica-lag-failover-risk
```

Difficulty:

```text
principal
```

Architecture:

```text
Clients
   ↓
API
   ↓
Shard Router
 ├─ Shard 1 Primary → Replica
 ├─ Shard 2 Primary → Replica
 ├─ Shard 3 Primary → Replica
 └─ Shard 4 Primary → Replica
```

Incident:

Shard 2 becomes hot because of concentrated tenant traffic.

At the same time:

- Shard 2 replica lag increases
- primary latency rises
- replica appears healthy from a process-health perspective
- API-level customer latency rises

The tempting action is failover.

But failing over while replica lag is high creates stale/lost-write risk.

Controls:

- tenant throttling
- shard routing/rebalancing
- hot-tenant isolation
- replica catch-up priority
- failover
- read routing
- API concurrency
- write throttling

Business invariants:

```text
Acknowledged writes must not be lost.

Temporary throttling of one tenant is acceptable to protect the platform.

Stale reads may be tolerated only within the authored bound.

A replica cannot become authoritative until it is sufficiently caught up.
```

Principal-level behavior:

Strong path should likely involve:

```text
contain hot-tenant pressure
→ reduce primary pressure
→ allow replica catch-up
→ evaluate failover only after safety threshold
→ gradually restore tenant traffic
```

Unsafe sequencing:

```text
fail over first
→ discover stale authority afterward
```

Must have explicit safe-order vs unsafe-order tests.

Scaling API capacity alone should worsen shard pressure or otherwise fail to solve the root issue.

Recovery lag is required.

---

# 3. Scenario 68 — Event Platform Partial Outage

Slug:

```text
event-platform-partial-outage
```

Difficulty:

```text
senior_staff
```

Architecture:

```text
Producers
    ↓
Event Gateway
    ↓
Broker Cluster
 ├─ Topic A
 ├─ Topic B
 └─ Topic C
    ↓
Consumer Group A
Consumer Group B
Consumer Group C
    ↓
Databases / External APIs
```

Incident:

Three different things happen simultaneously:

- one broker partition class becomes degraded
- Consumer Group B develops growing lag
- Consumer Group C retries aggressively against a degraded downstream DB/API

Overall broker health looks ambiguous rather than fully down.

Candidate must reason about:

- producer backpressure
- topic/business priority
- consumer isolation
- retry ownership
- downstream protection
- broker pressure

Business invariants:

```text
Critical Topic A events must remain durable.

Lower-priority Topic C may be delayed.

No consumer group may be allowed to destabilize unrelated topics.

Dropping events merely to reduce lag is not acceptable.
```

Controls:

- producer throttling/backpressure
- topic priority
- consumer concurrency by group
- retry mode by group
- partition isolation
- DLQ policy
- downstream circuit breaker
- batch size

Principal/Senior Staff requirement:

This must not collapse into “add consumers.”

A naive consumer-scale-up should transfer pressure downstream.

Candidate should have to separate:

```text
broker problem
consumer problem
downstream problem
```

and act independently.

---

# 4. Scenario 69 — Search Platform Cascade

Slug:

```text
search-platform-cascade
```

Difficulty:

```text
senior_staff
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

Ranking Service latency rises moderately.

The Query Coordinator waits longer for ranking results.

This causes:

- more in-flight search requests
- connection pressure against index clusters
- Feature Store QPS increase
- Search API tail latency explosion

Core search/index data remains healthy.

Business invariants:

```text
Basic search results are business-critical.

Advanced ranking/re-ranking is optional during an incident.

Search correctness must not be sacrificed by returning unrelated/stale content outside the allowed bound.

Feature enrichment may be degraded.
```

Controls:

- ranking inclusion
- ranking timeout
- feature-store usage
- query concurrency
- partial result mode
- cache
- index timeout
- API capacity

Strong path should likely include intentional quality degradation:

```text
disable/degrade ranking
→ reduce feature-store demand
→ drain coordinator concurrency
→ observe index recovery
→ restore selectively
```

Trap:

Scaling Search API or Query Coordinators alone should worsen downstream pressure.

There should be a safe degraded state where search quality is reduced but core search remains healthy.

This is a good candidate for `candidate_declared`.

---

# 5. Scenario 70 — API Migration Dual-Write Failure

Slug:

```text
api-migration-dual-write-failure
```

Difficulty:

```text
principal
```

Architecture:

```text
Clients
   ↓
API Gateway
   ↓
Migration Layer
  ↙              ↘
Legacy Service    New Service
    ↓                ↓
Legacy DB          New DB
       ↘            ↙
       Reconciliation
```

Incident:

A migration is in partial rollout.

Requests are being dual-written.

Some writes succeed only on Legacy, some only on New.

Reads may come from either system depending on rollout cohort.

Customer-facing availability remains high.

State divergence grows.

Candidate must reason about:

- authoritative source
- read authority
- write authority
- rollback
- reconciliation
- shadow traffic
- dual-write disable
- migration cohort
- historical divergence

Business invariants:

```text
There must be exactly one authoritative write source during incident containment.

Acknowledged writes must not disappear during rollback.

Rollback does not automatically repair data already written only to the new system.

Read routing must not expose unresolved divergent state.

Migration safety is more important than continuing rollout velocity.
```

Potential controls:

- write mode: legacy-only / dual / new-only
- read source
- rollout %
- reconciliation mode
- shadow traffic
- rollback
- cohort routing
- repair priority

Principal-level sequencing should matter strongly.

Example unsafe path:

```text
rollback application traffic
→ leave new-only writes unreconciled
→ switch reads to legacy
```

This may look available but expose missing acknowledged data.

Strong path should likely require:

```text
freeze authority
→ stop divergence
→ reconcile
→ verify
→ then choose rollback or controlled migration continuation
```

Do not encode only one final strategic direction if both “safe rollback” and “safe migration continuation” can be legitimately supported.

This should be one of the hardest IncidentRank scenarios so far.

---

# 6. Duplicate-Mechanism Audit

Before authoring each scenario, compare it against all 65 existing scenarios.

Especially compare:

66 against:
- Duplicate Event Processing
- Out-of-Order Events
- Ledger-like correctness scenarios

67 against:
- Hot Database Partition
- Primary Database Failover
- Read Replica Lag

68 against:
- Kafka Consumer Lag
- Event Processing Backpressure
- Message Retry Storm
- Kafka Partition Skew

69 against:
- Fan-Out Request Explosion
- Cascading Service Failure
- Dependency Timeout Cascade

70 against:
- Deployment Regression
- Partial Rollout Regression
- consistency-related distributed-system scenarios

For each return:

```text
Closest existing scenarios
Distinct root mechanism
Distinct dominant mitigation
Distinct Principal-level judgment
```

If root mechanism + dominant fix substantially duplicate an existing scenario, redesign before coding.

---

# 7. Architecture

Use the flat architecture model first.

Do not introduce grouping yet unless a real readability failure is demonstrated.

For each scenario report:

```text
node count
edge count
flat readability verdict
```

If flat architecture fails, stop and return a design note before modifying shared architecture types.

---

# 8. Complexity Requirements

Across these five scenarios require:

- all 5 multi-step
- at least 4 sequencing-sensitive
- all 5 with pressure transfer
- all 5 with recovery lag
- at least 4 with irreversible/historical correctness state
- at least 3 with alternate defensible resolution strategies
- at least 3 with safe degraded states

Do not force a quota if semantics become dishonest; document deviations instead.

---

# 9. Historical Damage

This batch explicitly introduces more scenarios where:

```text
fixing the cause
≠
undoing damage already caused
```

Examples:

- settlement divergence
- lost/stale failover writes
- missing/duplicated events
- migration divergence

Model historical damage distinctly from current health.

The candidate should be able to stop new damage while still needing reconciliation/recovery.

Do not magically reset historical correctness counters because the configuration was fixed.

---

# 10. Completion Semantics

Audit individually.

For candidate-declared scenarios:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

must be based on whole-system safety.

A system may be acceptable with bounded historical recovery still draining only if:

- new damage has stopped
- correctness is protected
- backlog is bounded
- recovery is demonstrably progressing

No instant-Finish exploits.

---

# 11. Sequencing Tests

At minimum, explicitly test safe vs unsafe sequencing for:

```text
#67 Hot Shard / Replica Failover
#70 Dual-Write Migration
```

and at least two additional scenarios where the authored state graph genuinely supports ordering sensitivity.

Do not manufacture order dependence for Search just to hit a count.

---

# 12. Scoring

Generic six dimensions only.

For each scenario record actual executed:

```text
optimal
acceptable
baseline
harmful
```

where applicable.

Also record alternate strong paths.

The completion report must contain the actual totals for every scenario; do not write “see test file.”

Pay close attention to Data Integrity.

A path with:

- settlement duplication
- lost acknowledged writes
- unsafe replica authority
- dropped critical events
- migration divergence

must score materially worse even if availability is excellent.

---

# 13. Feedback

100% meaningful classification-rule feedback coverage.

Principal-level feedback should explain transferred consequences, historical damage, and sequencing where relevant.

---

# 14. Verification Workflow

Use:

```text
5 authors in parallel
→ 5 independent verifiers
→ orchestrator filesystem verification
→ fixes by fresh fix-agent where necessary
→ re-verification
→ shared wiring
```

Verifier must inspect files and execute tests.

A verifier should reject for:

- dead controls
- fake multi-step behavior
- hidden gotchas
- misleading business constraints
- duplicate mechanism
- weak correctness gating
- scoring anomalies
- accidental instant Finish
- claimed recovery lag that actually snaps instantly
- supposedly Principal scenario solvable by control-mashing

---

# 15. Shared Metadata Validation

After adding `senior_staff` and `principal`, verify:

- schema validates all 65 existing + 5 new scenarios
- old difficulty values still work unchanged
- library renders labels
- filtering/sorting does not break
- assessment metadata displays correct level
- seed persists difficulty correctly
- no simulator dependence on difficulty exists

---

# 16. Manual QA Priority

Run live:

A. Ledger Reconciliation Divergence  
B. Hot Shard + Replica Lag + Failover Risk  
C. Event Platform Partial Outage  
D. API Migration Dual-Write Failure

Additionally choose either Search Platform Cascade or one other scenario for a fifth live run.

Verify:

- architecture readability
- business invariants visible
- first action does not magically solve incident
- pressure transfer observable
- historical damage behaves correctly
- recovery lag visible
- Finish semantics correct

---

# 17. Batch Completion Report

Return:

1. difficulty metadata change and tests
2. exact #63 scoring totals
3. scenarios 66–70 added
4. duplicate-mechanism audits
5. architecture node/edge counts
6. flat-readability verdicts
7. difficulty classification
8. completion modes
9. unsafe/acceptable/optimal states
10. business invariants
11. historical-damage model per scenario
12. multi-step path
13. sequencing audit
14. pressure-transfer audit
15. recovery-lag audit
16. tempting unsafe paths
17. alternate strong paths
18. immediate-Finish audit
19. exact scoring table for all 5
20. suspicious-score investigations
21. feedback coverage
22. tests per scenario
23. verifier verdicts
24. orchestrator verification
25. metadata regression tests
26. package test result
27. full test result
28. typecheck
29. lint
30. build
31. seed
32. deviations
33. Principal/Senior Staff quality assessment

Expected catalog:

```text
70 built-in scenarios
3 free
67 paid
```

Stop after the 6D.2 completion report.

Do not begin 6D.3.