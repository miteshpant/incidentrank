# IncidentRank — Phase 2: Candidate Incident Playground

Before making any changes:

1. Read the root `README.md` completely.
2. Read `docs/architecture.md`.
3. Read `docs/scenarios/payment-retry-storm.md`.
4. Review the existing Phase 1 scenario engine and Payment Retry Storm implementation.
5. Treat the README as the product source of truth.
6. Do not redesign the scenario engine unless a concrete UI integration bug requires it.
7. Do not start Phase 3 or later work.

Phase 0 and Phase 1 are complete.

The goal of Phase 2 is to turn **Payment Retry Storm** into the first playable IncidentRank experience.

---

# Phase 2 Goal

A user should be able to open IncidentRank in a browser, start the Payment Retry Storm incident, investigate the system, change configuration using structured controls, observe the consequences, and finish with a result screen.

This phase should make the existing deterministic scenario engine visible and interactive.

We are NOT adding:

- authentication
- database persistence
- user profiles
- leaderboards
- companies
- assessments
- billing
- AI
- LLMs
- scenario authoring
- multiplayer
- backend persistence

All attempt state may remain in browser memory for Phase 2.

Refreshing the page may reset the attempt.

That is acceptable.

---

# Product Experience

IncidentRank should feel like a production engineering console.

It should NOT feel like:

- a school quiz
- an LMS
- a coding challenge form
- a children's game
- a multiple-choice test

The candidate should feel like:

> I have been paged into a production incident and I need to restore the system.

---

# Routes

Keep:

```text
/
```

and:

```text
/incidents
```

Add:

```text
/incidents/payment-retry-storm
```

This route launches the scenario experience.

Also support a result view after an attempt ends.

This may be:

```text
/incidents/payment-retry-storm/result
```

or an internal state on the same route.

Choose the simpler implementation.

Do not add persistence just to support routing.

---

# Landing Page

Keep the existing IncidentRank positioning.

Primary message:

# IncidentRank

## Production is the test.

Supporting copy:

> Diagnose incidents. Operate the system. Restore production. Prove how you think under pressure.

The CTA should lead to:

```text
/incidents
```

---

# Incident Listing

The Payment Retry Storm card should no longer say "Coming Soon."

Display:

**Payment Retry Storm**

Difficulty:

**Senior**

Estimated duration:

**15–20 minutes**

Description:

> A payment provider begins degrading. Existing retry behavior starts amplifying traffic across the system. Diagnose the incident and restore checkout before the failure cascades.

CTA:

**Start Incident**

---

# Incident Briefing

Before the simulation begins, show a briefing screen.

Example:

# Payment Retry Storm

**SEV-1**

You are the primary engineer responding to a checkout degradation.

Checkout reliability is business-critical.

Your objective:

> Restore checkout while minimizing customer impact and unnecessary infrastructure changes.

Show:

```text
Difficulty        Senior
Expected Time     15–20 min
System            Checkout / Payments
```

Do NOT reveal:

- payment provider degradation
- retry storm
- intended mitigation
- root cause
- success thresholds
- authored rules

CTA:

**Acknowledge Incident**

The scenario clock starts only after this button is clicked.

---

# Main Incident Console

The desktop experience should be the primary target.

Use a layout conceptually similar to:

```text
┌─────────────────────────────────────────────────────────────┐
│ IncidentRank       SEV-1      03:42       CRITICAL         │
├───────────────────────────────┬─────────────────────────────┤
│                               │ LIVE METRICS                │
│      SYSTEM ARCHITECTURE      │                             │
│                               │ Checkout success     72%    │
│ Gateway                       │ Checkout P99         6.4s   │
│   ↓                           │ Provider latency     4.8s   │
│ Checkout                      │ Payment traffic   Critical  │
│   ↓                           │ DB pressure         High    │
│ Payment ───── Provider        │ Kafka lag         18,000   │
│   ↓                           │ Revenue loss      $24,000   │
│ Postgres                      │                             │
│   ↓                           │                             │
│ Kafka                         │                             │
│   ↓                           │                             │
│ Settlement                    │                             │
├───────────────────────────────┼─────────────────────────────┤
│ COMPONENT / CONTROLS          │ INCIDENT TIMELINE           │
│                               │                             │
│ Payment Service               │ 01:00 Provider latency ↑    │
│                               │ 01:18 Checkout critical     │
│ Retries       [ 3 ▼ ]         │ 02:03 YOU retries 3 → 1    │
│ Backoff       [ None ▼ ]      │ 02:03 Payment traffic ↓    │
│ Circuit       [ Off ▼ ]       │ ...                         │
│ Timeout       [ 2s ▼ ]        │                             │
│ Instances     [ 8 ▼ ]         │                             │
│                               │                             │
│        APPLY CHANGES          │                             │
└───────────────────────────────┴─────────────────────────────┘
```

Do not copy this literally if a cleaner composition is possible.

The required product concepts are:

1. Incident status/header
2. Architecture
3. Metrics
4. Component controls
5. Timeline/event log

---

# Incident Header

Always show:

- IncidentRank branding
- severity/status
- elapsed incident time
- scenario name

Example:

```text
SEV-1 · Payment Retry Storm
03:42
CRITICAL
```

When resolving:

```text
RECOVERING
```

When resolved:

```text
RESOLVED
```

When failed:

```text
FAILED
```

---

# Simulation Clock

The existing engine uses simulated time.

For the candidate UI, simulated time should progress automatically while an attempt is active.

Use:

```text
1 real second = 1 simulated second
```

for Phase 2 unless existing engine behavior makes another simple mapping substantially easier.

Do not create accelerated time.

Do not continue ticking when:

- incident is resolved
- incident has failed
- component is unmounted

Clean up timers correctly.

---

# Architecture View

Render the existing architecture definition.

Do not hardcode a completely separate architecture for Payment Retry Storm.

Use scenario architecture data.

For Phase 2, a manually positioned topology is acceptable.

You do NOT need to introduce a graph library unless clearly beneficial.

Prefer avoiding a heavy dependency for seven nodes.

Nodes:

```text
API Gateway
Checkout Service
Payment Service
External Payment Provider
Postgres
Kafka
Settlement Worker
```

Show edges/dependencies clearly.

Component health should be visually distinguishable:

```text
healthy
degraded
critical
```

Do not rely solely on color.

Use labels/icons/borders/status indicators accessible to color-blind users.

---

# Component Selection

Architecture nodes should be clickable.

Selecting a component should update the Component panel.

For example:

Click:

**Payment Service**

show its candidate controls.

Click:

**Checkout Service**

show Checkout instances.

Click:

**Postgres**

show DB connection limit.

Click:

**Kafka**

show settlement consumers.

Some nodes such as API Gateway or Payment Provider may have no candidate-editable controls.

In that case show relevant component state/observability instead of an empty panel.

---

# Controls

Render controls from the scenario definition wherever practical.

Do not create a second list of allowed values in the UI.

The scenario definition remains the source of truth.

Payment Service:

```text
Retries
Backoff
Circuit Breaker
Timeout
Instances
```

Checkout Service:

```text
Instances
```

Postgres:

```text
Connection Limit
```

Kafka:

```text
Settlement Consumers
```

Use:

- select/dropdown controls
- toggles where appropriate

No free-text configuration values.

No user-entered numerical fields.

---

# Applying Changes

Do NOT apply every dropdown selection immediately.

Let the candidate modify one or more controls for the selected component and then click:

**Apply Changes**

This better represents deliberate operational action.

For every actual changed value:

1. create a CandidateAction
2. pass it through the existing engine
3. update state
4. append resulting events

If nothing changed, disable Apply.

If multiple values changed simultaneously, apply them deterministically in a documented order.

Simplest acceptable solution:

Apply each changed control sequentially in the order the controls appear in the scenario definition.

Document this.

---

# Configuration Feedback

Do NOT tell the user:

```text
Correct decision
```

or:

```text
Wrong decision
```

The entire point of IncidentRank is that the system consequences provide feedback.

For example, after a bad change the user may observe:

```text
Checkout Success     72% → 58%
DB Pressure          High → Critical
Payment Traffic      Critical
```

and timeline events reflecting deterioration.

No green "correct" checkmarks.

No red "wrong answer" messages.

---

# Metrics Panel

Display all candidate-facing metrics from scenario state.

At minimum:

```text
Checkout Success
Checkout P99
Provider Latency
Payment Traffic
DB Pressure
Kafka Lag
Revenue Loss
```

Use the authored display values from the scenario engine wherever available.

Metrics should visually indicate severity.

Example:

```text
Checkout Success
72%
CRITICAL
```

Do not calculate new infrastructure behavior in React.

The UI only displays engine state.

---

# Metric Changes

When a candidate action changes a metric, visually indicate the change briefly.

For example:

```text
72% → 84%
```

or a subtle change indicator.

Keep this restrained.

The UI should feel operational, not arcade-like.

Do not add sound effects.

---

# Incident Timeline

Render events from the engine.

Example:

```text
01:00  SYSTEM
Payment provider latency increased sharply.

01:14  SYSTEM
Checkout entered critical state.

02:03  YOU
Retries changed from 3 to 1.

02:03  SYSTEM
Payment traffic reduced.

02:42  YOU
Backoff changed from none to exponential.
```

Differentiate:

```text
SYSTEM
YOU
```

visually.

Timeline should automatically keep recent events visible, but users should be able to scroll backward.

Do not discard earlier events.

---

# Observability / Investigation

For Phase 2, keep investigation simple.

Selecting a component can show an **Observability** section.

Examples:

Payment Provider:

```text
Health            Degraded
Latency           4.8s
```

Payment Service:

```text
Retries           3
Backoff           None
Circuit Breaker   Off
Timeout           2s
Instances         8
```

Postgres:

```text
Pressure          High
Connection limit  500
```

Kafka:

```text
Lag               18,000
Consumers          8
```

Do NOT add fake terminal commands or log search in this phase.

We can enrich observability later.

---

# Revenue Loss

Display cumulative revenue/customer-impact estimate prominently but not excessively.

Example:

```text
Estimated Revenue Impact
$42,000
```

Clearly label this as an estimate if needed.

It should increase based entirely on engine state.

React should not calculate revenue loss independently.

---

# Infrastructure Cost

Show:

```text
Current Infrastructure Cost
$20,000/mo
```

If candidate scales components:

```text
$20,000 → $23,200/mo
```

This helps communicate tradeoffs.

Again, use engine/scenario values.

Do not calculate cloud pricing in UI code.

---

# Resolve / Failure UX

When engine state becomes:

```text
resolved
```

stop simulation clock and present a clear transition:

# Incident Resolved

Show:

```text
Time to recovery
Revenue impact
Configuration changes
Peak severity
Infrastructure cost
Kafka backlog
```

Do not compute the final 0–1000 IncidentRank score yet unless Phase 1 already exposes a complete scoring model.

The final scoring system belongs to a later phase unless trivial objective calculations already exist.

For now call this:

**Incident Result**

Similarly, if failed:

# Incident Failed

Still show full result statistics.

Failure is a valid outcome.

Allow:

**Try Again**

which resets the scenario completely.

---

# Result Screen

Display objective attempt data.

Example:

```text
INCIDENT RESOLVED

Recovery Time
2m 30s

Estimated Revenue Impact
$25,258

Configuration Changes
3

Beneficial Changes
3

Harmful Changes
0

Peak Severity
Critical

Peak Infrastructure Cost
$20,000/mo

Peak Kafka Lag
18,000
```

Also display a condensed candidate action timeline.

CTA:

```text
Try Again
```

Secondary CTA:

```text
Back to Incidents
```

No leaderboard yet.

No login requirement.

No persistent history.

---

# Try Again

Retry must initialize a completely fresh scenario.

Ensure:

- clock resets
- metrics reset
- controls reset
- events reset
- result state resets
- scoring inputs reset
- all engine state is freshly initialized

Do not mutate/reuse the previous attempt state.

---

# Mobile / Responsive Behavior

The primary POC target is desktop engineering candidates.

Still make the page functional at narrower widths.

It is acceptable for panels to stack on smaller screens.

Do not spend substantial effort building a perfect mobile incident interface.

Desktop usability is the priority.

---

# Design Direction

IncidentRank should look like a professional engineering operations product.

Prefer:

- neutral/dark operational palette
- clear typography
- high information density without clutter
- subtle borders
- restrained status indicators
- monospace only where operational data benefits from it
- strong hierarchy
- clear interactive states

Avoid:

- excessive gradients
- neon hacker aesthetic
- terminal cosplay
- giant illustrations
- gaming HUD clichés
- cartoon incident graphics
- LMS aesthetics

Do not copy PagerDuty, Datadog, Grafana, New Relic, HackerRank, or any other existing product.

Create an original interface.

---

# Accessibility

Ensure:

- controls have labels
- keyboard navigation works
- architecture nodes are keyboard-selectable if interactive
- status is not represented only by color
- contrast is reasonable
- buttons expose proper disabled states
- semantic HTML is used where appropriate

---

# State Management

Do not introduce Redux or another global-state library.

Use React state/hooks unless there is a compelling reason otherwise.

The engine state and event history for one active attempt can be managed locally within the incident experience.

Keep the deterministic engine outside React.

React consumes the engine.

React does not recreate scenario rules.

---

# Important Architecture Rule

There must be only one source of truth for incident behavior:

```text
Scenario Definition
        ↓
Scenario Engine
        ↓
Incident State
        ↓
UI
```

Never:

```text
Scenario Definition
        ↓
Engine

AND

React component
        ↓
additional hardcoded incident behavior
```

Do not put Payment Retry Storm consequence logic inside UI components.

---

# Tests

Add appropriate tests.

At minimum:

## Incident listing

Payment Retry Storm is shown as playable.

## Briefing

Starting route displays briefing before incident begins.

## Start incident

Acknowledging starts the scenario.

## Architecture

Expected architecture components render.

## Controls

Selecting Payment Service reveals the correct controls.

## Apply action

Changing retries from 3 → 1 and applying:

- calls the engine
- updates state
- produces candidate/system timeline events

## Timed incident

Advancing fake timers beyond 60 seconds triggers incident degradation.

Use fake timers where appropriate.

Do not make tests actually wait 60 seconds.

## Different component

Selecting Kafka displays Kafka controls rather than payment controls.

## No answer feedback

Verify UI does not render "correct answer" / "wrong answer" style feedback.

## Resolution

Use a known good action sequence and fake timers as needed to reach resolved state.

Verify result view appears.

## Failure

Use a known harmful path to reach failed state.

Verify failure result view appears.

## Retry

Try Again creates fresh initial state.

## Timer cleanup

Verify timers do not continue after resolution/failure/unmount.

---

# Existing Engine Tests

Do not weaken, remove, or rewrite Phase 1 behavioral tests merely to make UI integration easier.

The existing scenario engine behavior remains authoritative.

If a genuine engine integration issue is discovered:

1. document it
2. make the smallest correct change
3. keep existing behavioral guarantees
4. add a regression test

---

# Validation

Before declaring Phase 2 complete:

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

Also manually run the app and complete at least:

### Manual Run A — Strong mitigation

Complete the incident using a strong mitigation path.

### Manual Run B — Harmful mitigation

Deliberately worsen and fail the incident.

### Manual Run C — No action

Verify natural provider recovery is visible and eventually resolves.

---

# Completion Report

When Phase 2 is finished, report:

1. files created/modified
2. routes added
3. component structure
4. how engine state is connected to React
5. how simulation time is advanced
6. how controls are generated
7. how actions are applied
8. how timeline events are displayed
9. result-screen contents
10. tests added
11. total tests passing
12. typecheck/lint/test/build results
13. Manual Run A result
14. Manual Run B result
15. Manual Run C result
16. any engine changes made and why
17. any UX/product concerns discovered

Do not begin Phase 3.

Stop when Phase 2 is complete.