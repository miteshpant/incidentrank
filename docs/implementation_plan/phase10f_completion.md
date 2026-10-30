# Phase 10F Completion Report — Infrastructure (Part 1)

**Status: infrastructure complete and fully verified. The one Staff-level reference incident (phase10f.md §17) has NOT been built yet — intentionally held per the explicit instruction to complete infrastructure first and get review before any new incident content.**

---

## 1. Architecture summary

Phase 10F's stated goal was to extend IncidentRank from mostly-linear incidents toward multi-service/branching/parallel/cascading incidents, plus a queryable weekly-content model. The key finding from investigation (confirmed before any code was written): **the existing simulation engine already supports this.** `packages/simulator/src/tick.ts` matches `Rule[]` against `triggers`/`controlValues` fresh every tick — there is no `currentStep → nextStep` pointer anywhere in the engine. Any control combination can already jump to any rule; multi-component topology (`architecture.nodes/edges`, `componentHealth`) already renders generically through the existing `ArchitectureView`/`GenericComponentPanel`. What was genuinely missing was **classification metadata** (which structure shape a scenario uses, which incident-role a piece of evidence represents) — not a new engine.

Per the explicit instruction "do not introduce a new incident runtime if the existing tick/rule engine already supports branching and parallel behavior": **no changes were made to `packages/simulator`'s engine mechanics** (`tick.ts`, `rules.ts`, `actions.ts`, `simulate.ts`, `review.ts` are all behaviorally unchanged — `review.ts` gained one new call site in application code, not an engine change). Every Phase 10F addition is either (a) additive database/type metadata that no engine code reads, or (b) a small, generic, server-side function (`buildIncidentNarrative`) that only ever runs post-completion.

---

## 2. Files changed

**Database**
- `packages/db/src/schema.ts` — two new enums (`scenario_structure`, `scenario_domain`), five new columns on `scenarios` (`structure`, `is_free`, `domain`, `release_week`, `published_at`)
- `packages/db/drizzle/0020_stale_venus.sql` (new) — the generated migration
- `packages/db/drizzle/meta/0020_snapshot.json`, `meta/_journal.json` — Drizzle's own generated migration bookkeeping
- `packages/db/src/seed.ts` — `onConflictDoNothing` → `onConflictDoUpdate` (scoped to built-in rows only via `targetWhere`), syncing `isFree`/`structure`/`domain` from code on every seed run

**Types**
- `packages/scenarios/src/types.ts` — new `ScenarioStructure` type; `ScenarioDefinition.structure` (required); `ScenarioLibraryMetadata.primarySkill` (optional)
- `packages/scenarios/src/candidate-ui.ts` — `CandidateControlDescriptor.kind`, `CandidateMetricDescriptor.roleInIncident` (both optional)
- `packages/scenarios/src/authoring/schema.ts` — new `AuthoredScenarioStructure`, `AuthoredRoleInIncident` types; `AuthoredBasics` gained `structure`/`domain`/`primarySkill`/`secondarySkills`; `AuthoredControl.kind`; `AuthoredRule.roleInIncident`; `AuthoredMetric.roleInIncident` (all optional)
- `packages/scenarios/src/authoring/compile.ts` — defaults missing `structure` to `"linear"` at the compile boundary
- `packages/scenarios/src/authoring/candidate-ui.ts` — passes `kind`/`roleInIncident` through from authored controls/metrics

**Mechanical, zero-behavior-change edit**
- All 100 built-in scenario `.ts` files under `packages/scenarios/src/` — each gained exactly one line, `structure: "linear",`, immediately after their existing `isFree:` field. Verified by diffing against the pre-change test suite: all 3606 pre-existing scenario tests pass byte-identically.

**Review/learn narrative (new)**
- `packages/scenarios/src/narrative.ts` (new) — `buildIncidentNarrative()`, `hasIncidentNarrative()`
- `packages/scenarios/src/narrative.test.ts` (new) — 5 tests
- `packages/scenarios/src/index.ts` — exports the above
- `apps/web/src/lib/server/scenario-registry.ts` — new `resolveCandidateUIDescriptor()`, mirroring the existing `resolveSimulationDefinition()`'s built-in/org-owned branching exactly
- `apps/web/src/lib/server/action-feedback.ts` — `reviewPracticeAttemptFeedback()` now also returns `narrative`
- `apps/web/src/app/api/attempts/[attemptId]/review/route.ts` — returns `narrative` in the JSON response
- `apps/web/src/lib/attempt-persistence.ts` — `requestActionFeedback()` return shape changed to `{actionGroups, narrative}`
- `apps/web/src/components/scenario-console/result-screen.tsx` — new "What Happened" section, rendered only when a narrative has content

**Test-fixture-only edits (type-completeness, no behavior change)**
- `packages/scenarios/src/library/catalog.test.ts`, `packages/scenarios/src/authoring/compile.test.ts` (+3 new backward-compat tests), `apps/web/src/app/incidents/library-browser.test.tsx`, `apps/web/src/components/scenario-console/scoring-retry.test.tsx`

---

## 3. Database migrations added

One migration: `0020_stale_venus.sql`.

```sql
CREATE TYPE "public"."scenario_domain" AS ENUM('Databases & Storage', 'Messaging & Streaming', 'Caching', 'Microservices & Dependencies', 'API & Traffic', 'Distributed Systems', 'Deployments & Reliability', 'Infrastructure & Capacity', 'Security & Identity', 'Data Pipelines');
CREATE TYPE "public"."scenario_structure" AS ENUM('linear', 'branching', 'parallel', 'cascading');
ALTER TABLE "scenarios" ADD COLUMN "structure" "scenario_structure" DEFAULT 'linear' NOT NULL;
ALTER TABLE "scenarios" ADD COLUMN "is_free" boolean DEFAULT false NOT NULL;
ALTER TABLE "scenarios" ADD COLUMN "domain" "scenario_domain";
ALTER TABLE "scenarios" ADD COLUMN "release_week" text;
ALTER TABLE "scenarios" ADD COLUMN "published_at" timestamp with time zone;
```

Purely additive. No column dropped, renamed, or made non-nullable without a default. No existing table's row count, row content, or any other column was touched by this migration. Applied to the local dev database (`pnpm db:migrate`) and verified against live rows (see §13).

---

## 4. New schema/entities introduced

- `ScenarioStructure` (`"linear" | "branching" | "parallel" | "cascading"`) — on every `ScenarioDefinition` and optionally on `AuthoredBasics`.
- `AuthoredRoleInIncident` (`"root_cause" | "contributing_factor" | "downstream_symptom" | "context" | "noise"`) — optional, on `AuthoredMetric`/`CandidateMetricDescriptor` only. **Deliberately not placed on `AuthoredControl`/controls at all**, and (after an implementation-time design correction) also not retained as a separate concept on `AuthoredRule` beyond the original field already added — see §16 for why the final implementation centers on metrics, matching your instruction to keep this metadata about *facts*, not actions.
- `"remediation" | "investigation"` control `kind` — purely a UI label distinguishing a non-destructive/evidence-revealing control from a state-mutating one. Never consulted by `isValidControlValue`/`classifyAction` or any engine mechanics; a control's real behavior still comes entirely from the rules/`actionClassifications` that key off it, unchanged.
- `IncidentNarrative` / `IncidentNarrativeEntry` (`packages/scenarios/src/narrative.ts`) — the structured, non-AI-generated post-incident explanation shape.

---

## 5. How backward compatibility is preserved

- **Existing scenarios**: every built-in scenario file's `ScenarioDefinition` literal gained one new required field (`structure: "linear"`) with a value matching its actual, unchanged behavior. No other field on any of the 100 files changed. The full pre-existing scenario test suite (3606 tests) passes with zero modifications to the tests themselves.
- **Existing org-authored scenarios** (`scenario_versions.definitionJson`, persisted before this phase): have no `structure`/`roleInIncident`/`kind` keys in their stored JSON. `compileAuthoredScenario` defaults a missing `structure` to `"linear"` at the compile boundary — verified by a new test using a fixture that intentionally omits these fields (`compile.test.ts`, "Phase 10F backward compatibility" describe block, 3 tests). No historical `definitionJson` row needs to be rewritten or migrated.
- **Existing attempts**: `attempts.finalStateJson` and every scoring column are completely untouched — no schema change, no code path that reads/writes them was modified. Historical scores and outcomes are unaffected, by construction (nothing new reads old attempt rows differently).
- **`isFree` migration specifically** (the area requiring the most care per your constraint #1): audited every one of the 100 built-in scenarios' `isFree` literal before writing the migration. Exactly 3 are free today (`kafka-consumer-lag`, `payment-retry-storm`, `database-connection-saturation`); confirmed org-authored scenarios have zero free-access concept today (`compile.ts` hardcodes `isFree: false` for all of them, and every `evaluatePracticeAccess` call site already defaults to `false` when a scenario isn't in the built-in catalog — `apps/web/src/app/api/attempts/route.ts:66`, `entry?.definition.isFree ?? false`). The new `scenarios.is_free` column defaults to `false` for every row, then the updated seed script immediately corrects the 3 free built-ins to `true` on the next `pnpm db:seed`. **The live entitlement check (`evaluatePracticeAccess`) was NOT changed to read this column** — it still reads the compiled `ScenarioDefinition.isFree` literal directly, exactly as before. The new column exists for querying/admin visibility only, so there is no risk of this migration silently changing who can play what.
- **Org-owned scenario with a colliding slug**: directly verified in the local dev DB that an organization-owned `database-connection-saturation` test-fixture row (unrelated `isFree: false` value) was correctly left untouched by the seed sync — the `targetWhere` clause on the upsert's conflict target scopes strictly to `ownership_type = 'incidentrank'` rows, matching the existing partial unique index exactly.

---

## 6. How existing linear incidents continue working

Nothing about how a linear incident's rules are evaluated, how its controls apply, how its success/failure conditions are checked, or how it scores changed in any way. `structure: "linear"` is read by zero engine code — it exists purely for future catalog filtering (not yet built — see §14/§17 "out of scope"). The full regression proof is the unmodified 3606-test scenario suite and 41-test simulator suite both passing unchanged after every edit in this phase.

---

## 7. How to author a new linear incident

No change from today's process — this phase adds nothing *required*. A new built-in scenario file still needs exactly: `difficulty`, `estimatedMinutes`, `isFree`, and now one more literal, `structure: "linear"`, immediately followed by `simulation: ...`. An org-authored scenario via the sectioned editor needs no new fields at all (`structure` defaults to `"linear"` if omitted).

## 8. How to author a branching incident

Set `structure: "branching"` (built-in literal) or leave the authoring UI's new structure field as "Branching" (once a form control for it is added — see §17 "out of scope," the sectioned editor's UI for these new fields was not built in this infrastructure pass). Mechanically: author multiple `rules` whose `when` conditions key off *different candidate control choices* from the same starting state — e.g. the existing Payment Retry Storm's 4 "Paths A-D" in `packages/scenarios/src/payment-retry-storm/rules.ts` is already a working branching incident in every way except its `structure` literal (which is correctly `"linear"` today, since its actual authored shape is a single primary path with variants, not independently meaningful branches — a judgment call for whichever scenario becomes the first real `"branching"`-tagged one).

## 9. How to author a parallel incident

Author `architecture.nodes` for each independent component, tag each relevant `AuthoredControl`/built-in `ControlDefinition` with the right `componentId`, and write rules whose `when` conditions combine trigger/control state across more than one component's signals — e.g. "Payment retries are elevated AND Redis connection usage is critical" as a single rule's joint condition, or two independently-matching rules that both key off the same shared trigger. Tag the relevant metrics with `roleInIncident: "root_cause"` / `"downstream_symptom"` / `"context"` / `"noise"` so the post-incident narrative can explain the correlation afterward. This is exactly the design for the pending reference incident (§17 of the original plan, not yet built).

## 10. How to author a cascading incident

Use `timedEvents` to set an initial trigger at `atMs: 0` (or shortly after), then a second `timedEvents` entry at a later `atMs` whose own `setTriggers` represents the downstream consequence, with a rule matching on the combination. Since `timedEvents` are purely wall-clock-offset-driven (not conditioned on earlier rule outcomes), a fully reactive cascade (B only happens if A was never mitigated) requires a rule whose `when` includes both the later trigger AND the relevant control/trigger state proving A was never addressed — fully expressible with existing primitives, no engine change needed.

---

## 11. How scoring works for multi-service incidents

**Unchanged from today — by deliberate decision, not an oversight.** No new scoring measure was added. `packages/scenarios/src/authoring/score.ts`'s own existing doc comment states the scorer is deliberately "generic over ANY string-valued state field any scenario authors, never a dedicated measure for one scenario's specific concept" (the existing precedent is Kafka Partition Skew's `orderingMode` tradeoff, scored via the existing `finalStringEquals` measure). Adding a named `investigationOrderScore` measure (considered during planning) was rejected during implementation as contradicting this existing convention.

Concretely, to score investigation order/prioritization for a multi-service incident: the scenario author writes an explicit rule that sets a state value (e.g. `diagnosisPath: "correlated-first" | "redis-first" | "guessed"`) based on the sequence of controls/triggers the candidate actually exercised, then scores that value with the existing `finalStringEquals` measure against author-chosen point bands — the same mechanism every tiered-outcome scenario already uses. `roleInIncident` tags help the *author* reason about which paths are strong/weak while writing those rules; the scorer itself has zero knowledge of `roleInIncident` and never reads it. This directly satisfies the instruction that investigation order, prioritization, risky actions, remediation, and verification remain intentionally authored, never auto-derived.

---

## 12. How the Staff reference incident works

**Not built in this pass.** Per your explicit instruction ("Only after those pass, create exactly ONE Staff-level parallel reference incident" / "Do not start creating new incident content before the infrastructure is complete"), this was intentionally held back so the infrastructure itself could be reviewed first. The design remains as specified in `phase10f.md` §17 (Checkout/Payment/Inventory/Redis, 4 components, 6+ metrics, misleading-healthy Checkout signal, Redis connection saturation as the non-obvious root cause) — ready to build once you confirm the infrastructure looks right.

---

## 13. How free incidents are configured

A built-in scenario's `isFree` literal (unchanged mechanism) is the sole source of truth read by `evaluatePracticeAccess`. The new `scenarios.is_free` DB column is a read-only mirror, kept in sync by `pnpm db:seed`, intended for future admin-portal querying/visibility (§13 of the original spec: "the content/admin layer should allow us to choose which incident is currently free") — **wiring an actual admin UI to toggle this is out of scope for this phase** (see §17 below); today it only reflects whatever the code literal already says. Verified live: querying the local dev DB after `pnpm db:seed` shows `kafka-consumer-lag`, `payment-retry-storm`, and `database-connection-saturation` as `is_free = true`, all 97 others `false`.

---

## 14. How weekly content can be queried/organized

The `scenarios` table can now be filtered by `structure`, `domain`, `is_free`, `status` (pre-existing), and `release_week`/`published_at` (new, currently unset on every row — no built-in scenario has been assigned a release week, since none existed before this phase and assigning them is an editorial act, not something this infrastructure pass should do unilaterally). No runtime code enforces the "3 per level per week" editorial ratio anywhere, per the explicit instruction not to hard-code it.

---

## 15. Test/lint/typecheck/build results

- `pnpm typecheck` — clean across all 5 workspace packages (simulator, scenarios, db, scoring, web).
- `pnpm lint` — clean across all 5 workspace packages.
- `packages/simulator` test suite — 41/41 passing, unchanged.
- `packages/scenarios` test suite — 3614/3614 passing (3606 pre-existing + 8 new: 5 narrative tests, 3 compile backward-compat tests).
- `apps/web` test suite (`--pool=forks --poolOptions.forks.singleFork`) — 705/708 passing. The 3 failures (`attempts-list.test.tsx`, a `NEXT_REDIRECT` from `enforceLegalGate`) are a pre-existing, unrelated flake — reproduced identically with every Phase 10F change stashed out via `git stash`, confirming they are not caused by this work.
- `pnpm build` — succeeds, no errors.
- `pnpm db:migrate` — applied cleanly to the local dev database.
- `pnpm db:seed` — idempotent re-run confirmed; live-queried the resulting rows to verify `isFree`/`structure`/`domain` sync correctly, including confirming an unrelated org-owned same-slug row was correctly left untouched.

---

## 16. Known limitations / design notes

- **`roleInIncident` placement was corrected mid-implementation.** The original plan proposed tagging both `AuthoredRule` and `AuthoredMetric`. During implementation, reading `packages/simulator/src/types.ts`'s `Rule` type (the built-in-scenario engine type, deliberately never touched by this phase) confirmed built-in scenarios have no authored-rule-level metadata surface at all — only `packages/scenarios`' `CandidateUIDescriptor` is shared by both built-in and org-authored scenarios. The final design centers `roleInIncident` on metrics (`AuthoredMetric`/`CandidateMetricDescriptor`), which works identically for both scenario kinds; `AuthoredRule.roleInIncident` was kept as an available, currently-unconsumed optional field on the org-authored schema only, since dropping it provided no simplification once it was already written and typechecked, and it costs nothing (never read by anything, never required). If this extra, currently-inert field is unwanted, it can be removed without any migration (it's a TypeScript type, not a DB column).
- **The narrative UI is intentionally plain.** Each entry renders as `"Label: value"` joined by " · " — no per-metric `format` (percentage/currency/duration) is applied, since threading that through the API DTO would have widened the response shape for a first pass. Worth revisiting once the reference incident shows what the narrative actually needs to look like in practice.
- **No admin UI exists yet** for setting a scenario's `structure`/`domain`/`primarySkill`/`secondarySkills`/`releaseWeek`/`publishedAt`, or for toggling `isFree` through the DB column rather than code. The sectioned scenario editor (`apps/web/src/app/organizations/[slug]/scenarios/[scenarioId]/edit/sections/`) was not touched in this pass.
- **No scenario yet uses `"branching"`, `"parallel"`, or `"cascading"`** — every existing scenario is correctly `"linear"`. The reference incident (not yet built) will be the first real exercise of the non-linear structures.

---

## 17. Recommended scope for Phase 10G

1. Build the one Staff-level parallel reference incident (this phase's final, deliberately-deferred step).
2. Add form fields for `structure`/`domain`/`primarySkill`/`secondarySkills` to the sectioned scenario editor, and a `roleInIncident` picker on the metrics section.
3. Build a minimal admin surface for setting `isFree`/`releaseWeek`/`publishedAt` on a built-in scenario without a code deploy (currently requires editing the TypeScript literal and redeploying).
4. Revisit the narrative UI's value formatting once real narrative content from the reference incident is available to look at.
5. Everything explicitly out of scope per the original spec remains out of scope: automatic weekly-15 generation, a publishing scheduler, a generic workflow/graph engine, a graph database, a large topology visualization library, an enterprise assessment builder, a CMS rewrite, an incident marketplace, automatic adaptive interviews.
