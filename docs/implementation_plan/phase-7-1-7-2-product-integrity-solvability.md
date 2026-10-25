# IncidentRank — Phase 7.1 + 7.2 Product Integrity & 100/100 Solvability

## Scope

The 100-scenario catalog is complete and approved.

Do not author scenario 101+.

This phase begins the product-quality program and covers exactly:

```text
Phase 7.1 — Candidate Completion UX Normalization
Phase 7.2 — Deterministic 100/100 Scenario Solvability Harness
```

Do not begin the organization/invitation/authentication user-story batches yet.

The goal of this phase is to make completion semantics consistent across every scenario and prove every one of the 100 scenarios is deterministically solvable through the real product/runtime completion path.

---

# 1. Product Doctrine — Candidate Declares Satisfaction

Universal rule:

```text
A successful incident must never auto-finish merely because a target state was reached.
```

Instead:

```text
candidate reaches a safe / acceptable / optimal state
→ system continues running
→ candidate observes metrics/timeline
→ candidate decides they are satisfied
→ candidate clicks Finish Incident
→ server-authoritative evaluation determines outcome/tier/score
```

Automatic terminal behavior is allowed only for genuine failure-type outcomes such as:

```text
failed
timed_out
other explicit terminal-failure state already supported by the engine
```

A successful state must never automatically close the attempt.

---

# 2. Finish Button Universal Behavior

Audit and normalize every candidate incident-solving surface.

After the incident starts, the candidate should always have access to:

```text
Finish Incident
```

unless the attempt has already become terminal through:

```text
automatic failure
timeout
abandonment
already-finished submission
```

The Finish button must not disappear based on scenario-specific completion configuration.

The candidate may Finish too early.

That is allowed and must produce a server-authoritative result such as:

```text
declared_unstable
```

The Finish button is not an oracle.

Do not disable it merely because the system is currently unsafe.

---

# 3. Remove Successful Auto-Completion

Audit all 100 scenarios and every runtime path for:

```text
automatic successful resolution
auto-Finish
attempt terminalization when successCondition becomes true
UI redirect to result when a safe target is reached without candidate action
```

Successful scenarios should remain active until the candidate explicitly finishes.

Preserve automatic failure handling.

For every scenario previously using:

```text
completion: "automatic"
```

determine the smallest generic migration to candidate-declared success semantics.

Do not solve this with 100 scenario-specific UI exceptions.

Prefer one product/runtime policy.

---

# 4. Completion Semantics Required State

After normalization, the expected lifecycle is:

```text
in_progress
    ↓ candidate clicks Finish
server/runtime replays/evaluates authoritative state
    ↓
resolved / optimal
resolved / acceptable
declared_unstable
```

or independently:

```text
in_progress
    ↓ automatic hard failure
failed
```

Do not trust client claims for:

```text
outcome
completionTier
score
simulation time
final state
```

---

# 5. Incident Brief Must Remain Accessible While Solving

The exact candidate-visible briefing shown before Acknowledge must remain available after:

```text
Acknowledge
incident start
throughout the entire solving session
```

Add or normalize a persistent:

```text
Incident Brief
```

button/panel/drawer on the solving screen.

The candidate must not have to remember the initial briefing.

---

# 6. Incident Brief Content Contract

The in-incident Incident Brief must show the same candidate-visible information as the pre-Acknowledge briefing:

```text
scenario title
severity/category where already candidate-visible
description
business invariants
constraints
system/context explanation
architecture/context links where appropriate
```

It must NOT expose:

```text
successCondition
acceptableCondition
hidden authored rule conditions
hidden timed consequences not yet observed
scoring configuration
action-classification internals
feedback answers
author-only metadata
expected solution
```

The content should come from the same source-of-truth candidate-facing model where possible.

Do not duplicate briefing text into a second manually maintained representation.

---

# 7. Briefing Readability / Structured Rendering

The current briefing UI can render long scenario content as a wall of text.

Fix this generically.

Candidate-facing descriptions must support readable structure:

```text
paragraphs
numbered lists
bulleted lists
section breaks
business-invariant groups
```

Numbered invariants must render as distinct rows/items, for example:

```text
Six business invariants govern every decision:

1. ...
2. ...
3. ...
4. ...
5. ...
6. ...
```

not:

```text
Six business invariants govern every decision: (1) ... (2) ... (3) ...
```

inside one paragraph.

The same formatting must appear:

```text
before Acknowledge
and
inside Incident Brief after incident start
```

---

# 8. Briefing Rendering Audit Across 100 Scenarios

Do not manually rewrite 100 descriptions just to make the UI look right unless the source content itself is genuinely malformed.

First determine whether the current content model can be generically structured.

Audit:

```text
paragraph breaks
embedded numbered invariants
embedded bullet-like prose
long description blocks
```

If the scenario schema needs a small generic candidate-facing structure such as:

```text
summary
sections[]
businessInvariants[]
```

propose the smallest compatible change.

Do not introduce a huge rich-text authoring system.

Backward compatibility for all existing 100 scenarios is required.

---

# 9. Practice vs Company-Assessment Result Privacy

This phase must preserve and explicitly test the distinction:

## Practice

Candidate may receive:

```text
numeric score
six-dimension breakdown
completion tier
educational feedback
historical consequences
```

according to existing practice policy.

## Company assessment

Candidate must NOT receive:

```text
numeric score
six-dimension score breakdown
optimal / acceptable tier
educational feedback
hidden authored rule/classification details
leaderboard result
```

Candidate-facing terminal experience should be equivalent to:

```text
Assessment submitted successfully.
```

with any appropriate neutral completion metadata.

The organization/reviewer can receive authorized evaluation data.

---

# 10. Assessment Score Privacy Must Be Server-Authoritative

Do not implement assessment privacy as CSS/component hiding only.

Audit all assessment candidate-accessible endpoints and runtime payloads.

A candidate in a company evaluation must not be able to recover assessment score/tier/feedback via:

```text
practice score-preview endpoint
attempt result endpoint
runtime state payload
URL manipulation
attempt ID substitution
scenario ID substitution
client network inspection
replay endpoint
browser refresh
direct API calls
```

This phase does not need the full organization permission matrix yet, but the company-assessment candidate score boundary must be explicit and covered because completion UX is being modified.

---

# 11. Deterministic Solvability Harness — Goal

Create a generic harness that proves:

```text
100 / 100 scenarios have at least one real deterministic solution
```

through the actual generic scenario engine/completion semantics.

Do not accept:

```text
individual unit tests exist
definition validates
author says path is solvable
```

as sufficient.

We need one cross-catalog invariant:

> Every shipped scenario can be solved deterministically from its starting state using an authored candidate action sequence and the same generic engine the product uses.

---

# 12. Golden Solution Contract

Define the smallest generic golden-path representation.

Conceptually:

```ts
type ScenarioGoldenPath = {
  scenarioSlug: string;
  actions: Array<{
    atMs: number;
    controlKey: string;
    value: string | number | boolean;
  }>;
  finishAtMs: number;
  expectedOutcome: "resolved";
  expectedCompletionTier: "optimal" | "acceptable";
  expectedFinalIncidentState?: string;
};
```

Exact implementation shape may differ.

The important requirements are:

```text
data-driven
generic
replayable
deterministic
not hardcoded into the simulator
not scenario-specific branching in the runner
```

---

# 13. Where Golden Paths Live

Prefer one of:

```text
scenario-local test fixture
scenario-local exported test-only fixture
dedicated scenarios/golden-paths registry
```

Do not expose golden solutions to candidate browser bundles.

Do not put them into candidate-visible scenario definitions.

They are test/release evidence only.

Assessment clients must never receive them.

---

# 14. 100/100 Golden-Path Runner

Create one generic catalog-wide test that:

```text
enumerates all 100 built-in scenarios
requires golden-path coverage for each
replays the authored actions at exact simulation times
advances timed events deterministically
requests Finish explicitly
evaluates through real completion logic
asserts resolved
asserts expected completion tier
asserts no hidden exception / dead end
```

Release gate:

```text
100 scenarios discovered
100 golden paths present
100 golden paths pass
0 missing
0 failed
```

---

# 15. Use the Real Finish Path

The harness must exercise the same completion logic used by the product as closely as practical.

It must not merely assert:

```text
successCondition === true
```

It should exercise:

```text
candidate action history
simulation advancement
Finish request
completion eligibility
authoritative final-state evaluation
scoring inputs
terminal outcome
```

For signed-in server-authoritative runtime where direct route execution is impractical in package-level tests, test the shared server-authoritative functions that those routes invoke and add route-level E2E coverage separately.

---

# 16. Immediate Finish Audit — 100/100

The same harness or companion catalog-wide test must verify:

```text
start incident
perform zero actions
candidate clicks Finish
```

for every candidate-declared scenario.

Expected default:

```text
declared_unstable
```

If a scenario genuinely has another intentional result, document it explicitly.

No scenario may accidentally resolve on immediate Finish.

---

# 17. No Successful Auto-Finish Audit — 100/100

For each golden path:

```text
reach the authored successful safe state
do NOT click Finish yet
advance at least one additional safe simulation tick/window where possible
```

Assert:

```text
attempt remains in_progress
no automatic successful terminalization occurs
```

Then:

```text
click Finish
```

and assert resolved.

This is the core regression test for the new universal completion doctrine.

---

# 18. Deterministic Replay Audit

For every golden path:

```text
run the same action/time sequence twice from fresh initial state
```

Assert deterministic equality for:

```text
terminal outcome
completion tier
score
final authored state
relevant historical peaks
```

Where intentionally non-score-equal behavior is impossible because the engine is deterministic, exact equality is required.

No stochastic behavior is allowed.

---

# 19. Score Reproducibility

For every golden path:

```text
score run 1 == score run 2
six-dimension breakdown run 1 == run 2
```

If the scenario's score depends on exact finish time, the fixture must use an exact deterministic `finishAtMs`.

Do not use wall-clock timing.

---

# 20. Alternate Strong Paths

For scenarios already documented as having genuine alternate strong paths:

```text
preserve their existing scenario-level tests
```

This phase does not require catalog-wide golden fixtures for every alternate path.

However, select a representative subset across:

```text
security
cost
ML/data
compliance
deadline
migration
```

and verify alternate paths still work after the Finish normalization.

At minimum include:

```text
#84
#90
#94
#98
#99
#100
```

or equivalent representatives if repository numbering differs from direct slug mapping.

---

# 21. Representative Browser E2E Matrix

Do not browser-click all 100 scenarios.

Use 100/100 engine-level solvability plus representative browser E2E.

Browser/E2E representatives should cover at least:

```text
simple free practice incident
multi-step incident
historical-damage incident
security incident
cost incident
ML/data incident
compliance incident
deadline/long-horizon incident
#100 flagship
```

For each browser representative verify:

```text
briefing readable
Acknowledge works
Incident Brief visible after start
same briefing content available
Finish button visible
safe state does not auto-finish
manual Finish works
correct terminal UX appears
```

---

# 22. Anonymous Practice Completion Story

At minimum test:

```text
anonymous user opens free incident
reads structured briefing
acknowledges
starts incident
reopens Incident Brief
performs actions
Finish button remains visible
manually finishes
stateless/server-replay completion result is correct
practice score can be shown
```

Also test immediate Finish.

---

# 23. Signed-In Practice Completion Story

Test:

```text
signed-in user starts practice
attempt persists
refresh/resume retains attempt
Incident Brief still available
safe state does not auto-finish
candidate manually finishes
attempt becomes completed exactly once
score persists
feedback appears post-terminal
duplicate Finish request is idempotent
```

---

# 24. Company Assessment Completion Story

Test representative company-assigned incident:

```text
candidate has valid assignment
personal practice entitlement irrelevant
candidate opens assigned incident
briefing visible
acknowledges
Incident Brief remains available
candidate solves
safe state does not auto-finish
candidate manually Finish/submits
assessment is terminal
```

Candidate-facing result:

```text
submission confirmation
```

Candidate must NOT see:

```text
score
dimension breakdown
completion tier
educational feedback
```

Organization-authorized reviewer data remains available server-side.

---

# 25. Finish Idempotency

For signed-in practice and assessment:

```text
same finishRequestId retried
duplicate network submission
browser double click
refresh after finish
```

must not:

```text
create duplicate completion
change score
change completion time
create duplicate feedback
```

Use existing idempotency architecture.

---

# 26. Finish Race Safety

Exercise:

```text
candidate submits action
candidate immediately clicks Finish
```

Ensure authoritative ordering is deterministic.

No client-side race should cause:

```text
last action omitted
score mismatch
wrong final state
duplicate terminalization
```

Use current runtime versioning/row-lock/idempotency mechanisms rather than inventing scenario-specific fixes.

---

# 27. Failure Semantics

Successful auto-finish is prohibited.

Automatic failure is still allowed.

Test representative automatic-failure scenarios to confirm:

```text
hard failure can terminalize without Finish
Finish button/result UI handles already-terminal state cleanly
no second Finish mutation occurs
```

Do not accidentally remove automatic failure while normalizing success.

---

# 28. Attempt Status Invariants

Across all tested flows:

```text
in_progress
→ completed
```

only through:

```text
candidate Finish
or
authorized automatic failure/timeout
```

No spontaneous successful completion.

Completed/failed attempts remain immutable.

---

# 29. Briefing Equality Test

For representative scenarios, assert the candidate-visible text before Acknowledge and inside Incident Brief after start is sourced from the same normalized data.

At minimum compare:

```text
title
description/summary
business invariants
candidate-visible constraints
```

No accidental drift.

---

# 30. Structured Briefing Rendering Test

Add UI/component tests proving:

```text
numbered invariants render as distinct list items
paragraphs remain separate
bullets remain separate
long prose does not collapse lists into one paragraph
```

Use #100 as one regression fixture because its six-invariant wall-of-text issue was observed directly.

Also test at least one shorter scenario.

---

# 31. Accessibility / Basic Interaction

For Incident Brief and Finish controls verify:

```text
keyboard reachable
semantic button labeling
drawer/modal has accessible label/title
focus returns sensibly
scroll works for long briefing
no content trapped offscreen
```

No major redesign required.

---

# 32. Mobile / Narrow Layout Smoke Test

Run at least one narrow viewport check for:

```text
briefing list readability
Incident Brief drawer/modal
Finish button availability
long invariant content
```

The #100 briefing must remain readable on a narrow viewport.

---

# 33. Security Boundary Tests — Assessment Result

Add negative tests proving assessment candidate cannot access score via candidate-accessible product surfaces.

At minimum:

```text
assessment result page
practice score-preview route
attempt/result route if present
runtime view payload
refresh/re-fetch
```

If an endpoint legitimately returns score only to org reviewers, assert candidate authorization failure/redaction.

---

# 34. Do Not Overreach Into Phase 7.3+

Do not implement:

```text
full organization role matrix
member invitation lifecycle
candidate email invitation delivery
certificate system
billing/Stripe
public profiles
all entitlement user stories
```

Those belong to later Phase 7 batches.

Only touch organization/assessment code where required to prove manual completion and candidate score privacy.

---

# 35. Required Validation

Run:

```text
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test

pnpm --filter <web-package> typecheck
pnpm --filter <web-package> lint
pnpm --filter <web-package> test

pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Expected catalog remains:

```text
100 built-in scenarios
3 free
97 paid
```

0 failures.

---

# 36. Required Phase 7.1 + 7.2 Completion Report

Return:

```text
Phase 7.1 + 7.2 Completion Report
```

with these sections:

## 1. Completion UX changes
- old behavior
- new universal behavior
- files changed

## 2. Successful auto-completion audit
- scenarios/configurations found
- migrations/fixes applied
- proof no successful auto-finish remains

## 3. Universal Finish behavior
- availability rules
- early Finish
- terminal-state handling
- idempotency

## 4. Incident Brief implementation
- source of truth
- before/after Acknowledge behavior
- hidden-information boundary

## 5. Briefing rendering/readability
- paragraphs
- numbered lists
- bullet lists
- #100 regression proof

## 6. Assessment candidate result privacy
- UI
- API
- runtime payload
- negative tests

## 7. Golden-path contract
- implementation shape
- where fixtures live
- why candidate clients cannot access them

## 8. 100/100 solvability result
Required exact summary:

```text
Scenarios discovered:
Golden paths present:
Golden paths passed:
Missing golden paths:
Failed golden paths:
```

Expected:

```text
100
100
100
0
0
```

## 9. 100/100 immediate-Finish audit
- count
- unexpected resolutions
- deviations

## 10. 100/100 no-success-auto-finish audit
- safe states reached
- attempts remained in_progress until Finish
- exceptions

## 11. Deterministic replay audit
- 100/100 outcomes
- tiers
- scores
- final states

## 12. Representative alternate-path regression
- selected scenarios
- outcomes

## 13. Anonymous practice E2E
- exact story result

## 14. Signed-in practice E2E
- resume
- manual Finish
- idempotency

## 15. Company assessment E2E
- assignment access
- manual submission
- candidate result redaction

## 16. Finish race/idempotency tests
- duplicate Finish
- action+Finish race
- refresh after terminal

## 17. Automatic failure regression
- representative scenarios
- failure still automatic

## 18. Structured UI tests
- briefing
- Incident Brief
- accessibility
- narrow viewport

## 19. Files changed

## 20. Test counts

## 21. Typecheck

## 22. Lint

## 23. Build

## 24. Seed/catalog state

## 25. Deviations

## 26. Product/UX concerns

## 27. Final recommendation

Exactly one:

```text
PHASE 7.1 + 7.2 READY FOR APPROVAL
```

or:

```text
PHASE 7.1 + 7.2 STILL BLOCKED
```

with exact blocker.

---

# 37. Release Gates

Do not approve this phase unless all are true:

```text
successful incident resolution never auto-finishes

Finish Incident available consistently after incident start

candidate may Finish early and receive authoritative declared_unstable

Incident Brief remains accessible after Acknowledge

briefing preserves structured paragraphs/lists

#100 six invariants render as separate readable items

assessment candidate cannot see score/tier/educational feedback

100 built-in scenarios discovered by solvability harness

100 golden paths present

100 golden paths pass

0 missing golden paths

0 failed golden paths

every golden path remains in_progress until explicit Finish

deterministic replay matches exactly

representative browser E2E passes

default pnpm test passes

typecheck/lint/build pass

seed remains exactly 100
```

---

# 38. Stop Condition

When Phase 7.1 + 7.2 is complete:

```text
STOP.
```

Do not begin the full organization/invitation/user-story matrix automatically.

Return the completion report for review.

The next approved batch will cover:

```text
Phase 7.3 — Practice identity/access user stories
Phase 7.4 — Organization + company assessment user stories
Phase 7.5 — Invitation/email flows
Phase 7.6 — Authorization/privacy abuse matrix
Phase 7.7 — Full end-to-end release QA
```

Certificates come only after the product/user-story validation phase is complete.
