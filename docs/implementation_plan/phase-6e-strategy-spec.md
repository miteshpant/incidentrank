# IncidentRank — Phase 6E Strategy Spec (Scenarios 81–100)

## Purpose

Phase 6E should not simply extend the catalog from 80 to 100.

It should deliberately diversify what IncidentRank evaluates.

Phase 6D proved that the current deterministic authored architecture can support:

- Principal-level scenarios
- multi-step resolution
- sequencing sensitivity
- historical/cumulative damage
- pressure transfer
- safe degraded modes
- alternate strong paths
- multi-region and shared-platform reasoning
- security-vs-availability judgment
- source-of-truth / migration correctness
- complex but still flat architectures

Phase 6E should now target the remaining content gaps rather than repeat the dominant Phase 6D pattern.

---

# 1. Phase 6E Goal

Implement scenarios 81–100 with four strategic objectives:

```text
1. expand security and authorization coverage
2. make cost-efficiency a real primary decision axis
3. add internal/platform/data/ML incidents that are not primarily customer-facing
4. reduce repetition of "scale X → overload Y" as the dominant mechanic
```

The core product doctrine remains unchanged:

> IncidentRank does not recreate production infrastructure. It recreates production decisions.

Do not turn Phase 6E into a physics simulator, cloud emulator, or arbitrary infrastructure sandbox.

---

# 2. Target Catalog After Phase 6E

Expected:

```text
100 built-in scenarios
3 free
97 paid
```

Do not change the free count unless separately approved.

---

# 3. Difficulty Mix

Target for scenarios 81–100:

```text
Principal:      8–10
Senior Staff:   6–8
Staff:          2–4
```

Do not force every new scenario to Principal.

Difficulty should come from:

- competing business invariants
- sequencing
- organizational blast radius
- security/correctness consequences
- ambiguous but observable signals
- recovery state
- choosing what to sacrifice

Not from:

- more controls
- more nodes
- obscure vocabulary
- artificially hidden facts

---

# 4. Content Mix Requirements

Across scenarios 81–100:

```text
at least 5 security / authorization / abuse-prevention scenarios

at least 4 scenarios where cost-efficiency is a primary scoring tension

at least 4 internal-platform / data / analytics / ML scenarios

at least 3 scenarios with no meaningful "scale service" decision at all

at least 3 scenarios where the dominant decision is policy/governance rather than capacity

at least 3 scenarios involving compliance / audit / retention / privacy invariants

at least 3 scenarios with multi-day or staged-remediation thinking represented inside the authored state machine

at least 5 scenarios where availability is NOT the primary business objective
```

Do not force quotas dishonestly. If a scenario does not fit its intended category, redesign it.

---

# 5. Avoid Overrepresented Phase 6D Mechanic

Phase 6D overrepresented this shape:

```text
naive scaling
→ pressure transfer
→ downstream overload
```

This remains valid and may still appear, but in Phase 6E:

```text
no more than 6 of 20 scenarios
```

should use this as a central mechanic.

Prefer different judgment axes:

- fail-open / fail-closed
- privilege boundaries
- cost vs resilience
- governance / retention
- data lineage
- compliance
- privacy
- model quality vs system freshness
- auditability
- multi-stage remediation
- rollback authority
- irreversible business decisions
- capacity reservation policy
- abuse/fraud containment
- internal stakeholder tradeoffs

---

# 6. Proposed Scenario Set 81–100

## Security / Authorization / Abuse Prevention

### 81. Privilege Escalation via Stale Authorization Cache
Difficulty: Principal

Architecture:
```text
Clients
→ API Gateway
→ Authorization Layer
→ Policy Store
→ Resource Metadata
→ Cache Distribution
```

Core problem:
A revoked privilege remains active in a subset of caches after an authorization update.

Tests:
- stale privilege propagation
- fail-closed vs availability tradeoff
- cache convergence
- historical unauthorized access
- safe degraded mode

Primary judgment:
Security correctness over availability.

---

### 82. Service-to-Service Credential Rotation Failure
Difficulty: Senior Staff

Architecture:
```text
Service A
→ Service B
→ Service C
→ Secret Manager
→ Certificate / Token Issuer
```

Core problem:
Credential rotation begins while a subset of workloads still use old credentials.

Tests:
- overlapping credential validity
- premature revocation
- rollout cohort
- recovery without broad bypass

Primary judgment:
Sequencing and blast-radius control.

---

### 83. Fraud Control Degradation During Payment Surge
Difficulty: Principal

Architecture:
```text
Checkout
→ Payment API
→ Fraud Service
→ Rules Engine
→ External Risk Provider
→ Ledger
```

Core problem:
Fraud controls degrade during legitimate peak traffic.

Candidate must decide:
- what may be degraded
- what must remain mandatory
- which transactions to delay or block
- whether fraud risk may temporarily rise

Primary judgment:
Risk policy, not throughput.

---

### 84. Abuse-Prevention False Positive Storm
Difficulty: Senior Staff

Architecture:
```text
Clients
→ Edge
→ Abuse Detection
→ Rate Limiter
→ Identity
→ Core API
```

Core problem:
A detection-rule update begins blocking legitimate users while actual abusive traffic is also present.

Primary judgment:
Avoid globally disabling protection just to restore availability.

---

### 85. Secret Leakage Containment Incident
Difficulty: Principal

Architecture:
```text
Applications
→ Secret Manager
→ CI/CD
→ Logging
→ External Integrations
```

Core problem:
A credential is believed exposed, but revoking it immediately may break critical dependencies.

Primary judgment:
Containment sequencing, credential scope, auditability, staged rotation.

No "scale service" mechanic.

---

## Cost / Efficiency / Capacity Economics

### 86. Runaway Cloud Spend During Healthy Traffic
Difficulty: Senior Staff

Architecture:
```text
Clients
→ API
→ Autoscaler
→ Worker Fleet
→ Database
→ Object Store
```

Core problem:
System is healthy, but a deployment causes a 4x cost increase without customer impact.

Primary objective:
Cost efficiency while preserving safety.

Tests:
- overprovisioning
- caching tradeoffs
- worker utilization
- graceful rightsizing
- cost vs latency

Availability is not the primary objective.

---

### 87. Cross-Region Replication Cost Explosion
Difficulty: Senior Staff

Architecture:
```text
US Region
EU Region
APAC Region
→ Replication Layer
→ Object / Data Store
```

Core problem:
A replication-policy change dramatically increases transfer cost while improving freshness.

Primary judgment:
Freshness vs cost vs durability.

---

### 88. Overprovisioned Resilience During Low-Risk Period
Difficulty: Staff / Senior Staff

Architecture:
```text
Global Router
→ Multi-AZ Service
→ Replicas
→ Database
```

Core problem:
A system is configured for extreme redundancy during a low-risk operational period with unsustainable cost.

Candidate must determine:
- what can safely be reduced
- what redundancy is mandatory
- when to restore higher resilience

Primary judgment:
Cost vs risk appetite.

---

### 89. Expensive Retry and Logging Amplification
Difficulty: Senior Staff

Architecture:
```text
API
→ Worker
→ External Dependency
→ Logging / Telemetry Pipeline
```

Core problem:
No outage, but retries + verbose logging generate extreme cost and noise.

Primary judgment:
Economic efficiency and observability quality.

---

## Internal Data / Analytics / ML

### 90. Model Feature Freshness Degradation
Difficulty: Principal

Architecture:
```text
Source Data
→ Feature Pipeline
→ Feature Store
→ Model Serving
→ Decision API
```

Core problem:
Model serving is healthy, but features become stale.

Business risk:
Decision quality deteriorates while uptime remains green.

Primary objective:
Decision quality, not availability.

---

### 91. Training Pipeline Produces Corrupted Model Artifact
Difficulty: Principal

Architecture:
```text
Training Data
→ Feature Builder
→ Trainer
→ Model Registry
→ Deployment Pipeline
```

Core problem:
A bad training dataset produces a technically valid but semantically incorrect model.

Candidate must:
- stop promotion
- determine artifact trust
- choose rollback
- preserve lineage and auditability

No "scale service" mechanic.

---

### 92. Analytics Warehouse Query Contention
Difficulty: Senior Staff

Architecture:
```text
BI Users
Data Science
Scheduled Reports
→ Query Gateway
→ Warehouse
```

Core problem:
Ad-hoc analytical workloads interfere with critical financial/reporting jobs.

Primary judgment:
Workload prioritization and stakeholder tradeoff.

---

### 93. Data Lineage Break During ETL Migration
Difficulty: Principal

Architecture:
```text
Sources
→ ETL v1 / ETL v2
→ Warehouse
→ Metrics Layer
→ Reports
```

Core problem:
Numbers remain "available" but lineage becomes inconsistent across old/new ETL paths.

Primary judgment:
Trust, auditability, source lineage, controlled migration.

---

### 94. ML Inference Cost vs Quality Incident
Difficulty: Principal

Architecture:
```text
Requests
→ Routing Layer
→ Large Model
→ Small Model
→ Feature Store
```

Core problem:
Traffic shifts toward the expensive model and cost explodes.

Candidate must choose:
- quality tiering
- routing
- fallback
- user segmentation
- cost containment

Primary dimension:
Cost Efficiency.

---

## Compliance / Privacy / Governance

### 95. Data Retention Policy Misconfiguration
Difficulty: Principal

Architecture:
```text
Application
→ Event Store
→ Data Lake
→ Archive
→ Deletion Service
```

Core problem:
Retention job is deleting too aggressively or not deleting at all.

Primary objective:
Compliance correctness.

Availability is largely irrelevant.

---

### 96. Privacy Deletion Backlog
Difficulty: Senior Staff

Architecture:
```text
Deletion Requests
→ Privacy API
→ Workflow Queue
→ Product Databases
→ Analytics Store
→ Backup Index
```

Core problem:
User deletion requests are accepted but downstream execution falls behind.

Primary judgment:
Deadline prioritization, completeness, auditability.

---

### 97. Audit Log Integrity Failure
Difficulty: Principal

Architecture:
```text
Services
→ Audit Logger
→ Event Stream
→ Immutable Store
→ Compliance Reports
```

Core problem:
Application traffic is healthy but audit events are missing/duplicated/out-of-order.

Primary judgment:
Evidence integrity, not availability.

---

## Multi-Day / Governance / Operational Strategy

### 98. Certificate Expiry Across Large Fleet
Difficulty: Senior Staff

Architecture:
```text
Certificate Authority
→ Secret Distribution
→ Service Fleet
→ Load Balancers
→ External Clients
```

Core problem:
Certificates are nearing expiry across multiple cohorts with uneven rotation support.

Primary judgment:
Staged remediation over a simulated multi-day horizon.

---

### 99. Emergency Capacity Reservation Decision
Difficulty: Principal

Architecture:
```text
Forecasting
→ Capacity Planner
→ Regions
→ Reserved Capacity
→ On-Demand Capacity
```

Core problem:
A major event is approaching. Candidate must reserve expensive capacity under uncertain demand.

This is a proactive incident-prevention scenario.

Primary judgment:
Cost vs resilience under uncertainty.

No outage required at start.

---

### 100. Enterprise-Wide Dependency Deprecation
Difficulty: Principal

Architecture:
```text
Product A
Product B
Product C
→ Shared SDK
→ Deprecated External API
→ Replacement API
```

Core problem:
A critical third-party dependency has a hard deprecation deadline.

Some products have migrated, others have not.

Candidate must sequence:
- migration cohorts
- compatibility
- testing
- fallback
- deadline risk
- cost
- temporary dual-support

This should be the Phase 6E flagship.

Primary judgment:
Multi-team, multi-stage migration governance over a long horizon.

No single incident-control action should solve it.

---

# 7. Phase 6E Thematic Distribution

Recommended classification:

```text
Security / authorization / abuse:
81–85

Cost / efficiency:
86–89

Internal data / ML:
90–94

Compliance / privacy:
95–97

Multi-day / governance:
98–100
```

This is intentionally different from Phase 6D's infrastructure-heavy composition.

---

# 8. New Design Capability to Explore: Multi-Stage Horizon

Do not build this preemptively.

But Phase 6E should test whether the existing timed-event model can represent:

```text
hours
days
deadline windows
staged rollouts
multi-step remediation milestones
```

without becoming a real-time simulator.

Preferred model:

```text
simulated operational phases
```

Examples:

```text
Day 0
Day 1
Day 3
Deadline T-24h
Deadline T-4h
```

These are authored deterministic time checkpoints, not real wall-clock waiting.

If current timed events can support this cleanly, no engine change is needed.

If not, propose the smallest generic addition.

---

# 9. Scoring Strategy for Phase 6E

Keep the six dimensions unchanged:

```text
Recovery                 300
Customer Impact          200
Data Integrity           200
Reliability              150
Cost Efficiency          100
Operational Efficiency    50
```

Do NOT create new scoring dimensions.

Instead, Phase 6E should use the existing dimensions differently.

For example:

```text
cost-primary scenario:
Cost Efficiency becomes a major discriminator

compliance scenario:
Data Integrity + Reliability dominate

ML quality scenario:
Customer Impact may represent decision-quality impact rather than HTTP uptime

internal analytics scenario:
Recovery / Operational Efficiency may matter more than Customer Impact
```

Do not reinterpret dimensions inconsistently inside the same scenario.

---

# 10. Cost-Efficiency Requirement

At least 4 Phase 6E scenarios must treat Cost Efficiency as a first-class judgment.

For these scenarios:

```text
two technically-safe paths
must differ materially on cost
```

Example:

```text
safe but extremely expensive
vs
safe and economically efficient
```

The expensive path may still resolve successfully but should score lower.

Do not make cost merely a decorative 10–20 point difference.

---

# 11. Security Requirement

At least 5 Phase 6E scenarios must include an explicit security invariant.

Unsafe paths should sometimes:

```text
improve availability
while
making security worse
```

As with #73/#74:

```text
availability-good / security-bad
must never score as safe
```

Historical security consequences should remain non-resetting where appropriate.

---

# 12. Compliance / Audit Requirement

For compliance-oriented scenarios:

Candidate-facing briefing must explicitly state:

```text
what regulation/policy requirement matters
```

without requiring knowledge of specific external law unless the scenario itself teaches it.

Do not make candidates memorize GDPR/SOX/HIPAA details.

Test system judgment, not trivia.

---

# 13. Internal-System Scenario Doctrine

For scenarios 90–97:

Do not force everything into "customer request error rate."

Use candidate-visible metrics appropriate to the system:

Examples:

```text
model feature freshness
decision accuracy proxy
training artifact trust
lineage divergence
report freshness
audit completeness
deletion backlog
retention coverage
```

The engine remains generic; only scenario state/metrics differ.

---

# 14. Long-Horizon Scenario Doctrine

For 98–100:

Do not simulate literal days of wall-clock time.

Represent time deterministically through authored simulated phases.

Candidate should make decisions such as:

```text
what to do now
what to postpone
what must be completed before deadline
what evidence must be gathered before next phase
```

The scenario can remain a 20–35 minute play session while representing multi-day operational judgment.

---

# 15. Architecture

Continue using flat architecture first.

Phase 6D proved flat graphs are sufficient up to 10 nodes.

Phase 6E may test:

```text
10–15 meaningful nodes
```

especially for #100.

Only propose grouping if a real live readability failure occurs.

No speculative shared UI work.

---

# 16. Completion Modes

Audit individually.

Expect many candidate-declared scenarios, but do not force 20/20.

Automatic completion is appropriate if:

```text
objective terminal recovery is genuinely unambiguous
```

Candidate-declared is appropriate if:

```text
safe handback depends on policy/judgment
```

---

# 17. Alternate Strong Paths

At least 12 of 20 scenarios should support more than one defensible strong strategy.

Especially:

```text
cost vs resilience
rollback vs forward-fix
security containment vs service reduction
regional vs global mitigation
staged vs immediate migration
```

Do not encode one "author's preferred answer" where multiple real operational choices exist.

---

# 18. Historical / Irreversible Consequences

At least 10 of 20 should include one of:

```text
historical damage
irreversible business consequence
audit scar
security violation
compliance miss
financial waste already incurred
model artifact already promoted
data already deleted
deadline already missed
```

Fixing current configuration must not erase history.

---

# 19. Control Audit

Keep the Phase 6D.3/6D.4 mandatory process:

For every control:

```text
defined
→ referenced in rules
→ exercised in tests
→ action classified where meaningful
```

Authors must prove this before verifier handoff.

Verifiers independently redo it.

Dead control = REJECT.

---

# 20. Timeline Causality

Keep Phase 6D.4's requirement.

Timeline events should clearly communicate whether they are:

```text
external progression
candidate-action consequence
elapsed recovery
deadline/milestone
historical consequence
```

This is especially important for multi-day/horizon scenarios.

---

# 21. Batch Plan

Do not implement all 20 at once.

Use four gated batches:

## Phase 6E.1 — Security / Abuse
```text
81 Privilege Escalation via Stale Authorization Cache
82 Service-to-Service Credential Rotation Failure
83 Fraud Control Degradation During Payment Surge
84 Abuse-Prevention False Positive Storm
85 Secret Leakage Containment Incident
```

## Phase 6E.2 — Cost / Internal Data
```text
86 Runaway Cloud Spend During Healthy Traffic
87 Cross-Region Replication Cost Explosion
88 Overprovisioned Resilience During Low-Risk Period
89 Expensive Retry and Logging Amplification
90 Model Feature Freshness Degradation
```

## Phase 6E.3 — ML / Analytics / Compliance
```text
91 Training Pipeline Produces Corrupted Model Artifact
92 Analytics Warehouse Query Contention
93 Data Lineage Break During ETL Migration
94 ML Inference Cost vs Quality Incident
95 Data Retention Policy Misconfiguration
```

## Phase 6E.4 — Privacy / Governance / Long Horizon
```text
96 Privacy Deletion Backlog
97 Audit Log Integrity Failure
98 Certificate Expiry Across Large Fleet
99 Emergency Capacity Reservation Decision
100 Enterprise-Wide Dependency Deprecation
```

Stop and review after every batch.

---

# 22. Manual QA Priority

Mandatory live QA should prioritize:

```text
81 Privilege Escalation
83 Fraud Control Degradation
85 Secret Leakage Containment
86 Runaway Cloud Spend
90 Model Feature Freshness
91 Corrupted Model Artifact
95 Data Retention
97 Audit Log Integrity
99 Emergency Capacity Reservation
100 Enterprise-Wide Dependency Deprecation
```

Scenario 100 should receive flagship-level QA equivalent to #80.

---

# 23. Phase 6E Flagships

Primary flagship:

```text
100 Enterprise-Wide Dependency Deprecation
```

Secondary flagships:

```text
85 Secret Leakage Containment Incident
90 Model Feature Freshness Degradation
95 Data Retention Policy Misconfiguration
99 Emergency Capacity Reservation Decision
```

These should prove IncidentRank can evaluate senior judgment outside classic production-outage handling.

---

# 24. Success Criteria for Phase 6E

Phase 6E is successful if, after scenarios 81–100, we can truthfully say:

```text
IncidentRank evaluates more than incident mitigation.

It evaluates:
- security policy
- authorization
- risk
- cost
- data trust
- ML operations
- privacy/compliance
- governance
- long-horizon operational planning
- staged migration decisions
```

while still using the same generic deterministic scenario engine.

---

# 25. Product-Level Acceptance Test

Before approving Phase 6E as a whole, ask:

```text
If a candidate practiced only scenarios 61–100,
would they encounter genuinely different decision archetypes?

Or would they mostly learn:
"find bottleneck → scale/throttle → wait"?
```

If the latter:

```text
Phase 6E failed its purpose.
```

---

# 26. Do Not Implement Yet

This document is the strategy/spec only.

Do not begin authoring scenarios 81–100 until the first batch script is separately approved.

Next artifact should be:

```text
Phase 6E.1 batch script
```

for scenarios 81–85 only.
