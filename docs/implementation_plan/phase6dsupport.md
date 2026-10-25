# IncidentRank — Phase 6D.1 Batch Script

## Scope

Implement and verify the first five Phase 6D Principal/Senior Staff scenarios:

```text
61 Multi-Region Payment Platform Degradation
62 Global Checkout Brownout
63 Multi-Tenant Control Plane Overload
64 Regional Failover Causes Global Overload
65 Cross-Service Retry Amplification
```

Do not begin 6D.2.

Do not modify shared architecture/UI primitives unless this batch produces a concrete, demonstrated readability problem that cannot be addressed with the existing flat architecture model.

The current architecture representation is intentionally the default:

```text
ArchitectureNode:
  id
  label

ArchitectureEdge:
  from
  to
```

Use it first.

---

# 1. Execution Model

Run this batch using the established gated workflow:

```text
5 parallel scenario-author agents
        ↓
5 independent verifier agents
        ↓
primary/orchestrator filesystem verification
        ↓
batch-wide test run
        ↓
Principal-level design audit
        ↓
approve/reject batch
```

No scenario author's self-report counts as verification.

---

# 2. Worker Ownership

Each author owns only the files for their assigned scenario.

Expected scenario file contract:

```text
packages/scenarios/src/<slug>/
  architecture.ts
  controls.ts
  metrics.ts
  timed-events.ts
  rules.ts
  revenue-and-cost.ts
  action-classifications.ts
  scoring.ts
  definition.ts
  candidate-ui.ts

packages/scenarios/src/<slug>.ts
packages/scenarios/src/<slug>.test.ts
```

Scenario workers must NOT modify:

```text
packages/scenarios/src/library/catalog.ts
packages/scenarios/src/index.ts
packages/simulator/*
apps/web/*
shared scoring infrastructure
shared architecture types
shared UI
```

Shared-file integration belongs to the orchestrator only.

---

# 3. Architecture Constraint

For all five scenarios:

Use the existing flat `ArchitectureNode` / `ArchitectureEdge` representation first.

Do not add:

- region containers
- subsystem groups
- nested architecture
- collapsible boxes
- critical-path highlighting
- new architecture node types

unless a real scenario becomes materially unreadable.

If an author believes the architecture is unreadable, they must report:

1. exact node count
2. exact edge count
3. what candidate misunderstanding the flat graph creates
4. why better labels/layout/order cannot solve it
5. the smallest generic reusable architecture extension needed

Do not implement the extension inside a worker branch.

The orchestrator decides after all five scenarios are authored.

---

# 4. Duplicate-Mechanism Audit

Before writing code, each author must compare their scenario against all existing 60 built-ins.

Report:

```text
Closest existing scenarios:
Why this is materially different:
Distinct root failure mechanism:
Distinct dominant mitigation:
Distinct Principal-level judgment:
```

If the proposed root failure + dominant resolution is substantially the same as an existing scenario, stop and redesign before authoring.

No reskins.

---

# 5. Scenario 61 — Multi-Region Payment Platform Degradation

Slug:

```text
multi-region-payment-platform-degradation
```

Difficulty:

```text
Principal
```

## Architecture

Target approximately 10–14 logical nodes:

```text
Clients
Global Traffic Manager

US Payment API
US Risk Service
US Ledger
US Event Publisher

EU Payment API
EU Risk Service
EU Ledger / Replica
EU Event Publisher

Fraud Provider
Settlement Pipeline
```

Do not increase nodes simply to look complex.

## Incident

At least three things should interact:

1. EU external dependency degradation
2. cross-region ledger replication lag
3. traffic shifting toward US creating settlement / capacity pressure

The candidate must recognize that:

```text
"move everything to US"
```

can improve payment availability while creating a second failure domain.

## Business invariants

At minimum:

```text
Payment authorization must not create divergent ledger authority.
Mandatory fraud controls may not be bypassed.
Settlement delay may be tolerated within an authored bounded window.
```

## Candidate-visible metrics

Suggested:

- US payment success
- EU payment success
- US payment latency
- EU payment latency
- ledger replication lag
- US ledger utilization
- settlement backlog
- fraud-provider health
- risk-check success
- cross-region traffic percentage

Do not expose every internal state field.

## Controls

Potential controls:

- EU traffic percentage
- regional write authority
- fraud fallback mode
- optional-risk enrichment
- settlement worker priority
- event-publisher priority
- high-risk transaction throttling
- cross-region replication mode

Keep to meaningful controls.

## Principal behavior

A strong path should likely require at least 3 decisions.

Example structure:

```text
contain EU degradation
→ protect mandatory correctness/security
→ selectively shift traffic
→ observe US ledger/settlement pressure
→ protect settlement/critical payment path
→ wait for lag/backlog recovery
→ Finish
```

Do not encode that exact sequence as the only solution if another legitimate approach exists.

## Harmful path

At least one tempting path:

```text
shift 100% EU traffic to US immediately
```

which improves one metric but overloads another subsystem.

## Recovery lag

Required.

Ledger lag or settlement backlog should take time to recover after a good mitigation.

---

# 6. Scenario 62 — Global Checkout Brownout

Slug:

```text
global-checkout-brownout
```

Difficulty:

```text
Principal
```

## Architecture

Suggested nodes:

```text
Web/Mobile
Checkout Orchestrator
Cart
Pricing
Inventory
Promotions
Tax
Payment
Order Service
```

Approximately 9 nodes.

## Incident

No service is fully down.

At least 3 dependencies degrade moderately.

Individually, each appears survivable.

Combined through the synchronous critical path, checkout becomes unusable.

This should test:

```text
critical-path reasoning
```

not outage detection.

## Business invariants

Examples:

```text
Payment authorization and inventory reservation must remain correct.
Promotions may be disabled.
Tax may use a bounded fallback if explicitly allowed.
Checkout may return reduced enrichment rather than fail entirely.
```

## Signals

- checkout end-to-end latency
- dependency latency by service
- dependency error rate
- request concurrency
- payment success
- inventory reservation success
- partial-checkout percentage

## Controls

- Promotions on/off
- Tax fallback
- Pricing cache/fallback
- timeout budget allocation
- retry policy
- max checkout concurrency
- optional enrichment mode
- inventory reservation strategy

## Principal requirement

Candidate should identify:

```text
the system is failing because several "moderately slow" services compose into an unusable synchronous critical path
```

A strong mitigation may intentionally reduce checkout functionality.

## Harmful path

Increasing retries across all dependencies should make things worse.

---

# 7. Scenario 63 — Multi-Tenant Control Plane Overload

Slug:

```text
multi-tenant-control-plane-overload
```

Difficulty:

```text
Senior Staff
```

## Architecture

Suggested:

```text
Tenant APIs
Control Plane
Scheduler
Config Service
Policy Engine
Metadata DB
Worker Fleet

Tenant A
Tenant B
Tenant C
```

Represent tenants only if they materially help candidate understanding.

## Incident

One large tenant produces excessive configuration churn.

The control plane degrades while the data plane is initially healthy.

The candidate must distinguish:

```text
control-plane emergency
```

from:

```text
customer data-plane outage
```

## Business invariants

```text
Existing data-plane traffic should remain available.
Config convergence may slow temporarily.
One tenant must not starve unrelated tenants.
Metadata durability must be preserved.
```

## Metrics

- config requests by tenant
- queue depth by tenant
- metadata DB write pressure
- scheduler latency
- config convergence age
- worker utilization
- small-tenant success rate
- data-plane health

## Controls

- per-tenant quota
- tenant priority
- queue partitioning
- metadata write batching
- worker concurrency
- dedicated processing lane
- propagation cadence

## Pressure transfer

Required.

Example:

```text
increase workers
→ metadata DB saturation
```

or:

```text
increase batching too aggressively
→ config convergence delay
```

## Principal/Senior Staff distinction

The candidate must protect system-wide fairness without unnecessarily impacting the healthy data plane.

---

# 8. Scenario 64 — Regional Failover Causes Global Overload

Slug:

```text
regional-failover-causes-global-overload
```

Difficulty:

```text
Principal
```

## Architecture

Suggested:

```text
Global Router

Region A API
Region A Cache
Region A DB

Region B API
Region B Cache
Region B DB

Region C API
Region C Cache
Region C DB
```

Keep shared dependencies only if necessary.

## Incident

Region A fails or severely degrades.

Automatic routing begins shifting traffic into B and C.

B and C are healthy initially but do not have enough reserve capacity for 100% failover.

The candidate must prevent:

```text
regional incident
→ global incident
```

## Business invariants

```text
Critical customer operations must remain available.
Optional traffic may be shed.
Healthy regions must not be driven into failure.
Partial regional loss is preferable to global collapse.
```

## Metrics

- traffic % per region
- regional API utilization
- regional DB utilization
- regional cache hit rate
- customer success by region
- queue depth
- shed traffic
- global success rate

## Controls

- failover percentage
- endpoint shedding
- regional traffic weights
- low-priority traffic policy
- cache protection
- DB concurrency
- Region A partial restoration mode

## Principal behavior

A strong path should probably look like:

```text
limit automatic failover
→ protect B/C
→ shed/degrade optional traffic
→ recover partial A or increase safe capacity
→ gradually restore traffic
```

not:

```text
send all A traffic to B/C
```

## Recovery sequencing

Required.

Restoring traffic too quickly after capacity returns should be able to retrigger degradation.

---

# 9. Scenario 65 — Cross-Service Retry Amplification

Slug:

```text
cross-service-retry-amplification
```

Difficulty:

```text
Senior Staff
```

## Architecture

```text
Client
Gateway
Service A
Service B
Service C
External Provider
```

Potentially include queue/pool components only if needed.

## Incident

The external provider suffers a moderate degradation.

Retries exist independently at:

- client/gateway
- Service A
- Service B
- Service C

The effective downstream request volume becomes much larger than original customer QPS.

This must be materially deeper than:

```text
Payment Retry Storm
Message Retry Storm
Dependency Timeout Cascade
Request Timeout Cascade
```

## Distinction requirement

Before implementation, author must explicitly explain why this scenario is not a duplicate.

Required distinction should center around:

```text
retry ownership across multiple independently-configured service boundaries
```

and the need to choose **where retries belong**, rather than simply tuning retry count/backoff globally.

## Business invariants

```text
Customer requests may retry at one controlled ownership boundary.
The external provider must be protected from multiplicative amplification.
Cancellation/timeout propagation should prevent zombie work.
```

## Signals

- original customer QPS
- downstream provider QPS
- retries per layer
- in-flight requests
- success rate
- provider latency
- connection utilization

## Controls

- Gateway retries
- Service A retries
- Service B retries
- Service C retries
- timeout budgets
- circuit breaker
- cancellation propagation
- concurrency

## Principal/Senior Staff behavior

Candidate should reason:

```text
Which layer should own retries?
```

not merely:

```text
What retry value is best?
```

## Harmful path

Reducing provider retries at one layer while leaving upstream retries multiplying requests should provide incomplete or misleading relief.

---

# 10. Completion Mode Audit

Do not preassign completion mode.

After each author finishes the real state graph, classify:

```text
automatic
candidate_declared
```

For any `candidate_declared` recommendation, provide:

```text
UNSAFE states
ACCEPTABLE states, if any
OPTIMAL states
```

A Principal scenario may have no acceptable tier.

Do not force one.

---

# 11. Immediate-Finish Audit

For every candidate-declared scenario:

```text
incident triggered
zero candidate actions
Finish immediately
```

Expected default:

```text
declared_unstable
```

If not, author must provide explicit semantic justification.

No accidental instant-success scenarios.

---

# 12. Sequencing Audit

At least 3 of these 5 scenarios should have meaningful action sequencing.

For each relevant scenario add tests for:

```text
safe sequence
unsafe/reversed sequence
```

Examples:

```text
protect surviving region
→ then shift more traffic
```

vs.

```text
shift everything
→ then attempt protection
```

or:

```text
choose retry owner
→ then tune timeout/circuit breaking
```

vs.

```text
increase retries at multiple layers
```

Do not encode arbitrary ordering unrelated to system semantics.

---

# 13. Pressure-Transfer Audit

All five scenarios should identify at least one potential pressure transfer.

Examples:

```text
61 traffic shift
→ US ledger / settlement pressure

62 retries/concurrency
→ downstream collapse

63 more workers
→ metadata DB pressure

64 failover
→ surviving-region overload

65 retry reduction at one layer
→ amplification persists elsewhere
```

Tests should prove the transferred pressure is represented.

---

# 14. Recovery-Lag Audit

At least 4 of 5 should model delayed recovery.

Potential examples:

```text
ledger replication catch-up
settlement backlog drain
checkout in-flight request decay
control-plane queue drain
regional caches warm
retry/in-flight pressure decays
```

Do not instantly turn all metrics green after a good action.

---

# 15. Business-Invariant Audit

Every scenario must contain candidate-visible business constraints.

Verifier must answer:

```text
Can the candidate infer what must never be sacrificed?
```

If not, reject the scenario.

Do not rely on hidden success conditions to define business rules.

---

# 16. Scoring

Use only generic declarative scoring.

Required executed paths:

```text
optimal
baseline
harmful
```

plus:

```text
acceptable
alternate strong path
```

where genuinely present.

Investigate:

- harmful scoring too high
- no-action score too high
- availability-good/correctness-bad path scoring near optimal
- acceptable > optimal without reason

Do not manipulate bands solely for visual ordering.

---

# 17. Action Feedback

All meaningful action classification rules should have:

```ts
feedback: {
  title,
  explanation
}
```

Feedback must explain the system consequence.

For combined/multi-step changes, make sure the feedback describes what actually happened in the current action-time state.

---

# 18. Verifier Agent Contract

Each scenario gets a separate independent verifier.

Verifier must inspect actual files, not writer summary.

Return:

```text
VERIFIED
or
REJECTED
```

with evidence for:

1. all required files exist
2. definition validates
3. architecture matches scenario
4. duplicate-mechanism audit is credible
5. controls are all meaningful
6. no dead controls
7. multi-step behavior is real
8. pressure transfer is real
9. delayed consequences are observable
10. business invariants are candidate-visible
11. completion classification is justified
12. immediate Finish is safe
13. scoring paths execute
14. harmful path is actually harmful
15. feedback coverage exists
16. tests are non-tautological
17. deterministic replay passes
18. scenario is genuinely Senior Staff/Principal level

Verifier must quote actual observed score values.

---

# 19. Orchestrator Verification

After all 5 verifiers return, orchestrator must independently inspect:

```text
git status
git diff
scenario directories
test names
catalog not touched by workers
index not touched by workers
```

Then run each scenario test directly.

Only after all five pass should orchestrator add them to:

```text
packages/scenarios/src/library/catalog.ts
packages/scenarios/src/index.ts
```

---

# 20. Batch-Level Architecture Readability Review

After all five scenarios are implemented with flat architecture:

Evaluate the actual candidate-facing diagrams.

For each:

```text
node count
edge count
whether service ownership/region boundaries are understandable
whether labels alone are sufficient
whether candidate can identify critical dependencies
```

Only if the flat model produces a real readability failure should a shared architecture extension be proposed.

If proposing one, return a design note before implementing:

```text
Problem:
Affected scenarios:
Why flat representation fails:
Minimal generic extension:
Backward compatibility:
Candidate UI impact:
Tests required:
```

Do not implement the extension until orchestrator explicitly accepts it.

---

# 21. Batch-Wide Tests

Before approval:

```text
pnpm --filter @incidentrank/scenarios test
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
```

Then, after shared catalog wiring:

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Expected catalog after 6D.1:

```text
65 built-in scenarios
3 free
62 paid
```

All tests must remain green.

---

# 22. 6D.1 Completion Report

Return a batch report containing:

1. exact 5 scenarios added
2. files created/modified
3. duplicate-mechanism audit per scenario
4. architecture node/edge counts
5. flat-architecture readability result
6. whether any architecture extension is recommended
7. difficulty classification
8. completion-mode classification
9. unsafe/acceptable/optimal state audit
10. business invariants
11. multi-step path per scenario
12. action-sequencing audit
13. pressure-transfer audit
14. recovery-lag audit
15. tempting unsafe path per scenario
16. alternate strong paths
17. immediate-Finish results
18. scoring table
19. suspicious score investigations
20. feedback coverage
21. per-scenario test counts
22. verifier verdicts
23. orchestrator filesystem verification
24. package test result
25. full test result
26. typecheck
27. lint
28. build
29. seed
30. deviations
31. Principal-level quality assessment for each scenario

---

# 23. Principal-Level Acceptance Test

Do not approve a scenario merely because it is large.

For each scenario ask:

> Could a strong Senior engineer solve this primarily by trying controls?

If yes:

```text
REJECT / REDESIGN
```

A Phase 6D.1 scenario should force meaningful reasoning about:

```text
failure domains
system ownership
pressure transfer
action order
degraded modes
business invariants
recovery state
blast radius
```

The candidate should have to form a system-level hypothesis before acting.

---

# 24. Stop Condition

6D.1 is complete when:

```text
scenarios 61–65 are fully authored
all five independently verified
shared catalog wired by orchestrator
flat architecture reviewed
Principal-level audit passed
all tests green
seed reports 65
```

Stop there.

Do not begin 6D.2 until the 6D.1 completion report is reviewed.