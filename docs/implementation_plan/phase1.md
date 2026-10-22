# IncidentRank — Phase 1: Build the First Complete Incident

Before doing anything:

1. Read the root `README.md`.
2. Treat it as the product source of truth.
3. Do not introduce concepts that contradict it.
4. Do not start work from later phases.
5. Do not add authentication, database persistence, companies, leaderboards, billing, AI, or a visual scenario authoring tool.

Phase 0 is complete.

The goal of Phase 1 is to create the first complete IncidentRank scenario:

# Payment Retry Storm

This phase proves that IncidentRank can represent a realistic production incident using:

- authored system state
- candidate controls
- deterministic scenario rules
- timed events
- consequences
- multiple possible paths
- success/failure conditions
- scoring inputs

Do NOT build the final candidate playground UI yet.

The scenario should be executable entirely through the scenario engine and automated tests.

---

# Product Reminder

IncidentRank is a system design and production incident assessment platform.

It does NOT mathematically simulate infrastructure.

Do not implement:

- queueing theory
- throughput equations
- network physics
- database performance equations
- AWS simulations
- probabilistic infrastructure behavior
- cloud capacity models

The scenario author defines what happens.

The candidate decides what to do.

The engine deterministically applies authored rules and consequences.

---

# Scenario Goal

The engineer is on-call for a checkout system.

The system topology is:

```text
Client
  ↓
API Gateway
  ↓
Checkout Service
  ↓
Payment Service ─────→ External Payment Provider
  ↓
Postgres
  ↓
Kafka
  ↓
Settlement Worker
```

Initially the system is healthy.

After the incident begins, the external payment provider degrades.

Because the Payment Service is configured with aggressive retries and no backoff, the degradation gets worse.

The candidate must diagnose and mitigate the incident.

---

# Scenario Metadata

Use:

```text
Name:
Payment Retry Storm

Difficulty:
Senior

Estimated Time:
15–20 minutes
```

Description:

> A payment provider begins degrading. Existing retry behavior starts amplifying traffic across the system. Diagnose the incident and restore checkout before the failure cascades.

---

# Initial Architecture

Create architecture nodes for:

```text
api-gateway
checkout-service
payment-service
payment-provider
postgres
kafka
settlement-worker
```

Create edges representing the topology above.

Each component should expose a simple component state that can later be displayed in the candidate UI.

Examples:

```text
health:
healthy
degraded
critical
```

Do not create performance equations.

---

# Candidate Controls

Phase 1 supports these controls.

## Payment Service

### Retries

Allowed:

```text
0
1
3
5
```

Initial:

```text
3
```

---

### Backoff

Allowed:

```text
none
fixed
exponential
```

Initial:

```text
none
```

---

### Circuit Breaker

Allowed:

```text
off
on
```

Initial:

```text
off
```

---

### Timeout

Allowed:

```text
1s
2s
3s
5s
```

Initial:

```text
2s
```

---

### Instances

Allowed:

```text
4
8
12
16
24
```

Initial:

```text
8
```

---

## Checkout Service

### Instances

Allowed:

```text
4
8
12
16
24
```

Initial:

```text
8
```

This must not be a magical fix for a degraded payment provider.

---

## PostgreSQL

### Connection Limit

Allowed:

```text
250
500
750
1000
```

Initial:

```text
500
```

---

## Kafka

### Settlement Consumers

Allowed:

```text
4
8
12
16
24
```

Initial:

```text
8
```

Scaling consumers should affect settlement backlog but should not directly solve checkout failure.

---

# Candidate-Facing Metrics

The scenario should expose these metrics:

```text
checkout-success
checkout-p99
payment-provider-latency
payment-traffic
db-pressure
kafka-lag
revenue-loss
```

Use authored values/state transitions.

Do not derive them using infrastructure formulas.

Possible severity values:

```text
normal
warning
critical
```

---

# Initial Healthy State

Before the incident begins:

```text
status = healthy

checkout success = 99.9%
checkout P99 = 420ms
payment provider latency = 180ms
payment traffic = normal
db pressure = normal
kafka lag = 0
revenue loss = $0
```

Relevant components are healthy.

---

# Timed Incident Start

At:

```text
60 seconds
```

trigger the incident.

The external payment provider becomes degraded.

Authored state becomes:

```text
payment provider health = degraded
payment provider latency = 4.8s

checkout success = 72%
checkout P99 = 6.4s

payment traffic = critical
db pressure = high

kafka lag = 18,000
revenue loss = increasing

incident status = critical
```

Emit an incident event such as:

```text
Payment provider latency has increased sharply.
```

Do NOT explicitly tell the candidate:

> Root cause: payment provider retry storm.

They should infer it.

---

# Scenario States

Avoid thinking of the scenario as a linear script.

The candidate's configuration determines the state.

Define clear authored incident states such as:

```text
healthy
storm-critical
storm-reduced
storm-controlled
recovering
resolved
```

These do not need to be candidate-visible state names.

They are internal scenario states.

---

# Core Rule Paths

The following behaviors must exist.

Do not treat these as the only possible action order.

Rules should evaluate current configuration.

---

## Path A — Incident remains critical

If:

```text
provider is degraded
AND retries >= 3
AND backoff = none
```

the scenario should remain approximately:

```text
checkout success = 72%
checkout P99 = 6.4s
provider latency = 4.8s
payment traffic = critical
db pressure = high
```

If retries are changed to:

```text
5
```

make the incident somewhat worse.

For example:

```text
checkout success = 63%
checkout P99 = 7.8s
payment traffic = critical
db pressure = critical
revenue loss increases faster
```

---

# Path B — Reduce retries

If:

```text
provider degraded
AND retries <= 1
```

then improve the system:

```text
checkout success = 84%
checkout P99 = 4.2s
provider latency = 3.4s
payment traffic = high
db pressure = medium
```

The incident is still not resolved.

---

# Path C — Add exponential backoff

If:

```text
provider degraded
AND retries <= 1
AND backoff = exponential
```

improve further:

```text
checkout success = 92%
checkout P99 = 2.8s
provider latency = 2.1s
payment traffic = medium
db pressure = medium
```

Still not fully resolved.

---

# Path D — Circuit breaker

If:

```text
provider degraded
AND circuit breaker = on
```

the downstream provider should be protected.

But some requests should fail fast.

This means the circuit breaker should not automatically produce a perfect system.

For example, with poor retry settings:

```text
checkout success = 82%
checkout P99 = 1.2s
payment traffic = medium
db pressure = medium
```

This is better operationally, but customer success is still not enough for resolution.

---

# Good Recovery State

A strong configuration such as:

```text
retries <= 1
backoff = exponential
circuit breaker = on
```

should result in a recovering state around:

```text
checkout success = 96%
checkout P99 = 1.6s
provider latency = 1.8s
payment traffic = normalizing
db pressure = normal
```

The incident should eventually resolve if this state remains stable.

Do not hardcode:

```text
if these exact 3 settings are present:
    resolved
```

Instead use scenario flags/state transitions and success conditions.

Other reasonable configurations should also be able to resolve if the authored rules support them.

---

# Timeout Tradeoffs

Timeout changes must matter.

For example:

## Too low

```text
timeout = 1s
```

during provider degradation may produce more fast failures.

Possible effect:

```text
checkout P99 improves
checkout success decreases
payment pressure may reduce
```

---

## Too high

```text
timeout = 5s
```

may reduce immediate timeout failures but make user experience worse.

Possible effect:

```text
checkout success improves slightly
checkout P99 gets worse
requests remain tied up longer
```

The point is to create a tradeoff.

Do not make one timeout value universally correct.

---

# Scaling Behavior

## Scaling Checkout

Increasing Checkout instances should have little effect when the payment provider is the root problem.

It may slightly improve local service health but should not resolve the incident.

---

## Scaling Payment Service

Increasing Payment Service instances may initially look helpful but can make payment traffic worse if retries remain aggressive.

Example:

```text
retries >= 3
payment instances increased significantly
```

may cause:

```text
payment traffic = critical
provider pressure remains high
```

This should teach that scaling the caller does not necessarily fix a failing dependency.

---

# Database Behavior

Database pressure should reflect authored scenario consequences.

If payment traffic remains critical:

```text
db pressure = high or critical
```

Increasing DB connection limit may reduce connection pressure somewhat.

But it must not resolve the external-provider incident.

It may also carry a cost penalty later.

---

# Kafka Behavior

Kafka lag should represent downstream settlement backlog.

If checkout successfully continues while consumers are too low:

```text
kafka lag increases
```

Increasing settlement consumers should reduce lag.

But changing Kafka consumers must not directly fix checkout.

This is an important system-design distinction.

---

# Revenue Loss

Track cumulative authored customer impact.

Do not simulate money mathematically from individual requests.

Use a scenario value such as:

```text
revenueLoss
```

that increases each time period based on incident severity.

For example:

```text
critical state:
+$12,000 per simulated minute

degraded state:
+$5,000 per simulated minute

recovering state:
+$1,500 per simulated minute
```

Healthy/resolved:

```text
+$0
```

This is a scenario scoring input, not accounting logic.

---

# Infrastructure Cost

Track an abstract current infrastructure cost.

Again, authored values are sufficient.

Example baseline:

```text
$20,000/month
```

Scaling services or DB configuration can increase the current cost.

Example authored increments:

```text
additional checkout instances
+ cost

additional payment instances
+ cost

larger DB connection configuration
+ cost

additional Kafka consumers
+ cost
```

The candidate should be able to brute-force some problems at a cost.

Cost will later influence scoring.

Do not model actual AWS pricing.

---

# Timed Recovery

The external provider should not remain permanently degraded.

After approximately:

```text
12 simulated minutes
```

it begins recovering.

By:

```text
15 simulated minutes
```

it is healthy again.

This means a candidate who does nothing may eventually survive the incident.

However, they should accumulate much larger:

```text
revenue loss
customer impact
recovery time
```

than someone who actively mitigates it.

This provides a useful baseline.

---

# Success Conditions

The scenario resolves when all of the following remain true for a short stable period, for example 30 simulated seconds:

```text
checkout success >= 95%
checkout P99 <= 3s
payment traffic is not critical
db pressure is not critical
```

Do not require Kafka lag to be zero.

Kafka state should influence the final score later but should not block checkout recovery.

---

# Failure Conditions

Add at least one failure condition.

For example:

If the incident remains in an extreme critical state for too long:

```text
checkout success < 60%
for 3 consecutive simulated minutes
```

the attempt may be marked failed.

Keep failure logic simple.

---

# Events

Generate meaningful events only when state changes.

Examples:

```text
incident-started
provider-degraded
config-changed
checkout-critical
checkout-recovering
db-pressure-critical
db-pressure-recovered
kafka-backlog-high
kafka-backlog-recovered
incident-resolved
incident-failed
provider-recovered
```

Do not spam the event stream every second.

---

# Attempt Timeline

The engine should make it possible to produce a timeline such as:

```text
00:00 System healthy

01:00 Provider degradation detected

01:12 Checkout success dropped to 72%

02:03 Candidate changed retries 3 → 1

02:03 Payment traffic reduced

02:42 Candidate changed backoff none → exponential

02:42 Provider pressure improved

03:30 Candidate enabled circuit breaker

03:31 Checkout recovering

04:02 Checkout success reached 96%

04:32 Incident resolved
```

---

# Scoring Inputs

Do not calculate the final 0–1000 IncidentRank score yet.

Track enough objective data for later scoring.

At minimum:

```text
incident start time
incident resolution time
incident failure time

total time in critical state
total time in degraded state

revenue loss

peak severity reached

number of candidate changes

number of harmful changes
number of beneficial changes

initial infrastructure cost
final infrastructure cost
peak infrastructure cost

final Kafka lag
peak Kafka lag
```

“Harmful” and “beneficial” should be based on authored rule/action metadata, not inferred from mathematics.

If useful, a scenario rule may classify an effect/action outcome as:

```text
beneficial
neutral
harmful
```

Do not turn this into a subjective AI judgment.

---

# Multiple Paths

Create tests proving there is more than one viable recovery path.

The strongest path may involve:

```text
retry reduction
backoff
circuit breaker
```

But another reasonable path may combine:

```text
retry reduction
shorter timeout
backoff
```

and still eventually resolve with a different tradeoff.

Avoid a single exact answer sequence.

---

# Tests

Add thorough tests.

At minimum:

## 1. Healthy start

Verify initial state is healthy.

---

## 2. Incident begins at 60 seconds

Verify provider degradation and critical checkout state.

---

## 3. Doing nothing

Advance through natural provider recovery.

Expected:

```text
eventual recovery
high revenue loss
long recovery time
```

---

## 4. Retry reduction

Change:

```text
3 → 1
```

Expected:

system improves but does not immediately resolve.

---

## 5. Retry increase

Change:

```text
3 → 5
```

Expected:

system becomes worse.

---

## 6. Exponential backoff

With reduced retries, enable exponential backoff.

Expected:

system improves further.

---

## 7. Circuit breaker

Verify it protects the degraded dependency but produces fast failures and is not universally perfect.

---

## 8. Scale Checkout only

Verify it does not fix the root incident.

---

## 9. Scale Payment aggressively while retries remain high

Verify this does not solve the incident and may worsen downstream pressure.

---

## 10. Kafka consumers

Verify changing consumers affects Kafka backlog but not checkout health directly.

---

## 11. Database connections

Verify DB state may improve while checkout incident remains unresolved.

---

## 12. Timeout tradeoff

Verify low and high timeout settings produce different advantages/disadvantages.

---

## 13. Good recovery

Apply a sensible sequence and verify incident resolves.

---

## 14. Alternative recovery

Use a different sensible sequence and verify incident can still resolve.

---

## 15. Bad configuration

Verify a clearly harmful configuration can trigger failure.

---

## 16. Invalid controls

Invalid control values must be rejected.

---

## 17. Determinism

Same scenario and same sequence of actions must produce identical final:

```text
state
events
scoring inputs
```

---

# Scenario Configuration

Keep Payment Retry Storm in the scenario package.

The scenario should be declarative.

Prefer:

```text
initialState
timedEvents
controls
rules
successConditions
failureConditions
scoring metadata
```

over scenario-specific imperative code spread throughout the engine.

The core engine must remain scenario-agnostic.

Do not build a generic enterprise DSL yet.

We only need enough abstraction to represent this incident cleanly.

---

# Documentation

Create:

```text
docs/scenarios/payment-retry-storm.md
```

Document:

- scenario purpose
- architecture
- initial state
- incident event
- available controls
- important system-design concepts tested
- major authored consequences
- possible recovery strategies
- failure cases
- success conditions
- scoring inputs

Also explicitly state:

> The numeric metrics in this scenario are authored to communicate realistic system behavior. They are not generated by an infrastructure performance model.

---

# Human-Readable Scenario Runner

Create a development-only runner or test helper that can print a scenario timeline.

Run at least these cases:

## Run A — No action

Candidate does nothing.

## Run B — Strong mitigation

Example:

```text
retries 3 → 1
backoff none → exponential
circuit breaker off → on
```

## Run C — Harmful mitigation

Example:

```text
payment instances 8 → 24
retries 3 → 5
timeout 2s → 5s
```

## Run D — Alternative reasonable mitigation

Use a different valid sequence from Run B.

Compare:

```text
resolution/failure
recovery time
revenue loss
peak incident severity
infrastructure cost
number of changes
Kafka backlog
```

The runs must show meaningfully different outcomes.

---

# Validation

Before completion:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

---

# Completion Report

Return:

1. files created/modified
2. final scenario structure
3. all controls
4. all major rules
5. timed events
6. success/failure logic
7. tracked scoring inputs
8. tests added
9. Run A results
10. Run B results
11. Run C results
12. Run D results
13. typecheck/lint/test/build results
14. any deviations and why
15. anything in the scenario that feels unrealistic or should be reviewed

Do not begin Phase 2.

Stop when Phase 1 is complete.