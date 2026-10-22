# IncidentRank — Phase 5: Scenario Authoring

Before making changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Review the existing `ScenarioDefinition` types.
4. Review the Payment Retry Storm scenario implementation.
5. Review how the simulator consumes scenario definitions.
6. Review Phase 4 company/assessment architecture.
7. Do not add AI/LLM scenario generation.
8. Do not add billing.
9. Do not add email delivery.
10. Do not modify Payment Retry Storm behavior unless needed for generic authoring compatibility.

Phase 0 through Phase 4.1 are complete.

---

# Goal

A company should be able to create its own private IncidentRank scenario without writing TypeScript.

Scenario authors should define:

- incident metadata
- architecture
- controls
- initial state
- metrics
- timeline events
- deterministic rules
- authored consequences
- success conditions
- failure conditions
- scoring metadata

The resulting scenario must execute through the existing generic simulator.

---

# Product Principle

IncidentRank is NOT a cloud simulator.

Scenario authors define cause and effect.

The authoring model is:

```text
Candidate action
      ↓
Scenario rule matches
      ↓
Authored consequence
      ↓
New incident state
```

Do not introduce:

- queueing theory
- infrastructure equations
- automatic capacity calculations
- AWS/GCP simulation
- arbitrary JavaScript
- arbitrary executable expressions

Scenario behavior must remain deterministic and inspectable.

---

# Scenario Ownership

Extend scenarios to support:

```text
IncidentRank-owned scenarios
Company-owned private scenarios
```

Conceptually:

```ts
Scenario {
  id
  slug
  version

  ownershipType:
    "incidentrank"
    | "organization"

  organizationId nullable

  visibility:
    "public"
    | "private"

  status:
    "draft"
    | "published"
    | "archived"

  ...
}
```

Existing Payment Retry Storm becomes:

```text
ownershipType = incidentrank
visibility = public
```

Company-authored scenarios:

```text
ownershipType = organization
visibility = private
```

---

# Critical Source-of-Truth Change

Until now, executable scenarios were source-controlled TypeScript definitions.

Phase 5 introduces database-authored scenarios.

Do not create a second incompatible engine.

Define a serialized scenario schema that maps cleanly to the existing simulator's `ScenarioDefinition`.

The simulator should still receive the same conceptual definition.

The flow becomes:

```text
DB authored scenario
       ↓
validation / compilation
       ↓
ScenarioDefinition
       ↓
existing simulator
```

Existing source-controlled scenarios must continue working.

---

# Scenario Versions

Publishing a scenario creates an immutable version.

A company may edit only a draft.

Conceptually:

```text
Scenario
  ↓
ScenarioVersion 1
ScenarioVersion 2
ScenarioVersion 3
```

An assessment always points to one immutable scenario version.

Never mutate a published version used by an assessment.

This is critical.

---

# Suggested Data Model

Choose names that fit the existing schema, but conceptually support:

```ts
scenarios
scenario_versions
```

Potential `scenario_versions` fields:

```ts
id
scenarioId
version
definitionJson
status
createdByUserId
createdAt
publishedAt
```

If existing `scenarios` already represents versioned identity differently, migrate carefully rather than duplicating concepts unnecessarily.

Document the final model.

---

# Authoring Routes

Add:

```text
/organizations/[slug]/scenarios
```

List:

- drafts
- published scenarios
- archived scenarios

CTA:

```text
Create Scenario
```

Add:

```text
/organizations/[slug]/scenarios/new
```

and:

```text
/organizations/[slug]/scenarios/[scenarioId]/edit
```

---

# Authoring Experience

Do not attempt to build a giant visual canvas immediately.

Use a structured form/editor.

Recommended authoring sections:

```text
1. Basics
2. Architecture
3. Controls
4. Initial State
5. Metrics
6. Timeline Events
7. Rules & Consequences
8. Success / Failure
9. Scoring
10. Preview & Publish
```

Allow navigation between sections.

Save draft state.

---

# 1. Basics

Fields:

```text
Scenario name
Slug
Description
Difficulty
Estimated duration
```

Optional:

```text
Instructions shown to candidate
```

Do not expose hidden solution information.

---

# 2. Architecture

Allow authors to define nodes.

Example:

```text
Checkout API
Payment Service
Payment Provider
Postgres
Kafka
```

Node fields:

```text
id
label
type
```

Keep types simple:

```text
service
database
queue
external
client
other
```

Allow edges:

```text
from
to
label optional
```

Do not build freeform drag-and-drop canvas unless trivial.

A structured list is sufficient.

The candidate rendering can continue using the current architecture view.

---

# 3. Controls

Authors define candidate-operable controls.

Example:

```text
Key:
retries

Label:
Retries

Type:
select

Allowed values:
0
1
3
5

Initial:
3
```

Supported control types for Phase 5:

```text
select
toggle
```

Do not add arbitrary text/config inputs yet.

Require:

- unique key
- label
- allowed values
- initial value

Validation must ensure the initial value is among allowed values.

---

# 4. Initial State

Allow authors to define initial incident state.

This should map to the same state keys used by rules and metrics.

Keep the model explicit.

Example:

```json
{
  "checkoutSuccessRate": 99.9,
  "paymentTraffic": "normal",
  "dbPressure": "normal"
}
```

The editor may use key/value rows rather than raw JSON where practical.

If raw JSON is used for POC speed:

- validate strongly
- show useful errors
- never execute it

---

# 5. Metrics

Authors define candidate-visible metrics.

Example:

```text
Checkout Success Rate
source state key:
checkoutSuccessRate
format:
percentage
```

Support a small set of formats:

```text
number
percentage
duration
currency
status
```

Do not build arbitrary formatting expressions.

---

# 6. Timeline Events

Authors can add deterministic timed events.

Example:

```text
At:
60 seconds

Name:
Payment provider degraded

Effects:
checkoutSuccessRate → 72
paymentTraffic → critical
```

Each timed event should contain:

```text
time
label
effects
```

Reuse existing engine effect structures where possible.

---

# 7. Rules & Consequences

This is the core of IncidentRank authoring.

Authors define:

```text
WHEN
conditions

THEN
effects
```

Example:

```text
WHEN
circuitBreaker == on
AND
backoff == exponential
AND
retries <= 1

THEN
checkoutSuccessRate = 96
paymentTraffic = recovering
dbPressure = degraded
```

No code.

No JavaScript.

No string eval.

No arbitrary expressions.

---

# Condition Types

Support only explicit structured operators.

At minimum:

```text
equals
not_equals
less_than
less_than_or_equal
greater_than
greater_than_or_equal
```

If the existing engine supports other safe operators, expose only those necessary.

Conditions may refer to:

```text
control values
incident state values
```

Do not expose runtime internals.

---

# Effects

Use structured effects matching the simulator.

Example:

```text
set state value
increment numeric value
set severity/status
```

Prefer the smallest set required by current engine capabilities.

Do not invent a scripting language.

---

# Rule Ordering

The current scenario engine evaluates authored rule order.

The authoring UI must make ordering explicit.

Show:

```text
Rule 1
Rule 2
Rule 3
...
```

Allow:

```text
Move Up
Move Down
```

Explain:

> More specific rules should usually appear before broader fallback rules.

Do not automatically reorder rules.

---

# Default / Fallback Behavior

Require each publishable scenario to have deterministic behavior even when no specialized rule matches.

If the engine requires a default rule, validate that one exists.

Do not allow scenarios that enter undefined state.

---

# 8. Success and Failure Conditions

Allow structured conditions.

Example success:

```text
checkoutSuccessRate >= 95
AND
p99Latency <= 3000
```

with:

```text
must remain true for:
30 seconds
```

Failure:

```text
checkoutSuccessRate < 60
```

with:

```text
must remain true for:
180 seconds
```

Reuse existing simulator condition structures.

---

# 9. Scoring

Do NOT build arbitrary scoring formula scripting.

Phase 5 should support either:

### Option A — predefined generic dimension configuration

or:

### Option B — scenario-authored scoring bands using supported IncidentRank dimensions.

Prefer B if it maps cleanly to the current scoring architecture.

Candidate score remains:

```text
0–1000
```

For authored scenarios, allow the author to choose configured dimensions such as:

```text
Recovery
Customer Impact
Data Integrity
Reliability
Cost Efficiency
Operational Efficiency
```

Weights must total:

```text
1000
```

Scoring rules must be deterministic and structured.

Do not allow arbitrary code.

---

# Scoring Bands

Example:

```text
Recovery

<= 2:30 → 300
<= 5:00 → 240
<= 10:00 → 150
failed → 0
```

Represent this as structured data.

If the current scoring package is too Payment-Retry-specific, extract reusable generic scoring primitives while preserving the existing scenario score exactly.

Payment Retry Storm must not change score behavior during the refactor.

Add regression tests.

---

# Authoring Validation

Drafts may be incomplete.

Publishing must require validation.

Return structured errors such as:

```text
Control "retries" has no initial value.

Rule 4 references unknown control "retryCount".

Metric "Latency" references unknown state key "p99".

Success condition references unsupported operator.
```

Never publish invalid executable definitions.

---

# Scenario Compilation

Create a pure function conceptually like:

```ts
compileAuthoredScenario(
  persistedDefinition
): ScenarioDefinition
```

Responsibilities:

- validate schema
- normalize persisted representation
- construct simulator-compatible definition

It must have:

- no React dependency
- no Clerk dependency
- no DB dependency if practical

Prefer placing this in:

```text
packages/scenarios
```

or a small dedicated package if separation is cleaner.

---

# Runtime Registry

The current resume mechanism uses:

```text
resolveSimulationDefinition(slug, version)
```

This can no longer depend only on a static registry.

Extend the resolver so it can obtain:

```text
IncidentRank built-in scenario version
OR
company-authored published scenario version
```

Do not break deterministic resume.

Assessment resume must still resolve the exact immutable version.

---

# Preview

Before publishing, provide:

```text
Preview Scenario
```

Authors should be able to launch their draft scenario in practice-style mode.

Preview:

- must not create candidate assessment results
- must not affect leaderboard
- must not create normal candidate practice history unless intentionally designed

Prefer an isolated preview mode.

---

# Test Run

Allow organization owner/admin to:

```text
Run Scenario
```

This helps validate whether rules behave as expected.

During preview, show normal candidate UI.

Optionally add a clearly labeled author/debug panel that shows:

```text
matched rule
resulting effects
```

only in preview mode.

Never show this to candidates.

---

# Publish

Publishing:

1. validates complete scenario
2. creates immutable version
3. marks it published
4. makes that version selectable when creating company assessments

Do not make company-authored scenarios public.

---

# Editing Published Scenarios

Published versions are immutable.

When user clicks:

```text
Edit
```

on a published scenario:

create a new draft based on the previous version.

Example:

```text
v1 published
↓
Edit
↓
v2 draft
↓
Publish
↓
v2 published
```

Existing assessments remain pinned to v1.

---

# Assessment Integration

When creating an assessment, scenario selector should show:

```text
IncidentRank built-in scenarios
+
organization's published private scenarios
```

It must not show:

- drafts
- archived scenarios
- another organization's private scenarios

---

# Privacy

Organization-authored scenario definitions are private.

Another organization must not be able to:

- list them
- fetch them
- preview them
- select them
- infer their rules
- access definition JSON

Candidate assessment APIs should expose only the candidate-visible representation.

Do not send hidden rule/scoring definition details to the browser if not required.

---

# Candidate-Safe Scenario Payload

Be careful here.

The browser needs:

- architecture
- controls
- visible metrics
- current state
- visible timeline information

It should NOT receive:

- hidden rule conditions
- success thresholds if hidden
- failure thresholds if hidden
- scoring bands
- intended solution
- internal author notes

If the current architecture sends complete scenario definitions client-side, document the risk and restructure where necessary.

For company assessments this matters.

---

# Scenario Author Roles

For Phase 5:

```text
owner/admin
→ create/edit/publish/archive

member
→ view scenario list and published scenario details
```

Keep server-side checks authoritative.

---

# Archive

Allow a scenario to be archived.

Archived scenario:

- cannot be used for new assessments
- existing assessments remain functional
- old attempts remain replayable

Never delete a published version referenced by an assessment or attempt.

---

# Tests

Add comprehensive tests.

At minimum:

## Scenario creation
Owner/admin can create draft.

## Member permissions
Member cannot edit/publish.

## Cross-org privacy
Org A cannot access Org B scenario.

## Control validation
Invalid initial control value rejected.

## Rule validation
Unknown control/state reference rejected.

## Operator validation
Unsupported operator rejected.

## Timed-event validation
Invalid effect rejected.

## Success/failure validation
Invalid condition rejected.

## Compilation
Valid authored scenario compiles to simulator-compatible definition.

## Determinism
Compiled scenario produces repeatable results.

## Publish
Valid draft publishes.

## Invalid publish
Invalid draft cannot publish.

## Immutability
Published version cannot be mutated.

## New version
Editing published v1 produces separate v2 draft.

## Assessment pinning
Assessment created against v1 stays on v1 after v2 publishes.

## Scenario selection
Org assessment selector shows own published scenarios only.

## Draft excluded
Draft scenario cannot be selected for assessment.

## Archive
Archived scenario excluded from new assessments.

## Existing assessment after archive
Existing assessment still works.

## Resume
Attempt using company scenario can resume using exact scenario version.

## Candidate privacy
Candidate-facing API does not expose hidden rules or scoring bands.

## Payment Retry Storm regression
Existing built-in scenario behavior and scores remain unchanged.

---

# Manual Validation

## Flow A — Build Scenario

Create company scenario:

```text
Database Connection Saturation
```

Example architecture:

```text
Client
API
Postgres
Worker
```

Controls might include:

```text
API Instances
DB Pool Size
Worker Concurrency
Timeout
```

Create:

- initial state
- timed event
- at least 3 rules
- success condition
- failure condition
- scoring

Publish v1.

---

## Flow B — Preview

Run the draft/published scenario as author.

Try:

- beneficial path
- harmful path

Verify authored consequences occur exactly.

---

## Flow C — Assessment

Create an assessment using the company scenario.

Invite a candidate.

Candidate completes scenario.

Hiring manager sees score + timeline + reasoning.

---

## Flow D — Versioning

1. v1 published
2. create assessment against v1
3. edit scenario
4. publish v2
5. verify original assessment remains v1
6. new assessment can choose v2

---

## Flow E — Privacy

Create Org A and Org B.

Verify Org B cannot:

- see Org A scenario
- fetch definition
- preview it
- use it in assessment

---

# Documentation

Update architecture docs with:

```text
Built-in Scenario
Organization Scenario
Scenario Draft
Scenario Version
Published Scenario
Archived Scenario
```

Add lifecycle diagram:

```text
Create Draft
    ↓
Edit
    ↓
Validate
    ↓
Preview
    ↓
Publish v1
    ↓
Used by Assessment
    ↓
Edit
    ↓
Create v2 Draft
    ↓
Publish v2
```

Document:

> Published scenario versions are immutable.

and:

> Assessments always reference an immutable scenario version.

---

# Important Constraints

Do NOT build:

- AI scenario generation
- AI rule generation
- natural language rule parsing
- arbitrary code execution
- JavaScript formulas
- cloud infrastructure simulation
- collaborative editing
- comments
- billing
- email sending
- ATS integrations
- marketplace

This phase is structured scenario authoring only.

---

# Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

Do not weaken previous tests.

---

# Completion Report

Return:

1. files created/modified
2. DB/schema changes
3. scenario ownership model
4. scenario versioning model
5. draft/published/archive lifecycle
6. authoring UI structure
7. authored scenario schema
8. compiler/validation design
9. rule condition model
10. rule effect model
11. success/failure configuration
12. scoring configuration
13. preview implementation
14. publishing implementation
15. assessment integration
16. candidate-safe payload strategy
17. authorization/privacy
18. tests added
19. total tests
20. typecheck/lint/test/build results
21. Manual Flow A result
22. Manual Flow B result
23. Manual Flow C result
24. Manual Flow D result
25. Manual Flow E result
26. deviations
27. product/UX concerns

Do not begin Phase 6.

Stop after Phase 5 is complete.