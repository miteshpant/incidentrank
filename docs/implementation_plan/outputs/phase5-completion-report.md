# Phase 5 Completion Report — Scenario Authoring

Status: **Complete**, with one disclosed, deliberate privacy limitation (item 16) and a handful of UX/product gaps (item 27). Per the spec's explicit instruction, Phase 6 has not been started.

## 1. Files created or modified

### `packages/scenarios` (modified + new `authoring` subpackage)
- `src/types.ts` — `ScenarioDefinition` gained a required `version: number` field, authoritative for source-controlled scenarios.
- `src/payment-retry-storm.ts`, `src/db-connection-saturation.ts` — `version: 1` added to each.
- `src/db-connection-saturation.ts` (+ `src/db-connection-saturation.test.ts`, 7 tests) — a second, deliberately simple built-in scenario added purely to prove the simulator is genuinely scenario-agnostic (no Payment-Retry-Storm-specific assumptions survived from Phase 1–4.1) before authoring was built on top of it.
- `src/candidate-ui.ts` (new) — shared `CandidateUIDescriptor` / `CandidateMetricDescriptor` / `CandidateControlDescriptor` / `CandidateComponentDescriptor` types: the candidate-display-metadata shape every scenario (built-in or authored) now produces.
- `src/payment-retry-storm/candidate-ui.ts` (new) — `paymentRetryStormCandidateUI`, a hand-written descriptor matching the pre-Phase-5 hardcoded UI exactly (regression-safe migration, not a new design).
- `src/index.ts` — exports the above.
- `package.json` — added an `exports` map with a `"./authoring"` subpath so `apps/web` can import the authoring subpackage without it leaking into the main `@incidentrank/scenarios` surface.
- `src/authoring/schema.ts` (new) — the full `AuthoredScenario` type tree (9 data sections; "Preview & Publish" is UI-only and has no data-schema counterpart).
- `src/authoring/errors.ts` (new) — `AuthoredScenarioValidationError { path, message }`, `AuthoredScenarioValidationException`.
- `src/authoring/validate.ts` (new) — `validateAuthoredScenario()`.
- `src/authoring/compile.ts` (new) — `compileAuthoredScenario()`.
- `src/authoring/score.ts` (new) — `scoreAuthoredAttempt()`.
- `src/authoring/candidate-ui.ts` (new) — `authoredScenarioToCandidateUI()`.
- `src/authoring/fixtures.ts` (new) — `blankAuthoredScenario()` template and shared test fixtures.
- `src/authoring/validate.test.ts` (15 tests), `src/authoring/compile.test.ts` (5 tests), `src/authoring/score.test.ts` (5 tests) — new.
- `src/authoring/index.ts` (new) — barrel export for the subpackage.

### `packages/db` (modified)
- `src/schema.ts` — new enums `scenarioOwnershipTypeEnum` ("incidentrank" | "organization"), `scenarioVisibilityEnum` ("public" | "private"), `scenarioStatusEnum` ("draft" | "published" | "archived"), `scenarioVersionStatusEnum` ("draft" | "published"). `scenarios` table: removed its `version` column entirely; added `ownershipType`, `organizationId` (FK, nullable), `visibility`, `status`, `createdByUserId` (FK, set-null), `updatedAt`; unique index changed from `scenarios_slug_version_idx` to `scenarios_slug_idx`. New `scenario_versions` table: `id`, `scenarioId` (FK, cascade), `version`, `definitionJson` (jsonb), `status`, `createdByUserId` (FK, set-null), `createdAt`/`updatedAt`/`publishedAt`; unique on `(scenarioId, version)`. Added a code comment on `attempts` clarifying that `scenarioId` + `scenarioVersion` pinning now resolves differently depending on the referenced scenario's `ownershipType`.
- `src/relations.ts` — added `scenarioVersionsRelations`; extended `scenariosRelations` with `versions`, `organization`, `createdBy`; extended `organizationsRelations` with `scenarios`.
- `src/types.ts` — added `ScenarioVersion` / `NewScenarioVersion` exports.
- `src/seed.ts` — Payment Retry Storm's seed insert updated to the new columns (`ownershipType: "incidentrank"`, `visibility: "public"`, `status: "published"`); `version: 1` removed (no longer a `scenarios` column).
- `src/schema.test.ts` — assertion updated from `row?.version` to `row?.ownershipType`; two fixtures now hardcode `scenarioVersion: 1` with an explanatory comment, since the DB row itself no longer carries a version number.
- `drizzle/0003_yielding_lady_vermin.sql` (new) — the generated+applied migration implementing all of the above.

### `apps/web/src/lib/server` (modified + new)
- `scenario-registry.ts` (modified) — `resolveSimulationDefinition()` is now async and branches by the scenario's `ownershipType` instead of a static `(slug, version)` lookup table; `getActiveScenarioBySlug` / `getActiveScenarioById` now return `ScenarioWithVersion = Scenario & { version: number }`; `getActiveScenarioById` gained an optional `organizationId` parameter for strict same-organization, published-only resolution; `listAssessableScenarios(organizationId?)` now includes the calling organization's own published scenarios alongside built-ins. A new `resolveCurrentVersion()` helper centralizes the ownership branch.
- `scenario-access.ts` (new) — `loadOrgScenario()` (the privacy boundary for every authoring route, mirroring `loadOrgAssessment`), `listScenarioVersions()`, `getDraftVersion()`, `getLatestPublishedVersion()`, `listOrgAssessableScenarios()`.
- `scenario-authoring.ts` (new) — `createOrgScenario()`, `saveScenarioDraft()`, `publishScenarioDraft()`, `createNewDraftFromPublished()`, `archiveScenario()`.
- `scenario-authoring.test.ts` (new, 24 tests), `attempt-resume.test.ts` (modified, +1 test) — see item 18.
- `load-owned-attempt.ts` (modified) — now loads the `scenario` relation; return type widened to `OwnedAttempt = Attempt & { scenario: Scenario }` (needed so the completion route can branch scoring by ownership type).

### `apps/web/src/app/api/organizations/[slug]/scenarios` (new)
- `route.ts` — `POST` (create, from `blankAuthoredScenario()`, 409 on slug collision), `GET` (list the org's own scenarios).
- `[scenarioId]/route.ts` — `GET` (scenario + versions), `PATCH` (`action: "save_draft" | "archive"`).
- `[scenarioId]/publish/route.ts` — `POST` publish.
- `[scenarioId]/edit/route.ts` — `POST` create-new-draft-from-published.

### `apps/web/src/app/api` (modified)
- `organizations/[slug]/assessments/route.ts` — passes `membership.organization.id` into `getActiveScenarioById()`.
- `assessment/[assessmentId]/route.ts` — preview payload extended with `scenarioName` / `scenarioDifficulty` / `scenarioEstimatedMinutes` via a new `loadCandidateSafeScenarioMeta()` helper.
- `assessment/[assessmentId]/scenario/route.ts` (new) — the candidate-safe simulation payload endpoint (see item 16).
- `attempts/[attemptId]/complete/route.ts` (modified) — added a `scoreAttempt()` helper branching by `attempt.scenario.ownershipType` (see item 15).

### `apps/web/src/app/organizations/[slug]` (new authoring UI + modified pages)
- `org-dashboard.tsx` (modified) — added a "Scenarios" link button.
- `scenarios/scenario-list.tsx`, `scenarios/create-scenario-form.tsx`, `scenarios/page.tsx`, `scenarios/new/page.tsx` (new) — list + create flow.
- `scenarios/[scenarioId]/edit/page.tsx`, `scenarios/[scenarioId]/edit/scenario-editor.tsx` (new) — the authoring editor shell (see item 6).
- `scenarios/[scenarioId]/edit/sections/*.tsx` (new, 9 files: `basics-section.tsx`, `architecture-section.tsx`, `controls-section.tsx`, `initial-state-section.tsx`, `metrics-section.tsx`, `timeline-events-section.tsx`, `rules-section.tsx`, `success-failure-section.tsx`, `scoring-section.tsx`, plus shared `section-errors.tsx`) — one component per authoring section.
- `scenarios/[scenarioId]/edit/sections/preview-publish-section.tsx` (new) — section 10 (UI-only; validity summary + Preview link + Publish button).
- `scenarios/[scenarioId]/preview/page.tsx`, `scenarios/[scenarioId]/preview/preview-console.tsx` (new) — author preview mode (see item 13).
- `assessments/[assessmentId]/assessment-detail.tsx` (modified) — fixed a pre-existing Phase 4 bug where the scenario name was a hardcoded `"Payment Retry Storm"` literal; now fetched dynamically.
- `assessments/new/page.tsx` (modified) — passes the organization id into `listAssessableScenarios()`.

### `apps/web/src/components/scenario-console` (new generic components)
- `metrics-panel.tsx`, `component-panel.tsx`, `timeline-panel.tsx`, `candidate-ui-format.ts` (new) — `GenericMetricsPanel`, `GenericComponentPanel`, `GenericTimelinePanel`, driven entirely by a `CandidateUIDescriptor` instead of hardcoded Payment-Retry-Storm field lists.

### `apps/web/src/app/assessment/[assessmentId]` (modified)
- `assessment-console.tsx` — rewritten to accept `simulation` / `candidateUI` / `scenarioSlug` / `scenarioName` as props (fetched dynamically by the parent) instead of importing Payment Retry Storm directly; renders the new Generic* components.
- `assessment-landing.tsx` — fetches `/api/assessment/[assessmentId]/scenario` in parallel with the existing preview fetch; scenario name/difficulty/estimated-minutes are now dynamic instead of hardcoded.
- `assessment-result-screen.tsx` — rewritten to render a server-supplied `serverScore` prop; no longer calls `scorePaymentRetryStormAttempt()` client-side (a real, pre-existing privacy/correctness bug — see item 16).

### `apps/web/src/lib` (modified)
- `attempt-persistence.ts` — `completeAttemptRecord()` now returns `Promise<ServerScoreResult | null>` instead of `Promise<void>`.
- `use-incident-attempt.ts` — added `serverScore` state, populated only from `completeAttemptRecord()`'s response, exposed on `IncidentAttempt`, reset in `resetAttempt()`.

### `docs/architecture.md` (modified)
- See item-by-item breakdown below; "Phase 5 scope" section added documenting the ownership/versioning/lifecycle model and the candidate-safe-payload limitation, per the spec's explicit documentation requirement.

## 2. DB/schema changes

Summarized in item 1; full detail in item 3/4. One migration: `packages/db/drizzle/0003_yielding_lady_vermin.sql`, applied to local Postgres. No data loss: the single pre-existing `scenarios` row (Payment Retry Storm) was migrated in place to the new column set; its implicit "version 1" became `ScenarioDefinition.version = 1` in source rather than a stored column.

## 3. Scenario ownership model

```ts
scenarios {
  id
  slug
  name
  isActive
  ownershipType: "incidentrank" | "organization"
  organizationId: uuid | null     // set iff ownershipType === "organization"
  visibility: "public" | "private"
  status: "draft" | "published" | "archived"
  createdByUserId: uuid | null
  createdAt, updatedAt
}
```

`ownershipType: "incidentrank"` scenarios (currently Payment Retry Storm and Database Connection Saturation) are source-controlled TypeScript (`packages/scenarios`), always `visibility: "public"`, never have an `organizationId`. `ownershipType: "organization"` scenarios are DB-authored, always `visibility: "private"`, always scoped to exactly one `organizationId`. `loadOrgScenario()` enforces this as a hard privacy boundary: a row is only ever reachable through an organization's own authoring routes if `ownershipType === "organization" && organizationId === <that organization>` — a built-in scenario can never be loaded through this path, and another organization's scenario can never be loaded through it either, by construction (confirmed by the cross-org privacy tests in item 18).

## 4. Scenario versioning model

This went through two rounds of explicit design correction before landing on the final shape (see the architecture doc's "Scenario Versions" section for full reasoning). The final model:

- **`scenarios` carries no version concept at all.** It is a stable identity record only.
- **Built-in scenarios**: `ScenarioDefinition.version: number` (in `packages/scenarios` source) is the sole authoritative version source. Bumping it is a source-code change, reviewed like any other code change.
- **Organization-owned scenarios**: `scenario_versions.version` (DB) is the sole authoritative version source. `scenario_versions(scenarioId, version)` is unique.
- **No synchronization between the two.** The resolver (`resolveCurrentVersion()` / `resolveSimulationDefinition()` in `scenario-registry.ts`) explicitly branches on the referenced scenario's `ownershipType` rather than unifying both cases behind one storage shape. Fake `scenario_versions` rows are deliberately never created for built-in scenarios — that would blur the distinction between code-owned and DB-authored content for no real benefit.
- `attempts.scenarioVersion` / `assessments.scenarioVersion` remain plain integers (not foreign keys into `scenario_versions`), exactly as before Phase 5. What that integer *means* now depends on the referenced scenario's `ownershipType` — resolved at read time, not by schema shape.

## 5. Draft/published/archive lifecycle

- A scenario and its first `scenario_versions` row (`version: 1`, `status: "draft"`) are created together by `createOrgScenario()` — there is never a scenario with zero versions.
- A scenario has **at most one draft at a time** (enforced by `createNewDraftFromPublished()` refusing if a draft already exists, not by a DB constraint).
- `saveScenarioDraft()` only ever updates the row where `status === "draft"` — a published row is never touched by it structurally (there is no code path that calls it against a published row's id, since the editor only ever has a draft loaded in editable mode).
- `publishScenarioDraft()`: re-validates, re-compiles (belt-and-suspenders — a definition that validates but somehow fails to compile can never be published), then atomically (within the single request) flips the `scenario_versions` row to `status: "published"` + stamps `publishedAt`, and flips the `scenarios` row to `status: "published"`. The `WHERE status = 'draft'` guard on the update means a double-publish race can never silently re-stamp an already-published row.
- `createNewDraftFromPublished()` ("Edit" on a published scenario): inserts a new `scenario_versions` row at `version: latestPublished.version + 1`, seeded from the published row's `definitionJson`, `status: "draft"`; flips the scenario's `status` back to `"draft"`. The previously-published row is never mutated.
- `archiveScenario()` sets `scenarios.status = "archived"`. It does not touch `scenario_versions` rows at all — existing assessments/attempts still resolve their pinned version normally; only `listOrgAssessableScenarios()` (new-assessment selection) excludes archived scenarios.

## 6. Authoring UI structure

`/organizations/[slug]/scenarios` (list: drafts/published/archived, grouped, "Create Scenario" CTA gated by `canMutate(role)`) → `/organizations/[slug]/scenarios/new` (name+slug form, auto-slugify) → `/organizations/[slug]/scenarios/[scenarioId]/edit`.

The edit page is a single `ScenarioEditor` client component rendering all 10 spec-recommended sections in one scrollable page (no multi-step wizard — all sections always visible, consistent with "allow navigation between sections" without over-building). State: `sourceVersion = draft ?? latestPublished`; `isReadOnly = !draft`. When a draft exists, the full form is editable and autosaves (debounced 600ms) via `PATCH .../scenarios/[scenarioId]` with `action: "save_draft"`. When no draft exists (viewing a published scenario with nothing in progress), the identical 10-section view renders fully populated but `disabled` throughout, with a "Published vN (read-only)" header, an explanatory banner, and — only for owner/admin — an "Edit (create vN+1 draft)" button. This read-only rendering is what satisfies the spec's "member → view published scenario details" requirement without a second, parallel read-only view to maintain.

Each section receives `authored`, `errors` (filtered to that section's `path` prefix), `disabled`, and `onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void` — a functional-updater, not a direct-value setter (see item 26 for why this mattered). Section 10 (`PreviewPublishSection`) shows live validation status, a count of outstanding errors, an unconditional "Preview Scenario" link, and a "Publish" button shown only when `canEdit && !isReadOnly`.

## 7. Authored scenario schema

`AuthoredScenario` (`packages/scenarios/src/authoring/schema.ts`), a plain serializable object tree with 9 sections matching the spec's sections 1–9 exactly (section 10 is UI-only, not part of the data schema):

```ts
AuthoredScenario {
  basics: { name, slug, description, difficulty, estimatedMinutes, candidateInstructions? }
  architecture: { nodes: {id,label,type}[], edges: {from,to,label?}[] }
  controls: AuthoredControl[]       // key, label, type: "select"|"toggle", allowedValues, initial, componentId
  initialState: Record<string, AuthoredStateValue>
  metrics: AuthoredMetric[]         // label, stateKey, format
  timelineEvents: AuthoredTimelineEvent[]   // atMs, label, setValues?, setTriggers?
  rules: AuthoredRule[]             // id, when: condition[], then: effect[]
  successCondition: AuthoredOutcomeCondition
  failureCondition: AuthoredOutcomeCondition
  scoring: { dimensions: AuthoredScoringDimensionConfig[] }
}
```

Notable deliberate restrictions, each reflecting a genuine simulator constraint rather than an arbitrary authoring limitation:
- `AuthoredControl.componentId: string` — a candidate-UI grouping hint only; it has no engine meaning, used solely so `authoredScenarioToCandidateUI()` can group controls under architecture components the same way the hardcoded Payment Retry Storm UI always did.
- `AuthoredRuleConditionOperator = "equals" | "at_most" | "at_least"` for rule `when` conditions (deliberately no `not_equals`: the simulator's rule-matching has no native bucket for it). `AuthoredStateCondition` (success/failure conditions only, a separate and broader type) supports the full `equals | not_equals | less_than | less_than_or_equal | greater_than | greater_than_or_equal` set the spec asks for, because success/failure evaluation is a different, more general engine mechanism than rule matching.
- Rule `when` conditions are restricted to `AuthoredTriggerCondition | AuthoredControlCondition` (trigger state or control values only) — never direct `values` access — mirroring the simulator's actual `Rule` matching contract (it matches on triggers+controls, then supplies an authored `values` snapshot as the consequence).

## 8. Compiler/validation design

- `validateAuthoredScenario(authored): AuthoredScenarioValidationError[]` — pure, structural, never throws, always returns `{path, message}` pairs. Checks: basics completeness, architecture node/edge integrity, controls (unique key, non-empty allowed values, initial value is among allowed values, `componentId` references a real architecture node), initial state keys are well-formed, metrics reference real state keys, timeline event effects reference real state/trigger keys, rules (unknown control/state references, unsupported operators, and — per the spec's "do not allow undefined state" requirement — a required fallback/default rule check), success/failure conditions reference real keys and supported operators, scoring (dimension weights sum to exactly 1000, each dimension has exactly one fallback band with no `atMost` bound as its last band).
- `compileAuthoredScenario(raw: unknown): CompileAuthoredScenarioResult` — validates first, then (only if valid) constructs a `ScenarioDefinition`. Deliberately **never includes `scoring` in its compiled output** — this is privacy-by-construction, not a separate filtering step: the compiled definition that gets sent anywhere (browser or otherwise) structurally cannot carry scoring bands, because the compiler never puts them there in the first place.
- Both functions live in `packages/scenarios/src/authoring/` — no React, no Clerk, no DB dependency, per the spec's explicit requirement, so they can be (and are) unit tested in total isolation and reused identically by the publish route, the preview route, and the test suite.
- One documented, bounded compilation gap: Phase 5's authoring sections have no dedicated cost/action-classification editor, so compiled authored scenarios always get `severityFields: []`, `numericWatchFields: []`, `revenueLossRatePerMinute: {}`, `infrastructureCost: { baselineMonthlyUsd: 0, perUnitMonthlyUsd: {} }`, `actionClassifications: []`. This is why `scoreAuthoredAttempt()` (item 12) computes `costEfficiency` from a peak-cost-increase ratio against this zeroed baseline rather than real infrastructure cost modeling — acceptable for Phase 5's scope (no cost/billing authoring was requested), but a real gap if a future phase wants authored scenarios to express genuine cost tradeoffs.

## 9. Rule condition model

`AuthoredRule { id, when: AuthoredRuleCondition[], then: AuthoredRuleEffect[] }`. `when` is an implicit AND of a discriminated union:

```ts
AuthoredTriggerCondition  { source: "trigger", key, operator: "equals", value: boolean }
AuthoredControlCondition { source: "control", key, operator: "equals"|"at_most"|"at_least", value }
```

No string eval, no JavaScript, no arbitrary expressions — exactly the spec's "no code" constraint. The rules-authoring UI (`sections/rules-section.tsx`) shows rules as an explicit, numbered, reorderable list (Move Up/Move Down, never automatic reordering) with the spec's own guidance text ("more specific rules should usually appear before broader fallback rules") surfaced directly in the UI.

## 10. Rule effect model

`AuthoredRuleEffect` sets an authored `values` snapshot as the consequence when a rule's `when` conditions match — i.e. "set state value(s)," matching the spec's requested effect set and the existing `Rule` engine contract exactly (no increment-by-delta or severity-only effect types were added beyond what the existing engine already supports, per the spec's "prefer the smallest set required by current engine capabilities").

## 11. Success/failure configuration

`AuthoredOutcomeCondition { conditions: AuthoredStateCondition[], sustainedSeconds: number }`, where `AuthoredStateCondition { source: "value"|"trigger", key, operator, comparedTo }` supports the full six-operator set the spec lists. The authoring UI (`sections/success-failure-section.tsx`) renders separate editors for Success and Failure, each with an add/remove condition list and a "must remain true for (seconds)" field — directly matching the spec's worked example (`checkoutSuccessRate >= 95 AND p99Latency <= 3000`, sustained 30s).

## 12. Scoring configuration

Spec's **Option B** (scenario-authored scoring bands over IncidentRank's fixed dimensions), chosen because it maps cleanly onto the existing `packages/scoring` architecture without requiring arbitrary formula scripting.

```ts
AuthoredScoringDimensionConfig {
  dimension: "recovery"|"customerImpact"|"dataIntegrity"|"reliability"|"costEfficiency"|"operationalEfficiency"
  maxPoints: number
  bands: AuthoredScoringBand[]   // { atMost?: number, points: number } — last band has no atMost (fallback)
}
```

Validation enforces `sum(maxPoints) === 1000` and exactly one fallback band per dimension, matching the spec exactly. `scoreAuthoredAttempt(config, inputs)` measures each of the six fixed dimensions the same way Payment Retry Storm's existing scorer conceptually does (recovery → elapsed seconds to resolution, customerImpact → revenue loss USD, dataIntegrity → currently always `0`, matching Payment Retry Storm's own documented limitation rather than inventing new semantics, reliability → ratio of time spent in a critical state, costEfficiency → peak-cost-increase ratio against the zeroed baseline noted in item 8, operationalEfficiency → count of harmful configuration changes), then applies the first band whose `atMost` the measured value satisfies. The authoring UI (`sections/scoring-section.tsx`) shows a running `total / 1000` with pass/fail coloring and per-dimension band editors (add/remove bands, the fallback band always pinned last and non-removable).

## 13. Preview implementation

`/organizations/[slug]/scenarios/[scenarioId]/preview` — any org member may open it (no `canMutate` gate; confirmed intentional, matching the spec's "member → view published scenario details"). Server component resolves `draft ?? latestPublished`, compiles it via `compileAuthoredScenario()`, and shows a compile-error fallback UI if invalid rather than crashing. `PreviewConsole` runs the compiled scenario through `useIncidentAttempt(simulation, scenarioSlug, isSignedIn: false)` — the exact same mechanism anonymous practice play already used to guarantee zero persistence, so preview runs never create an attempt row, never touch the leaderboard, and never appear in candidate practice history, per the spec's explicit "must not create candidate assessment results... must not affect leaderboard" requirement. An orange "AUTHOR PREVIEW — NOT SCORED, NOT PERSISTED, NOT VISIBLE TO CANDIDATES" banner is always shown. A debug panel (author-only, never reachable by candidates since it only exists on this author-only route) shows the matched rule id, the resulting incident state, and a live `scoreAuthoredAttempt()`-computed preview score — scoring bands are deliberately sent to this specific page, since it is the organization's own authors previewing their own scenario, not a candidate-facing surface, so this is not a violation of the candidate-privacy boundary in item 16.

## 14. Publishing implementation

`POST /api/organizations/[slug]/scenarios/[scenarioId]/publish` → `publishScenarioDraft()` (item 5). On success, the newly published version immediately becomes eligible for `listOrgAssessableScenarios()` / the organization's assessment-creation scenario selector. On failure (`invalid`), the API returns the full `AuthoredScenarioValidationError[]` list, which the UI surfaces per-section (each section only shows errors whose `path` falls under it) rather than as one opaque failure message — matching the spec's worked error-message examples (`Control "retries" has no initial value.`, `Rule 4 references unknown control "retryCount".`, etc.) in spirit, though the exact wording is generated structurally from the validator rather than hand-authored to match those exact strings.

## 15. Assessment integration

`listAssessableScenarios(organizationId?)` (`scenario-registry.ts`) returns built-in public scenarios plus — when an `organizationId` is supplied — that organization's own scenarios with `status === "published"`, via `listOrgAssessableScenarios()`. Drafts, archived scenarios, and other organizations' scenarios are excluded by the query itself (`eq(scenarios.status, "published")`, `eq(scenarios.organizationId, organizationId)`), not by UI-side filtering — so a direct API call attempting to bypass the UI filter hits the same restriction (confirmed in Manual Flow E, see item 24). Assessment creation pins `scenarioVersion` to the scenario's current version at creation time, exactly as Phase 4 already did; the only change is that "current version" is now resolved by `resolveCurrentVersion()`'s ownership branch instead of unconditionally reading a `scenarios.version` column. At assessment runtime, `getActiveScenarioById()` additionally accepts an `organizationId` for strict re-verification (published, same org) before resolving an org-owned scenario's simulation definition — a defense-in-depth check beyond the selector-time filtering.

## 16. Candidate-safe payload strategy

**This is a disclosed, deliberate limitation, not a secure implementation — do not read the rest of this section as "candidate security was solved."**

Per explicit user direction, Phase 5 keeps the existing client-side simulation architecture so both built-in and organization-authored scenarios run through the identical client-side execution model (no new engine, no special-casing authored scenarios in the browser runtime). Within that constraint:

- **What is kept server-side**: scoring bands and dimension weights (`AuthoredScoringDimensionConfig`) are never compiled into the `ScenarioDefinition` at all (item 8) — scoring is computed exclusively server-side, branched by `ownershipType`, in `/api/attempts/[attemptId]/complete` (item 17). Author notes and any other authoring metadata not needed for client-side execution are also never sent — `/api/assessment/[assessmentId]/scenario` returns only `{ simulation, scenarioSlug, candidateUI }`, never the raw `AuthoredScenario` document.
- **What candidate browsers can currently inspect** (because the client-side simulator needs it to run the incident at all): scenario rules (the full authored rule table, including conditions and effects), success/failure conditions and their thresholds, timed-event definitions, and any other simulation logic the client engine requires to execute deterministically. A sufficiently motivated candidate can read this directly out of the network response or browser memory.
- **This must be treated as a known assessment-integrity limitation.** Phase 5 does **not** claim hidden rules are protected from candidates. It is architecturally identical, in this respect, to how Payment Retry Storm's rules were already fully inspectable client-side since Phase 1 — Phase 5 generalizes that same (pre-existing) exposure to organization-authored scenarios rather than introducing a new one.
- **Named future architectural requirement**: **Server-authoritative simulation**, where candidate clients send actions and receive only resulting state/events, while rule definitions remain server-side at all times. This is explicitly out of scope for Phase 5 and is recorded here as a named requirement for a future phase, not an implied "someday" — see also `docs/architecture.md`'s Phase 5 section, which carries the identical wording.

## 17. Authorization/privacy

- **Organization-scoped authoring routes**: every one chains through `loadOrgScenario()` (item 3) — 404 if the scenario doesn't exist or belongs to a different organization/is built-in, 403 only reachable via the underlying `loadOrganizationMembership` check if the user isn't an org member at all.
- **Mutation gating**: `canMutate(role)` (owner/admin) gates scenario creation, draft save, publish, archive, and the "Edit (create new draft)" action, both in the UI (buttons hidden) and in the API routes (the authoritative check — UI hiding is convenience only). `member` can load the editor and view full published content (read-only) but never see mutation controls.
- **Candidate-side scoring privacy**: `/api/attempts/[attemptId]/complete`'s `scoreAttempt()` helper is the single place scoring bands are ever read for a signed-in attempt — it branches on `attempt.scenario.ownershipType`, loading `scorePaymentRetryStormAttempt` for built-ins or freshly loading the pinned `scenario_versions` row and calling `scoreAuthoredAttempt` for org-owned scenarios. The client never computes scoring itself for a server-round-tripped attempt (`assessment-result-screen.tsx` renders a server-supplied `serverScore` prop only) — this closes a real pre-existing Phase 3/4 bug (item 26) where the client called `scorePaymentRetryStormAttempt()` directly in the browser, which would have been fundamentally wrong (and would have leaked scoring bands) for any org-authored scenario.
- **Cross-org privacy**: verified independently three ways — UI listing exclusion (an org's scenario list/selector never queries another org's rows), direct URL access to another org's `[scenarioId]/edit` or `/preview` 404s, and direct `fetch()` calls from the browser console against another org's scenario API endpoints return 403/404 — all three confirmed live in Manual Flow E (item 24) and covered by three dedicated automated tests (item 18).

## 18. Tests added

| File | Tests |
|---|---|
| `packages/scenarios/src/db-connection-saturation.test.ts` | 7 |
| `packages/scenarios/src/authoring/validate.test.ts` | 15 |
| `packages/scenarios/src/authoring/compile.test.ts` | 5 |
| `packages/scenarios/src/authoring/score.test.ts` | 5 |
| `apps/web/src/lib/server/scenario-authoring.test.ts` | 24 |
| `apps/web/src/lib/server/attempt-resume.test.ts` (extended) | +1 (authored-scenario resume) |

**Total new tests: 57.**

`scenario-authoring.test.ts`'s 24 tests map directly onto the spec's "Tests" checklist: scenario creation, member permissions (read-only access, cannot edit/publish), cross-org privacy (3 tests: `loadOrgScenario` rejection, `listOrgAssessableScenarios` exclusion, `getActiveScenarioById` rejection), control validation, rule validation (unknown reference), operator validation, timed-event validation, success/failure validation, compilation, determinism, publish, invalid publish (leaves status `draft`), immutability (a `save_draft` call after publish never mutates the published row), new version (edit creates v2 without touching v1; a second draft is refused while one exists), assessment pinning (a v1-pinned assessment stays on v1 after v2 publishes), scenario selection (published-only, draft excluded), draft excluded (`getActiveScenarioById` returns null for a draft-only scenario), archive (excluded from the assessable list; an existing assessment still resolves its pinned version), candidate privacy (the compiled definition contains no `scoring` key and no `"maxPoints"`/`"bands"` substrings anywhere in its serialized form), and a Payment-Retry-Storm regression test (built-in resolution and scoring are unaffected by all of the above).

## 19. Total tests

`pnpm -r test`: **192 passed, 4 skipped** (pre-existing dev-only timeline suite, unrelated to Phase 5), **0 failed** — `packages/simulator` 20, `packages/db` 5, `packages/scenarios` 53 (+4 skipped), `packages/scoring` 15, `apps/web` 99.

## 20. Typecheck/lint/test/build results

- **Typecheck**: clean across all 5 packages (`packages/db`, `packages/simulator`, `packages/scenarios`, `packages/scoring`, `apps/web`).
- **Lint**: clean across all 5 packages.
- **Test**: 192 passed, 4 skipped, 0 failed.
- **Build**: `next build` succeeds. All new routes correctly registered, including the new dynamic API routes (`/api/organizations/[slug]/scenarios`, `.../[scenarioId]`, `.../[scenarioId]/publish`, `.../[scenarioId]/edit`, `/api/assessment/[assessmentId]/scenario`) and new pages (`/organizations/[slug]/scenarios`, `.../new`, `.../[scenarioId]/edit`, `.../[scenarioId]/preview`), all correctly rendered as dynamic or partial-prerender per their actual per-user/per-organization data dependency.

## 21. Manual Flow A result — Build Scenario

**Passed**, driven live end-to-end using "Database Connection Saturation" as the test scenario (architecture: Client → API → Postgres → Worker; controls: API Instances, DB Pool Size, Worker Concurrency, Timeout). Created the scenario, authored a full architecture + control set, an initial state, a timed degradation event, 3+ rules (including a required fallback rule), a success condition, a failure condition, and scoring bands totaling 1000 across all six dimensions. Validation correctly caught intermediate incomplete states (e.g. a missing fallback rule, an unreferenced control) with section-scoped error messages. Published v1 successfully; confirmed via direct Postgres query that `scenario_versions` held exactly one row with `status = "published"` and a non-null `publishedAt`, and `scenarios.status` had flipped to `"published"`.

## 22. Manual Flow B result — Preview

**Passed.** Ran the published scenario through `/preview` as the author. Drove a beneficial control path (matching the scenario's recovery rule) and confirmed the authored consequence (state transition + candidate-visible metric change) occurred exactly as authored, with the author-only debug panel correctly showing the matched rule id and resulting state. Separately drove a deliberately harmful control combination and confirmed the failure condition triggered after its authored sustained-duration threshold, not instantly — matching the authored `sustainedSeconds` value exactly. Confirmed via the Network tab that no attempt record was created and no request to any persistence/leaderboard endpoint fired during either preview run.

## 23. Manual Flow C result — Assessment

**Passed.** Created an assessment against the organization's own published scenario, invited a candidate (real `+clerk_test` account, not a mocked identity), and completed the full candidate flow through the browser: briefing → live incident console (architecture/metrics/controls rendered via the Generic* components, driven by the scenario's `CandidateUIDescriptor`, not any hardcoded Payment-Retry-Storm UI) → decisions with reasoning → resolution. The hiring-manager-facing assessment detail page correctly showed the candidate's server-computed score, full timeline, and reasoning text. Confirmed via direct Postgres query that the score shown in the UI matched `attempts.score` exactly, and that it had been written by the `scoreAuthoredAttempt()` branch (not the Payment Retry Storm branch) of `scoreAttempt()`.

## 24. Manual Flow D result — Versioning

**Passed.** Starting from the Flow A scenario's published v1: created an assessment against it (pinning `scenarioVersion: 1`), then edited the scenario (creating a v2 draft via "Edit (create vN+1 draft)"), changed a rule's threshold, and published v2. Confirmed via Postgres that the original assessment's `scenarioVersion` column remained `1` and that its resolution (`resolveSimulationDefinition`) still compiled the original v1 `definitionJson`, unaffected by v2's publish. A newly created assessment against the same scenario correctly defaulted to v2 (confirmed by its `scenarioVersion` column reading `2` and its resolved rule threshold matching the v2 edit).

## 25. Manual Flow E result — Privacy

**Passed**, verified via a combination of live two-organization browser testing and direct API-bypass attempts (mirroring the methodology used for the member-role gap-closure this phase also required). With Org A's scenario published and private: Org B's scenario list never showed it (query-level exclusion, not client-side filtering); a direct URL to Org A's `[scenarioId]/edit` or `/preview` from an Org-B-authenticated session returned 404; a direct `fetch()` call from the browser console (while signed in as an Org B member) against Org A's scenario API endpoints (`GET .../scenarios/[scenarioId]`) returned 404; and Org B's own assessment-creation scenario selector never listed Org A's scenario as a selectable option. All four checks are additionally covered by the three dedicated cross-org-privacy automated tests in `scenario-authoring.test.ts` (item 18), so this behavior is regression-protected, not solely manually verified.

## 26. Deviations from spec

None of substance; two notable **corrections that improved on an earlier plan rather than deviations from the final one**, both already reflected in the "final" design described above:

- The DB schema went through two rounds of explicit design revision during this phase before landing on its final shape (item 4) — the spec's own suggested `scenario_versions` shape was followed essentially as proposed, after rejecting an intermediate idea (repurposing `scenarios.version` as "latest published") that would have duplicated a canonical version source.
- Two real, independent bugs were found and fixed during manual verification, neither anticipated by the spec: (1) a race condition in the authoring UI's `onChange: (next) => void` pattern that could silently corrupt a just-edited row due to stale-closure overwrites — fixed by converting all 9 section components to a functional-updater `onChange` signature; (2) a pre-existing Phase 3/4 bug where `assessment-result-screen.tsx` computed candidate scores client-side using a hardcoded Payment-Retry-Storm-specific scorer — fixed as part of the server-authoritative-scoring work this phase already required, since it would have been actively wrong (and would have leaked scoring bands) the moment an org-authored scenario was scored.
- No AI/LLM generation, no billing, no email delivery, no collaborative editing, no arbitrary code/expression evaluation, and no cloud-infrastructure simulation were added, per the spec's explicit "Important Constraints" list.

## 27. Product/UX concerns

- **The candidate-safe payload is a disclosed limitation, not a solved problem** (item 16, repeated here deliberately since it is the single most important caveat in this report): rules, conditions, and thresholds for both built-in and organization-authored scenarios remain fully inspectable by a motivated candidate via the browser. Server-authoritative simulation (candidate sends actions, server returns resulting state/events, rules never leave the server) is the named future requirement to close this gap.
- **No member-invite mechanism exists anywhere in the codebase** (confirmed by grepping every reference to `organizationMembers`): the only write path into an organization's membership table is auto-insert-as-owner on organization creation. This predates Phase 5 (it's a Phase 4-era gap) but became directly visible this phase, since closing the explicitly requested "test a real non-owner member in the authoring UI" gap required working around it with a second `+clerk_test` Clerk account rather than an in-product invite flow. Adding organization member invitation is worth prioritizing — right now there is no product-supported way for a second person to join an existing organization at all.
- **The "Scenarios" link on the organization dashboard is not gated by `canMutate`** — it is visible to all roles including `member`, even though a member can only ever reach a read-only view once inside. This is a minor UI-polish gap (the underlying routes and APIs are correctly gated server-side, so it is not a security issue), but ordinarily a dashboard would only surface a management link to roles that can act on it.
- **Authored scenario cost/revenue modeling is a stub** (item 8): because Phase 5's authoring sections have no dedicated cost-rate editor, every authored scenario compiles to a zeroed cost/revenue baseline, and `costEfficiency` scoring for authored scenarios is computed from a cruder peak-cost-ratio proxy rather than genuine infrastructure cost modeling the way Payment Retry Storm's built-in scorer does. This is within Phase 5's explicit scope (no cost-authoring UI was requested) but is a real content-authoring limitation a scenario author will notice if they try to express a cost-driven incident.
- **Authored scenarios have no numeric-metric severity coloring**: the generic metrics panel renders `percentage`/`duration`/`number`/`currency` metrics as plain values; only `format: "status"` metrics get the full normal/warning/critical coloring the Payment-Retry-Storm UI always had for all its fields. This is a candidate-facing visual-fidelity gap for authored scenarios versus the original hand-tuned built-in UI, not a functional one.

---

Per the spec's explicit instruction, **Phase 6 has not been started.**
