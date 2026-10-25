# Phase 7.3 — Full User Story & End-to-End Product QA

## Purpose

The 100-scenario IncidentRank catalog is complete.

Phase 7.1 + 7.2 established the engine/product-integrity baseline:

- 100/100 scenarios have deterministic golden paths.
- 100/100 scenarios reject zero-action immediate Finish.
- 100/100 scenarios cannot auto-pass.
- Automatic failure behavior remains intact.
- Finish Incident is universally available once an incident starts.
- Assessment candidate score/result leakage has been removed from the confirmed candidate-facing surfaces.
- Incident Brief is available during practice and assessment.
- Briefing descriptions render more readably.
- Deterministic replay is proven across all 100 scenarios.
- 3,940 monorepo tests passed at Phase 7.1 + 7.2 closeout.
- Database seed reports 100 built-in scenarios.

Phase 7.3 is **not another engine-authoring phase**.

It is a product QA phase.

The purpose is to test IncidentRank the way real users will experience it and discover problems that unit tests, catalog tests, and golden-path engine tests cannot reliably reveal.

Examples:

- confusing copy
- unclear next actions
- broken navigation
- inconsistent state after refresh
- bad resume behavior
- confusing assessment behavior
- authorization leaks
- stale links
- duplicate submissions
- poor error states
- awkward mobile layouts
- results that technically work but communicate badly
- flows that differ unexpectedly between practice and assessment
- timing/state bugs caused by real browser interaction
- state persistence issues
- accessibility regressions
- UX behavior that makes a correct scenario feel broken

The standard for this phase is:

> **IncidentRank should behave correctly as a product, not merely as a collection of passing tests.**

Do not begin new product features unless a defect discovered during this phase requires a narrowly scoped fix.

Do not begin organization billing, enterprise pricing, AI tutors, custom scenario creation, marketing infrastructure, email infrastructure, certificates, or unrelated roadmap work.

---

# 1. Core QA principles

## 1.1 Test from the user's perspective

Do not start from implementation assumptions.

For every user story:

1. define the user's goal
2. define the preconditions
3. perform the flow through the actual product
4. observe what the user can see and do
5. verify data/state after the interaction
6. verify refresh/back/resume behavior where applicable
7. verify unauthorized variants
8. record evidence
9. classify defects by severity
10. retest after fixes

A passing unit test is supporting evidence, not a substitute for a broken browser flow.

## 1.2 Prefer real browser execution

Use the running application for all stories that can reasonably be exercised through the browser.

Use direct API/database inspection only when needed to verify:

- persisted state
- authorization behavior
- redaction
- idempotency
- data consistency
- impossible-to-see backend effects

Do not declare a user story passed solely because its server function passes a unit test when the actual UI can be exercised.

## 1.3 Do not fabricate production identity behavior

If a story requires real authentication, organization membership, candidate invitations, or Clerk-backed identity:

- use real development/test accounts if already configured
- do not fake successful authorization in the browser
- do not weaken auth to make QA easier
- do not create insecure test-only production paths

If a specific authenticated flow cannot be exercised because the environment lacks valid identities, document it explicitly and cover the closest possible real route/API behavior with automated tests.

Do not silently mark it PASS.

Mark it:

`BLOCKED_ENVIRONMENT`

with exact reason and evidence.

## 1.4 Product correctness outranks test convenience

If the user flow reveals a real defect:

- fix the product
- add regression coverage
- rerun the affected user story
- rerun relevant lower-level tests

Do not change the user-story expectation merely because existing code behaves differently.

---

# 2. Required QA output structure

Create a Phase 7.3 QA workspace under an appropriate docs path, for example:

```text
docs/qa/phase7_3/
```

Suggested structure:

```text
docs/qa/phase7_3/
  phase7_3_plan.md
  user_story_matrix.md
  execution_log.md
  defects.md
  coverage_matrix.md
  completion_report.md
```

If the repository already has an established QA-document location, follow that convention instead.

For every user story, track:

```text
Story ID
Persona
Goal
Preconditions
Scenario(s)
Environment
Steps
Expected result
Observed result
Status
Evidence
Defects
Retest status
```

Allowed statuses:

```text
NOT_RUN
PASS
FAIL
BLOCKED_ENVIRONMENT
BLOCKED_DEPENDENCY
NOT_APPLICABLE
```

Do not use ambiguous statuses such as "mostly works."

---

# 3. Personas to test

At minimum include these personas.

## P1 — Anonymous visitor

Goals:

- discover an incident
- understand what IncidentRank is
- inspect public/free content
- encounter authentication/access boundaries correctly
- avoid seeing protected content

## P2 — Signed-in individual engineer

Goals:

- discover a scenario
- start an incident
- reason through it
- use Incident Brief
- submit Finish
- see results
- retry or attempt another scenario
- leave and return safely

## P3 — Engineer who makes poor decisions

Test a practice user who:

- applies harmful controls
- waits too long
- triggers automatic failure
- declares Finish too early
- reaches `declared_unstable`

Goal: verify failure states are understandable and terminate correctly.

## P4 — Engineer who reaches ACCEPTABLE

Goal: verify a legitimate degraded-but-safe result is communicated clearly as resolved but not optimal.

## P5 — Engineer who reaches OPTIMAL

Goal: verify the canonical successful end-to-end experience and score/result clarity.

## P6 — Returning/resuming engineer

Goal: verify state persistence after refresh, navigation away, browser close/reopen where feasible, and return.

## P7 — Company assessment candidate

Goals:

- open valid assessment
- understand instructions
- start
- complete
- submit
- receive neutral confirmation only
- never see score/tier/outcome/evaluation data

## P8 — Invalid/expired/unauthorized assessment visitor

Test:

- wrong assessment ID
- insufficient permission
- stale/invalid link
- another candidate's attempt URL
- direct protected result routes

Goal: clean denial with no data leakage.

## P9 — Organization-side evaluator

Only test if the current product already has an organization/evaluator result-view flow.

Do not build organization features in this phase.

If the flow exists, verify authorized evaluator access and candidate/evaluator view separation.

If it does not exist, mark NOT_APPLICABLE and document that organization management is intentionally deferred.

## P10 — Mobile/small-screen user

Test both practice and, where possible, assessment at narrow viewport sizes.

---

# 4. Scenario sampling strategy

Do not manually execute all 100 scenarios end-to-end through the browser unless explicitly required later.

Phase 7.2 already proves all 100 through the real engine.

Phase 7.3 should use a **representative scenario matrix** of approximately 15–20 incidents.

At minimum cover:

1. one formerly automatic-completion scenario
2. one scenario with automatic failure
3. one scenario with ACCEPTABLE and OPTIMAL outcomes
4. one scenario with alternate strong paths
5. one scenario with historical/non-resetting damage
6. one scenario with recovery lag
7. one scenario with sequencing sensitivity
8. one cost-efficiency scenario
9. one security/authorization scenario
10. one model/decision-quality scenario
11. one scenario with a long/structured briefing
12. scenario #100 (`enterprise-wide-dependency-deprecation`)
13. one plain-paragraph briefing scenario
14. one free scenario
15. one paid/premium scenario
16. one staff-level scenario
17. one senior_staff scenario
18. one principal scenario

Prefer reuse where one scenario covers multiple categories.

Known high-value candidates from prior phases include:

- `cache-eviction-storm`
- `cache-node-failure`
- `runaway-cloud-spend-during-healthy-traffic`
- `cross-region-replication-cost-explosion`
- `expensive-retry-and-logging-amplification`
- `model-feature-freshness-degradation`
- `abuse-prevention-false-positive-storm`
- `ml-inference-cost-vs-quality-incident`
- `certificate-expiry-across-large-fleet`
- `emergency-capacity-reservation-decision`
- `enterprise-wide-dependency-deprecation`

Use the repository as the source of truth for actual catalog positions and metadata.

Document the final chosen sample and why each scenario was included.

---

# 5. User Story Group A — Discovery and entry

## US-A01 — Anonymous user opens a public scenario

Verify:

- page loads
- scenario title is correct
- difficulty is visible
- estimated duration is visible if intended
- briefing is readable
- no protected solution material is exposed
- no golden-path information is exposed
- no internal scoring configuration is exposed
- CTA is understandable

## US-A02 — Anonymous user encounters protected/premium scenario

Verify current intended pre-launch behavior.

If premium incidents are currently "coming soon":

- do not expose paid access as if purchasing is live
- show the current intended coming-soon/access state
- do not create fake checkout behavior
- do not expose the incident if current policy says it is locked

Document the exact current product behavior.

## US-A03 — Anonymous user is asked to sign in at the correct point

Verify:

- sign-in prompt appears when required
- user is not forced to sign in earlier than intended
- after sign-in, intended navigation context is preserved if currently supported
- no infinite redirect
- no loss of selected scenario if the current design promises return-to-context

## US-A04 — Invalid scenario slug

Verify:

- clean 404/not-found experience
- no stack trace
- no raw database error
- no unrelated scenario
- no internal path leakage

---

# 6. User Story Group B — Practice incident lifecycle

## US-B01 — Start a practice incident

Verify:

- briefing appears before start
- scenario data matches catalog
- Acknowledge/start action is clear
- incident starts once
- started state is persisted
- controls become available
- timer/runtime behaves correctly
- Incident Brief becomes available after start
- Finish Incident becomes available after start
- Finish is not available before intended point

## US-B02 — Incident Brief consistency

For at least:

- one plain-text description
- scenario #100 structured description

Verify:

- pre-start and mid-incident brief content is semantically identical
- structured numbered content remains structured
- no hidden solution fields appear
- drawer can be opened/closed repeatedly
- Escape closes if intended
- layout remains usable
- state underneath does not reset

## US-B03 — Golden-path OPTIMAL completion

Using one canonical scenario:

- start incident
- follow known golden path
- wait required recovery windows
- confirm incident does not auto-pass
- click Finish
- verify result screen
- verify completion tier
- verify total score
- verify six dimensions
- verify persisted attempt status/outcome

Do not hardcode score expectations unless sourced from current scenario tests.

## US-B04 — ACCEPTABLE completion

Choose a scenario with a legitimate acceptable path.

Verify:

- candidate can Finish
- outcome is resolved
- completion tier is acceptable
- UI clearly distinguishes acceptable from optimal
- score presentation does not misleadingly imply failure
- persisted completion tier is correct

## US-B05 — Premature Finish

Verify:

- outcome is `declared_unstable`
- UI explains that the incident was not fully stabilized
- no accidental success
- attempt is persisted correctly
- UI result matches server state

## US-B06 — Harmful control path

Choose a scenario with a tempting harmful action.

Verify:

- harmful state appears in visible metrics/timeline
- action feedback is understandable
- Finish does not incorrectly resolve
- scoring penalizes intended dimensions
- historical damage remains visible where applicable

## US-B07 — Automatic failure

Choose a scenario where sustained harmful state can auto-fail.

Verify:

- candidate does not need to click Finish
- failure occurs only when intended threshold is reached
- UI transitions cleanly
- controls/Finish become appropriately disabled
- result persists after refresh
- no later action can resurrect the attempt

## US-B08 — No automatic success

Use a formerly automatic-mode scenario such as `cache-eviction-storm`.

Verify through the browser:

- reach fully safe/golden state
- wait beyond required sustain duration
- attempt remains in-progress
- Finish button remains present
- only explicit Finish resolves the attempt

This is a permanent product-level regression story.

---

# 7. User Story Group C — Resume, refresh, navigation, persistence

## US-C01 — Refresh during active incident

Steps:

- start incident
- make at least one control change
- wait for state progression
- refresh browser

Verify:

- same attempt resumes
- control state persists
- elapsed/runtime state is sensible
- timeline is not duplicated incorrectly
- metrics are consistent
- no new attempt is silently created

## US-C02 — Navigate away and return

Verify:

- active attempt is discoverable/resumable if product supports this
- returning does not reset scenario
- returning does not duplicate attempt rows
- result state is preserved if attempt already ended

## US-C03 — Close browser / reopen

If technically feasible:

- start incident
- persist meaningful state
- close page/session
- return

Verify current intended resume semantics.

## US-C04 — Refresh at result screen

Verify:

- result remains consistent
- score does not change
- completion tier does not change
- no duplicate terminal persistence
- no duplicate candidate submission
- no duplicated attempt row

## US-C05 — Double-click / repeated Finish

Attempt to submit Finish repeatedly or rapidly.

Verify:

- terminal result is idempotent
- no duplicate scoring/persistence
- no inconsistent responses
- final attempt remains singular and stable

Inspect `finish_request_id` behavior if relevant.

Add regression coverage if repeated submission exposes a defect.

---

# 8. User Story Group D — Result integrity

## US-D01 — Practice result completeness

Verify a practice result contains intended fields:

- overall score
- completion state
- tier if resolved
- six scoring dimensions
- relevant historical/peak metrics if displayed
- appropriate completion copy

Verify no internal/debug-only fields leak.

## US-D02 — Result matches persisted attempt

Compare UI result against persisted attempt/database/API.

Verify:

- score matches
- dimension scores match
- outcome matches
- tier matches
- completion time/state matches
- result is not recomputed differently on reload

## US-D03 — Historical damage presentation

Choose a scenario such as:

- `expensive-retry-and-logging-amplification`
- `model-feature-freshness-degradation`
- another historical-peak scenario

Cause historical damage, then recover.

Verify:

- live state can become safe
- historical damage remains represented
- result/scoring reflects the historical consequence
- refresh does not erase it

---

# 9. User Story Group E — Assessment candidate lifecycle

Only run browser-authenticated stories with valid development/test identities.

Do not weaken authentication to satisfy this section.

## US-E01 — Valid assessment landing

Verify:

- candidate opens assigned assessment
- scenario name/difficulty/duration appear
- candidate-safe description appears
- no score/rubric/solution leakage
- instructions are clear

## US-E02 — Start assessment

Verify:

- correct candidate/assessment is bound
- incident starts once
- attempt type is `assessment`
- assessment ID is linked
- practice-only result UX is not shown
- Incident Brief works

## US-E03 — Complete assessment

Follow a known valid path and submit.

Candidate should see only neutral confirmation such as:

> Assessment submitted successfully. Results are available to the hiring organization.

Verify absence of:

- score
- tier
- outcome
- dimension breakdown
- completion note
- final-state evaluation
- revenue loss
- peaks
- action tallies

## US-E04 — Direct attempt URL after assessment

Candidate navigates directly to:

`/attempts/{attemptId}`

Verify:

- neutral candidate-safe assessment state
- no result leakage

## US-E05 — Direct attempt API after assessment

Verify candidate-safe GET response.

Assert explicit safe-key allowlist.

Do not merely check that `score` is null.

The prohibited keys must be absent.

## US-E06 — Finish API response privacy

Verify assessment Finish response is neutral:

```json
{"submitted": true}
```

or current equivalent.

No score/tier/outcome.

## US-E07 — Refresh submitted assessment

Verify:

- neutral submitted state remains
- no scoring retry UI
- no accidental result exposure
- no duplicate submission

## US-E08 — Candidate attempts practice-result route patterns

Try normal direct navigation patterns that might reveal assessment result data.

Verify authorization/redaction remains correct.

---

# 10. User Story Group F — Assessment authorization failures

## US-F01 — Wrong candidate

With authorized test identities if available:

Candidate A attempts to access Candidate B's assessment or attempt.

Expected:

- denied
- no metadata leakage beyond appropriate not-found/forbidden response
- no result leakage

## US-F02 — Invalid assessment ID

Verify:

- clean error/404
- no internal stack trace
- no candidate data

## US-F03 — Assessment already completed

Reopen completed assessment.

Verify intended behavior:

- submitted/complete state
- cannot create duplicate attempt unless explicitly allowed
- cannot re-run through stale UI
- no result leakage

## US-F04 — Assessment link after invalidation/expiry

Only if expiry/invalidation already exists.

Do not build it here.

If implemented:

- verify expired state
- verify no new attempt can start

If not implemented:

mark NOT_APPLICABLE and document as future behavior.

---

# 11. User Story Group G — Access control and premium/free behavior

## US-G01 — Free scenario access

Verify current entitlement rules.

## US-G02 — Premium scenario without entitlement

Given the current pre-launch state:

- premium should remain locked/coming soon according to current product policy
- no accidental access through direct URL
- no accidental access through API
- no client-only lock that server routes ignore

## US-G03 — Attempt API authorization

A user tries to access another user's practice attempt.

Verify:

- rejected
- no attempt metadata leak
- no score leak
- no final state leak

## US-G04 — Scenario solution/golden-path isolation

Verify candidate-facing browser bundles/APIs do not expose:

- golden-path fixtures
- expected optimal controls
- private scoring rules beyond intended UI
- scenario solution internals

The `golden-paths` directory must remain test-only/internal.

Use build/bundle inspection if necessary.

---

# 12. User Story Group H — Browser resilience and edge behavior

## US-H01 — Back button during incident

Verify no destructive reset or accidental duplicate attempt.

## US-H02 — Forward/back around result

Verify terminal state remains terminal and stable.

## US-H03 — Slow/repeated actions

Rapidly change controls or repeat the same control.

Verify:

- runtime remains coherent
- no duplicate action corruption
- harmful/beneficial counts behave as designed
- UI does not get stuck

## US-H04 — Network/API error handling

Use existing dev tooling/mocking only if available.

Do not add artificial infrastructure solely for this test.

Simulate or induce:

- failed action submission
- failed Finish request
- failed attempt reload

Verify:

- useful error message
- retry path
- no false success
- no duplicate terminal persistence
- user does not lose current state unnecessarily

## US-H05 — Stale browser tab

Where feasible:

- open same attempt in two tabs
- act in one
- act/Finish in the other

Verify current behavior.

Look for:

- stale state overwrites
- duplicate Finish
- inconsistent runtime versions
- server-authoritative conflict handling

Document whether this is currently supported or a known limitation.

Do not build collaborative synchronization unless required to fix a correctness defect.

---

# 13. User Story Group I — Mobile and responsive UX

Use at least:

- ~390px mobile viewport
- tablet-ish width
- normal desktop

Test at minimum:

- pre-start briefing
- architecture view
- controls
- metrics
- timeline
- Incident Brief
- Finish flow
- result screen

Verify:

- no unusable horizontal overflow
- important buttons remain reachable
- drawer/modal does not trap content incorrectly
- text remains readable
- architecture is not catastrophically clipped
- controls are operable
- Finish remains accessible

Do not redesign for perfection in this phase.

Fix severe usability defects.

Document lower-severity polish opportunities.

---

# 14. User Story Group J — Accessibility sanity checks

This is not a full formal WCAG audit unless the repository already requires one.

At minimum test:

- keyboard navigation through primary flow
- visible focus states
- Escape behavior on Incident Brief/dialogs
- buttons have accessible names
- modal/dialog focus is not obviously broken
- color is not the only indicator of critical state where text/status already exists
- headings are reasonably structured
- result state is readable by text

Use existing lint/a11y tooling if configured.

Do not claim full WCAG compliance from this pass.

---

# 15. User Story Group K — Content-quality product checks

This phase does not re-author scenarios.

However, browser execution should identify scenarios whose content creates product confusion.

For each sampled scenario inspect:

- briefing clarity
- business invariants readability
- control labels
- metric labels
- timeline causality
- action feedback
- Finish decision clarity
- result explanation

Flag problems such as:

- ambiguous control names
- misleading units
- metric names not matching scenario context
- timeline events that look like candidate actions but are external events
- insufficient explanation of why a result was unsafe
- briefings too long to scan
- hidden invariant required for success but not communicated

Classify as:

```text
CONTENT_DEFECT
UX_COPY
SCENARIO_DESIGN
NOT_A_DEFECT
```

Do not broadly rewrite scenario content unless the issue materially harms the user experience.

---

# 16. Severity model

Every defect must receive a severity.

## SEV-0 — Release blocker / critical

Examples:

- cross-user or candidate result leakage
- authentication bypass
- data corruption
- assessment candidate can see evaluation
- arbitrary user can mutate another user's attempt
- scenario impossible to complete despite golden path because of product-flow discrepancy

## SEV-1 — Major

Examples:

- active attempt lost on refresh
- duplicate Finish creates inconsistent results
- automatic success reappears
- result score differs from persisted score
- Finish button inaccessible in common flow
- assessment cannot be completed

## SEV-2 — Moderate

Examples:

- confusing error state with workaround
- Incident Brief broken on one viewport
- result copy misleading
- navigation inconsistency
- resume flow awkward but data intact

## SEV-3 — Minor/polish

Examples:

- spacing
- low-impact wording
- cosmetic alignment
- minor responsive annoyance

Do not allow open SEV-0 or SEV-1 defects at phase completion.

SEV-2 defects must either be fixed or explicitly accepted with rationale.

SEV-3 defects may be deferred and listed.

---

# 17. Defect handling workflow

For each FAIL:

1. capture exact reproduction steps
2. capture scenario/persona/account context
3. capture screenshot/log/API response where useful
4. identify expected vs observed
5. assign severity
6. trace root cause
7. make the smallest correct fix
8. add automated regression coverage where practical
9. rerun affected story
10. rerun neighboring stories
11. rerun relevant package tests
12. update defect status

Defect statuses:

```text
OPEN
IN_PROGRESS
FIXED_PENDING_RETEST
VERIFIED_FIXED
DEFERRED
NOT_REPRODUCIBLE
```

Do not close a defect based solely on code inspection.

Retest the user story.

---

# 18. Representative incident execution matrix

Create a matrix mapping scenario sample → required story categories.

Example only:

| Scenario | Why selected | Stories |
|---|---|---|
| cache-eviction-storm | formerly automatic completion | B01, B03, B08, C01 |
| cache-node-failure | plain description parser fallback | B02, C01 |
| runaway-cloud-spend-during-healthy-traffic | cost + unsafe floor | B06, D03 |
| cross-region-replication-cost-explosion | policy/cost tradeoff | B04, B06 |
| expensive-retry-and-logging-amplification | historical damage | B06, D03 |
| model-feature-freshness-degradation | decision quality + principal | B04, B06, D03 |
| enterprise-wide-dependency-deprecation | #100 + structured briefing | B02, I, K |

Build the final matrix from actual repository data.

Do not blindly copy this example.

---

# 19. Data integrity checks

For sampled attempts, inspect persistence.

Verify:

- one attempt row per intended attempt
- correct `user_id`
- correct `scenario_id`
- correct `scenario_version`
- correct `attempt_type`
- correct `assessment_id` when applicable
- correct `started_at`
- `incident_started_at` behavior
- correct terminal `status`
- correct `outcome`
- correct `completion_tier`
- score fields consistent with UI
- `final_state_json` saved where intended
- Finish idempotency behavior
- no duplicate rows from refresh/resume

Do not modify schema unless a real defect requires it.

---

# 20. Security/privacy QA boundaries

This is normal product security/privacy QA, not a penetration-testing phase.

Focus on:

- broken object-level authorization
- candidate result leakage
- direct URL access
- API response redaction
- cross-user attempt access
- premium/free entitlement boundaries
- golden-path leakage

Do not perform destructive security testing.

Do not fuzz external services.

Do not attempt credential attacks.

---

# 21. Required automated regression additions

When Phase 7.3 finds a product defect, add regression tests at the lowest sensible layer.

Examples:

- route test for authorization leak
- component test for candidate result redaction
- server-function test for duplicate Finish
- integration test for resume persistence
- browser/E2E test if repository tooling already supports it

Do not introduce a large new E2E framework unless the repository already has one or the defect clearly justifies it.

If no browser automation framework exists, document manual browser evidence carefully.

---

# 22. Test execution checkpoints

Run targeted tests throughout.

At minimum after all fixes:

```bash
pnpm --filter @incidentrank/simulator typecheck
pnpm --filter @incidentrank/simulator lint
pnpm --filter @incidentrank/simulator test

pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test

pnpm --filter @incidentrank/web typecheck
pnpm --filter @incidentrank/web lint
pnpm --filter @incidentrank/web test

pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm --filter @incidentrank/db db:seed
```

Expected seed:

```text
Seed complete (100 built-in scenario(s)).
```

Do not accept a changed scenario count without an explicit scoped reason.

---

# 23. Browser QA evidence requirements

For every manually executed story, record:

- exact route
- persona/account type
- scenario
- start state
- actions taken
- observed UI state
- terminal state if applicable
- result
- refresh/revisit outcome if tested
- screenshots where useful
- defect IDs if any

Do not rely on memory when compiling the completion report.

---

# 24. Minimum required story coverage

Before Phase 7.3 can close, the following must have a final status.

### Discovery/access
- A01
- A02
- A03
- A04

### Practice
- B01
- B02
- B03
- B04
- B05
- B06
- B07
- B08

### Persistence/navigation
- C01
- C02
- C04
- C05

### Result integrity
- D01
- D02
- D03

### Assessment
- E01
- E02
- E03
- E04
- E05
- E06
- E07

### Authorization failures
- F01
- F02
- F03

### Access controls
- G01
- G02
- G03
- G04

### Browser resilience
- H01
- H02
- H03
- H05

### Responsive
- core mobile pass under Group I

### Accessibility sanity
- Group J minimum pass

### Content/product quality
- Group K on every representative scenario

Stories requiring unavailable auth/environment may be `BLOCKED_ENVIRONMENT`, but only with exact documented evidence.

The phase cannot be called complete if core practice stories are blocked.

---

# 25. Explicitly deferred work

Do not implement during Phase 7.3:

- organization billing
- per-attempt billing
- organization usage ledger
- organization-created scenarios
- AI scenario builder
- AI tutor / $5 subscription
- $99 payment flow
- email infrastructure
- production hosting work
- launch marketing
- LinkedIn automation
- certificates
- enterprise SSO
- new pricing plans
- referral systems
- broad analytics work
- redesign of all 100 incidents
- new incident authoring

You may record future opportunities discovered during QA.

Do not build them.

---

# 26. Phase completion criteria

Phase 7.3 is complete only when:

1. the user-story matrix exists
2. representative scenario matrix exists
3. all minimum required stories are executed or legitimately blocked
4. all SEV-0 defects are fixed and verified
5. all SEV-1 defects are fixed and verified
6. all SEV-2 defects are fixed or explicitly accepted with rationale
7. assessment privacy is validated at every feasible real surface
8. practice resume/refresh behavior is proven
9. repeated Finish/idempotency behavior is proven
10. cross-user attempt authorization is tested
11. premium/free access boundary is tested
12. golden-path fixtures remain inaccessible to candidates
13. practice result integrity is verified against persisted state
14. historical damage survives recovery/refresh where applicable
15. mobile core flow is usable
16. basic keyboard/accessibility sanity passes
17. content-quality review is completed for every representative scenario
18. full monorepo validation is green
19. DB seed remains 100 built-in scenarios
20. completion report is written

---

# 27. Completion report format

Write:

`docs/qa/phase7_3/completion_report.md`

or the repository's established equivalent path.

Include:

## Executive summary

- overall status
- whether product is ready for the next post-quality phase
- total stories
- passed
- failed
- blocked
- deferred
- total defects by severity

## Environment

- app mode
- browser(s)
- viewport(s)
- auth setup
- database
- relevant test users

## Representative scenario matrix

List every scenario used and why.

## User story results

For every required story:

- ID
- status
- evidence
- defects

## Defects discovered

For each:

- ID
- severity
- summary
- reproduction
- root cause
- fix
- regression test
- retest evidence

## Practice-flow assessment

- start
- active interaction
- Finish
- result
- resume
- failure
- acceptable
- optimal

## Assessment-flow assessment

- landing
- start
- submit
- candidate privacy
- direct URL/API access
- authorization

## Access-control assessment

- cross-user
- premium/free
- invalid IDs
- protected result routes
- golden-path leakage

## Persistence assessment

- refresh
- navigation
- resume
- terminal persistence
- duplicate Finish

## Responsive assessment

- mobile
- tablet
- desktop

## Accessibility sanity assessment

- keyboard
- focus
- dialogs/drawers
- textual state communication

## Content-quality assessment

- briefing clarity
- control clarity
- metric clarity
- timeline clarity
- result clarity

## Test results

Exact counts for:

- simulator
- scenarios
- web
- db
- scoring
- monorepo

## Validation

- typecheck
- lint
- test
- build
- seed

## Deferred items

List only intentionally deferred future work.

## Recommendation

Choose one:

```text
READY_FOR_NEXT_PHASE
READY_WITH_MINOR_DEFERRED_ISSUES
NOT_READY
```

Explain why.

---

# 28. Final doctrine

Do not optimize this phase for the number of PASS rows.

Optimize it for confidence.

A discovered defect is useful.

A hidden defect is not.

The goal is to reach a point where we can say:

> IncidentRank has 100 incidents, every incident is engine-solvable, and the actual product flows engineers and candidates use have been exercised deliberately across success, failure, resume, privacy, authorization, and edge cases.

---

# Stop condition

Stop after:

- Phase 7.3 QA is complete
- all required fixes are implemented
- all required retests are complete
- the completion report is written
- the recommendation is recorded

Do **not** begin organization billing, launch infrastructure, email setup, marketing execution, or future AI features without explicit instruction.
