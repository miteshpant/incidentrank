# IncidentRank — Phase 2.1: Candidate Reasoning + Pre-Incident Countdown

Before making changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Read `docs/scenarios/payment-retry-storm.md`.
4. Read the existing Phase 2 implementation and completion report.
5. Do not begin Phase 3.
6. Do not add authentication, persistence, organizations, leaderboards, AI, LLMs, or scoring changes.

Phase 2 is complete and working.

This is a focused Phase 2 enhancement.

The goal is to add two product features:

1. Candidate reasoning attached to configuration changes.
2. A visible countdown before the incident begins.

Do not redesign the incident engine.

---

# Feature 1 — Candidate Reasoning

When a candidate prepares configuration changes and clicks:

**Apply Changes**

they should have the option to explain why they are making those changes.

Add a text field near the Apply Changes action.

Suggested label:

**Why are you making this change?**

Placeholder:

> Explain what you think is happening and why this change may help.

This field should be optional in practice mode for now.

Do NOT block Apply Changes if it is empty.

---

# Purpose

The reasoning field exists because IncidentRank should capture not only:

```text
WHAT the candidate changed
```

but also:

```text
WHY the candidate changed it
```

This becomes valuable later for company assessments.

Example:

```text
02:03 YOU

Retries
3 → 1

Reason:
"The payment provider is already responding slowly. Repeated retries appear to be amplifying traffic and making the degradation worse."
```

This reasoning is informational only.

It must NOT influence:

- scenario state
- system consequences
- success/failure
- scoring
- rule evaluation

No AI or LLM evaluation should be introduced.

---

# Candidate Action Model

Extend the CandidateAction model to support optional reasoning.

Conceptually:

```ts
interface CandidateAction {
  ...

  reasoning?: string;
}
```

Choose a naming convention consistent with the existing codebase.

The field should remain optional.

Do not add a separate candidate reasoning subsystem.

Reasoning belongs to the action that triggered the configuration change.

---

# Multi-Control Apply

Phase 2 currently allows multiple pending configuration values to be applied together.

Example:

```text
Retries        3 → 1
Backoff        none → exponential
```

with one Apply click.

The single explanation entered by the candidate should be attached to the logical Apply operation.

Do NOT require one separate explanation per field.

If the existing engine creates one CandidateAction per changed control, avoid duplicating the reasoning visually three times.

Preferred approach:

Introduce an attempt/UI-level action-group concept if this can be done cleanly.

For example:

```ts
interface CandidateActionGroup {
  id: string;
  elapsedSeconds: number;
  reasoning?: string;
  changes: CandidateAction[];
}
```

However:

Do NOT perform a broad engine redesign just to achieve this.

If the simplest implementation is to attach the same reasoning metadata to each CandidateAction internally, that is acceptable as long as the timeline groups them visually into one candidate decision.

The UI should display:

```text
02:03 YOU

Changed:
Retries       3 → 1
Backoff       None → Exponential

Reason:
"Reduce retry amplification while spacing out requests to the degraded provider."
```

rather than two separate duplicated reasoning blocks.

---

# Reasoning Input Behavior

The text area should:

- support multiple lines
- have a reasonable maximum length
- not dominate the interface
- remain visible beside the Apply Changes workflow
- clear after a successful Apply
- remain unchanged if no configuration changes are actually applied

Use a limit such as:

```text
1000 characters
```

unless the existing UI conventions suggest a better value.

Show a small character count only if it can be done unobtrusively.

Do not add rich text.

Plain text only.

---

# Timeline

Update the Incident Timeline so candidate actions can include reasoning.

Example:

```text
02:03   YOU

Retries changed 3 → 1
Backoff changed None → Exponential

Reason:
Provider latency is high and I suspect retries are amplifying the failure.
```

System events should continue to appear separately after the candidate action.

Example:

```text
02:03 SYSTEM

Payment traffic reduced.
```

Keep the distinction between:

```text
YOU
SYSTEM
```

very clear.

---

# Result Screen

The result screen should show the candidate's reasoning with each action.

Currently the result screen includes a condensed candidate action list.

Improve it so it uses the same richer action representation as the live timeline.

For every candidate decision show:

```text
02:03

Retries
3 → 1

Backoff
None → Exponential

Reason
"Provider is slow and retries seem to be worsening downstream pressure."
```

This should also fix the existing Phase 2 inconsistency where the result screen displays generic action text rather than richer old/new values.

The completion report noted this issue; fix it as part of this work.

---

# Future Assessment Compatibility

Do not build company assessment functionality yet.

But structure reasoning data so that later a hiring manager can view:

```text
Candidate action
Candidate reasoning
System consequence
```

in chronological order.

This is a core part of IncidentRank's eventual assessment value.

---

# Feature 2 — Incident Countdown

Currently Payment Retry Storm starts in a healthy state and the provider degradation occurs at T=60 seconds.

The candidate should clearly understand that the incident has not started yet.

After:

**Acknowledge Incident**

show a visible countdown.

For example:

```text
INCIDENT BEGINS IN

00:60
```

then:

```text
00:59
00:58
...
00:01
```

At T=60:

replace the countdown with:

```text
INCIDENT ACTIVE
```

or the appropriate scenario status.

---

# Countdown Placement

The countdown should be visible in or near the incident header.

Example:

```text
SEV-1 · Payment Retry Storm

Incident begins in 00:42
```

Do not use a modal.

The candidate should still be able to inspect the healthy system during the countdown.

This pre-incident period can be useful for understanding baseline architecture and configuration.

---

# Countdown Semantics

The underlying engine still begins at:

```text
T = 0
```

and the provider degradation still happens at:

```text
T = 60 seconds
```

Do NOT shift scenario timing.

The countdown is purely a UI representation:

```text
remaining =
incidentStartSeconds - currentElapsedSeconds
```

But use scenario data rather than hardcoding `60` in React if the incident start timing is already available through the scenario definition.

The UI must not contain Payment Retry Storm-specific scenario behavior.

---

# Countdown State

Before incident start:

show something like:

```text
PRE-INCIDENT
```

and:

```text
Incident begins in 00:42
```

At incident start:

show the normal scenario status:

```text
CRITICAL
```

Do not label the healthy baseline as if the incident is already active.

---

# Candidate Interaction During Countdown

The candidate may inspect:

- architecture
- controls
- component state
- baseline metrics

during the countdown.

For Phase 2.1:

Do NOT allow configuration changes before the incident begins.

Disable:

```text
Apply Changes
```

until the first timed incident event has fired.

Include unobtrusive text such as:

> Controls unlock when the incident begins.

This prevents candidates from preemptively solving the known scenario during the 60-second baseline.

Do not disable architecture inspection.

---

# Timer Design

The header should distinguish:

## Before incident

```text
Baseline 00:24
Incident begins in 00:36
```

or an equivalent clean design.

## After incident

```text
Incident 02:14
CRITICAL
```

The important point is that the candidate understands:

- how long until incident start
- how long the active incident has been running

The exact visual wording can follow the existing design system.

---

# Engine Changes

Do not alter scenario behavioral rules.

No changes should be required to:

- authored consequences
- incident state transitions
- success conditions
- failure conditions
- revenue loss behavior
- infrastructure cost behavior

Candidate reasoning is metadata.

Countdown is presentation based on existing scenario time.

If a small type change is required to carry reasoning metadata, make the smallest possible change and add regression tests.

---

# Tests

Add tests for the following.

## Reasoning field renders

Verify:

```text
Why are you making this change?
```

appears with editable controls.

---

## Optional reasoning

Verify configuration changes can still be applied without entering reasoning.

---

## Reasoning stored

Enter:

```text
Provider is degraded and retries appear to be amplifying traffic.
```

Apply:

```text
Retries 3 → 1
```

Verify reasoning is associated with that candidate action.

---

## Reasoning appears in timeline

Verify the explanation appears underneath the candidate action in the live timeline.

---

## Reasoning clears

After successful Apply:

reasoning text field is empty.

---

## Multiple configuration changes

Change:

```text
Retries 3 → 1
Backoff none → exponential
```

with one explanation.

Verify timeline renders this as one coherent candidate decision rather than duplicated explanation blocks.

---

## Result screen reasoning

Resolve the incident.

Verify action history contains:

- field changes
- old/new values
- candidate reasoning

---

## Countdown initial state

After acknowledging:

verify:

```text
Incident begins in 01:00
```

or the project's chosen `00:60` formatting.

---

## Countdown decreases

Advance fake timers.

Verify remaining countdown decreases correctly.

---

## Controls locked before incident

Before T=60:

configuration Apply must be unavailable.

---

## Architecture remains inspectable

During countdown:

candidate can still select components.

---

## Incident activation

Advance fake time to 60 seconds.

Verify:

- countdown disappears
- incident becomes active
- system degradation occurs
- controls become usable

---

## No hardcoded scenario timing

Where practical, test countdown based on scenario timed-event data rather than React constant `60`.

---

# Manual Validation

Perform:

## Run A

Acknowledge incident.

Verify full 60-second countdown behavior using development/fake timing where practical.

Verify system begins healthy and transitions to critical at incident start.

---

## Run B

After incident begins:

Change:

```text
Retries 3 → 1
Backoff none → exponential
```

Reason:

```text
The provider is degraded and retries appear to be amplifying traffic. I want to reduce immediate pressure while spacing retry attempts.
```

Verify:

- timeline groups both configuration changes
- explanation appears once
- system consequences follow
- explanation remains visible on result screen

---

## Run C

Perform a harmful action with an intentionally plausible explanation.

Verify IncidentRank records the explanation without evaluating or labeling it as correct/incorrect.

---

# Documentation

Update architecture/product documentation to state:

Candidate actions may include candidate-authored reasoning.

The reasoning:

- is stored with the attempt
- is visible in replay/results
- does not affect deterministic scenario behavior
- does not currently affect scoring

Add a product principle:

> IncidentRank records both what the engineer did and why they said they did it.

Do not introduce AI analysis.

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

---

# Completion Report

Report:

1. files modified
2. CandidateAction/reasoning model changes
3. how multi-control actions are grouped
4. timeline changes
5. result-screen changes
6. countdown implementation
7. how incident start time is obtained
8. how controls are locked/unlocked
9. tests added
10. total test results
11. typecheck/lint/build results
12. Manual Run A result
13. Manual Run B result
14. Manual Run C result
15. screenshots or visual descriptions of:
    - pre-incident countdown
    - action with reasoning
    - result screen with reasoning
16. any concerns or deviations

Do not begin Phase 3.

Stop after Phase 2.1.