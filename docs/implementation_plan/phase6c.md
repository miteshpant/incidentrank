# IncidentRank — Phase 6C: Scenario Library Expansion, Scenarios 41–60

## Status

Phase 6A delivered scenarios 1–20 and the scalable scenario-library architecture.

Phase 6.1 added candidate-declared completion, acceptable vs optimal completion tiers, server-authoritative Finish evaluation, multi-step incident semantics, scoring generalization, and post-incident authored feedback.

Phase 6B delivered scenarios 21–40 and proved that the same generic runtime can support database, messaging, caching, microservice, and distributed-systems incidents without scenario-specific runtime code.

Phase 6B.1 closed the remaining test-harness, Cross-Region completion, and post-incident feedback QA gaps.

Phase 6C now adds **exactly 20 additional production-quality built-in scenarios**, bringing the catalog from:

```text
40 → 60 scenarios
```

Do not begin scenarios 61–80 in this phase.

---

# 1. Primary Goal

Author and ship scenarios **41–60** using the existing generic scenario/runtime/scoring infrastructure.

This batch should broaden IncidentRank into:
- dependency degradation
- API and traffic management
- region-aware failure
- deployment/reliability incidents
- coordination and consistency
- production capacity tradeoffs

The quality bar remains:

> Does this incident require engineering judgment, observation, and tradeoff reasoning — or can it be solved by trying controls until the UI looks healthy?

---

# 2. Binding Product Doctrine

IncidentRank does not attempt to recreate production infrastructure numerically.

It recreates production decisions:

```text
Candidate action
    ↓
Authored deterministic rule
    ↓
Authored consequence
    ↓
Observable system state
    ↓
Candidate judgment
```

Do not add:
- arbitrary scripting
- arbitrary formulas
- shell access
- SQL consoles
- Kubernetes terminals
- freeform infrastructure commands
- LLM-based runtime decisions

All scenarios must remain deterministic and replayable.

---

# 3. Catalog Target

After Phase 6C:

```text
60 built-in scenarios
3 free
57 paid
```

The only free scenarios remain:

1. Payment Retry Storm
2. Database Connection Saturation
3. Kafka Consumer Lag

Every Phase 6C scenario must use:

```ts
isFree: false
```

Do not add billing or personal paid entitlements.

---

# 4. Phase 6C Scenario List

Implement exactly these 20 scenarios.

## Microservices & Dependencies

### 41. Partial Regional Dependency Failure

Category: `Microservices & Dependencies`  
Difficulty: `Staff`

Architecture:
```text
Global API
   ↓
Regional Services
 ├─ US
 ├─ EU
 └─ APAC
      ↓
Shared Dependency
```

Incident: a shared dependency is healthy in one region, slow in another, and intermittently failing in a third.

Signals:
- per-region success rate
- per-region latency
- dependency health by region
- fallback traffic
- cross-region request volume
- customer success

Controls:
- regional routing
- dependency fallback
- traffic shifting
- timeout policy
- circuit breaker
- regional isolation

Required judgment: a globally uniform mitigation should not automatically be optimal. The candidate should reason region-by-region.

### 42. Dependency Rate-Limit Exhaustion

Category: `Microservices & Dependencies`  
Difficulty: `Senior`

Architecture:
```text
API
 ↓
Aggregation Service
 ↓
Third-Party Dependency
```

Incident: a downstream provider enforces a hard request quota and the application begins exhausting it well before the quota window resets.

Signals:
- quota remaining
- dependency 429 rate
- application success rate
- retry volume
- cache hit rate
- request priority mix

Controls:
- caching
- request coalescing
- retry behavior
- priority traffic policy
- optional feature suppression
- dependency concurrency

Important trap: retries against a hard rate limit must be able to accelerate quota exhaustion.

## API & Traffic Management

### 43. API Traffic Spike

Category: `API & Traffic Management`  
Difficulty: `Intermediate / Senior`

Architecture:
```text
Clients
 ↓
Load Balancer
 ↓
API Fleet
 ↓
Database + Cache
```

Incident: a legitimate traffic spike drives one or more downstream resources toward saturation.

Signals:
- request rate
- API CPU/load
- queue depth
- DB pressure
- cache hit rate
- latency
- error rate

Controls:
- API instances
- rate limiting
- cache behavior
- DB protection
- request queue
- optional endpoint shedding

Do not make “scale API instances” the universal answer.

### 44. Rate-Limit Misconfiguration

Category: `API & Traffic Management`  
Difficulty: `Senior`

Architecture:
```text
Clients
 ↓
API Gateway
 ↓
Services
```

Incident: a newly deployed rate-limit policy begins throttling legitimate traffic while allowing some bursty workloads to dominate available capacity.

Signals:
- 429 rate
- request mix
- accepted requests by tenant
- customer success
- backend utilization
- limiter bucket utilization

Controls:
- rate-limit policy
- burst size
- per-tenant quota
- global quota
- priority class
- emergency bypass

Correctness requirement: an emergency bypass that simply disables protection must not automatically count as optimal.

### 45. Load Balancer Imbalance

Category: `API & Traffic Management`  
Difficulty: `Senior`

Architecture:
```text
Clients
 ↓
Load Balancer
 ├→ Instance A
 ├→ Instance B
 ├→ Instance C
 └→ Instance D
```

Incident: one subset of instances receives disproportionate traffic despite healthy fleet capacity.

Signals:
- requests per instance
- per-instance latency
- connection count
- healthy backend count
- global success rate

Controls:
- balancing strategy
- connection draining
- health-check sensitivity
- sticky sessions
- instance count
- traffic weights

A strong solution should address the imbalance, not merely add more instances.

### 46. Thundering Herd

Category: `API & Traffic Management`  
Difficulty: `Senior`

Architecture:
```text
Clients
 ↓
API
 ↓
Shared Resource / Cache / Dependency
```

Incident: a synchronized expiry/retry event causes a sudden burst of identical work.

Signals:
- concurrent requests
- cache misses
- dependency QPS
- request latency
- queue depth

Controls:
- request coalescing
- jitter
- cache TTL
- concurrency
- backoff
- capacity

Important distinction: scaling can help symptoms without fixing synchronized amplification.

### 47. Request Timeout Cascade

Category: `API & Traffic Management`  
Difficulty: `Staff`

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
Dependency
```

Incident: timeouts and retries across multiple layers cause requests to remain alive longer than upstream budgets, creating a feedback loop.

Signals:
- timeout rate by layer
- in-flight requests
- connection utilization
- retry rate
- customer latency

Controls:
- timeout budgets by layer
- retries
- circuit breaking
- concurrency
- request cancellation

Must test end-to-end timeout-budget reasoning.

### 48. Large Payload Regression

Category: `API & Traffic Management`  
Difficulty: `Senior`

Architecture:
```text
Clients
 ↓
Gateway
 ↓
API
 ↓
Storage / Database
```

Incident: a response/request payload change dramatically increases serialization cost, bandwidth, memory pressure, and tail latency.

Signals:
- payload size
- response latency
- memory
- network utilization
- error rate
- throughput

Controls:
- response projection
- compression
- pagination
- payload limit
- instance count
- cache behavior

Do not let raw scaling be the only durable answer.

### 49. API Gateway Saturation

Category: `API & Traffic Management`  
Difficulty: `Senior`

Architecture:
```text
Clients
 ↓
API Gateway
 ↓
Service Fleet
```

Incident: backend services remain healthy but the gateway becomes the actual bottleneck.

Signals:
- gateway queue
- gateway CPU
- backend utilization
- connection count
- downstream latency
- customer latency

Controls:
- gateway capacity
- connection reuse
- route complexity
- rate limits
- auth middleware mode
- backend capacity

Trap: scaling backends should not fix a gateway bottleneck.

### 50. Webhook Delivery Storm

Category: `API & Traffic Management`  
Difficulty: `Staff`

Architecture:
```text
Event Source
 ↓
Webhook Dispatcher
 ↓
Customer Endpoints
```

Incident: a large number of customer endpoints become slow/unreachable, causing retry amplification and queue growth.

Signals:
- webhook backlog
- retry volume
- per-destination failures
- delivery latency
- worker utilization
- DLQ growth

Controls:
- retry strategy
- destination isolation
- concurrency
- backoff
- circuit breaker
- DLQ policy

A strong design should prevent one failing customer destination from damaging all others.

### 51. Bot Traffic Surge

Category: `API & Traffic Management`  
Difficulty: `Staff`

Architecture:
```text
Internet Traffic
 ↓
Edge / Gateway
 ↓
API
 ↓
Core Services
```

Incident: automated traffic rises sharply and resembles legitimate traffic closely enough that coarse blocking would harm real customers.

Signals:
- request volume
- suspicious traffic ratio
- customer success
- rate-limit actions
- backend load
- false-positive rate

Controls:
- rate limits
- challenge policy
- endpoint protection
- tenant/user quotas
- traffic sampling
- cache

Tradeoff: protecting the platform vs blocking legitimate customers.

### 52. Uneven Tenant Traffic

Category: `API & Traffic Management`  
Difficulty: `Staff`

Architecture:
```text
Multi-Tenant API
 ↓
Shared Service Fleet
 ↓
Shared Data Layer
```

Incident: one tenant generates disproportionately high traffic and consumes shared resources.

Signals:
- tenant QPS
- global latency
- tenant latency
- shared-resource pressure
- throttling rate

Controls:
- per-tenant quotas
- global scaling
- priority
- tenant isolation
- caching
- workload routing

Candidate must reason about fairness and platform protection.

## Distributed Systems

### 53. Network Partition

Category: `Distributed Systems`  
Difficulty: `Staff`

Architecture:
```text
Region A
  ↕
Replicated Service
  ↕
Region B
```

Incident: regions lose reliable connectivity while each retains healthy local capacity.

Signals:
- replication health
- regional availability
- stale reads/writes
- quorum status
- conflict risk

Controls:
- write routing
- quorum policy
- read-only mode
- failover
- regional isolation
- consistency mode

The scenario must explicitly encode the product/business consistency requirements.

### 54. Quorum Loss

Category: `Distributed Systems`  
Difficulty: `Staff`

Architecture:
```text
Node A
Node B
Node C
Node D
Node E
   ↓
Consensus Group
```

Incident: enough nodes become unavailable or isolated that safe quorum operation is threatened.

Signals:
- healthy nodes
- quorum count
- leader health
- write availability
- replication status

Controls:
- membership
- node isolation
- read-only mode
- recovery priority
- quorum requirement

Unsafe writes without quorum must be a first-class correctness failure.

### 55. Replication Backlog

Category: `Distributed Systems`  
Difficulty: `Senior / Staff`

Architecture:
```text
Primary
 ↓
Replication Stream
 ↓
Replica(s)
```

Incident: write volume exceeds replication throughput and lag grows continuously.

Signals:
- replication lag
- write throughput
- replica apply rate
- stale-read age
- storage/network pressure

Controls:
- write throttling
- replication workers
- compression/batching
- read routing
- traffic priority
- replica count

Candidate should reason about whether to protect consistency, latency, or ingest throughput.

### 56. Consistency vs Availability Incident

Category: `Distributed Systems`  
Difficulty: `Staff`

Architecture:
```text
Clients
 ↓
Distributed Data Service
 ↙          ↘
Region A    Region B
```

Incident: a connectivity problem makes the service unable to provide both strong consistency and full write availability.

Business context must clearly identify:
- which data requires strong consistency
- which data may tolerate temporary staleness
- what operations may degrade

There must be at least two defensible strategies under different priorities.

This should be one of the batch's strongest candidate-declared scenarios.

### 57. Duplicate Request Processing

Category: `Distributed Systems`  
Difficulty: `Senior / Staff`

Architecture:
```text
Client
 ↓
API Gateway
 ↓
Service
 ↓
Database / Side Effect
```

Incident: client retries, gateway retries, and uncertain acknowledgements cause the same request to execute more than once.

Signals:
- duplicate request rate
- retry volume
- side-effect count
- idempotency hit rate
- customer errors

Controls:
- idempotency key handling
- retry behavior
- timeout behavior
- request deduplication
- transaction handling

Correctness matters more than apparent throughput.

### 58. Idempotency Failure

Category: `Distributed Systems`  
Difficulty: `Staff`

Architecture:
```text
Request Source
 ↓
Service A
 ↓
Queue / Worker
 ↓
External Side Effect
```

Incident: the idempotency store or key-generation strategy fails, allowing duplicated real-world side effects.

Signals:
- duplicate side effects
- idempotency cache/store health
- retry count
- request success
- external side-effect rate

Controls:
- idempotency storage mode
- key scope
- retry strategy
- worker concurrency
- fail-closed/fail-open behavior

Important tradeoff: failing closed may reduce availability but protect correctness.

### 59. Distributed Coordination Failure

Category: `Distributed Systems`  
Difficulty: `Staff`

Architecture:
```text
Workers
  ↓
Coordination Service
  ↓
Shared Scheduling / Ownership State
```

Incident: coordination state becomes stale/intermittent, causing duplicate ownership, missed work, or stalled workers.

Signals:
- ownership conflicts
- stale leases
- scheduler backlog
- completed work
- duplicate work

Controls:
- lease policy
- heartbeat
- fencing
- ownership reconciliation
- worker concurrency
- failover mode

Must avoid becoming a duplicate of Distributed Lock Failure. This scenario should focus on broader coordination/scheduling semantics.

## Deployments & Reliability

### 60. Deployment Regression

Category: `Deployments & Reliability`  
Difficulty: `Senior`

Architecture:
```text
Traffic
 ↓
Load Balancer
 ↙       ↘
Old Version  New Version
     ↓
Shared Dependencies
```

Incident: a newly deployed version introduces a production regression affecting only part of traffic.

Signals:
- errors by version
- latency by version
- rollout percentage
- customer success
- dependency pressure

Controls:
- rollout percentage
- rollback
- traffic routing
- feature flag
- instance count
- dependency protection

Candidate should distinguish between rollback, traffic isolation, masking/scaling, and feature disabling.

Do not make “rollback immediately” the only valid strategy if another safe containment strategy is genuinely defensible.

---

# 5. Batch Complexity Targets

Across the 20 scenarios, target:
- at least 12 with real multi-stage behavior
- at least 8 where a mitigation transfers pressure or risk elsewhere
- at least 7 with correctness/fairness/consistency concerns
- at least 6 with delayed consequences
- at least 6 with more than one defensible mitigation strategy
- at least 5 with a genuine safe-but-imperfect handback possibility

These are quality targets, not quotas.

Do not invent complexity simply to satisfy a count.

---

# 6. Multi-Step Quality Contract

A strong scenario should often follow:

```text
incident appears
    ↓
candidate identifies likely bottleneck/failure mode
    ↓
first mitigation
    ↓
primary symptom improves
    ↓
secondary consequence becomes visible
    ↓
candidate observes
    ↓
second mitigation / tradeoff decision
    ↓
system stabilizes
    ↓
candidate or engine determines completion
```

Avoid one-red-metric → one-obvious-dropdown → resolved unless that simplicity is appropriate to the difficulty.

---

# 7. Observable Evidence Rule

No invisible gotchas.

If the scenario expects a candidate to wait, keep observing, or make a second mitigation, there must be candidate-visible evidence supporting that expectation.

Do not punish a candidate for failing to predict an author-only hidden timer.

---

# 8. Completion-Mode Audit

Do not preassign completion modes from this document.

After each scenario is fully authored, inspect the real reachable state graph and classify it as `automatic` or `candidate_declared`.

Binding rule:

```text
candidate_declared = "Is this system safe enough to hand back?"
automatic          = "Has the objective recovery condition happened?"
```

For every proposed candidate-declared scenario, identify:
- UNSAFE states
- ACCEPTABLE states, if any
- OPTIMAL states

Do not create an acceptable tier simply because a partial path exists.

---

# 9. Immediate-Finish Audit

For every candidate-declared scenario test:

```text
incident starts
→ candidate makes zero changes
→ immediate Finish
```

Investigate any `resolved` result.

If waiting/observation itself is a legitimate strategy, require a meaningful sustained stability interval before Finish is eligible.

Do not require arbitrary configuration changes.

---

# 10. Acceptable Condition Standard

`acceptableCondition` means the system is safe enough to hand back despite a deliberate, bounded tradeoff.

It does not mean:
- almost fixed
- close to threshold
- partial credit
- ineffective mitigation
- a scoring middle tier

---

# 11. Correctness and Business Requirements

For consistency, idempotency, fairness, quorum, or security-like tradeoffs, candidate briefing must state enough business context to make the decision fair.

Do not score candidates against unstated requirements.

Do not give away the fix.

---

# 12. Controls

Each scenario should generally have 4–8 meaningful controls.

Every control should map to a real authored consequence.

Remove dead/cosmetic controls.

---

# 13. Action Reasoning

Existing behavior remains unchanged. Candidate reasoning is optional, persisted, visible in replay/hiring review, and never simulator/scoring input.

---

# 14. Post-Incident Feedback

Every meaningful action classification rule in Phase 6C should include authored feedback where educational explanation is useful.

Feedback explains:
- what happened
- why it happened
- what tradeoff was introduced

Never say “the correct answer was…”

---

# 15. Feedback Leak Boundary

Do not weaken Phase 6.1/6B.1 behavior.

During active play:
```text
no feedback text
no meaningful matched rule id
no hidden rule metadata
```

Completed practice may reveal feedback through the review endpoint.

Assessment candidates do not receive educational feedback.

---

# 16. Scoring

Use only generic declarative scoring.

Six dimensions remain:

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

No scenario-specific scorer functions.

---

# 17. Required Scoring Paths

For every scenario execute actual scorer runs for:
- good/optimal
- baseline/no-action
- harmful

Where genuine:
- partial
- acceptable
- alternate good path

Investigate suspicious outcomes.

Especially flag:
- harmful > strong mitigation
- correctness-violating path near perfect
- immediate no-action Finish unusually high
- acceptable > optimal without a real reason

---

# 18. Terminal-Override Limitation

The known unresolved/failed Recovery/Reliability flattening remains out of scope for broad redesign.

Document legitimate ties.

---

# 19. Generic Engine Extensions

Prefer no engine changes.

Any extension must be scenario-agnostic, deterministic, reusable, and necessary.

Do not add scenario-named scorer/runtime primitives.

---

# 20. No Scenario-Specific UI

All scenarios must use `/incidents/[slug]` and the generic console.

No per-scenario React pages/components.

---

# 21. Difficulty Calibration

Target approximately:
```text
Intermediate: 1–2
Senior:       7–9
Staff:        9–12
```

---

# 22. Duration

Suggested:
```text
Intermediate: 8–12 min
Senior:       12–20 min
Staff:        15–25 min
```

Do not pad with arbitrary timers.

---

# 23. Tests Per Scenario

Every scenario must cover:

Definition:
- validation
- metadata
- scoring
- candidate UI

Runtime:
- trigger
- strong path
- baseline
- harmful path
- delayed effects
- failure

Scoring:
- actual executed totals

Determinism:
- same actions + elapsed time = same state/events/score

Candidate-declared:
- no auto-terminal on success
- Finish unsafe
- Finish acceptable
- Finish optimal
- failure still automatic
- immediate zero-action Finish audited

---

# 24. Cross-Catalog Tests

Confirm:
```text
60 total built-in scenarios
3 free
57 paid
all slugs unique
all definitions valid
all scoring configs valid
all candidate UI valid
all built-ins resolvable
paid practice locked
assessment assignment bypasses practice lock
```

---

# 25. Suggested Gated Execution Plan

## 6C.1
41 Partial Regional Dependency Failure  
42 Dependency Rate-Limit Exhaustion  
43 API Traffic Spike  
44 Rate-Limit Misconfiguration  
45 Load Balancer Imbalance

## 6C.2
46 Thundering Herd  
47 Request Timeout Cascade  
48 Large Payload Regression  
49 API Gateway Saturation  
50 Webhook Delivery Storm

## 6C.3
51 Bot Traffic Surge  
52 Uneven Tenant Traffic  
53 Network Partition  
54 Quorum Loss  
55 Replication Backlog

## 6C.4
56 Consistency vs Availability Incident  
57 Duplicate Request Processing  
58 Idempotency Failure  
59 Distributed Coordination Failure  
60 Deployment Regression

For every batch:

```text
5 parallel authors
→ 5 independent verifiers
→ primary filesystem verification
→ batch-wide tests
→ approve
```

Do not start the next batch before the current batch passes its gate.

---

# 26. Worker Rules

Scenario agents may modify only their own scenario files.

The orchestrator owns shared:
- catalog
- index
- simulator
- scorer
- shared UI

No agent self-report counts as completion.

---

# 27. Verification Rules

For each scenario inspect actual filesystem state and run its tests directly.

Verify:
- files really changed
- rules exist
- scoring exists
- feedback exists
- score claims reproduce
- completion semantics match
- no hidden gotcha
- deterministic replay passes

---

# 28. Anti-Gotcha Audit

For every delayed or harmful path answer:

> Could a candidate know this was unsafe from candidate-visible evidence?

If not, fix the scenario.

---

# 29. Multi-Step Audit

For each scenario document:

```text
Initial problem
First likely mitigation
Secondary consequence
Next decision
Potential tradeoff
Completion criterion
```

If it collapses to `set X = Y`, review the scenario depth.

---

# 30. Alternate Good Paths

Support multiple valid approaches where legitimately defensible.

Do not invent alternatives solely for variety.

---

# 31. Manual QA Priority Scenarios

Run live:

A. Partial Regional Dependency Failure  
B. Rate-Limit Misconfiguration  
C. Webhook Delivery Storm  
D. Network Partition  
E. Consistency vs Availability Incident  
F. Idempotency Failure

Verify each scenario's intended tradeoff and observability.

---

# 32. Manual Finish QA

For every new candidate-declared scenario test:

```text
immediate zero-action Finish
unsafe Finish
acceptable Finish, where applicable
optimal Finish
```

Verify outcome, completion tier, score, note, and timeline.

---

# 33. Post-Incident Feedback QA

For at least five scenarios across at least four categories:

- signed-in practice
- beneficial action
- harmful action
- neutral action where available
- terminal completion
- review feedback
- action-time-state correctness
- no live feedback leak

Perform actual browser QA, not code-only verification.

---

# 34. Assessment QA

Use at least one automatic and one candidate-declared Phase 6C scenario.

Verify:
- paid assignment works
- hidden rules remain server-side
- Finish works
- failure remains automatic
- company sees reasoning/outcome/completion note
- candidate gets no educational feedback

---

# 35. Full Validation

Run all aggregate or equivalent package-level checks:

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

Seed must report:
```text
Seed complete (60 built-in scenario(s)).
```

---

# 36. Completion Report

Return:

1. files created/modified
2. final catalog count
3. exact 20 scenarios added
4. category distribution
5. difficulty distribution
6. estimated-duration distribution
7. completion-mode classification
8. rationale for candidate-declared scenarios
9. acceptableCondition scenarios
10. scenarios intentionally having no acceptable tier
11. immediate-Finish audit
12. multi-step audit
13. observable delayed-risk audit
14. correctness/integrity scenarios
15. fairness/tenant-isolation scenarios
16. alternate-good-path scenarios
17. generic engine/schema changes
18. justification for any shared engine change
19. authored feedback coverage
20. feedback leak-boundary verification
21. scoring table
22. suspicious scores/ties investigated
23. legitimate scoring limitations
24. per-scenario tests
25. catalog-level tests
26. anonymous paid-lock verification
27. assessment override verification
28. Manual QA A
29. Manual QA B
30. Manual QA C
31. Manual QA D
32. Manual QA E
33. Manual QA F
34. candidate-declared Finish QA
35. post-incident feedback QA
36. assessment QA
37. total test count
38. typecheck result
39. lint result
40. test result
41. build result
42. seed result
43. deviations
44. product/UX concerns

---

# 37. Stop Condition

Phase 6C is complete only when:

```text
60 built-in scenarios exist
3 remain free
57 are paid
all tests are green
all 20 new scenarios are fully authored
scoring tests exist for every new scenario
feedback is authored
candidate-declared semantics are audited
manual QA is complete
seed reports 60
```

Stop after returning the completion report.

Do not begin Phase 6D / scenarios 61–80.

---

# Final Quality Principle

For every Phase 6C scenario ask:

> Can a strong candidate reason about this system from the evidence they are given?

> Does the scenario distinguish symptom treatment from durable system recovery?

> Does it test tradeoffs, correctness, fairness, or operational judgment rather than control guessing?

A strong Phase 6C incident should increasingly force the candidate to ask:

```text
What is actually failing?
Is this local, regional, or global?
Am I fixing the bottleneck or transferring it?
Am I protecting one tenant by harming everyone else?
Am I increasing availability by sacrificing correctness?
Is this retry safe?
Is the system stable, or merely temporarily quiet?
Is this state safe enough to hand back?
```

That is the standard for scenarios 41–60.
