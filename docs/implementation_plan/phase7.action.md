You are implementing **IncidentRank Phase 7.1 + Phase 7.2 only**.

The 100-scenario catalog is complete. This phase is no longer about creating new incidents. It is about proving the existing product is correct, safe, deterministic, private where required, and genuinely usable across all 100 scenarios.

Do not begin organization billing, enterprise features, custom scenario authoring, AI tutors, marketing infrastructure, email systems, or any other future-product work.

Your job is to complete the product-integrity pass described below.

# Core doctrine

IncidentRank must follow this rule:

**The system may fail a candidate automatically, but it must never pass a candidate automatically.**

A candidate must explicitly choose **Finish Incident** before a successful result can be produced.

This applies to all 100 scenarios.

---

# Phase 7.1 — Product Integrity

## 1. Remove automatic success

Current reconnaissance found 17 scenarios that can resolve successfully with zero candidate action because `packages/simulator/src/tick.ts` defaults completion mode to `automatic` and writes `status = "resolved"` when the success condition sustains.

Fix this at the engine level.

In:

`packages/simulator/src/tick.ts`

Remove the branch that writes:

`status = "resolved"`

for automatic completion.

Do not remove or weaken automatic failure behavior.

Failure must remain unconditional where the existing scenario logic requires it.

Do not change the `CompletionMode` type or broadly rewrite scenario definitions unless required.

The important invariant is:

```text
success condition reached
        ↓
attempt remains in_progress
        ↓
candidate clicks Finish Incident
        ↓
evaluateCandidateDeclaredFinish(...)
        ↓
resolved / acceptable / declared_unstable
```

Never:

```text
success condition reached
        ↓
engine automatically marks resolved
```

---

## 2. Make Finish Incident universal

Update all frontend/server logic that currently restricts Finish to `candidate_declared` scenarios.

Audit and update the files identified in the reconnaissance, including:

- `apps/web/src/components/scenario-console/generic-incident-console.tsx`
- `apps/web/src/app/assessment/[assessmentId]/assessment-console.tsx`
- `apps/web/src/lib/server/finish-attempt.ts`
- `apps/web/src/app/api/attempts/finish-preview/route.ts`
- `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts`
- `apps/web/src/app/api/attempts/[attemptId]/finish/route.ts`

The button should be available once:

- the incident has started
- the attempt is not terminal

Do not gate Finish based on completion mode.

Client code must never be allowed to claim a successful resolved state directly.

A client-claimed:

`status = "resolved"`

must be rejected universally.

Server-authoritative Finish evaluation is the only path to successful resolution.

---

## 3. Migrate the 17 legacy scenario tests

The identified 17 scenario tests currently expect simulation itself to set:

`state.status === "resolved"`

Those tests must be migrated to the new product doctrine.

Do not change the actual good-path logic.

Instead:

1. simulate/replay the known good path
2. confirm the runtime is still non-terminal/in progress
3. call `evaluateCandidateDeclaredFinish(...)`
4. assert that the returned outcome is `resolved`
5. assert the expected completion tier

Affected scenarios identified during reconnaissance:

- cache-eviction-storm
- distributed-coordination-failure
- cache-node-failure
- autoscaling-failure
- bad-configuration-rollout
- cache-revalidation-herd
- cache-stampede
- cascading-service-failure
- database-lock-contention
- deployment-regression
- downstream-dependency-failure
- kafka-consumer-lag
- memory-leak
- read-replica-lag
- slow-query-regression
- third-party-api-latency
- thundering-herd

Do not redesign these scenarios.

This is a completion-semantics migration only.

---

# Assessment result privacy

## 4. Company-assessment candidates must not see evaluation results

This is a privacy/product-integrity requirement.

For an assessment attempt, the candidate must not receive or see:

- total score
- recovery score
- customer-impact score
- data-integrity score
- reliability score
- cost-efficiency score
- operational-efficiency score
- completion tier
- outcome
- completion note
- final-state details
- revenue-loss details
- peak metrics
- action tallies
- any other evaluation-derived result that reveals the organization's assessment

The candidate experience should be equivalent to:

**Assessment submitted successfully. Results are available to the hiring organization.**

Practice attempts keep their existing result experience.

---

## 5. Add a candidate-safe response model

Create a shared server-side redaction layer.

Prefer a discriminated-union shape rather than returning a partially-redacted raw `Attempt`.

Conceptually:

```ts
type CandidateAttemptView =
  | {
      attemptType: "practice";
      // existing practice-safe result fields
    }
  | {
      attemptType: "assessment";
      id: string;
      status: AttemptStatus;
      startedAt: Date;
      completedAt: Date | null;
      submitted: boolean;
    };
```

The assessment branch must not expose optional score/result fields as `undefined` accidentally.

They should not be part of the assessment-safe shape.

Use one shared helper for serialization/redaction rather than duplicating logic across API routes.

---

## 6. Fix all confirmed result-leak surfaces

Audit and correct all confirmed surfaces identified in the plan:

1. `GET /api/attempts/[attemptId]`
2. `POST /api/attempts/[attemptId]/finish`
3. assessment runtime/result screen
4. direct attempt detail page

For assessment attempts:

`finish` should return only a neutral submission result such as:

```json
{
  "submitted": true
}
```

Do not return:

```json
{
  "outcome": "...",
  "completionTier": "...",
  "score": ...
}
```

For practice attempts, preserve the existing result response.

---

## 7. Add negative privacy regression tests

Do not test only what assessment responses contain.

Explicitly assert what they do **not** contain.

For an assessment candidate response, assert absence of at least:

- `score`
- `recoveryScore`
- `customerImpactScore`
- `dataIntegrityScore`
- `reliabilityScore`
- `costEfficiencyScore`
- `operationalEfficiencyScore`
- `completionTier`
- `outcome`
- `completionNote`
- `finalStateJson`
- `revenueLossUsd`

Also inspect any peak/history/action-count fields exposed by the raw attempt model and assert that they do not leak.

If new result fields have been added since this plan was written, include them in the redaction test.

The privacy test should fail closed when possible.

---

# Terminal persistence cleanup

## 8. Remove duplicate terminal persistence logic

The plan identified duplicate assessment terminal-persistence code in:

`apps/web/src/lib/server/assessment-runtime.ts`

Replace the inline implementation with the shared:

`persistTerminalAttempt(...)`

from:

`apps/web/src/lib/server/terminal-attempt.ts`

Do not create another persistence path.

Use the shared server-authoritative terminal-persistence primitive for both flows where appropriate.

Confirm assessment-candidate synchronization still behaves correctly.

---

# Incident Brief and briefing readability

## 9. Add persistent Incident Brief access

Once an incident starts, candidates must still be able to re-read the original incident briefing.

Add a persistent **Incident Brief** control in both:

- practice
- assessment

Use a non-blocking drawer/side panel where practical so the candidate can inspect the brief while still seeing incident metrics.

Do not duplicate briefing text.

Use the same underlying data/source used before Acknowledge.

---

## 10. Share briefing rendering

Extract a reusable briefing-content component.

The pre-start briefing and mid-incident Incident Brief should render the same underlying content.

Avoid:

- duplicated scenario-description strings
- separate hardcoded assessment/practice briefings
- copy/paste versions that may drift later

---

## 11. Ensure assessments actually receive the description

The assessment flow currently does not expose the full scenario description in all required places.

Update the candidate-safe assessment metadata so the pre-start assessment landing page and the post-start Incident Brief can render the scenario briefing.

Do not expose hidden scoring logic, golden paths, root cause, or internal solution material.

Only expose candidate-safe scenario briefing information.

---

## 12. Improve briefing readability without rewriting all 100 scenarios

Many descriptions currently contain inline numbered clauses such as:

`(1)... (2)... (3)...`

Do not manually rewrite all 100 scenario content files in this phase.

Create a rendering compatibility layer that parses recognizable numbered clauses into structured list items.

Descriptions without structured markers should continue rendering as paragraphs.

Treat this parser as a presentation-layer compatibility solution, not necessarily the permanent future content model.

Add a regression test against scenario #100's existing description if it contains six numbered business invariants.

Confirm the six items render as separate list entries.

---

# Phase 7.2 — 100/100 Solvability

## 13. Build a golden-path fixture registry

Create one golden-path fixture per scenario under a non-public/internal test-support location such as:

`packages/scenarios/src/golden-paths/`

Each fixture should contain:

```ts
{
  scenarioSlug,
  actions: [
    {
      atMs,
      controlKey,
      value
    }
  ],
  finishAtMs,
  expectedOutcome: "resolved",
  expectedCompletionTier
}
```

Do not invent 100 new solutions.

Extract the already-proven good/optimal action path from each scenario's existing scenario test.

The current scenario tests are the source of truth.

If multiple valid paths exist, choose one canonical golden path.

Golden paths must never be exposed in candidate/public bundles.

Do not export them from the package's candidate-facing public API.

---

# Golden-path validation

## 14. Prove all 100 scenarios are solvable

Create a generic catalog-driven test.

For every built-in scenario:

1. load its golden path
2. replay it through the real engine using `replayAttempt`
3. stop at the fixture's `finishAtMs`
4. assert runtime has not auto-resolved
5. call `evaluateCandidateDeclaredFinish`
6. assert:
   - outcome = expected outcome
   - completion tier = expected tier

The runner must contain no scenario-specific branching.

Scenario-specific knowledge belongs only in fixtures.

Target:

**100/100 built-in scenarios have a deterministic successful golden path.**

If a scenario cannot pass its existing documented good path through the real engine, investigate the scenario or engine defect.

Do not weaken the harness merely to make the count pass.

---

## 15. Immediate-Finish invariant

Create a catalog-wide immediate-Finish test.

Default policy:

```text
zero candidate action
+
Finish Incident
=
declared_unstable
```

for all scenarios.

Use an explicit documented exceptions allowlist structure, but expect it to be empty today unless the repository proves a legitimate exception.

Never silently exclude scenarios.

If an exception becomes necessary, document:

- slug
- reason
- why zero-action success is legitimate
- why it does not violate the product doctrine

---

## 16. No-auto-success regression

For every scenario:

1. replay the golden path to a safe/success condition
2. do not call Finish
3. advance enough simulation time to prove the success condition can sustain
4. assert the attempt remains non-success-terminal
5. then call Finish
6. assert it resolves

This is the permanent regression barrier for:

**safe != automatically passed**

---

## 17. Deterministic replay proof

For every golden path, run the full authoritative pipeline twice.

Include:

- replayed state
- completion evaluation
- scoring inputs
- total score
- all six score dimensions
- completion tier
- outcome
- final relevant scenario state
- peak/historical metrics
- cumulative non-resetting consequences where applicable

Assert deep deterministic equality between runs.

Do not compare only the final score.

Scenarios with historical/peak consequences must prove those values are deterministic too.

---

## 18. Preserve alternate-path scenario tests

Do not replace scenario-specific alternate-path tests with the catalog golden harness.

The golden harness proves one canonical successful path per scenario.

Existing scenario-level tests must continue proving alternate valid strategies where they exist.

Pay special attention to known multi-path scenarios, including the examples identified in the plan:

- #84
- #90
- #94
- #98
- #99
- #100

If actual numbering/slugs differ in the repository, use the repository as source of truth.

---

# Product-quality doctrine

## 19. Do not confuse engine correctness with UX quality

This phase proves:

- no accidental success
- correct candidate Finish semantics
- assessment privacy
- briefing availability
- structured briefing rendering
- deterministic engine behavior
- 100/100 solvability

It does not replace the later end-to-end user-story QA phase.

After Phase 7.1 + 7.2 is complete, IncidentRank should be ready for a separate user-story-driven product QA pass where an agent behaves as:

- a practice engineer
- an assessment candidate
- a returning/resuming user
- a candidate who fails
- a candidate who reaches acceptable
- a candidate who reaches optimal
- a user who makes harmful changes
- a user who abandons/resumes
- an organization-side evaluator where applicable later

Do not implement that larger phase unless explicitly instructed.

---

# Execution order

Execute in this order:

1. remove automatic success
2. make Finish universal
3. migrate the 17 affected scenario tests
4. verify scenario package is green
5. implement assessment privacy redaction
6. add privacy negative tests
7. consolidate terminal persistence
8. implement Incident Brief
9. implement structured briefing rendering
10. build golden-path fixtures
11. build 100/100 solvability harness
12. build immediate-Finish test
13. build no-auto-success test
14. build deterministic-replay test
15. run full validation
16. perform manual browser QA
17. write completion report

Do not start later steps while foundational tests are red unless the work is truly independent and does not hide the failure.

---

# Required validation

Run at minimum:

```bash
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

Use the actual workspace/package name if `@incidentrank/web` differs.

Expected seed result:

```text
Seed complete (100 built-in scenario(s)).
```

Do not claim success if the actual registered count differs.

If known unrelated flaky tests fail:

- rerun them independently
- capture exact evidence
- distinguish pre-existing flakes from new regressions
- do not label a real failure as flaky without proof

---

# Manual QA

At minimum perform these browser checks.

## Practice completion

Use one of the formerly automatic-success scenarios.

- start incident
- drive it to a correct safe state
- confirm it does not auto-resolve
- confirm Finish Incident remains available
- click Finish
- confirm the correct result appears

## Assessment privacy

Complete an assessment attempt.

Confirm the candidate sees only a neutral submission confirmation.

Verify there is no score/tier/outcome leakage through:

- result screen
- Finish response
- attempt detail page
- direct attempt GET endpoint where accessible

## Incident Brief

In both practice and assessment:

- start incident
- open Incident Brief
- verify it matches the pre-start briefing
- verify the same source of truth is being rendered

## Scenario #100 readability

Open scenario #100:

- before starting
- after starting via Incident Brief

Confirm its numbered business invariants render as a structured list instead of a single wall-of-text paragraph.

---

# Completion report

At the end produce a detailed Phase 7.1 + 7.2 report including:

- exact engine changes
- exact web changes
- 17 migrated scenario tests
- assessment privacy surfaces fixed
- redaction model
- negative privacy-test coverage
- terminal-persistence cleanup
- Incident Brief implementation
- briefing parser behavior
- golden-path fixture count
- 100/100 golden-path result
- immediate-Finish result
- no-auto-success result
- deterministic replay result
- historical/peak determinism result
- alternate-path regression status
- scenario test count
- web test count
- monorepo test count
- typecheck result
- lint result
- build result
- DB seed result
- manual QA evidence
- any defects discovered
- fixes made
- any known unrelated flakes
- deviations from plan
- product/UX concerns discovered
- remaining work intentionally deferred

---

# Stop condition

Stop when:

- no scenario can automatically succeed
- automatic failure behavior still works
- Finish Incident works universally once an incident starts
- all affected legacy scenario tests are migrated
- assessment candidates cannot access evaluation results
- assessment privacy has negative regression coverage
- Incident Brief works in practice and assessment
- briefing readability is improved without rewriting 100 scenario files
- all 100 scenarios have a golden-path fixture
- all 100 golden paths resolve through the real engine
- zero-action immediate Finish is validated catalog-wide
- no-auto-success is validated catalog-wide
- deterministic replay is validated catalog-wide
- full test/typecheck/lint/build/seed validation is complete
- required manual QA is complete
- the completion report is written

**Do not begin organization features, billing, custom scenarios, AI assistants, marketing infrastructure, or the later user-story QA phase.**