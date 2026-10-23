# IncidentRank — Phase 6.1: Multi-Step Incident Resolution & Candidate Completion

Before making changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Review the generic simulator and authored-scenario compiler from Phase 5.
4. Review the server-authoritative assessment runtime from Phase 5.1.
5. Review the Phase 6 scenario catalog, generic practice route, and scoring model.
6. Review all 20 current launch scenarios.
7. Do not start scenarios 21–40 yet.
8. Do not add AI/LLM evaluation.
9. Do not add billing.
10. Do not add browser surveillance/proctoring.
11. Do not redesign the scenario library/search UI except where required for the new completion model.

Phase 6A is complete with 20 scenarios.

---

# Why This Phase Exists

The current system is technically capable of multiple candidate actions, but the product still tends to model incidents as:

```text
Incident starts
    ↓
Candidate finds the right control change(s)
    ↓
Success condition becomes true
    ↓
Simulator automatically resolves the incident
```

That is too close to:

> Find the hidden fix.

Real production incidents and Staff-level system-design decisions are often different.

A strong engineer may:

- make one mitigation
- observe the consequence
- deliberately wait
- make another mitigation
- accept a temporary tradeoff
- protect customer traffic while allowing backlog to grow
- stabilize rather than fully restore every metric
- decide the system is operationally safe
- explicitly hand the incident back / declare stabilization

IncidentRank should evaluate that sequence of judgment.

The candidate should therefore have an explicit way to say:

> **I'm done. I believe the incident is sufficiently stabilized.**

That declaration itself is an engineering decision.

---

# Goal

Add a richer incident-completion model that supports:

```text
observe
→ act
→ observe
→ act
→ tolerate tradeoff
→ stabilize
→ declare done
→ evaluate final system state
```

without turning the simulator into an open-ended programming environment.

The new model must:

- support multiple sequential interventions naturally
- preserve delayed consequences
- let candidates intentionally leave non-critical tradeoffs unresolved
- allow explicit candidate completion
- record that completion decision
- evaluate whether the declared state was actually acceptable
- preserve deterministic scoring
- preserve server-authoritative assessment execution
- preserve current scenarios unless intentionally upgraded

---

# Core Product Principle

For appropriate scenarios:

> **The simulator should determine what happened.  
> The candidate should determine when they believe they are finished.**

Those are different responsibilities.

The simulator owns:

```text
cause
effect
time
state
failure
```

The candidate owns:

```text
decisions
tradeoffs
completion judgment
```

---

# Do Not Turn "Done" Into a Hint Button

A critical rule:

The candidate must NOT be able to repeatedly click:

```text
Am I done yet?
```

and use the server response as an oracle.

Declaring completion is a **final decision**.

Once the candidate declares the incident complete:

```text
attempt becomes terminal
```

The system evaluates the current state and scores that decision.

If the candidate declares completion too early or in an unsafe state, that is meaningful assessment evidence.

Do NOT respond:

```text
Not stable yet — keep trying.
```

and let them continue.

---

# Completion Modes

Extend scenario configuration with an explicit completion mode.

Conceptually:

```ts
type CompletionMode =
  | "automatic"
  | "candidate_declared";
```

Existing scenarios may initially remain:

```text
automatic
```

where appropriate.

New richer scenarios should increasingly use:

```text
candidate_declared
```

This allows migration without breaking the current 20 incidents.

Do not globally change every existing scenario to candidate-declared completion without reviewing its design.

---

# Automatic Completion

Current behavior remains:

```text
success condition sustained
→ attempt resolves automatically
```

Useful for:

- simpler practice scenarios
- scenarios with an objectively final terminal event
- backward compatibility

---

# Candidate-Declared Completion

For:

```text
completionMode = candidate_declared
```

the success condition changes meaning.

It no longer automatically ends the attempt.

Instead it represents:

```text
the system is currently in an acceptable/stable completion state
```

The engine should continue running until:

- candidate declares completion
- catastrophic failure condition is reached
- optional hard scenario time limit is reached, if configured

---

# Failure Remains Automatic

Failure conditions should remain server-authoritative and automatic.

Example:

```text
database corruption
service availability < 20% for 3 minutes
irreversible security bypass
complete dependency collapse
```

If a true failure condition is sustained:

```text
attempt = failed
```

The candidate cannot continue merely because they have not clicked Done.

This preserves consequence realism.

---

# Candidate Completion Action

Add a first-class candidate action:

```text
Declare Incident Stabilized
```

or equivalent user-facing wording.

Recommended CTA:

```text
Finish Incident
```

Before confirmation:

> You are declaring that the system is sufficiently stabilized and you are finished making changes. This will end the incident and cannot be undone.

Buttons:

```text
Keep Working
Finish Incident
```

Do not use a casual single-click destructive action.

---

# Final Completion Note

When declaring completion, allow an optional short explanation:

```text
Why do you believe the system is ready to hand back?
```

Example:

> Customer success rate is restored, DB pressure is stable, and I am intentionally leaving worker throughput reduced until the downstream backlog clears.

This is valuable hiring evidence.

Rules:

- optional
- bounded length, e.g. 1000 characters
- persisted
- never affects simulator state
- never affects score
- visible to hiring managers after completion
- visible in practice attempt review

Do not use AI to judge it.

---

# Completion Is a First-Class Attempt Event

Persist the declaration explicitly.

Do NOT represent it as a fake configuration change.

Conceptually:

```ts
CandidateCompletionDeclaration {
  attemptId
  elapsedMs
  note: string | null
  createdAt
}
```

You may model this as:

- dedicated table
- dedicated attempt event
- dedicated fields on attempt

Choose the cleanest design given the current persistence model.

The important thing is that the hiring timeline can distinguish:

```text
Candidate changed controls
```

from:

```text
Candidate declared the incident stabilized
```

---

# Attempt Status

Review the existing attempt statuses.

Current statuses include concepts such as:

```text
in_progress
resolved
failed
abandoned
```

For candidate-declared scenarios:

If candidate declares Done while the system satisfies the scenario's completion criteria:

```text
status = resolved
```

If candidate declares Done while the final state is not acceptable:

prefer a distinct terminal outcome such as:

```text
completed_unresolved
```

or another explicit name if changing the enum is clean.

Do NOT silently call an unsafe declared state `"resolved"`.

Do NOT necessarily call it `"failed"` either unless the actual failure condition occurred.

We want to distinguish:

```text
system catastrophically failed
```

from:

```text
candidate chose to stop before adequately stabilizing it
```

This distinction is valuable in hiring review.

If adding a new DB status would create disproportionate blast radius, use a separate terminal outcome field.

Document the final decision.

---

# Recommended Outcome Model

Prefer separating:

```text
attempt lifecycle
```

from:

```text
incident outcome
```

Conceptually:

```ts
AttemptStatus =
  | "in_progress"
  | "completed"
  | "abandoned";

IncidentOutcome =
  | "resolved"
  | "failed"
  | "declared_unstable"
  | null;
```

This may be cleaner long-term than continuing to overload one enum.

However:

Do not perform a large schema rewrite merely for theoretical purity.

If the existing model can safely support one additional terminal state, that is acceptable.

Explain the chosen model in the completion report.

---

# Final-State Evaluation

When the candidate declares completion:

Server must evaluate the current authoritative state against the scenario's completion/success condition.

Example:

```text
Candidate clicks Finish Incident
        ↓
server reconstructs authoritative state
        ↓
evaluates success condition at current state
        ↓
acceptable?
       / \
     yes  no
     /     \
resolved   declared_unstable
```

This must happen server-side for assessment attempts.

The browser must not know the hidden success criteria.

---

# Sustained Stability

Existing success conditions support:

```text
sustainedSeconds
```

For candidate-declared scenarios, preserve this concept.

Example:

```text
success criteria true
for 30 seconds
```

means the system must have actually remained stable for that duration before a candidate declaration counts as resolved.

The candidate should not be told:

```text
You need another 17 seconds.
```

That would expose hidden scenario mechanics.

If they declare too early:

```text
declared_unstable
```

and the attempt ends.

This makes patience and observation part of the assessment.

---

# Multi-Step Incident Design

Phase 6.1 must also establish a quality contract for future scenarios.

A scenario should not be considered "complex" merely because it has 8 controls.

The scenario should require meaningful temporal reasoning.

Good structure:

```text
initial degradation
    ↓
candidate mitigation #1
    ↓
new system behavior
    ↓
tradeoff becomes visible
    ↓
candidate chooses mitigation #2
    ↓
secondary consequence
    ↓
candidate observes stabilization
    ↓
candidate decides whether to finish
```

---

# Example — Kafka Consumer Lag

Weak scenario:

```text
Lag high
→ increase consumers
→ resolved
```

Not sufficient.

Better scenario:

```text
Kafka lag increases
      ↓
candidate adds consumers
      ↓
DB write pressure increases
      ↓
processing latency worsens
      ↓
candidate reduces batch/concurrency
      ↓
customer-facing system recovers
      ↓
lag is still elevated but declining
      ↓
candidate waits and observes trend
      ↓
candidate declares system stable
```

That tests tradeoffs rather than one fix.

---

# Example — Database Saturation

Possible good path:

```text
DB connections critical
     ↓
reduce worker concurrency
     ↓
API success improves
     ↓
queue backlog increases
     ↓
adjust API pool size carefully
     ↓
DB pressure stabilizes
     ↓
queue remains elevated but controlled
     ↓
Finish Incident
```

A candidate does NOT need to eliminate the entire queue.

They need to make the system operationally safe.

---

# Example — Deployment Regression

Possible path:

```text
deployment causes elevated errors
     ↓
candidate shifts traffic / rolls back
     ↓
errors fall
     ↓
old and new versions temporarily coexist
     ↓
latency remains elevated
     ↓
candidate observes recovery
     ↓
Finish Incident
```

Again:

```text
perfect metrics
```

are not necessarily required.

---

# Candidate-Visible Stability Signals

Do not expose hidden success criteria directly.

But the UI must give enough legitimate operational signals for the candidate to exercise judgment.

Examples:

```text
error rate
latency
queue trend
connection pressure
consumer lag trend
component status
throughput
dependency health
```

Candidates should decide from observable system behavior.

Do not display:

```text
READY_TO_FINISH = true
```

or any equivalent hidden-engine hint.

---

# Trend Support

For richer incidents, single-point metrics may be insufficient.

A candidate needs to know whether:

```text
Kafka lag = 120k
```

is:

```text
rising rapidly
stable
falling
```

Without implementing a full observability product, support lightweight metric trend/history where useful.

Recommended minimal model:

```text
current value
+
recent direction
```

such as:

```text
↑ rising
→ stable
↓ falling
```

or a small recent sparkline if already easy to support.

Do NOT make trend a manually-authored fake label if the engine can derive it from recent values.

Keep this generic.

---

# Observation Time Is a Decision

Candidates should be allowed to do nothing temporarily.

Do not penalize every second without a configuration change as inactivity.

Sometimes:

```text
wait 30 seconds and observe
```

is the correct engineering action.

Scoring should distinguish:

```text
constructive observation
```

from:

```text
doing nothing until natural recovery
```

where the scenario supports that distinction.

Do not introduce mouse/keyboard activity tracking.

---

# Optional Explicit "Observe" Action

Do NOT require a dedicated Observe button merely to advance time.

Time already advances.

If useful in the candidate timeline, an explicit:

```text
Continue Observing
```

action may be considered later, but it is not required for Phase 6.1.

The system should naturally support waiting.

---

# Scoring Changes

Extend generic scoring only where necessary to represent the new completion semantics.

Potential generic scoring measures may now include:

```text
completion outcome
time to declaration
time spent critical
time spent degraded
customer impact
revenue loss
harmful action count
beneficial action count
configuration churn
stability duration before declaration
final-state severity
```

Do not hardcode scenario-specific scoring.

---

# Declared-Unstable Scoring

A candidate who declares Done in an unsafe state should still receive a score.

They may have:

- made some good mitigations
- reduced customer impact
- avoided catastrophic failure
- stopped too early

So:

```text
declared_unstable
```

should not automatically mean:

```text
score = 0
```

Instead:

- Recovery should usually be heavily penalized or zero.
- Reliability should usually be penalized.
- Customer Impact may still earn points.
- Cost Efficiency may still earn points.
- Operational Efficiency may still earn points.
- Data Integrity may still earn points where relevant.

This follows the same philosophy already used for failed attempts.

---

# Candidate Completion and Scoring Privacy

For assessments:

- final-state evaluation happens server-side
- scoring happens server-side
- hidden success conditions remain server-side
- hidden scoring bands remain server-side

The completion endpoint returns only:

```text
terminal outcome
score
candidate-visible final state
```

after the attempt is over.

Do not expose why a hidden criterion failed during the active attempt.

---

# Practice Mode

Practice should support the same completion model.

For free practice:

Candidate clicks:

```text
Finish Incident
```

and receives final evaluation.

Because practice is educational, after completion the result page may explain:

```text
what remained unstable
what tradeoffs were acceptable
what the scenario expected
```

But this feedback appears ONLY after the attempt has ended.

Do not expose it before completion.

Use authored feedback where possible.

No LLM required.

---

# Post-Incident Practice Explanation

This also closes an earlier product requirement:

> After a practice incident finishes, explain what happened with each candidate action.

Add scenario-authored post-incident feedback capability if it does not already exist.

Conceptually, rules/actions may provide safe author feedback metadata such as:

```ts
{
  feedback: {
    title: "Reduced retry amplification",
    explanation:
      "Lowering retries reduced pressure on the degraded payment provider."
  }
}
```

This metadata:

- is NOT sent during assessments
- is NOT shown during active practice
- may be revealed after practice completion
- does not affect simulation
- does not affect score

For every action group in completed practice review, show where possible:

```text
What you changed
Why you said you changed it
What happened afterward
Post-incident explanation
```

Do not use AI to invent explanations.

---

# Do Not Reveal "Correct Answer"

Post-incident feedback should explain consequences, not prescribe one sacred sequence.

Good:

> Reducing worker concurrency lowered database pressure but increased queue backlog. This was a reasonable tradeoff while customer traffic was unstable.

Bad:

> The correct action was to reduce worker concurrency to 4.

Multiple good paths remain a core product principle.

---

# Completion UI

For candidate-declared scenarios, add a visible but non-dominant control:

```text
Finish Incident
```

Recommended placement:

near Apply Changes / incident controls, but visually separate.

It should not look like another configuration setting.

Before incident start:

```text
disabled
```

Once incident begins:

```text
enabled
```

unless the attempt is already terminal.

---

# Confirmation Dialog

Required.

Example:

```text
Finish this incident?

You're declaring that the system is sufficiently stabilized and that you're finished making changes.

This will end the incident and cannot be undone.

Optional:
Why are you ready to hand the system back?

[Keep Working] [Finish Incident]
```

Do not indicate whether the current state is actually acceptable.

---

# Hiring Manager Timeline

The interviewer view should include the completion declaration.

Example:

```text
06:14 CANDIDATE

Declared incident stabilized.

Reason:
"Customer errors are back to baseline. Kafka lag remains elevated but is falling consistently and DB pressure is normal."
```

Then:

```text
06:14 SYSTEM

Incident outcome:
Resolved
```

or:

```text
06:14 SYSTEM

Incident outcome:
Declared before sufficient stabilization
```

The latter wording may be shown to hiring managers after completion.

---

# Practice Timeline

Same timeline structure.

Practice may additionally show authored educational explanation after the attempt.

---

# Assessment Runtime Endpoint

Add a server-authoritative completion/declaration endpoint.

Conceptually:

```http
POST /api/attempts/:attemptId/finish
```

Payload:

```ts
{
  requestId: string,
  note?: string
}
```

Use an idempotency key exactly as candidate action submission already does.

Server:

1. verifies attempt ownership
2. locks/serializes mutation
3. verifies attempt still in progress
4. advances/reconstructs authoritative state
5. evaluates current completion criteria
6. records declaration
7. determines outcome
8. computes score
9. persists terminal result
10. returns final candidate-safe result

No hidden criteria are returned pre-completion.

---

# Finish Idempotency

Double click / request retry must not create:

- two declarations
- duplicate terminal events
- duplicate scoring
- conflicting outcomes

Use a client-generated request id.

Test this directly.

---

# Concurrency

Handle:

```text
advance poll
vs.
Finish Incident
```

and:

```text
Apply Changes
vs.
Finish Incident
```

The attempt must end in one deterministic final state.

If an Apply action wins first:

finish evaluates the resulting state.

If Finish wins first:

later Apply is rejected because attempt is terminal.

No partial double mutation.

---

# Terminal Failure Race

If the scenario crosses an automatic failure condition at effectively the same time the candidate declares Done:

The server-authoritative mutation ordering decides the outcome.

Do not allow the browser to override a failure that already became authoritative.

Document concurrency behavior.

---

# Scenario Schema Changes

Extend the generic authored/built-in model conceptually with:

```ts
completion: {
  mode: "automatic" | "candidate_declared"
}
```

Reuse existing success/failure condition definitions.

Avoid duplicating:

```text
success condition
```

and:

```text
finish condition
```

unless there is a genuine domain need.

For candidate-declared scenarios:

```text
successCondition
=
acceptable final operating state
```

For automatic scenarios:

```text
successCondition
=
automatic resolution condition
```

Same condition structure; different completion semantics.

---

# Scenario Library Metadata

Optionally expose:

```text
Completion style:
Candidate judged
```

internally, but do not clutter public cards unless it helps users.

No filter is required for this in Phase 6.1.

---

# Upgrade Current 20 Scenarios

Do NOT blindly convert all 20.

Review each scenario and classify:

```text
automatic
```

or:

```text
candidate_declared
```

Provide a table in the completion report explaining the decision.

At minimum, upgrade several scenarios where final judgment materially improves the exercise.

Strong candidates include:

- Database Connection Saturation
- Kafka Consumer Lag
- Cache Stampede
- Read Replica Lag
- Database Lock Contention
- Consumer Rebalance Storm
- Cascading Service Failure
- Third-Party API Latency
- Deployment Regression
- Autoscaling Failure

Payment Retry Storm may remain automatic initially if its existing design is better suited to that.

Do not change mode merely for consistency.

---

# Multi-Step Quality Audit of Current 20

Review every current scenario for:

## 1. Number of meaningful decision stages

A strong scenario should ideally have at least:

```text
2 meaningful decision points
```

not necessarily 2 mandatory actions.

## 2. Multiple good strategies

At least two reasonable mitigation approaches where the scenario permits it.

## 3. Harmful plausible strategy

At least one action that seems reasonable but can worsen another subsystem.

## 4. Delayed feedback

Where realistic, at least one consequence should take time to become visible.

## 5. Tradeoff

At least one scenario metric should be allowed to remain imperfect while the incident is still considered safely stabilized.

## 6. No magic sequence

Do not require one exact ordered action sequence unless the underlying system genuinely demands ordering.

---

# Do Not Artificially Complicate Incidents

Not every incident needs:

```text
7 actions
10-minute timeline
three-stage recovery
```

Complexity must come from engineering judgment, not arbitrary clicking.

Some scenarios may legitimately resolve after one excellent decision.

The candidate still may need to observe whether it worked before declaring completion.

---

# Scoring Regression Coverage

Phase 6 report identified that 13 of the 20 scenarios still lacked dedicated scoring-path regression tests.

Close that gap in this phase.

For every one of the 20 scenarios, add concrete scoring tests for at least:

```text
strong/good path
baseline/no-action path
harmful path
```

Where applicable also test:

```text
partial mitigation
declared unstable
```

Assertions should include actual ordering:

```text
good > partial > baseline > harmful
```

only where that ordering is semantically correct.

Do not force artificial ordering where two outcomes should legitimately tie.

Document legitimate ties.

---

# Scenario Quality Test Contract

Every built-in scenario should now automatically validate:

```text
definition validates
catalog metadata exists
scoring config exists
candidate UI exists
deterministic replay works
good path produces intended outcome
harmful path produces intended consequence
score bounds 0–1000
```

Candidate-declared scenarios additionally test:

```text
success state does not auto-resolve
Finish in stable state → resolved
Finish too early → declared_unstable
failure condition still auto-fails
```

---

# Practice Result Screen

Generic result screen should support:

```text
Resolved
Failed
Declared Too Early / Not Stabilized
```

Use user-friendly wording.

Avoid accusatory language.

Example:

```text
Incident Not Fully Stabilized

You ended the incident while important reliability conditions were still degraded.
```

Then show:

- score
- breakdown
- final metrics
- candidate actions
- candidate reasoning
- completion note
- post-incident authored feedback

---

# Assessment Result Screen

Candidate should see:

- outcome
- IncidentRank score
- score breakdown

Do not expose hidden evaluator details that would compromise future assessments if the scenario might be reused.

Hiring manager can see richer detail.

---

# Scoring on "Done"

Do not give bonus points merely for clicking Done.

The declaration is not a positive action by itself.

Score should reflect:

```text
state achieved
time
impact
reliability
cost
action quality
```

The Done action only says:

```text
evaluate me now
```

---

# Hard Maximum Duration

Review whether scenarios need a maximum active duration.

Support an optional scenario field if necessary:

```ts
maxDurationMs?: number
```

If configured and reached while still in progress:

```text
terminal outcome = timeout
```

or closest existing terminal type.

Do not globally impose an arbitrary time limit in this phase.

Only add generic capability if needed by real scenario design.

---

# Candidate Can Finish With Outstanding Backlog

This is explicitly allowed.

Example:

```text
Kafka lag > 0
```

does not necessarily mean unresolved.

The success condition may instead require:

```text
customer errors normal
DB pressure safe
consumer throughput > producer throughput
lag trend decreasing
```

This is the sort of system-design judgment IncidentRank should test.

---

# Trend Evaluation

If trend becomes part of success conditions, keep it deterministic and generic.

Do not let scenario authors write formulas.

Possible generic condition:

```text
metric trend == decreasing
```

only if implemented safely from bounded recent history.

If this is too large for Phase 6.1, authors may encode safe stabilization using existing state/timed-event transitions instead.

Do not overbuild trend infrastructure solely because it sounds useful.

---

# Tests

At minimum add:

## Completion mode

Automatic scenario still auto-resolves.

## Candidate-declared success

Success criteria becoming true does not automatically end the attempt.

## Stable declaration

Candidate declares Done in valid sustained state → resolved.

## Early declaration

Candidate declares before sufficient stabilization → declared_unstable or chosen equivalent.

## Unsafe declaration

Candidate declares with critical state → terminal but not resolved.

## Automatic failure

Candidate-declared scenario still auto-fails when failure condition triggers.

## Completion idempotency

Same finish request applied twice creates one declaration/result.

## Finish/apply race

Deterministic, no double mutation.

## Finish/advance race

Deterministic.

## Terminal immutability

No changes accepted after Finish.

## Completion note

Persisted and visible in hiring review.

## Reasoning exclusion

Completion note does not affect score.

## Hidden criteria

Assessment client receives no hidden completion thresholds.

## Resume

Candidate can refresh before declaration, resume, then Finish.

## Practice anonymous

Free anonymous candidate-declared incident can Finish and receive result.

## Assessment

Server-authoritative paid assessment supports Finish correctly.

## Scoring

All 20 scenarios have good/baseline/harmful score-path coverage.

## Existing regressions

All Phase 0–6A tests remain green.

---

# Manual Flow A — Multi-Step Database Incident

Use Database Connection Saturation.

1. Start incident.
2. Make first mitigation.
3. Observe a new tradeoff.
4. Wait.
5. Make second mitigation.
6. Observe customer metrics recover while some backlog remains.
7. Click Finish Incident.
8. Add optional completion note.
9. Verify attempt resolves.
10. Verify hiring/practice timeline contains all decisions + final declaration.

---

# Manual Flow B — Finish Too Early

1. Start candidate-declared scenario.
2. Make one partial improvement.
3. Immediately Finish.
4. Verify attempt ends.
5. Verify outcome is not resolved.
6. Verify partial work still earns appropriate score.
7. Verify candidate cannot return and continue editing after seeing the result.

---

# Manual Flow C — Wait and Observe

1. Apply a mitigation with delayed benefit.
2. Do nothing for a period.
3. Verify system changes over time.
4. Finish after stabilization.
5. Verify waiting itself was not treated as harmful configuration churn.

---

# Manual Flow D — Assessment Privacy

1. Run candidate-declared company assessment.
2. Inspect network responses.
3. Verify hidden success/completion conditions remain server-only.
4. Finish.
5. Verify server determines outcome.
6. Hiring manager sees declaration note and final state.

---

# Manual Flow E — Failure Before Done

1. Run a scenario with a catastrophic failure condition.
2. Take harmful action.
3. Let failure threshold trigger.
4. Verify attempt auto-fails without requiring candidate to click Finish.
5. Verify Finish is unavailable afterward.

---

# Manual Flow F — Scoring Review

For all 20 scenarios:

Run or programmatically verify:

```text
good path
baseline path
harmful path
```

Record scores.

Flag:

- suspicious ties
- harmful path scoring above sensible mitigation
- baseline outperforming meaningful mitigation
- scoring dimensions with no real discriminating power

Do not silently manipulate scores just to produce prettier spacing.

Document genuine limitations.

---

# Documentation

Update `docs/architecture.md`.

Add:

## Completion Modes

```text
automatic
candidate_declared
```

Add lifecycle:

```text
Incident Starts
     ↓
Candidate Decisions
     ↓
System Evolves
     ↓
Candidate Declares Finished
     ↓
Server Evaluates Final State
     ↓
Resolved OR Declared Unstable
```

Document:

> Candidate completion is a final assessment decision, not a hint request.

Document:

> Failure conditions remain automatic even in candidate-declared scenarios.

Document:

> Candidate completion notes are recorded but never scored.

---

# Important Constraints

Do NOT add:

- LLM evaluation
- natural-language scoring
- AI judgment of completion notes
- browser surveillance
- webcam/microphone monitoring
- arbitrary scripting
- freeform infrastructure commands
- shell access
- collaborative incident response
- billing
- scenario 21–40

This phase is about richer decision semantics and closing quality gaps in the first 20 scenarios.

---

# Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:seed
```

All must pass.

Do not weaken existing tests.

---

# Completion Report

Return:

1. files created/modified
2. DB/schema changes
3. completion-mode model
4. candidate-declared lifecycle
5. Finish Incident API design
6. completion idempotency
7. concurrency handling
8. final-state evaluation
9. failure behavior
10. completion-note persistence
11. hiring-manager timeline changes
12. practice-result changes
13. post-incident authored feedback implementation
14. multi-step quality audit of all 20 scenarios
15. which scenarios remain automatic
16. which scenarios use candidate-declared completion
17. rationale for each classification
18. scoring tests added for all 20 scenarios
19. good/baseline/harmful score table for all 20
20. legitimate score ties or limitations
21. total tests
22. typecheck/lint/test/build/seed results
23. Manual Flow A
24. Manual Flow B
25. Manual Flow C
26. Manual Flow D
27. Manual Flow E
28. Manual Flow F
29. deviations
30. product/UX concerns

Do not begin scenarios 21–40.

Stop after Phase 6.1 is complete.