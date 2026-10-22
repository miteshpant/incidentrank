# IncidentRank — Phase 5.1: Server-Authoritative Assessment Runtime

Before changing anything:

1. Read the root README.
2. Read `docs/architecture.md`.
3. Review the Phase 5 scenario compiler and runtime resolver.
4. Review `useIncidentAttempt`.
5. Review assessment persistence/resume from Phases 4 and 4.1.
6. Review the Phase 5 completion report's candidate-safe payload limitation.
7. Do not begin Phase 6.
8. Do not change scenario scoring.
9. Do not add anti-cheating surveillance.
10. Do not add billing, AI, email delivery, or ATS integration.

---

# Goal

Company assessments must execute authoritatively on the server.

A candidate browser must no longer receive:

- scenario rules
- rule effects
- hidden success conditions
- hidden failure conditions
- scoring bands
- internal trigger definitions
- future timed-event definitions that have not yet occurred
- intended solution mechanics

The browser should receive only what the candidate legitimately observes.

---

# Core Architecture

Current:

```text
Browser
  ├── complete scenario rules
  ├── simulator
  └── candidate UI
```

Target for assessments:

```text
Candidate Browser
       |
       | action / tick
       v
Server Assessment Runtime
       |
       | loads pinned immutable scenario version
       | executes simulator
       | applies authored rules
       | evaluates success/failure
       v
Candidate-visible state
metrics
events
control values
status
```

Rules remain server-side.

---

# Scope

This phase applies first to:

```text
attemptType = "assessment"
```

Do not unnecessarily rewrite:

- author preview
- anonymous practice
- normal practice

Those may continue using local deterministic simulation temporarily.

Keep the generic simulator itself pure and reusable.

---

# Runtime Model

Do NOT create a second simulation engine.

The server runtime must use the same:

```text
packages/simulator
```

engine used everywhere else.

The difference is only **where it executes**.

---

# Assessment Session

An assessment attempt already has:

```text
attemptId
scenarioId
scenarioVersion
```

This is enough to resolve the immutable scenario version.

Every runtime mutation must load/verify:

```text
current user
→ assessment candidate
→ attempt
→ pinned scenario version
```

Never trust scenario identifiers supplied independently by the browser.

---

# Candidate Runtime Payload

The client may receive:

```text
scenario identity
scenario name
candidate instructions
architecture
candidate-visible metric definitions
candidate-visible control definitions
current visible metric values
current control values
candidate-visible events that have occurred
elapsed simulation time
attempt status
```

The client must NOT receive:

```text
rules
rule ordering
hidden triggers
hidden success thresholds
hidden failure thresholds
future event effects
scoring configuration
author-only metadata
```

---

# Candidate Actions

Candidate submits structured control changes.

Conceptually:

```http
POST /api/attempts/:attemptId/actions
```

Payload:

```ts
{
  changes: [
    {
      controlKey: "retries",
      value: 1
    },
    {
      controlKey: "backoff",
      value: "exponential"
    }
  ],
  reasoning: "..."
}
```

Server:

1. verifies attempt ownership/context
2. reconstructs authoritative current state
3. validates requested control/value
4. advances runtime to current checkpoint if necessary
5. applies changes in order
6. executes matching rules
7. persists candidate action group
8. persists resulting system events
9. updates checkpoint/state
10. returns candidate-visible state only

Reasoning remains metadata and never affects engine behavior or scoring.

---

# Time Advancement

The current UI ticks every second.

Do not necessarily perform one HTTP request per second.

Design a server-authoritative timing mechanism that minimizes request volume.

Preferred direction:

client may display a local visual timer, but server state remains authoritative.

Possible pattern:

```text
client periodically requests runtime advancement
```

for example every few seconds, while the server calculates:

```text
elapsed simulation delta
```

from the authoritative stored checkpoint/session state.

Choose a simple deterministic model.

Do not introduce realtime WebSockets unless clearly necessary.

---

# Important Timing Requirement

The candidate must not be able to manipulate simulation time by changing browser clocks or request payloads.

Do not trust:

```text
client elapsedMs
```

as authoritative.

The server determines allowable elapsed progression.

---

# Pause Policy

Preserve Phase 4.1's current assessment policy:

> Simulation time pauses while the assessment console is not actively running.

A refresh or temporary navigation must not cause hidden incident progress.

Design this explicitly rather than relying on wall-clock time.

---

# Runtime State Persistence

Evaluate whether server-authoritative assessment mode should continue using deterministic replay exclusively or add a persisted runtime checkpoint.

Prefer the smallest safe architecture.

Acceptable:

```text
persisted candidate actions
+
authoritative elapsed time
+
deterministic replay
```

If replay on every action becomes unnecessarily expensive, a serialized server runtime checkpoint may be introduced.

If adding snapshots:

- treat them as optimization
- persisted actions remain audit history
- never make snapshots candidate-editable
- document invalidation/version behavior

---

# Resume

Existing deterministic resume must continue working.

Refresh:

```text
GET authoritative assessment runtime
```

Server reconstructs from:

```text
pinned scenario version
+
persisted candidate actions
+
authoritative checkpoint
```

The browser should no longer need the scenario rule table to replay locally.

---

# System Events

System events are generated server-side.

Only events that have actually occurred should be sent to the candidate.

Do not expose future timeline events.

Persist them exactly once.

Existing interviewer timeline must remain compatible.

---

# Candidate UI

Reuse the Phase 5 generic UI components:

```text
GenericMetricsPanel
GenericComponentPanel
GenericTimelinePanel
```

They should consume server-returned candidate-visible data instead of a full executable scenario definition.

Do not regress built-in vs authored scenario visual parity.

---

# Assessment Completion

The server already owns scoring.

Preserve that.

Terminal flow should be:

```text
server simulator reaches resolved/failed
        ↓
server computes scoring inputs
        ↓
server score
        ↓
persist terminal result
        ↓
candidate receives final score
```

The browser should never determine whether an assessment has officially completed.

---

# Race Safety

Account for concurrent requests.

Examples:

- candidate double-clicks Apply
- periodic advance request overlaps action request
- refresh occurs during action persistence
- two browser tabs open same assessment

Use transactional/optimistic concurrency protection where necessary.

At minimum prevent:

```text
same action applied twice
elapsed time moving backwards
terminal attempt mutated
sequence collisions
```

Document the chosen concurrency model.

---

# Request Idempotency

Candidate action submission should carry a client-generated idempotency key.

Example:

```text
actionRequestId
```

Server ensures retrying the same network request cannot apply the action twice.

Do not use the reasoning text or timestamp as identity.

---

# Authorization

Every runtime endpoint must verify:

```text
current signed-in user
=
assessmentCandidates.userId
```

and:

```text
candidate.attemptId
=
requested attempt
```

Do not authorize assessment execution via organization membership.

Hiring managers view results but cannot operate the candidate's incident.

---

# Built-In Scenarios

Payment Retry Storm must work through server-authoritative assessment mode.

Its rules must not reach the browser during an assessment.

Practice mode may temporarily retain existing behavior.

Add regression coverage.

---

# Organization-Authored Scenarios

Organization-authored assessments must use:

```text
scenarioId + pinned scenarioVersion
```

and compile their immutable DB definition server-side.

No authored rule JSON reaches the candidate browser.

---

# Preview

Author preview may remain client-side.

Authors own the scenario and are allowed to inspect:

```text
rules
effects
scoring
debug matched rule
```

Do not complicate preview merely to mirror candidate security.

---

# Candidate-Safe Endpoint

Replace/rework Phase 5:

```text
/api/assessment/[assessmentId]/scenario
```

so it no longer needs to return an executable `ScenarioDefinition`.

It should return only presentation metadata that is safe before the incident begins.

Runtime metric values/state come from server runtime endpoints.

---

# Tests

At minimum:

## Rules hidden

Assessment bootstrap/runtime payload contains no rules.

## Success conditions hidden

No candidate response contains hidden success/failure thresholds.

## Scoring hidden

Existing scoring privacy remains intact.

## Future events hidden

Future timed-event consequences are not sent before they occur.

## Built-in assessment

Payment Retry Storm completes through server runtime.

## Authored assessment

Organization-authored scenario completes through server runtime.

## Beneficial action

Server returns expected authored consequence.

## Harmful action

Server returns expected harmful consequence.

## Invalid control

Rejected.

## Invalid allowed value

Rejected.

## Cross-attempt action

Candidate cannot submit action against someone else's attempt.

## Organization member cannot operate candidate attempt

Hiring manager access does not imply runtime mutation permission.

## Replay/resume

Refresh reconstructs authoritative state.

## Pause semantics

Away time does not advance simulation.

## Idempotent action

Repeated request id applies exactly once.

## Concurrent action protection

Conflicting concurrent requests do not corrupt sequence/state.

## Terminal attempt immutable

No action accepted after resolved/failed.

## Score equality

Identical action path under previous local runtime vs new server runtime produces identical score.

## Payment Retry Storm regression

Scores/outcomes unchanged.

## Authored scenario regression

Phase 5 test scenario produces identical behavior.

---

# Manual Flow A — Inspect Browser

Run an assessment.

Use browser DevTools.

Verify candidate cannot find:

```text
rules
success thresholds
failure thresholds
scoring bands
future event definitions
```

in network responses or bootstrapped page data.

---

# Manual Flow B — Payment Retry Storm

Complete a strong mitigation path through the new runtime.

Verify:

```text
state transitions
timeline
score
reasoning
result
```

match existing behavior.

---

# Manual Flow C — Organization Scenario

Complete Database Connection Saturation through an actual company assessment.

Verify authored rules execute correctly while remaining invisible to the browser.

---

# Manual Flow D — Refresh

Apply actions.

Refresh.

Resume.

Verify exact state/timeline/action history restoration without rules ever being shipped.

---

# Manual Flow E — Duplicate Request

Simulate sending the same Apply request twice.

Verify one action group and one state transition only.

---

# Documentation

Update architecture documentation with:

```text
Practice Runtime
Author Preview Runtime
Assessment Runtime
```

Explicitly state:

> Company assessments execute authoritatively on the server.

And:

> Candidate clients never receive scenario rules, hidden outcome thresholds, or scoring configuration.

---

# Important Constraints

Do NOT add:

- browser lockdown
- webcam monitoring
- screen recording
- anti-cheating spyware
- keystroke tracking
- AI proctoring
- WebSockets unless truly necessary
- billing
- ATS
- email sending

This phase is server-side assessment integrity only.

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

Do not weaken existing tests.

---

# Completion Report

Return:

1. files created/modified
2. runtime architecture
3. candidate-safe bootstrap payload
4. action API design
5. timing model
6. pause/resume model
7. state persistence/replay model
8. idempotency implementation
9. concurrency handling
10. built-in scenario behavior
11. authored scenario behavior
12. scoring integration
13. authorization
14. hidden-data verification
15. tests added
16. total test results
17. typecheck/lint/test/build
18. Manual Flow A
19. Manual Flow B
20. Manual Flow C
21. Manual Flow D
22. Manual Flow E
23. deviations
24. product concerns

Do not begin Phase 6.