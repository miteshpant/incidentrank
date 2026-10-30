We are continuing development of **IncidentRank**.

The last completed/current development phase was **Phase 10E**.

Before making any changes:

1. Inspect the existing codebase and understand what was implemented through Phase 10E.
2. Identify the current incident data model, incident runner/player, scoring model, admin/content creation flow, candidate attempt flow, learn/review flow, entitlement/free-access logic, and database schema.
3. Do NOT break or unnecessarily refactor existing Phase 10E behavior.
4. Existing incidents must continue to work exactly as they do today.
5. Candidate attempt history must remain valid.
6. First give me a concise summary of the current architecture relevant to incidents and explain the minimal changes you plan to make.

We are now starting:

# Phase 10F — Multi-Service Incident Architecture + Weekly Content Model

## Goal

IncidentRank currently supports incidents that are mostly linear.

A candidate receives information, investigates, makes a decision, sees more evidence, makes another decision, and eventually resolves the incident.

That model must continue to work.

However, IncidentRank now needs to support more realistic production incidents where:

- multiple services exist simultaneously
- several signals may appear at once
- failures may cross service boundaries
- candidates may choose different investigation paths
- downstream symptoms may look like root causes
- shared infrastructure may affect several services
- more senior candidates may face ambiguity instead of one obviously correct path

The architecture should evolve from a mostly linear incident sequence into a flexible incident model capable of representing production systems.

Do NOT turn this into a generic workflow engine or graph database.

Build the smallest clean extension of the existing architecture.

---

# 1. Incident Engineering Levels

IncidentRank uses these engineering levels:

```ts
INTERMEDIATE
SENIOR
STAFF
SENIOR_STAFF
PRINCIPAL
```

Use the exact enum names already present in the repository if they differ.

Do NOT introduce L1/L2/L3 terminology.

Level and incident structure are separate dimensions.

Conceptually:

```ts
level:
  | "INTERMEDIATE"
  | "SENIOR"
  | "STAFF"
  | "SENIOR_STAFF"
  | "PRINCIPAL"

structure:
  | "linear"
  | "branching"
  | "parallel"
  | "cascading"
```

A Principal incident is not automatically cascading.

An Intermediate incident is not automatically linear.

Do not couple difficulty with structure.

---

# 2. Supported Incident Structures

Add an explicit incident structure/type.

Initially support:

```ts
linear
branching
parallel
cascading
```

Use the naming conventions of the existing codebase.

## Linear

The candidate follows one primary investigation path.

Example:

Signal
→ Investigation
→ Evidence
→ Action
→ Verification

Most existing incidents should safely behave as `linear`.

## Branching

Several plausible investigation choices are available.

Some paths provide valuable evidence.

Some are lower-value, distracting, or premature.

The candidate should be evaluated partly on prioritization and reasoning.

## Parallel

Multiple services/components/signals exist at the same time.

The candidate must correlate information across systems rather than simply follow a single current node.

Example:

```text
                    Checkout API
                    /          \
              Payment         Inventory
                    \          /
                       Redis
```

Possible state:

```text
Checkout
- traffic normal
- error rate normal

Payment
- retries +340%
- timeouts elevated

Inventory
- p95 latency elevated

Redis
- CPU normal
- memory normal
- connections 96%
```

The candidate must decide whether the Payment and Inventory symptoms are independent or related.

## Cascading

One problem produces downstream failures elsewhere.

Example:

```text
Database connection exhaustion
        ↓
API latency
        ↓
request retries
        ↓
queue growth
        ↓
worker CPU increase
```

The candidate must distinguish root cause from secondary effects.

---

# 3. Generalized Incident Runtime

Do NOT create separate incident engines for each structure.

Extend the existing runtime so the same engine can support all four structures.

The current system may assume something conceptually similar to:

```ts
currentStep -> answer -> nextStep
```

Identify where this assumption exists.

For parallel and branching incidents, the runtime must instead be able to maintain incident state containing:

- currently visible evidence
- currently available investigations
- completed investigations
- remediation actions taken
- unlocked actions
- component state
- scoring state
- completion state

Do this with minimal disruption to the current implementation.

Existing linear incidents must continue working.

---

# 4. Components / Services

A multi-service incident needs a lightweight representation of the systems involved.

Examples of component types:

```text
service
api
worker
database
cache
queue
load_balancer
kubernetes_workload
external_provider
object_store
cdn
network
```

Do not over-engineer this list.

Use free-form metadata or an extensible enum where appropriate.

Conceptually an incident might contain:

```ts
components: [
  {
    id: "checkout",
    name: "Checkout API",
    type: "service"
  },
  {
    id: "payment",
    name: "Payment API",
    type: "service"
  },
  {
    id: "inventory",
    name: "Inventory API",
    type: "service"
  },
  {
    id: "redis",
    name: "Redis",
    type: "cache"
  }
]
```

Relationships may look conceptually like:

```ts
relationships: [
  { from: "checkout", to: "payment" },
  { from: "checkout", to: "inventory" },
  { from: "payment", to: "redis" },
  { from: "inventory", to: "redis" }
]
```

Do NOT introduce a graph database.

A simple relational or JSON-backed representation is enough if it fits the existing schema.

---

# 5. Evidence and Signals

Evidence/signals should optionally belong to a component.

Example:

```text
Checkout API
Latency: normal
Error rate: normal

Payment API
Retries: +340%
Timeouts: elevated

Inventory API
p95 latency: 1.8s

Redis
CPU: 42%
Memory: 61%
Connections: 96%
```

Evidence should support visibility state.

Conceptually:

```ts
visibility:
  | "initial"
  | "hidden"
  | "revealed"
```

or whatever fits the existing model.

Evidence may be revealed by:

- an investigation
- a candidate action
- another evidence item
- incident progression

Reuse the existing reveal mechanism wherever possible.

Do not replace working logic if it can be generalized.

---

# 6. Investigations

Candidates need to be able to investigate specific components.

Examples:

```text
Inspect Payment retry metrics

Inspect Redis connection usage

Check Inventory deployment history

Compare request volume across services

Inspect database saturation

Check dependency latency
```

An investigation may:

- reveal evidence
- unlock another investigation
- affect scoring
- update incident state
- lead to a remediation action

Do not assume every investigation transitions to exactly one next step.

Several investigations may remain available simultaneously.

---

# 7. Remediation Actions

Actions should be able to target components.

Examples:

```text
Restart Payment pods

Increase Redis connection pool capacity

Rollback Inventory deployment

Disable retries temporarily

Reduce minimum replicas

Fail traffic over

Scale a dependency
```

A remediation action may:

- change incident state
- reveal new signals
- resolve one symptom but worsen another
- alter scoring
- unlock verification steps

For more senior incidents, some actions may be technically valid but risky.

The runtime should allow this.

---

# 8. Root Cause Relationships

The authoring model needs a way to classify evidence/components/actions in relation to the incident.

At minimum support concepts such as:

```text
root cause
contributing factor
downstream symptom
context
noise
```

Use names that fit the existing project conventions.

Example:

```text
Redis connection exhaustion
= root cause

Payment retries
= downstream symptom

Inventory latency
= downstream symptom

Checkout healthy state
= useful context

Unrelated warning
= noise
```

These classifications are primarily for:

- scoring
- post-incident explanations
- analytics

Do NOT expose these labels to candidates while an incident is active.

---

# 9. Scoring

Do NOT completely replace the current scoring model.

Inspect it first.

Extend it so multi-service incidents can evaluate:

- investigation prioritization
- diagnosis quality
- identifying correlated symptoms
- finding shared dependencies
- distinguishing root cause from downstream symptoms
- risk awareness
- remediation quality
- verification quality
- unnecessary or risky actions

Potential scoring dimensions could eventually include:

```text
Diagnosis
Prioritization
System Understanding
Risk Awareness
Remediation
Verification
```

Reuse current scoring concepts where possible.

Important requirement:

Two candidates who eventually reach the same root cause should not necessarily receive the same score.

A candidate who takes a strong investigation path should score better than someone who randomly explores the system until they eventually find the answer.

---

# 10. Level-Specific Reasoning

Do NOT make higher levels merely contain more metrics.

The nature of the reasoning should evolve by engineering level.

## Intermediate

Primarily test:

- reading production signals
- basic diagnosis
- choosing a safe first action
- basic verification
- identifying obvious dependencies

Mostly linear/simple branching incidents.

## Senior

Test:

- prioritization
- multiple plausible causes
- recognizing downstream symptoms
- simple cross-service dependencies
- operational risk awareness

Can include simple parallel incidents.

## Staff

Test:

- reasoning across service boundaries
- shared infrastructure
- cascading effects
- incomplete evidence
- system-level remediation
- blast radius awareness

Cross-service reasoning should become a core competency here.

## Senior Staff

Test:

- second-order consequences
- tradeoffs
- complex cascading failures
- blast radius
- reliability vs availability
- coordinating remediation across multiple systems
- deciding what NOT to change

## Principal

Do NOT simply create harder Staff incidents.

Principal incidents should often include ambiguity.

Examples:

- multiple contributing causes
- several technically defensible actions
- incomplete or contradictory evidence
- dependencies owned by different teams
- mitigation vs permanent fix tradeoffs
- cost vs capacity vs reliability decisions
- deciding on containment before root cause is fully known
- situations where no action is perfect

Principal scoring should evaluate reasoning quality and risk management, not merely whether one predetermined answer was selected.

---

# 11. Weekly Publishing Model

IncidentRank will publish:

```text
3 Intermediate incidents/week
3 Senior incidents/week
3 Staff incidents/week
3 Senior Staff incidents/week
3 Principal incidents/week
```

Total:

```text
15 new incidents/week
```

Do NOT hard-code "3 incidents" into runtime logic.

This is editorial policy.

The content model should make it easy to query incidents by:

- level
- structure
- domain
- status
- publication date
- release week
- free/paid access

Reuse existing fields if they already exist.

If needed, introduce concepts similar to:

```ts
status:
  | "draft"
  | "published"
  | "archived"

publishedAt

releaseWeek
```

Only add fields that are actually useful and not already represented.

---

# 12. Recommended Weekly Content Mix

This is an editorial guideline only.

Do NOT enforce these ratios in code.

## Intermediate — 3/week

Suggested:

```text
2 linear
1 simple branching
```

## Senior — 3/week

Suggested:

```text
1 linear
1 branching
1 simple parallel
```

## Staff — 3/week

Suggested:

```text
1 branching
1 parallel
1 cascading
```

## Senior Staff — 3/week

Suggested:

```text
1 parallel
1 cascading
1 complex branching
```

## Principal — 3/week

Suggested:

```text
1 complex parallel
1 system-wide cascading
1 ambiguous architecture/production incident
```

The schema should support this editorial mix without enforcing it.

---

# 13. Free Incident Support

IncidentRank needs the ability to select individual incidents as free.

Reuse the current entitlement/access system.

Conceptually:

```ts
isFree: boolean
```

or equivalent.

Do NOT make all five levels free every week.

Do NOT automatically make one incident per level free.

The content/admin layer should allow us to choose which incident is currently free.

This allows free incidents to rotate independently of publishing cadence.

---

# 14. Domains / Skills Metadata

We want incidents to become queryable and eventually useful for targeted assessments.

Support metadata such as:

```text
reliability
performance
cost
capacity
networking
deployment
database
distributed_systems
queues
caching
data
security
observability
```

Also support primary and secondary skills if the current architecture can accommodate this cleanly.

Conceptually:

```ts
domain: "reliability"

primarySkill: "cross_service_diagnosis"

secondarySkills: [
  "redis",
  "dependency_analysis",
  "safe_remediation"
]
```

Do not build a complex taxonomy system in Phase 10F.

A simple extensible model is enough.

---

# 15. Post-Incident Explanation / Learn Flow

Inspect the Phase 10E learn/review experience.

Extend it rather than building a duplicate system.

For a multi-service incident, the completed incident should be capable of explaining:

```text
Root cause:
Redis connection exhaustion

Observed effects:
→ Payment retry increase
→ Inventory latency increase

Why Checkout looked healthy:
Its connection pool had not yet crossed the failure threshold.

Strong investigation path:
1. Correlate Payment and Inventory degradation
2. Identify shared dependency
3. Inspect Redis
4. Confirm connection saturation
5. Apply safe mitigation
6. Verify recovery
```

The post-incident explanation should help candidates learn the system model, not merely tell them "correct answer."

---

# 16. Authoring / Admin

Inspect how incidents are currently created.

We will eventually create 15 new incidents every week.

Therefore, the incident architecture must not require manually editing application code for every new incident.

If incidents are currently seeded from JSON or TypeScript:

- preserve compatibility
- cleanly structure the new model
- make it possible to build an admin authoring system later

If an admin editor already exists, extend it only as much as needed.

Do NOT build a massive CMS in Phase 10F.

The priority is:

1. data model
2. runtime
3. backward compatibility
4. one complete reference incident
5. clean authoring format

---

# 17. Reference Incident

After implementing the architecture, create ONE complete reference multi-service incident.

Make it a **Staff-level parallel incident**.

Scenario:

Checkout traffic appears healthy.

Payment retries are elevated.

Inventory latency is elevated.

Payment and Inventory both depend on Redis.

Redis CPU and memory appear normal.

Redis connection utilization is extremely high.

The candidate should need to correlate Payment and Inventory to discover the shared dependency.

Do NOT make Redis obviously the root cause in the initial view.

Requirements:

- at least 4 components
- at least 6 meaningful evidence items
- multiple investigation options
- at least 2 plausible but inferior investigation paths
- at least one misleading/noise signal
- remediation decision
- verification step
- scoring
- learn/review explanation
- candidate should be able to investigate services in more than one order

The strongest investigation path should look roughly like:

```text
Notice Payment + Inventory degradation
→ identify shared dependency
→ inspect Redis
→ discover connection saturation
→ choose safe mitigation
→ verify both dependent services recover
```

Do not require this exact order if the candidate can reach the same conclusion through another strong path.

---

# 18. UI

Do not turn IncidentRank into a monitoring dashboard.

The product is an interview/assessment experience.

For multi-service incidents, candidates should clearly understand:

- which systems exist
- what signals are currently visible
- what investigations are available
- what actions they may take

A small topology view is useful.

Example:

```text
             Checkout
             /      \
        Payment    Inventory
             \      /
               Redis
```

Keep it simple.

Do NOT introduce a large graph visualization library unless absolutely necessary.

Existing UI patterns should remain recognizable.

---

# 19. Backward Compatibility

This is critical.

Every current incident must continue to work.

Existing incidents should safely default to:

```text
structure = linear
```

or equivalent behavior.

Do NOT destroy or rewrite candidate attempt history.

Do NOT invalidate existing attempt URLs.

Do NOT change existing scoring in a way that alters historical results.

Be careful with production database migrations.

Prefer additive migrations.

Avoid destructive schema changes.

---

# 20. Database / Drizzle

Follow the repository's existing:

- Drizzle conventions
- Postgres conventions
- migration patterns
- enum conventions
- naming conventions

Do not create duplicate concepts if equivalent fields/tables already exist.

Before introducing new tables, first determine whether existing incident/node/step/evidence models can be generalized safely.

Prefer incremental schema evolution.

---

# 21. Tests

Add tests for:

- existing linear incidents still working
- structure defaults/migration
- parallel incident state
- evidence reveal behavior
- investigations targeting components
- branching paths
- scoring path differences
- remediation
- verification
- completed multi-service incident review
- preservation of existing attempts

Run the existing:

- tests
- lint
- typecheck
- production build

Use the actual repository commands.

---

# 22. What NOT to Build in Phase 10F

Do NOT build:

- automatic AI generation of 15 incidents/week
- automatic publishing scheduler
- generic workflow engine
- graph database
- elaborate topology visualization
- enterprise assessment builder
- large CMS rewrite
- incident marketplace
- automatic adaptive interviews

These can be future phases.

Phase 10F should create the architecture that makes those possible.

---

# Before Coding

First inspect the repository and report:

1. How Phase 10E's incident architecture currently works.
2. Which files/models/tables are relevant.
3. Where the current implementation assumes a linear incident.
4. How the current scoring engine works.
5. How the current learn/review flow works.
6. How free/paid incident access currently works.
7. Your proposed minimal schema changes.
8. Your proposed runtime changes.
9. Migration and backward-compatibility strategy.
10. What you intentionally will NOT build in Phase 10F.

Do not ask me architectural questions that can be answered by inspecting the codebase.

Make reasonable engineering decisions based on the existing implementation.

Then implement Phase 10F.

---

# Completion Report

When finished, provide:

1. Architecture summary.
2. Files changed.
3. Database migrations added.
4. New schema/entities introduced.
5. How backward compatibility is preserved.
6. How existing linear incidents continue working.
7. How to author a new linear incident.
8. How to author a branching incident.
9. How to author a parallel incident.
10. How to author a cascading incident.
11. How scoring works for multi-service incidents.
12. How the Staff reference incident works.
13. How free incidents are configured.
14. How weekly content can be queried/organized.
15. Test/lint/typecheck/build results.
16. Any known limitations.
17. Recommended scope for Phase 10G.

The main architectural principle is:

**IncidentRank should model how engineers reason about production systems, not merely how they progress through a sequence of questions.**


# Critical Sequencing Requirement

Do NOT create new production incident content at the beginning of Phase 10F.

Phase 10F must be infrastructure-first.

Complete the work in this order:

1. Inspect the existing Phase 10E architecture.
2. Implement the new incident structure/data model.
3. Implement multi-service runtime support.
4. Extend evidence/investigation/action handling.
5. Extend scoring where required.
6. Extend learn/review support.
7. Add safe database migrations.
8. Verify backward compatibility with all existing incidents and candidate attempts.
9. Run tests, lint, typecheck, and production build.
10. Fix any regressions.

Only after all infrastructure work is complete and passing should you create new incident content.

At that point, create exactly ONE new reference incident:

- Level: Staff
- Structure: parallel
- Purpose: validate the new multi-service architecture end-to-end

This reference incident is a test/validation artifact for Phase 10F.

Do NOT create:

- the 15 weekly incidents
- 3 incidents per level
- additional Intermediate/Senior/Staff/Senior Staff/Principal content batches

Those belong to the next content phase after the infrastructure has been proven stable.

Phase 10F completion means:

**the platform is ready to support the new incident model, and one reference incident proves that it works.**

It does NOT mean the weekly incident library has already been populated.