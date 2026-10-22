# IncidentRank — Phase 4.1: Assessment Resume & Reliability

Before making any changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Review Phase 3 and Phase 4 attempt persistence.
4. Review the Phase 4 completion report, especially the documented assessment refresh/resume limitation.
5. Do not begin scenario authoring.
6. Do not add billing, AI, email delivery, ATS integrations, or new scenarios.
7. Do not change Payment Retry Storm's authored behavior or scoring bands.

Phase 4 is complete.

This is a focused reliability phase before IncidentRank begins supporting company-created scenarios.

---

# Goal

A candidate taking a company assessment must be able to refresh the browser or temporarily leave the page and return without:

- restarting the incident
- losing previous actions
- losing candidate reasoning
- resetting system state
- gaining a second attempt
- corrupting the timeline
- duplicating persisted events
- changing the final score

The existing attempt must resume deterministically.

---

# Product Principle

For assessment mode:

> A browser refresh must not create a new incident.

and:

> The persisted attempt history must be sufficient to reconstruct the candidate's current incident state.

IncidentRank's deterministic engine gives us the ability to do this through replay.

Do not persist a mutable simulation snapshot on every second unless replay proves impractical.

Prefer rebuilding state from persisted history.

---

# Existing Persistence

Phase 4 already persists:

- attempt identity
- scenario id/version
- candidate action groups
- individual configuration changes
- candidate reasoning
- system events
- completion state
- score/result

Reuse these structures.

Do not create a second assessment persistence system.

---

# Resume Strategy

Implement deterministic replay.

Conceptually:

```text
Scenario initial state
        ↓
Advance to candidate action timestamp
        ↓
Replay candidate action(s)
        ↓
Advance to next candidate action timestamp
        ↓
Replay candidate action(s)
        ↓
...
        ↓
Advance to persisted/current simulation time
        ↓
Reconstructed current state
```

The resulting engine state must match the state the candidate had before refresh.

---

# Important Distinction

Candidate actions are authoritative replay inputs.

Persisted system events are primarily:

- audit history
- interviewer timeline
- verification/debugging information

Do NOT replay system events as commands.

System events should be regenerated naturally by replaying the deterministic scenario.

---

# Attempt Timing

An in-progress attempt needs enough persisted timing information to know where to resume.

Review the existing schema.

If not already sufficient, add explicit fields such as:

```text
simulationElapsedMs
lastPersistedAt
```

or equivalent.

Choose the smallest model that makes deterministic reconstruction possible.

Do NOT rely on browser-local state.

---

# Time While Candidate Is Away

For Phase 4.1, choose a clear behavior:

## Assessment clock pauses when the candidate is not actively running the assessment.

This is the preferred POC behavior.

If the candidate refreshes at:

```text
Incident elapsed = 03:42
```

they return at:

```text
Incident elapsed = 03:42
```

not ten minutes later because the browser was closed.

This avoids penalizing candidates for network/browser disruptions.

Document this policy.

Future versions may implement stricter timed assessments, but do not introduce that complexity now.

---

# Persist Elapsed Simulation Time

Do not write every 1-second tick to the database.

Use a lightweight checkpoint strategy.

For example persist elapsed simulation time:

- when a candidate applies changes
- periodically at a modest interval such as 10–15 seconds
- when page visibility changes / unload is attempted if practical
- when incident resolves/fails

Do not depend solely on `beforeunload`, since it is not guaranteed.

The periodic checkpoint should be sufficient.

---

# Replay API

Create a pure replay helper outside React.

Conceptually:

```ts
replayAttempt({
  scenario,
  elapsedMs,
  actionGroups
}): ReplayResult
```

It should:

1. create initial scenario state
2. order candidate decisions chronologically
3. advance deterministic time
4. apply changes in their original recorded order
5. advance to target elapsed time
6. return reconstructed engine state and regenerated events

Do not introduce Next.js, Clerk, or database dependencies into the pure replay function.

Place it where it logically belongs based on the current monorepo structure.

It may live in:

```text
packages/simulator
```

if replay is fundamentally an engine capability,

or in a small dedicated pure package/helper if keeping simulator API minimal is preferable.

Do not put replay logic inside a React component.

---

# Replay Equality

A critical test:

Given an original uninterrupted run and a reconstructed run from persisted actions:

```text
final engine state
metrics
status
control values
scoring inputs
```

must be identical.

System event IDs/order should also be identical where the deterministic engine guarantees them.

---

# Candidate Resume Flow

When candidate opens:

```text
/assessment/[assessmentId]
```

and their linked attempt is:

```text
in_progress
```

the app should:

1. load persisted attempt state/history
2. reconstruct the engine state
3. show a resume screen

Example:

# Assessment in Progress

**Payment Retry Storm**

Your assessment is currently paused at:

```text
03:42
```

CTA:

**Resume Assessment**

Do not automatically restart the timer before the candidate explicitly resumes.

---

# Resume Disclosure

Show concise text:

> Your previous actions and reasoning have been restored.

Do not expose hidden scenario information.

---

# Resume Incident Console

After Resume:

- architecture reflects reconstructed state
- metrics reflect reconstructed state
- controls reflect reconstructed values
- timeline contains previous candidate decisions and system events
- candidate reasoning remains attached
- incident clock continues from saved elapsed time

The user should perceive this as the same attempt.

---

# Completed Assessments

If attempt is already:

```text
resolved
```

or:

```text
failed
```

never replay it as active.

Continue showing the completed assessment/result experience from Phase 4.

---

# One-Attempt Guarantee

Existing invariant remains:

```text
1 assessment candidate
=
maximum 1 official attempt
```

Refresh/resume must never create another attempt row.

Test this explicitly.

---

# Practice Mode

Do not require practice-mode resume as part of this phase.

However, design the pure replay mechanism so it could later be reused for practice attempts.

Assessment mode is the priority.

Do not break existing practice behavior.

---

# Duplicate Persistence Protection

Resume may cause the client to encounter already-persisted events/action groups.

All persistence endpoints must remain idempotent where appropriate.

Verify:

- replay itself does not re-persist historical actions
- old events are not inserted again
- sequence constraints remain valid
- completing after resume creates one terminal result

---

# Scenario Version

Resume must use the exact:

```text
scenarioId
scenarioVersion
```

stored on the attempt/assessment.

Never resume using "currently active latest version."

If the stored version cannot be resolved:

fail safely and show an error rather than running a different scenario.

---

# Assessment State Changes During Pause

Handle:

## Assessment becomes closed while candidate already has an in-progress attempt

Allow the candidate to resume their already-started official attempt.

Closing an assessment blocks **new starts**, not an existing legitimate attempt.

Document this.

---

# Invite Token Improvements

Phase 4 documented that invite tokens currently do not expire.

Add simple expiration.

Suggested default:

```text
7 days
```

or another clearly documented POC duration.

Store:

```text
inviteExpiresAt
```

Invitation preview/accept should reject expired invitations.

Do not introduce token rotation.

Do not email anything.

Already accepted candidates should not depend on the invite token afterward.

---

# Assessment Candidate State

Ensure state transitions remain valid:

```text
invited
→ started
→ completed
```

Resume does not create a new status.

An in-progress resumed attempt remains:

```text
started
```

until completion.

---

# Failure Recovery

If resume reconstruction fails because persisted data is inconsistent:

Do NOT silently restart.

Show a clear safe error:

> We couldn't restore this assessment. Your existing attempt has not been changed.

Log enough server-side diagnostics for development.

Do not expose internal stack traces to candidates.

---

# Candidate Timeline

After resume, historical timeline must look exactly like it did before refresh:

```text
01:00 SYSTEM
Payment provider latency increased.

01:46 YOU
Retries 3 → 1
Backoff None → Exponential

Reason:
...

01:47 SYSTEM
Checkout moved to degraded.
```

New events append after historical events.

Do not duplicate the old timeline.

---

# Hiring Team View

No major UI changes required.

However, resumed assessments must remain indistinguishable from uninterrupted attempts in the hiring-team review.

The interviewer sees one chronological attempt.

Do not label candidate refreshes as harmful actions.

Optionally record a neutral lifecycle event such as:

```text
ASSESSMENT_RESUMED
```

only if useful for auditing.

If added, it must not influence score.

---

# Score Integrity

A resumed attempt and an uninterrupted attempt with identical actions/timing must produce exactly the same:

```text
IncidentRank score
dimension breakdown
result stats
```

Add a direct regression test.

---

# Tests

At minimum add:

## Replay baseline

Replay with no actions to elapsed time T produces the same engine state as uninterrupted simulation to T.

## Replay with one action

Original run and replayed run match.

## Replay with grouped multi-control action

All controls replay in original sequence.

## Replay with multiple candidate decisions

Final state matches uninterrupted run.

## Reasoning ignored by engine

Changing reasoning text does not alter reconstructed state or score.

## Resume elapsed time

Attempt saved at 03:42 resumes at 03:42.

## No duplicate attempt

Resume uses existing attempt ID.

## No duplicate action/event persistence

Historical data remains single-copy after resume.

## Complete after resume

Resumed candidate can resolve incident and complete normally.

## Fail after resume

Resumed candidate can fail incident normally.

## Score equality

Uninterrupted vs resumed identical action path => identical score.

## Closed assessment

Already-started candidate may resume after assessment is closed.

## Scenario version

Replay uses stored version.

## Missing scenario version

Fails safely.

## Invite expiry

Expired unclaimed invite cannot be accepted.

## Accepted invite unaffected by expiry

Candidate who already claimed invitation can access assessment normally.

## Existing practice regression

All current practice tests remain green.

---

# Manual Flow A — Refresh Early

1. Start assessment.
2. Wait for incident start.
3. Apply one decision with reasoning.
4. Refresh browser.
5. Verify Resume Assessment screen.
6. Resume.
7. Verify metrics/controls/timeline/reasoning restored.
8. Complete assessment.
9. Verify one attempt only.

---

# Manual Flow B — Refresh Multiple Times

1. Start assessment.
2. Apply action.
3. Refresh/resume.
4. Apply another action.
5. Refresh/resume again.
6. Complete.
7. Verify no duplicated events/action groups.

---

# Manual Flow C — Compare Scores

Run an action sequence uninterrupted.

Run the exact same sequence with one or more refresh/resume cycles.

Verify identical final IncidentRank score and breakdown.

---

# Manual Flow D — Close During Attempt

1. Candidate starts.
2. Organization closes assessment.
3. Candidate refreshes.
4. Candidate can resume existing attempt.
5. New candidate who has not started cannot start.

---

# Manual Flow E — Expired Invitation

1. Create invite.
2. Force expiration in development/test data.
3. Verify preview/accept indicates expired.
4. Verify accepted candidates do not need the invitation afterward.

---

# Documentation

Update `docs/architecture.md` with:

## Deterministic Attempt Replay

Document:

```text
Scenario version
+
Persisted candidate actions
+
Persisted simulation elapsed time
=
Reconstructed incident state
```

Document assessment clock behavior:

> Assessment simulation time pauses while the incident console is not actively running.

Document invite expiration.

---

# Important Constraints

Do NOT add:

- scenario authoring
- billing
- email delivery
- AI
- LLM analysis
- ATS
- enterprise SSO
- multiple attempts
- anti-cheating surveillance
- browser monitoring
- webcam/microphone monitoring

This phase is reliability only.

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
2. replay architecture
3. elapsed-time persistence model
4. resume lifecycle
5. how candidate actions are replayed
6. how historical events are handled
7. idempotency strategy
8. scenario-version handling
9. invite expiration implementation
10. tests added
11. total tests
12. typecheck/lint/test/build results
13. Manual Flow A result
14. Manual Flow B result
15. Manual Flow C result
16. Manual Flow D result
17. Manual Flow E result
18. any schema changes
19. any deviations
20. any product concerns

Do not begin Phase 5.

Stop after Phase 4.1 is complete.