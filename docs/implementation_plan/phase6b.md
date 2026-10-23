# IncidentRank — Phase 6B: Scenario Library Expansion, Scenarios 21–40

## Status

Phase 6A delivered the first 20 launch scenarios and the scalable scenario-library architecture.

Phase 6.1 added:

- candidate-declared completion
- acceptable vs optimal completion tiers
- server-authoritative Finish evaluation
- multi-step incident semantics
- post-incident authored feedback
- generic string-state scoring
- full scoring-path regression coverage
- observable-signal requirements for delayed risks
- practice/assessment completion parity

Phase 6B now adds **exactly 20 additional production-quality IncidentRank scenarios**, bringing the built-in catalog from:

```text
20 → 40 scenarios
```

Do not begin scenarios 41–60 in this phase.

---

# 1. Primary Goal

Author and ship scenarios **21–40** using the existing generic scenario/runtime/scoring infrastructure.

The objective is NOT merely:

> Add twenty more incident files.

Phase 6B must prove that IncidentRank can represent increasingly complex production systems where candidates need to reason across:

- multiple services
- multiple subsystems
- delayed effects
- data correctness
- distributed coordination
- failover
- capacity
- backpressure
- consistency
- operational tradeoffs
- partial mitigation
- safe handback decisions

The dominant quality bar is:

> **Does this incident test engineering judgment, or does it merely ask the candidate to discover the right dropdown?**

---

# 2. Binding Product Doctrine

Do not change these principles.

IncidentRank does **not** recreate cloud infrastructure mathematically.

It recreates:

```text
production decisions
→ authored consequences
→ evolving observable system state
```

The model remains:

```text
Candidate action
        ↓
Authored deterministic rule
        ↓
Authored consequence
        ↓
New system state
        ↓
Candidate observes
        ↓
Next decision
```

Do not introduce:

- CPU queueing formulas
- arbitrary infrastructure simulation equations
- arbitrary JavaScript scenario scripts
- shell access
- Kubernetes terminals
- SQL consoles
- freeform infrastructure commands

---

# 3. Scenario Count

Add exactly **20 new built-in scenarios**.

Catalog after Phase 6B:

```text
40 total built-in scenarios

3 free
37 paid
```

The existing free scenarios remain the only free scenarios:

```text
Payment Retry Storm
Database Connection Saturation
Kafka Consumer Lag
```

All Phase 6B scenarios:

```text
isFree: false
```

Do not change the free set.

---

# 4. Phase 6B Scenario List

Implement these 20 scenarios.

## Databases & Storage

### 21. Missing Database Index

Category:

```text
Databases & Storage
```

Difficulty:

```text
Intermediate / Senior
```

Core architecture:

```text
Clients
  ↓
API Service
  ↓
Orders Service
  ↓
PostgreSQL Primary
```

Incident:

A recently deployed query path begins performing full-table scans as traffic rises.

Candidate should observe interaction between:

- query latency
- DB CPU
- scanned rows
- connection utilization
- API latency
- request queueing

Potential controls:

- enable targeted index
- increase API instances
- increase DB connection pool
- disable expensive endpoint
- reduce query page size
- enable temporary cache

Important design requirement:

Scaling application instances must be capable of making DB contention worse.

Strong resolution paths should include a real database-side correction, not merely throwing capacity at the API layer.

---

### 22. Deadlock Storm

Category:

```text
Databases & Storage
```

Difficulty:

```text
Senior
```

Architecture:

```text
Checkout
   ↓
Order Service ─────┐
                   ↓
              PostgreSQL
                   ↑
Inventory Service ─┘
```

Incident:

Two services acquire shared resources in inconsistent order after a deployment.

Signals:

- deadlocks/sec
- transaction retries
- lock wait time
- checkout failures
- inventory update latency
- DB connections

Controls may include:

- transaction ordering strategy
- deadlock retry policy
- retry backoff
- transaction scope
- service concurrency
- temporary write serialization

Design requirement:

Simply increasing retries should amplify DB pressure.

There should be a distinction between:

```text
masking deadlocks
```

and:

```text
removing the underlying lock-order conflict
```

---

### 23. Hot Database Partition

Category:

```text
Databases & Storage
```

Difficulty:

```text
Staff
```

Architecture:

```text
API
 ↓
Routing Layer
 ↓
Distributed Database
 ├─ Partition A
 ├─ Partition B
 ├─ Partition C
 └─ Partition D
```

Incident:

A small number of high-volume tenants concentrate traffic on one partition.

Signals:

- per-partition request rate
- partition latency
- queue depth
- tenant traffic distribution
- global API latency
- throttled requests

Controls:

- partitioning strategy
- tenant throttling
- shard split
- routing policy
- cache hot tenants
- temporary per-tenant limits

Required tradeoff:

Candidate may need to choose between:

```text
protecting all tenants equally
```

and:

```text
temporarily constraining one hot tenant to preserve the platform
```

This is a strong candidate for `candidate_declared` if a genuine safe-but-imperfect handback state exists.

---

### 24. Primary Database Failover

Category:

```text
Databases & Storage
```

Difficulty:

```text
Staff
```

Architecture:

```text
Application Services
        ↓
    DB Proxy
    /      \
Primary   Replica
```

Incident:

Primary DB health degrades and eventually becomes unavailable.

Candidate decisions should involve:

- failover timing
- replication lag
- write safety
- connection draining
- read/write routing
- old-primary fencing

Potential trap:

Promoting a lagging replica too aggressively can restore availability while creating stale/lost writes or split-primary risk.

This scenario must include a meaningful **availability vs correctness** tradeoff.

---

### 25. Storage IOPS Saturation

Category:

```text
Databases & Storage
```

Difficulty:

```text
Senior
```

Architecture:

```text
API
 ↓
Database
 ↓
Persistent Storage
```

Incident:

A background workload begins saturating storage IOPS.

Signals:

- read/write latency
- IOPS utilization
- DB query latency
- checkpoint pressure
- API latency
- batch throughput

Controls:

- batch concurrency
- checkpoint frequency
- storage tier
- query concurrency
- background workload pause
- read-cache behavior

Candidate should be able to restore customer health while intentionally slowing non-critical background processing.

---

# Messaging & Event Streaming

### 26. Message Retry Storm

Category:

```text
Messaging & Streaming
```

Difficulty:

```text
Senior
```

Architecture:

```text
Producer
  ↓
Queue/Broker
  ↓
Workers
  ↓
Dependency
```

Incident:

A downstream dependency becomes partially unhealthy. Worker retries multiply traffic faster than messages are being processed.

Signals:

- queue depth
- retry rate
- downstream request volume
- worker success rate
- dependency errors
- processing latency

Controls:

- retry count
- backoff
- concurrency
- DLQ threshold
- circuit breaker
- worker count

This must NOT simply duplicate Payment Retry Storm.

The core problem here is:

```text
asynchronous amplification + queue health
```

not synchronous checkout traffic.

---

### 27. Dead-Letter Queue Explosion

Category:

```text
Messaging & Streaming
```

Difficulty:

```text
Senior
```

Architecture:

```text
Events
 ↓
Consumer
 ├→ Main Processing
 └→ DLQ
       ↓
   Reprocessor
```

Incident:

A schema/content issue causes large numbers of otherwise recoverable events to enter the DLQ.

A reprocessor simultaneously begins replaying them.

Signals:

- DLQ growth
- replay throughput
- main queue lag
- processing error reason
- reprocessor load
- duplicate processing risk

Candidate decisions:

- pause replay
- filter failure class
- increase retry delay
- fix parser/schema compatibility mode
- scale consumers
- discard events

Important trap:

Deleting the DLQ may make operational metrics look healthy while causing data loss.

Data Integrity scoring must meaningfully detect this.

---

### 28. Duplicate Event Processing

Category:

```text
Messaging & Streaming
```

Difficulty:

```text
Staff
```

Architecture:

```text
Producer
 ↓
Broker
 ↓
Consumers
 ↓
Payment/Order Side Effects
```

Incident:

Consumer acknowledgements fail intermittently, causing redelivery.

Throughput looks healthy, but side effects begin occurring multiple times.

Signals:

- duplicate event rate
- consumer throughput
- acknowledgement failures
- duplicate orders/payments
- retry/redelivery volume

Controls:

- idempotency handling
- acknowledgement timing
- retry policy
- consumer concurrency
- deduplication window
- processing semantics

Critical product requirement:

A high-throughput state with duplicate side effects must never count as optimal simply because availability metrics are healthy.

Correctness must be first-class.

---

### 29. Out-of-Order Events

Category:

```text
Messaging & Streaming
```

Difficulty:

```text
Staff
```

Architecture:

```text
Producers
   ↓
Partitioned Event Stream
   ↓
Stateful Consumers
   ↓
Materialized State
```

Incident:

A scaling/routing change increases throughput but breaks event ordering for related entities.

Signals:

- throughput
- lag
- stale-state corrections
- ordering violations
- state reconciliation rate

Potential controls:

- partition key
- consumer parallelism
- reorder buffer
- sequence validation
- delayed processing tolerance

Required tradeoff:

One mitigation may intentionally sacrifice throughput to restore ordering guarantees.

A second strategy may achieve higher throughput while accepting bounded reconciliation.

Only make the latter Finish-eligible if it is genuinely safe.

---

### 30. Event Processing Backpressure

Category:

```text
Messaging & Streaming
```

Difficulty:

```text
Staff
```

Architecture:

```text
Event Producers
      ↓
     Kafka
      ↓
Processing Layer
      ↓
Database + External API
```

Incident:

Producers exceed downstream processing capacity.

Candidate must balance:

- ingestion
- processing concurrency
- database pressure
- external dependency pressure
- queue growth
- customer freshness

Controls:

- producer throttling
- worker concurrency
- consumer count
- batch size
- external-call concurrency
- priority routing

This should be deliberately multi-step.

Increasing consumers alone should eventually transfer the bottleneck downstream.

---

# Caching

### 31. Cache Node Failure

Category:

```text
Caching
```

Difficulty:

```text
Intermediate / Senior
```

Architecture:

```text
API Cluster
    ↓
Distributed Cache
    ↓
Primary Database
```

Incident:

One cache node fails and keys redistribute.

Signals:

- cache hit rate
- DB reads
- cache-node load
- API latency
- eviction rate

Controls:

- cache node count
- failover mode
- DB request protection
- cache warming
- application concurrency

Trap:

Aggressively warming the cache can produce a DB load spike.

---

### 32. Hot-Key Cache Overload

Category:

```text
Caching
```

Difficulty:

```text
Senior
```

Architecture:

```text
Clients
 ↓
API
 ↓
Distributed Cache
```

Incident:

One extremely popular key overloads one cache shard.

Signals:

- per-key traffic
- shard utilization
- cache latency
- origin traffic
- API latency

Controls:

- key replication
- local caching
- TTL
- request coalescing
- sharding strategy
- origin protection

Simply scaling unrelated cache nodes should not solve the hot-key problem.

---

### 33. Cache Eviction Storm

Category:

```text
Caching
```

Difficulty:

```text
Senior
```

Architecture:

```text
API
 ↓
Cache
 ↓
Database
```

Incident:

A deployment changes object size/cardinality and causes rapid eviction churn.

Signals:

- eviction rate
- hit ratio
- memory utilization
- DB reads
- cache latency
- API latency

Controls:

- cache memory
- TTL
- object caching policy
- cache admission policy
- API concurrency
- DB protection

The candidate should distinguish:

```text
cache capacity problem
```

from:

```text
cache policy/cardinality problem
```

---

# Microservices & Dependencies

### 34. Service Discovery Failure

Category:

```text
Microservices & Dependencies
```

Difficulty:

```text
Senior
```

Architecture:

```text
API Gateway
    ↓
Service A
   / \
  ↓   ↓
B     C
      ↓
Service Registry / Discovery
```

Incident:

Service discovery begins returning stale/unhealthy endpoints.

Signals:

- connection failures
- healthy endpoint count
- discovery refresh age
- service latency
- retry volume

Controls:

- discovery refresh interval
- endpoint cache TTL
- retry behavior
- fallback routing
- health-check policy

Potential trap:

Increasing retries can amplify traffic against stale endpoints.

---

### 35. Dependency Timeout Cascade

Category:

```text
Microservices & Dependencies
```

Difficulty:

```text
Staff
```

Architecture:

```text
Client
 ↓
API
 ↓
Service A
 ↓
Service B
 ↓
Service C
```

Incident:

The deepest dependency slows down.

Upstream timeouts are poorly aligned, causing blocked threads/connections and cascading exhaustion.

Signals:

- latency at every service
- timeout rate
- outstanding requests
- connection pools
- customer success rate

Controls:

- timeout values at multiple hops
- retries
- circuit breaker
- concurrency
- fallback behavior

This must test **timeout-budget reasoning across multiple services**, not simply “lower timeout.”

---

### 36. Fan-Out Request Explosion

Category:

```text
Microservices & Dependencies
```

Difficulty:

```text
Staff
```

Architecture:

```text
API
 ↓
Aggregator
 ├→ Service A
 ├→ Service B
 ├→ Service C
 ├→ Service D
 └→ Service E
```

Incident:

A request-path change dramatically increases fan-out and one downstream service degrades.

Signals:

- requests per user request
- downstream QPS
- aggregator latency
- partial-response rate
- dependency saturation
- customer success

Controls:

- fan-out concurrency
- optional dependency inclusion
- partial response policy
- caching
- request batching
- downstream timeout

Strong candidates should be able to preserve core functionality by sacrificing optional enrichment.

This is a good potential `candidate_declared` scenario.

---

# Distributed Systems

### 37. Split-Brain Incident

Category:

```text
Distributed Systems
```

Difficulty:

```text
Staff
```

Architecture:

```text
Region A
   ↕
Distributed Coordinator
   ↕
Region B
```

Incident:

Network isolation causes two sides to believe they are authoritative.

Signals:

- leader count
- replication divergence
- writes per region
- quorum state
- conflict count
- customer availability

Controls:

- fencing
- write routing
- quorum requirement
- region isolation
- read-only mode
- reconciliation policy

Critical requirement:

Availability must not dominate correctness.

A candidate who keeps both regions writable may improve apparent availability while causing severe integrity damage.

---

### 38. Leader Election Storm

Category:

```text
Distributed Systems
```

Difficulty:

```text
Staff
```

Architecture:

```text
Cluster Nodes
     ↓
Consensus / Coordination Layer
```

Incident:

Intermittent network latency causes repeated leadership changes.

Signals:

- leader changes/minute
- election duration
- request failures
- replication lag
- quorum health
- cluster throughput

Controls:

- election timeout
- heartbeat interval
- node isolation
- quorum membership
- client retry behavior

Do not model this as a magic “increase timeout” puzzle.

Changes should involve tradeoffs between:

```text
failure-detection speed
```

and:

```text
stability under transient latency
```

---

### 39. Distributed Lock Failure

Category:

```text
Distributed Systems
```

Difficulty:

```text
Staff
```

Architecture:

```text
Workers
   ↓
Distributed Lock Service
   ↓
Shared Resource
```

Incident:

Lock leases expire while workers are still processing, allowing concurrent owners.

Signals:

- lock contention
- overlapping owners
- lease expiry count
- duplicate work
- processing duration
- correctness violations

Controls:

- lease duration
- lease renewal
- fencing token
- worker concurrency
- retry behavior

Important requirement:

Simply increasing lease duration should reduce symptoms but introduce slow failure recovery.

Using fencing/ownership validation should be the cleaner solution.

---

### 40. Cross-Region Latency Spike

Category:

```text
Distributed Systems
```

Difficulty:

```text
Staff
```

Architecture:

```text
US Region
  ↕
Global Services
  ↕
EU Region
```

Incident:

Cross-region latency rises sharply while both regions remain individually healthy.

Signals:

- inter-region RTT
- replication lag
- synchronous-write latency
- regional customer latency
- cross-region request volume

Controls:

- traffic locality
- consistency mode
- synchronous replication
- read routing
- cross-region dependency usage
- regional failover

This should require a real decision between:

```text
consistency
availability
latency
```

Do not make one universally correct answer unless the scenario's business constraints explicitly demand it.

---

# 5. Complexity Requirements

Phase 6B exists partly because the first batch leaned too heavily toward incidents where one or two controls produced the answer.

These scenarios must be more representative of real systems.

At a batch level, target:

- at least **12 of 20** with meaningful multi-stage behavior
- at least **8 of 20** where one mitigation moves pressure into another subsystem
- at least **5 of 20** involving correctness/integrity/ordering/consistency concerns
- at least **6 of 20** with delayed consequences
- at least **5 of 20** with more than one reasonable mitigation strategy

These are quality targets, not artificial quotas.

If a scenario should genuinely be simpler, keep it simple and explain why.

Do not manufacture complexity.

---

# 6. Multi-Step Scenario Contract

A strong Phase 6B scenario should often resemble:

```text
Incident appears
      ↓
Candidate diagnoses initial symptom
      ↓
Mitigation A
      ↓
Customer metric improves
      ↓
Secondary subsystem becomes constrained
      ↓
Candidate observes consequence
      ↓
Mitigation B / tradeoff decision
      ↓
System stabilizes
      ↓
Candidate or engine determines completion
```

Avoid:

```text
red metric
→ select obvious control
→ everything green
```

except where the scenario genuinely represents an intermediate-level incident.

---

# 7. Observable Evidence Rule

No hidden gotchas.

If an authored future event is expected to influence candidate judgment, the candidate must have a legitimate observable reason to anticipate that the system is not yet stable.

This does NOT mean exposing the future event itself.

Good:

```text
queue depth ↑
connection headroom ↓
replication lag ↑
lease expiry frequency ↑
```

Bad:

```text
everything healthy
→ hidden timer
→ catastrophic surprise
```

Unless the event is intentionally an external incident event that no engineer could predict, in which case it must not retroactively make a previously correct handback decision “wrong.”

---

# 8. Completion Mode Audit

Do NOT preassign completion modes purely from the scenario names above.

After implementing the state/rule model for each scenario, audit it and classify:

```text
automatic
```

or:

```text
candidate_declared
```

Use the Phase 6.1 rule:

```text
candidate_declared
= "Is this system safe enough to hand back?"

automatic
= "Has an objective recovery condition happened?"
```

Before setting `candidate_declared`, explicitly identify:

```text
UNSAFE states
ACCEPTABLE states, if any
OPTIMAL states
```

Most scenarios may legitimately have:

```text
no acceptableCondition
```

Do not invent one.

---

# 9. Acceptable Condition Standard

`acceptableCondition` means:

> The system is operationally safe enough for an engineer to hand back even though it is not in the best achievable state.

It does NOT mean:

- almost passed
- score needed more differentiation
- metric missed threshold by 5%
- partial mitigation deserves credit

Examples where it may be legitimate:

```text
bounded tenant throttling protecting platform stability

degraded-but-safe consistency mode explicitly permitted by business requirements

optional enrichment disabled while core customer path is healthy

regional traffic isolated with known reduced redundancy
```

Scoring may distinguish:

```text
optimal > acceptable
```

Both may produce:

```text
outcome = resolved
```

when Finish is valid.

---

# 10. Data Integrity and Correctness

Phase 6B contains several scenarios where healthy availability metrics can conceal an unsafe system.

Examples:

- Primary Database Failover
- Duplicate Event Processing
- Out-of-Order Events
- Split Brain
- Distributed Lock Failure
- Cross-Region Latency Spike

These MUST model correctness explicitly.

Do not allow:

```text
availability healthy
latency healthy
→ resolved
```

when the system is:

```text
duplicating money movement
losing writes
accepting concurrent leaders
breaking ordering guarantees
corrupting shared state
```

Use generic numeric/string state fields and scoring conditions.

Do not add scenario-specific scorer code.

---

# 11. Action Controls

Each scenario should generally expose:

```text
4–8 meaningful controls
```

Controls should represent realistic engineering choices, not trivia.

Good:

```text
retry strategy
consumer concurrency
partition strategy
failover target
quorum policy
traffic locality
fencing
timeout budget
```

Avoid controls that differ only cosmetically.

Every control should participate in at least one meaningful authored consequence.

Delete dead controls.

---

# 12. Candidate Reasoning

Existing behavior remains:

Each Apply action may have:

```text
Why are you making this change?
```

Reasoning:

- optional
- attempt metadata only
- never simulator input
- never scorer input
- visible in replay/hiring review

No changes required unless integration breaks.

---

# 13. Post-Incident Feedback Is Mandatory for Phase 6B

Unlike the first 20 scenarios, Phase 6B should not defer educational feedback.

Every meaningful `ActionClassificationRule` should have authored feedback where an explanation provides educational value.

Example:

```ts
feedback: {
  title: "Retry amplification increased",
  explanation:
    "Increasing retries while the downstream dependency remained degraded multiplied request volume and increased queue pressure."
}
```

Feedback must explain:

```text
what happened
why it happened
what tradeoff existed
```

Do not write:

```text
"The correct answer was X."
```

Multiple good paths remain valid.

---

# 14. Feedback Leak Boundary

Existing Phase 6.1 boundary remains binding.

During active play:

```text
NO feedback title
NO feedback explanation
NO meaningful matched rule identifier
```

may enter candidate live state.

Completed practice:

```text
review endpoint
→ replay/reclassify
→ reveal authored feedback
```

Assessment:

```text
no educational feedback exposed to candidate
```

Do not weaken this boundary.

---

# 15. Scoring

Every scenario must use generic declarative scoring.

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

Not every dimension must meaningfully discriminate every scenario, but the configuration must be defensible.

Do not create scenario-specific scorer functions.

---

# 16. Scoring Fidelity

For each scenario, execute and record at minimum:

```text
good path
baseline/no-action
harmful path
```

Where genuine:

```text
partial path
acceptable path
alternate good path
```

Do not force:

```text
good > partial > baseline > harmful
```

if semantics do not justify it.

But suspicious results must be investigated.

Examples:

```text
harmful > strong mitigation
```

or:

```text
data-loss path scores 950
```

should trigger review.

Document legitimate ties.

---

# 17. Known Terminal-Override Limitation

Phase 6.1 identified that unresolved/failed attempts may collapse Recovery/Reliability distinctions.

Do NOT redesign the entire scoring model in Phase 6B unless a Phase 6B scenario is impossible to score sensibly without doing so.

If the limitation produces a suspicious tie:

1. verify whether another existing generic scoring measure can distinguish it honestly
2. improve scenario scoring if justified
3. document the tie if it is still legitimate

Do not invent arbitrary penalties to make charts prettier.

---

# 18. Scenario Definition Requirements

Every new scenario must define:

- title
- slug
- version
- short description
- category
- difficulty
- estimated minutes
- tags
- skills
- `isFree: false`
- architecture
- controls
- initial state
- numeric/string state where needed
- metrics
- severity/watch metadata
- timed events
- rules/consequences
- failure condition
- success condition
- acceptable condition only if genuinely justified
- completion mode
- revenue/customer-impact rates where meaningful
- infrastructure cost where meaningful
- action classifications
- post-incident feedback
- scoring config
- candidate UI

---

# 19. Library Metadata

All 20 must automatically appear in:

```text
/incidents
```

through the existing central catalog.

No registry switch.

No new route.

No scenario-specific React component.

No per-scenario scoring dispatch.

Adding each scenario should be primarily content work.

---

# 20. Paid Access

All 20 Phase 6B scenarios:

```text
Paid
```

Practice behavior:

```text
anonymous
→ visible, locked

signed-in without entitlement
→ visible, locked

localhost dev unlock
→ playable for development only

assigned company assessment
→ playable regardless of personal entitlement
```

Do not implement billing.

Do not implement subscriptions.

Do not create fake personal entitlements.

---

# 21. Scenario-Specific React Is Forbidden

Do not create:

```text
hot-database-partition-console.tsx
split-brain-console.tsx
...
```

Use the existing generic console.

If a scenario cannot render through the generic UI, first determine whether the required capability is genuinely generic.

Only extend generic UI primitives where multiple current/future scenarios can benefit.

---

# 22. Generic Engine Extensions

Do not modify simulator architecture merely because a scenario author wants convenience.

A generic engine extension is justified only if:

1. a real production concept cannot be represented with current primitives
2. the new primitive is scenario-agnostic
3. multiple future incidents could plausibly use it
4. it remains deterministic
5. it does not become arbitrary scripting

Examples that MAY be legitimate:

```text
generic state comparison
generic bounded condition
generic trend condition
generic typed state
```

Examples that are NOT legitimate:

```text
KafkaOrderingPenalty
SplitBrainResolver
DatabaseFailoverScore
```

---

# 23. Trend Use

Trend can be important in:

- backpressure
- queues
- lag
- replication
- cross-region recovery
- storage saturation

If existing generic state transitions can represent this safely, use them.

Do not build a complex time-series engine unless a scenario genuinely requires it.

Candidate-visible direction such as:

```text
↑ rising
→ stable
↓ falling
```

is appropriate where the underlying state/history supports it.

---

# 24. Difficulty Calibration

Target distribution for this batch:

```text
Intermediate: ~2–3
Senior:       ~8–10
Staff:        ~8–10
```

Do not inflate difficulty labels.

Staff scenarios should genuinely require:

- system-level reasoning
- tradeoffs
- correctness
- multiple interacting components
- or architecture-level decisions

not merely more controls.

---

# 25. Estimated Duration

Target:

```text
Intermediate: 8–12 min
Senior:       12–20 min
Staff:        15–25 min
```

These are approximate.

Do not artificially add timers to hit duration.

---

# 26. Tests Per Scenario

Every scenario must include dedicated tests before Phase 6B is considered complete.

At minimum:

### Definition

```text
validates
catalog metadata complete
scoring config present
candidate UI present
```

### Runtime

```text
incident event fires
strong path behaves correctly
harmful path behaves correctly
baseline behaves correctly
delayed consequences occur
failure path works
```

### Scoring

Execute actual scorer for:

```text
good
baseline
harmful
```

plus relevant:

```text
partial
acceptable
alternate good
```

### Determinism

Same actions + same elapsed simulation time:

```text
→ identical state
→ identical events
→ identical score
```

### Candidate-declared scenarios

Additionally:

```text
success does not auto-terminal
acceptable does not auto-terminal
Finish optimal → resolved/optimal
Finish acceptable → resolved/acceptable
Finish unsafe → declared_unstable
automatic failure still works
```

---

# 27. Cross-Scenario Tests

Add/extend library-level tests confirming:

```text
40 total built-in scenarios
3 free
37 paid
all slugs unique
all built-ins resolvable
all definitions validate
all scoring configs valid
all candidate UI descriptors valid
all catalog entries complete
all paid scenarios lock in practice
all assessment assignments bypass practice lock
```

No manual allowlist should need updating except the central content catalog itself.

---

# 28. Anti-Gotcha Audit

Before considering any scenario complete, explicitly answer:

```text
Does the candidate have enough observable evidence
to make the decision we are scoring?
```

For every harmful/unsafe delayed path.

If answer is:

```text
"No, they only know because rules.ts knows."
```

fix the scenario.

---

# 29. Multi-Step Audit

For each scenario, document:

```text
Initial problem
First likely mitigation
Secondary consequence
Next decision
Potential tradeoff
Completion criterion
```

If the answer collapses into:

```text
set control X = Y
```

review whether the scenario is rich enough for its claimed difficulty.

---

# 30. Alternate Strong Paths

Where appropriate, support more than one good strategy.

Example:

Cross-Region Latency Spike might allow:

```text
localize reads + tolerate bounded replication lag
```

or:

```text
temporarily route all critical writes to one region
```

if both are safe under the scenario's business constraints.

Do not hardcode one sacred solution when multiple approaches are legitimately defensible.

---

# 31. Business Constraints

For scenarios involving tradeoffs, candidate briefing must contain enough business context to know what matters.

Example:

If strong ordering is mandatory:

```text
"Per-account transaction ordering must be preserved."
```

If stale reads are acceptable for 60 seconds:

state it.

Do not score candidates against requirements they were never given.

This is especially important for:

- Primary DB Failover
- Out-of-Order Events
- Duplicate Processing
- Split Brain
- Cross-Region Latency

---

# 32. Candidate Briefing Must Not Give Away the Fix

Business constraints:

```text
yes
```

Solution hints:

```text
no
```

Good:

> Payment operations must remain idempotent. Duplicate charges are considered a critical integrity incident.

Bad:

> Enable idempotency keys on the consumer.

---

# 33. Manual QA Priority Scenarios

Manually run at least these six in the browser:

### A. Hot Database Partition

Verify:

- one tenant causes asymmetric load
- broad scaling isn't enough
- candidate can observe tenant/partition asymmetry

### B. Duplicate Event Processing

Verify:

- throughput can look healthy while integrity degrades
- duplicate side effects are visible
- unsafe high-throughput state doesn't resolve

### C. Event Processing Backpressure

Verify:

- adding consumers can move pressure downstream
- multi-stage mitigation works

### D. Fan-Out Request Explosion

Verify:

- candidate can trade optional functionality for core availability
- no hidden success oracle

### E. Split Brain

Verify:

- apparent availability can coexist with correctness failure
- fencing/read-only/quorum decisions behave coherently

### F. Cross-Region Latency Spike

Verify:

- consistency/availability/latency tradeoffs are observable
- scenario does not imply one magical universal answer

---

# 34. Manual Finish QA

For every new `candidate_declared` scenario:

Run at least:

```text
Finish unsafe
Finish acceptable, if applicable
Finish optimal
```

Verify the correct:

```text
outcome
completionTier
score
timeline
completion note
```

---

# 35. Post-Incident Review QA

For at least 5 scenarios across different categories:

Complete practice attempts containing:

```text
beneficial action
harmful action
neutral/ineffective action
```

Verify result review explains each authored consequence accurately.

No feedback should appear during active play.

---

# 36. Assessment QA

Choose at least:

```text
1 automatic Phase 6B scenario
1 candidate_declared Phase 6B scenario
```

Assign each through a company assessment.

Verify:

- paid lock does not block assignment
- hidden definition remains server-side
- candidate-declared assessment Finish works
- failure remains automatic
- company result sees candidate timeline/reasoning/completion declaration

---

# 37. Do Not Work On

Do not add:

- scenarios 41–60
- billing
- subscriptions
- personal Pro entitlement
- public IncidentRank profile changes
- AI scoring
- LLM feedback
- candidate chat
- collaborative incident rooms
- proctoring
- webcam/mic features
- freeform command execution

---

# 38. Suggested Implementation Order

## 6B.1 — Author 5 foundational scenarios

```text
21 Missing Database Index
22 Deadlock Storm
26 Message Retry Storm
31 Cache Node Failure
34 Service Discovery Failure
```

Validate authoring ergonomics.

---

## 6B.2 — Author 5 multi-system scenarios

```text
23 Hot Database Partition
25 Storage IOPS Saturation
30 Event Processing Backpressure
35 Dependency Timeout Cascade
36 Fan-Out Request Explosion
```

Validate multi-step behavior.

---

## 6B.3 — Author 5 correctness-heavy scenarios

```text
24 Primary Database Failover
27 Dead-Letter Queue Explosion
28 Duplicate Event Processing
29 Out-of-Order Events
39 Distributed Lock Failure
```

Validate integrity scoring.

---

## 6B.4 — Author 5 distributed-system scenarios

```text
32 Hot-Key Cache Overload
33 Cache Eviction Storm
37 Split-Brain Incident
38 Leader Election Storm
40 Cross-Region Latency Spike
```

Validate Staff-level complexity.

---

## 6B.5 — Full QA

Run every scenario through:

```text
runtime
scoring
completion-mode audit
feedback audit
anti-gotcha audit
library integration
assessment integration
```

---

# 39. Validation Commands

Before completion:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:seed
```

All must pass.

Seed should report:

```text
40 built-in scenario(s)
```

No simulator/UI resolver changes should be required simply because the catalog grew from 20 to 40.

---

# 40. Completion Report

Return a Phase 6B completion report containing:

1. files created/modified
2. final catalog count
3. exact 20 scenarios added
4. category distribution
5. difficulty distribution
6. estimated-duration distribution
7. completion-mode classification for all 20
8. rationale for each candidate-declared scenario
9. acceptableCondition scenarios and rationale
10. scenarios intentionally having no acceptable tier
11. multi-step audit table
12. observable-delayed-risk audit
13. integrity/correctness scenarios
14. alternate-good-path scenarios
15. generic engine/schema changes, if any
16. justification for every generic engine change
17. action-feedback coverage
18. feedback leak-boundary verification
19. good/partial/acceptable/baseline/harmful score table
20. suspicious ties investigated
21. legitimate scoring limitations
22. all per-scenario tests
23. catalog-level tests
24. anonymous paid-lock verification
25. assessment-override verification
26. Manual QA A
27. Manual QA B
28. Manual QA C
29. Manual QA D
30. Manual QA E
31. Manual QA F
32. candidate-declared Finish QA
33. post-incident feedback QA
34. assessment QA
35. total test count
36. typecheck result
37. lint result
38. test result
39. build result
40. seed result
41. deviations
42. product/UX concerns

---

# 41. Stop Condition

When Phase 6B is complete:

```text
IncidentRank has 40 production-quality built-in incidents.
```

Stop.

Do not start Phase 6C.

Return the completion report for review first.

---

# Final Quality Principle

The primary test for every Phase 6B scenario is:

> **Would a strong engineer need to understand what the system is doing, or could they solve this by trying dropdown combinations?**

If a scenario can be solved primarily by guessing controls until the UI turns healthy, it is not finished.

The candidate should increasingly have to reason:

```text
What is the actual bottleneck?

What subsystem will my mitigation pressure next?

What correctness guarantee am I trading?

What customer impact am I willing to tolerate?

Did I fix the cause or only mask the symptom?

Is this recovery durable?

Is the system actually safe to hand back?
```

That is the standard Phase 6B should establish for scenarios 21–40.