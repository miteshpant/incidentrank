We are continuing development of **IncidentRank**.

**Phase 10F is complete and accepted.**

Phase 10F delivered:

- additive scenario metadata for structure/domain/free/release fields
- persisted `scenarios.is_free` as the authoritative free-access value
- multi-service scenario support using the existing simulation engine
- `roleInIncident` metadata on evidence/metrics
- post-incident incident narrative support
- one fully validated Staff-level parallel reference incident
- golden-path registration and validation for that incident
- preserved backward compatibility for all existing scenarios and attempts

Do NOT revisit or redesign the Phase 10F incident runtime unless a concrete blocker is found.

We are now starting:

# Phase 10G — Content Operations, Authoring, Validation, Publishing, and First Weekly Incident Batch

The goal of Phase 10G is to make IncidentRank operationally ready to create, review, validate, schedule, and publish **15 high-quality new incidents every week** without editing application code or relying on direct database changes for normal editorial work.

Do NOT start by generating 15 incidents.

Phase 10G must be infrastructure-first.

Only after the authoring, validation, scoring-display, metadata, publishing, and workflow pieces are complete and tested should the first weekly batch be created.

---

# 1. Existing Engineering Levels

IncidentRank uses:

```ts
INTERMEDIATE
SENIOR
STAFF
SENIOR_STAFF
PRINCIPAL
```

Use the existing enums/naming exactly as they exist in the repository.

Weekly target:

```text
3 Intermediate
3 Senior
3 Staff
3 Senior Staff
3 Principal

Total: 15 new incidents/week
```

Do NOT hard-code this count into runtime logic.

This is an editorial target.

---

# 2. Critical Phase 10F Finding — Fix Score Display First

Phase 10F exposed a real UI bug.

The result screen currently uses a hard-coded client-side mapping for each scoring dimension's max score.

This caused the Staff reference incident to display an incorrect denominator such as:

```text
150 / 50
```

even though the server-side score was correct.

Fix this before creating additional incidents.

The client must NOT own hard-coded dimension maximums.

Instead:

- derive each dimension's actual `maxPoints` from the authored scoring configuration
- return that max alongside the server score breakdown
- use the server-provided value everywhere the result/review UI renders a dimension score

Update all relevant DTOs/types/routes/hooks.

Inspect at least:

- score-preview route
- finish-preview route
- persisted attempt scoring/review flow
- `ServerScoreResult`
- `use-incident-attempt.ts`
- `attempt-persistence.ts`
- `result-screen.tsx`

Do not create a second client-side mapping.

Add tests for:

- standard historical score dimensions
- a scenario with non-standard dimension weights
- result UI showing correct numerator and denominator

Existing scenario scores must not change.

---

# 3. Content Metadata Must Become Editable

Phase 10F added metadata but did not provide normal authoring/admin controls for all of it.

Phase 10G should make the scenario authoring/admin experience capable of editing:

```text
level
structure
domain
primarySkill
secondarySkills
releaseWeek
publishedAt
isFree
status
```

and, where appropriate:

```text
roleInIncident
```

for evidence/metrics only.

Do NOT put `roleInIncident` on controls or rules.

Use existing editor patterns.

Do NOT build a new CMS from scratch.

Extend the existing sectioned scenario editor/admin surfaces.

---

# 4. Skill Metadata

Ensure both primary and secondary skills are represented consistently.

We should be able to query/filter scenarios conceptually by combinations like:

```text
Staff
+ parallel
+ Caching
+ distributed systems
```

or:

```text
Senior
+ branching
+ deployment
```

Do not introduce an elaborate taxonomy system.

Use a simple, extensible representation.

If `primarySkill` or `secondarySkills` currently live only in code/JSON and cannot be queried through the scenario catalog/admin system, make the smallest clean change needed so they are usable operationally.

Avoid unnecessary denormalization if existing JSON metadata can already be queried cleanly.

---

# 5. Free Incident Management

Phase 10F made persisted `scenarios.is_free` authoritative.

Phase 10G should make free incident rotation manageable through the application rather than direct DB editing.

Add a minimal admin/editor control for:

```text
isFree
```

Important:

- changing free status must not require a code deploy
- do not overwrite editorial DB changes during normal production operation
- review the current `db:seed` behavior

Today the seed process may synchronize code-level `isFree` defaults back into DB rows.

That was acceptable during Phase 10F bootstrap.

For Phase 10G, ensure normal seed runs do NOT unintentionally overwrite editorial free/paid state that was changed through the admin/editor.

Use code values only as initial bootstrap/defaults where appropriate.

Existing three free incidents must remain correct unless deliberately changed.

Add tests proving:

- admin/editor free toggle persists
- runtime entitlement follows it
- later seed runs do not silently overwrite it

---

# 6. Publishing Lifecycle

We need a lightweight editorial publishing workflow.

Use the existing status model where possible.

Support a lifecycle conceptually similar to:

```text
DRAFT
READY_FOR_REVIEW
VALIDATED
SCHEDULED
PUBLISHED
ARCHIVED
```

Do not blindly create all of these if current status values already cover some of them.

Inspect what exists first.

The important business capabilities are:

1. authors can work on drafts
2. drafts cannot accidentally become candidate-visible
3. a scenario can be marked ready for review
4. a scenario can be validated
5. a scenario can be scheduled for a release week/date
6. only published/eligible scenarios appear to candidates
7. old content may be archived without deleting historical attempts

Keep implementation minimal.

Do not build a workflow orchestration engine.

---

# 7. Release Week / Publication Scheduling

Phase 10F added:

```text
releaseWeek
publishedAt
```

or equivalent fields.

Make them operational.

We need to support preparing incidents before publication.

A scenario should be able to exist as:

```text
draft today
scheduled for next week's release
published when intended
```

Clarify the semantics of:

```text
releaseWeek
publishedAt
status
```

and enforce them consistently.

Do NOT build a background scheduler unless it is truly necessary.

If publication can be achieved with a simple rule such as:

```text
status = published
AND publishedAt <= now
```

use that.

Prefer the smallest reliable implementation.

---

# 8. Incident Validation Contract

Phase 10F discovered that a scenario is not complete merely because its definition compiles.

Every scenario must satisfy a validation contract before it can be considered publishable.

Build a reusable validation layer/checklist.

At minimum validate:

```text
scenario definition valid
required metadata present
simulation definition compiles
candidate UI descriptor resolves
success condition reachable via golden path
scoring config valid
score max totals valid
golden path exists
golden path passes
review/narrative generation does not fail
architecture component references valid
control component references valid
metric component references valid
no duplicate IDs
release/publishing metadata valid
```

Add any other checks already implied by repository invariants.

Prefer deterministic validation.

Do not use AI for validation.

---

# 9. Golden Path Becomes Mandatory

Phase 10F exposed that every registered scenario requires a golden-path definition and registry entry.

Make this a first-class authoring requirement.

Every new scenario must have:

- scenario definition
- candidate UI
- rules
- scoring
- golden path
- golden-path registration
- regression tests

If possible, improve the developer/author experience so a missing golden path produces a clear validation error such as:

```text
Scenario "foo-bar" cannot be validated/published:
missing golden path registration.
```

instead of failing later with an obscure undefined-property error.

Do NOT weaken or remove the golden-path regression suite.

It is valuable.

---

# 10. Publishability / Validation Status

A scenario should NOT become publishable simply because an editor toggles a status field.

Create a clear publishability check.

Conceptually:

```ts
canPublishScenario(scenario)
```

should verify all required content and validation conditions.

A scenario that fails validation should show why.

Examples:

```text
Missing golden path
Invalid scoring total
Missing primary skill
Architecture edge references unknown component
No success condition reachable
Missing release date
```

Do not scatter this logic across UI components.

Centralize it cleanly.

---

# 11. Authoring UX

Keep the authoring interface practical.

We will be creating 15 incidents/week, so the workflow should make common tasks easy.

At minimum, an author/reviewer should be able to see/edit:

## Basics
- title
- slug
- description
- engineering level
- estimated duration
- structure
- domain
- primary skill
- secondary skills

## Access / Publishing
- free/paid
- status
- release week
- publication date

## Architecture
- components/nodes
- relationships/edges

## Evidence / Metrics
- component
- initial value/state
- incident behavior
- `roleInIncident`

## Controls / Investigations / Remediations
- component
- control kind
- options
- classifications

## Rules / Simulation
Use existing editor behavior.

## Scoring
Use existing scoring editor behavior.

## Validation
Show whether the scenario is publishable and why/why not.

Do not attempt a visual no-code workflow builder.

---

# 12. Editorial Content Mix

The platform should support this approximate editorial strategy.

Do NOT enforce these ratios in application logic.

## Intermediate — 3/week

Suggested:

```text
2 linear
1 simple branching
```

Focus on:

- basic diagnosis
- production signals
- safe remediation
- verification

## Senior — 3/week

Suggested:

```text
1 linear
1 branching
1 simple parallel
```

Focus on:

- prioritization
- plausible competing causes
- operational risk
- simple dependency analysis

## Staff — 3/week

Suggested:

```text
1 branching
1 parallel
1 cascading
```

Focus on:

- cross-service reasoning
- shared dependencies
- cascading effects
- system-level remediation

## Senior Staff — 3/week

Suggested:

```text
1 parallel
1 cascading
1 complex branching
```

Focus on:

- second-order effects
- blast radius
- tradeoffs
- multi-system remediation
- what NOT to change

## Principal — 3/week

Suggested:

```text
1 complex parallel
1 system-wide cascading
1 ambiguous production/architecture incident
```

Focus on:

- ambiguity
- multiple contributing causes
- containment before full diagnosis
- organizational/system boundaries
- availability vs reliability vs cost tradeoffs
- several defensible actions
- reasoning quality over one predetermined answer

Again: editorial guidance only.

---

# 13. Do NOT Generate Incidents Yet

This is critical.

Do NOT generate the first 15 weekly incidents until all of the following are complete:

1. score-max display fix
2. metadata authoring support
3. free-incident admin control
4. safe seed behavior
5. publishing lifecycle
6. release metadata behavior
7. validation contract
8. mandatory golden-path handling
9. publishability checks
10. tests/lint/typecheck/build pass

Only after those are complete should you create content.

---

# 14. First Weekly Batch

After the infrastructure above is fully complete and verified, create exactly:

```text
3 Intermediate
3 Senior
3 Staff
3 Senior Staff
3 Principal
```

Total:

```text
15 incidents
```

Do NOT create more than 15.

These are the first weekly batch and should exercise the newly improved content pipeline.

Use a healthy mix of domains.

Avoid creating 15 versions of the same failure mode.

Across the batch, include diversity such as:

```text
databases
caching
messaging
microservices
API/traffic
deployments
capacity
networking
distributed systems
security/identity
data pipelines
cost/reliability tradeoffs
```

Use only domains already supported by the product taxonomy unless extending the taxonomy is clearly required.

---

# 15. First Weekly Batch — Quality Requirements

Every one of the 15 incidents must include:

- correct level
- explicit structure
- domain
- primary skill
- secondary skills
- architecture/components where relevant
- meaningful production signals
- authored rules
- authored scoring
- success/failure behavior
- golden path
- golden-path registration
- publish metadata
- validation success

For incidents where it makes sense, include:

- investigation controls
- multiple plausible paths
- noise/context signals
- `roleInIncident` metadata
- post-incident explanation

Do not force every incident to be cross-service.

Linear incidents remain useful, especially at Intermediate/Senior.

---

# 16. Quality Over Quantity

The target is 15 incidents, but do not lower scenario quality to hit the number.

Each scenario should have a distinct production lesson.

Avoid trivial variations such as:

```text
same incident
different service name
same root cause
same score path
```

Each scenario should test a meaningful engineering competency.

Examples:

- connection pool exhaustion
- bad retry policy
- queue consumer lag
- hot partition
- cache stampede
- stale configuration rollout
- certificate or identity failure
- deployment regression
- partial region degradation
- database replica lag
- noisy neighbor/capacity issue
- DNS/network dependency failure
- backpressure failure
- cost/resilience tradeoff
- cascading dependency pressure

Do not reuse these examples mechanically if similar scenarios already exist.

Inspect the existing catalog first to avoid duplication.

---

# 17. Principal-Level Content Guardrail

Principal incidents must NOT simply have more controls or more services.

They should test qualitatively different reasoning.

Examples:

- no single perfect action
- mitigation and root-cause repair are different
- competing organizational/system priorities
- contradictory metrics
- degraded third-party dependency
- safe containment before full diagnosis
- deliberate acceptance of temporary degradation
- deciding what not to touch
- system risk across multiple teams/domains

Scoring may reward several defensible paths differently.

Do not make Principal content a single hidden-answer puzzle.

---

# 18. Review / Learn Experience

Verify that the 15 new scenarios produce meaningful post-incident review.

For scenarios using `roleInIncident`, the review should appropriately distinguish:

- root cause
- contributing factor
- downstream effects
- context

Noise should generally not be highlighted as part of the explanation.

Do not fabricate AI explanations.

Use deterministic authored metadata/rules.

---

# 19. Catalog / Discovery

Make sure new metadata can support future catalog filtering.

At minimum, repository/server data access should support filtering/querying by:

```text
level
structure
domain
primarySkill
secondarySkills
isFree
status
releaseWeek
publishedAt
```

A full candidate-facing filter UI is not required unless one already exists and can be extended easily.

The important part is that the data model and queries support this cleanly.

---

# 20. Backward Compatibility

Critical requirements:

- all existing 101 scenarios continue to work
- existing scores do not change
- historical attempts remain valid
- existing free/paid behavior remains correct unless deliberately changed
- existing golden paths continue to pass
- existing authored org scenarios continue to compile
- no destructive DB migration
- no scenario definition rewrite unless required

Prefer additive changes.

---

# 21. Tests

Add/extend tests for:

## Scoring display
- custom max-points scenario
- standard historical scenario

## Free access
- DB toggle
- admin toggle
- seed persistence

## Publishing
- draft hidden
- scheduled future hidden
- published eligible visible
- archived hidden
- historical attempts still readable

## Validation
- missing golden path
- invalid component reference
- invalid score config
- missing required metadata
- valid scenario passes

## Golden paths
- all 116 scenarios pass after first weekly batch

Expected total after Phase 10G:

```text
101 existing scenarios
+ 15 new incidents
= 116 scenarios
```

Adjust if the current catalog count differs when you inspect the repository.

Run:

- scenario tests
- simulator tests
- web tests
- lint
- typecheck
- production build
- DB migration/seed validation

Use the repository's actual commands.

---

# 22. Manual QA

Before declaring Phase 10G complete, manually exercise at least:

- one Intermediate incident
- one Staff incident
- one Principal incident

For each:

- open briefing
- start incident
- perform investigations/actions
- complete incident
- verify scoring
- verify correct score denominators
- verify review/learn
- verify access/publishing state

Also manually verify:

- toggling free/paid changes candidate access
- scheduled unpublished scenario is not candidate-visible
- published scenario is visible

---

# 23. Explicitly Out of Scope

Do NOT build:

- AI auto-generation of weekly incidents
- automated LLM content approval
- generic workflow engine
- graph database
- visual drag-and-drop simulation builder
- enterprise assessment builder
- marketplace
- adaptive interview engine
- automated candidate-level personalization
- large analytics dashboard
- automatic weekly publishing cron unless truly required by the existing architecture

Phase 10G is a content-operations and first-batch phase.

---

# 24. Before Coding

First inspect the repository and report:

1. Current authoring/editor architecture.
2. Current scenario status/publishing behavior.
3. Current catalog query/filter model.
4. Current score result DTO path from scorer → API → UI.
5. Current seed behavior for `is_free`.
6. Current golden-path validation behavior.
7. Exact changes proposed for Phase 10G.
8. DB migration needs, if any.
9. What will intentionally remain out of scope.

Do not ask questions that can be answered from the repository.

Make reasonable engineering decisions.

Then implement Phase 10G in this order:

```text
A. Fix score-max display
B. Complete metadata authoring
C. Fix free-incident editorial persistence
D. Implement publishing lifecycle
E. Implement validation contract
F. Make golden-path requirement explicit
G. Verify infrastructure
H. Only then build the 15-incident weekly batch
I. Validate all 15
J. Manual QA
```

Do not start section H before A–G pass.

---

# 25. Phase 10G Completion Report

At completion, provide:

1. Architecture summary.
2. Files changed.
3. Migrations added.
4. Score-display fix details.
5. Authoring/admin changes.
6. Free-incident rotation behavior.
7. Seed behavior.
8. Publishing lifecycle.
9. Validation contract.
10. Golden-path enforcement.
11. First weekly batch table containing:
   - slug
   - title
   - level
   - structure
   - domain
   - primary skill
   - free/paid
12. Short description of each of the 15 incidents.
13. Scoring strategy for each.
14. Golden-path status for each.
15. Manual QA results.
16. Full test/lint/typecheck/build results.
17. Any architectural gaps discovered.
18. Recommended Phase 10H scope.

The central principle for Phase 10G is:

**IncidentRank should be able to produce 15 high-quality incidents every week through a reliable editorial workflow, without turning scenario development into application development.**

And the execution rule is:

**Build the content-production system first. Only then use it to create the first 15 incidents.**