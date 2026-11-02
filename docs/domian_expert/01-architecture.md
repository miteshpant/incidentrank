# Architecture: Simulation Engine, Scenario Authoring, Scoring

## Monorepo structure

```
apps/web               the one deployable app (Next.js 16, App Router, Turbopack)
packages/simulator      pure TS simulation engine — zero workspace deps, no React/DB/auth
packages/scenarios      scenario content + authoring pipeline — depends on simulator only
packages/scoring        legacy reference-oracle package (see "Scoring" below)
packages/db             Drizzle schema/migrations/client — depends on scenarios
```

Dependency direction: `simulator ← scenarios ← db`, and `scenarios + simulator ← scoring`.
`apps/web` depends on all four. Nothing depends on `apps/web`.

Package manager: pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).
Root scripts: `pnpm dev` (→ `apps/web`'s `next dev`), `pnpm build`, `pnpm lint`/`pnpm typecheck`
(→ `pnpm -r run <script>` across every workspace), `pnpm test` (same, **without**
`--pool=forks --poolOptions.forks.singleFork` — see `06-conventions.md`).

`packages/scenarios` exports two entry points:
```json
"exports": { ".": "./src/index.ts", "./authoring": "./src/authoring/index.ts" }
```
Built-in scenario definitions/catalog come from the default export; the authoring
pipeline (for org-authored JSON scenarios) is a separate subpath import.

## Core types (`packages/simulator/src/types.ts`)

The whole domain model in one file, ~440 lines. The pieces that matter most:

```ts
export interface ScenarioSimulationDefinition {
  tickMs: number;
  architecture: ArchitectureDefinition;        // nodes + edges, display-only topology
  controls: ControlDefinition[];                // what a candidate can change
  initialValues: Record<string, StateValue>;
  initialComponentHealth: Record<string, ComponentHealth>;
  severityFields: SeverityFieldConfig[];
  numericWatchFields: NumericWatchFieldConfig[];
  timedEvents: TimedEvent[];                     // scripted things that happen at atMs
  rules: Rule[];                                 // first-match declarative rule table
  revenueLossRatePerMinute: RevenueLossRatePerMinute;
  infrastructureCost: InfrastructureCostConfig;
  successCondition: SuccessCondition;
  failureCondition: FailureCondition;
  actionClassifications: ActionClassificationRule[];
  completion?: CompletionConfig;                 // defaults to { mode: "automatic" }
}

export interface SimulationState {
  simulationTimeMs: number;
  status: IncidentStatus;   // "healthy"|"degraded"|"critical"|"resolved"|"failed"
  incidentStartedAtMs: number | null;
  resolvedAtMs: number | null;
  failedAtMs: number | null;
  controlValues: Record<string, ControlValue>;
  values: Record<string, StateValue>;
  componentHealth: Record<string, ComponentHealth>;
  triggers: Record<string, boolean>;
  customerImpact: CustomerImpactState;
  cost: CostState;
  transitions: TransitionTrackingState;   // consecutiveSuccess/Failure/AcceptableSeconds live here
  peaks: PeakTrackingState;
  numberOfConfigurationChanges: number;
  numberOfHarmfulChanges: number;
  numberOfBeneficialChanges: number;
}

export interface CandidateAction {
  id: string; timestampMs: number; controlKey: string; value: ControlValue;
}
```

`Rule.when` (`RuleCondition`) is a closed, structured shape —
`triggerEquals`/`controlEquals`/`controlAtMost`/`controlAtLeast` — never arbitrary
code/expression evaluation. Rules are evaluated first-match-wins via
`matchRule()` (`packages/simulator/src/rules.ts`).

## THE completion model (read this before touching scoring/Finish/result UI)

`docs/architecture.md` (1539 lines, covers Phase 0 through Phase 6.1 only)
describes an older model. **Phase 7.1 replaced it.** The binding doctrine,
quoted verbatim from `docs/implementation_plan/phase7.action.md`:

> **The system may fail a candidate automatically, but it must never pass a
> candidate automatically.**
>
> A candidate must explicitly choose Finish Incident before a successful
> result can be produced. This applies to all 100 scenarios.

### What this means in code

`packages/simulator/src/tick.ts` exports `ATTEMPT_CEILING_MS = 35 * 60 * 1000`
(35 minutes) — the **only** automatic-failure trigger left in the engine:

```ts
let status = state.status;
if (status !== "resolved" && status !== "failed") {
  if (incidentStartedAtMs !== null && nextTimeMs - incidentStartedAtMs >= ATTEMPT_CEILING_MS) {
    status = "failed";
    failedAtMs = nextTimeMs;
  } else if (incidentStartedAtMs === null) {
    status = "healthy";
  } else if (currentSeverityRank >= 2) {
    status = "critical";
  } else {
    status = "degraded";
  }
}
```

There is **no branch anywhere in `tick.ts` that writes `status = "resolved"`** —
confirmed directly in the source. Breaching the authored `failureCondition`
itself no longer auto-ends an attempt either (tracked via
`consecutiveFailureSeconds` for scoring/telemetry only); only the 35-minute
ceiling can auto-fail. A sustained `successCondition` only accumulates
`transitions.consecutiveSuccessSeconds` — it never auto-resolves anything.

`packages/simulator/src/completion.ts` is the completion-decision core:

```ts
export function isLocallyTerminal(state, completionMode): boolean {
  if (completionMode === "automatic") {
    return state.status === "resolved" || state.status === "failed";
  }
  return state.status === "failed";
}
```
The `state.status === "resolved"` clause here is **permanently unreachable**
for the `"automatic"` branch — kept only as self-documenting proof that
automatic-mode scenarios never actually reach "resolved" outside an explicit
Finish call.

```ts
export type CompletionTier = "optimal" | "acceptable";

export function evaluateCompletionEligibility(scenario, state): CompletionEligibility {
  // successCondition sustained long enough -> { eligible: true, tier: "optimal" }
  // else completion.acceptableCondition sustained long enough -> { eligible: true, tier: "acceptable" }
  // else { eligible: false }
}

export function evaluateCandidateDeclaredFinish(scenario, state): CandidateDeclaredFinishResult {
  // state.status === "failed" -> { outcome: "declared_unstable", completionTier: null }
  // not eligible -> { outcome: "declared_unstable", completionTier: null }
  // eligible -> { outcome: "resolved", completionTier, scoringResolvedAtMs: derived from
  //              the actual sustained-since instant, not the Finish click's wall-clock time }
}
```

A true automatic failure (the 35-minute ceiling) always wins, even for a
`candidate_declared` scenario — Finish cannot override it.

**The Finish flow**: `apps/web/src/lib/server/finish-attempt.ts`'s
`finishAttempt()` is the one place `evaluateCandidateDeclaredFinish()` is
called from the server. It row-locks the attempt, checks the client-supplied
`finishRequestId` idempotency key against the locked row (checked *before* the
terminal check, so a genuine retry of an already-applied Finish is still
recognized), replays persisted action groups, evaluates the finish result, and
calls `persistTerminalAttempt()` (see `04-runtime-and-billing.md`) to actually
write it.

### Candidates never see their own assessment results

A second major Phase 7.1 rule, independent of the above: for an
**assessment** attempt, the candidate must never receive score, outcome,
completion tier, completion note, final-state details, revenue-loss details,
peak metrics, or action tallies. The required candidate-facing message is
literally: *"Assessment submitted successfully. Results are available to the
hiring organization."* Practice attempts keep the full result experience.
Any new route/screen that surfaces attempt results must check which case it's
in and redact accordingly — `phase7.action.md` §6-7 lists the exact fields a
negative-privacy-test must assert are *absent*, not just that allowed fields
are present:
`score, recoveryScore, customerImpactScore, dataIntegrityScore, reliabilityScore, costEfficiencyScore, operationalEfficiencyScore, completionTier, outcome, completionNote, finalStateJson, revenueLossUsd`.

## Scenario authoring (`packages/scenarios/src/authoring/`)

Two kinds of scenario exist:

- **Built-in** (`scenarios.ownershipType = "incidentrank"`): hand-written
  TypeScript directly under `packages/scenarios/src/<slug>/`. One directory
  per scenario, consistent file-per-concern convention unchanged since the
  earliest scenarios: `action-classifications.ts`, `architecture.ts`,
  `candidate-ui.ts`, `controls.ts`, `definition.ts`, `metrics.ts`,
  `revenue-and-cost.ts`, `rules.ts`, `scoring.ts`, `timed-events.ts`. Version
  is a source-code field on `ScenarioDefinition.version`, bumped via code
  review — never a DB write.
- **Organization-authored**: authored via the org admin UI as JSON, stored in
  `scenario_versions.definitionJson`. Flow:
  ```
  AuthoredScenario JSON
         ↓
  validateAuthoredScenario()   — structural validation, never throws
         ↓
  compileAuthoredScenario()    — pure, no React/Clerk/DB
         ↓
  ScenarioDefinition             — identical shape a built-in scenario produces
         ↓
  the same simulator
  ```
  Rule conditions are restricted to the same closed operator set as built-ins
  (no code/string-eval). Every publishable scenario needs a fallback rule.
  `compileAuthoredScenario()`'s output structurally never includes scoring
  bands/weights — the compiler itself omits them, not a post-hoc filter.

## The scenario catalog (`packages/scenarios/src/library/catalog.ts`)

`BUILT_IN_SCENARIO_CATALOG: Record<string, BuiltInScenarioEntry>`:
```ts
export interface BuiltInScenarioEntry {
  definition: ScenarioDefinition;
  candidateUI: CandidateUIDescriptor;
  scoring: AuthoredScoringConfig;
}
```
Its own doc comment: "one catalog entry = everything the platform needs to run,
display, score, and list a built-in scenario... Adding scenario #101 means
adding one entry here — never touching any other call site." Current size is
roughly **116 entries**: the original 100-scenario launch catalog (authored in
4-batch waves: Phase 6B scenarios 21-40, 6C 41-60, 6D 61-80, 6E 81-100, plus
the original Payment Retry Storm baseline), a Phase 10F reference incident
(`checkout-payment-inventory-redis-contention`), and 15 Phase 10G scenarios.

## Golden paths — the mandatory solvability proof

`packages/scenarios/src/golden-paths/` (122 files). A golden path is a
recorded, deterministic sequence of candidate actions + a `finishAtMs` +
expected outcome/tier, proven to actually replay through the real engine to
that result. **Every** built-in scenario must have one, enforced two
independent ways:

1. `catalog.golden.test.ts` — fails the suite if any catalog entry has no
   registered golden path, and replays every one through
   `replayAttempt()` + `evaluateCandidateDeclaredFinish()`, asserting
   `state.status` never equals `"resolved"` (engine-level proof of the Phase
   7.1 doctrine) and the Finish result matches the expected outcome/tier.
2. `packages/scenarios/src/library/validate-built-in.ts`'s
   `validateBuiltInScenario()` — the publish-time gate. Checks the golden
   path exists as its *first* check (before anything else, so other checks
   still run and report), then validates architecture/control/metric
   references, duplicate IDs, scoring config, and does a narrative
   smoke-test. `canPublishScenario()` wraps it as the single centralized
   publish gate: `{ publishable: errors.length === 0, errors }`.

Difficulty taxonomy (six levels, shared with Engineer Rank bands):
`beginner | intermediate | senior | staff | senior_staff | principal`.

## Scoring — the 6 fixed dimensions

Confirmed exact, two independent sources (`packages/scoring/src/types.ts` and
`packages/scenarios/src/authoring/validate.ts`):

```
recovery:              300
customerImpact:        200
dataIntegrity:          200
reliability:            150
costEfficiency:         100
operationalEfficiency:   50
                       ────
                       1000
```

**Important**: `packages/scoring` is a legacy/reference-oracle package now,
not the live engine. The real, generic, catalog-wide scoring engine is
`scoreAuthoredAttempt()` in `packages/scenarios/src/authoring/score.ts`. The
original hand-written Payment Retry Storm scorer is kept in
`packages/scoring/src/payment-retry-storm.ts` purely as a byte-for-byte
reference oracle (`payment-retry-storm-equivalence.test.ts` proves the
declarative config reproduces it exactly), not deleted.

Scoring config shape: `AuthoredScoringConfig` → `dimensions: [{ dimension,
maxPoints, measure, bands | penalties, naturalRecoveryOverride?,
terminalOverrides? }]`. `AuthoredScoringMeasure` is a closed set:
`recoveryTimeSeconds, revenueLossUsd, dataIntegrity, criticalTimeRatio,
costIncreaseRatio, harmfulChangeCount, configurationChangeCount,
finalStringEquals, finalStringNotEquals`. `terminalOverrides: { failed?,
unresolved? }` lets each dimension define its own score for a
never-successfully-resolved attempt. The 300/200/200/150/100/50 split is
fixed catalog-wide — only the within-dimension bands/measures vary per
scenario.

**A real scoring bug this project hit**: giving every dimension a blanket
`terminalOverrides.unresolved: 0` collapsed the distinction between "did
nothing" and "took a plausible-but-wrong harmful action" into a ~10-15 point
gap carried entirely by `operationalEfficiency`, across 7 of the original 20
launch scenarios. Documented as a content-authoring tuning failure, not an
engine defect — worth remembering when authoring new scenario scoring configs.
