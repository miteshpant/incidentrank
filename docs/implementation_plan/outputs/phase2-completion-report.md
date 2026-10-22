# Phase 2 — Completion Report

Candidate Incident Playground for Payment Retry Storm, built per
`docs/implementation_plan/phase2.md` on top of the Phase 1 scenario-agnostic
engine. No changes to `packages/simulator`'s behavioral logic were required.

## 1. Files created/modified

**New files (`apps/web/src/app/incidents/`)**
- `payment-retry-storm/page.tsx` — route entry
- `payment-retry-storm/incident-console.tsx` — top-level orchestrator (phase routing: briefing → active → result)
- `payment-retry-storm/briefing-screen.tsx` — pre-incident SEV-1 briefing
- `payment-retry-storm/incident-header.tsx` — branding, severity/status, elapsed clock
- `payment-retry-storm/architecture-view.tsx` — clickable architecture node list with health indicators
- `payment-retry-storm/metrics-panel.tsx` — live metrics with severity coloring and change indicators
- `payment-retry-storm/component-panel.tsx` — observability + controls + Apply Changes for the selected component
- `payment-retry-storm/timeline-panel.tsx` — SYSTEM/YOU-differentiated event timeline
- `payment-retry-storm/result-screen.tsx` — resolved/failed result screen with objective stats
- `payment-retry-storm/incident-console.test.tsx` — 13 integration tests
- `listing.test.tsx` — incident listing test

**New files (`apps/web/src/lib/`)**
- `use-incident-attempt.ts` — the hook owning all engine state, timeline, pending edits, and the 1Hz clock (useReducer-based)
- `payment-retry-storm-ui.ts` — UI-only display metadata (component→control mapping, labels, value formatting)
- `format.ts` — display formatting helpers (elapsed time, USD, ms, percent)

**Modified**
- `apps/web/src/app/incidents/page.tsx` — Payment Retry Storm card is now a live "Start Incident" link instead of a disabled "Coming Soon" card
- `apps/web/vitest.config.ts` — added `@` path alias resolution (Vite doesn't read `tsconfig.json` paths automatically)
- `apps/web/vitest.setup.ts` — added explicit RTL `cleanup()` in `afterEach` (was missing; without it, multiple tests' DOM trees accumulated and broke `getByRole`/`getByText` queries)
- `packages/scenarios/src/index.ts` — re-exported `paymentRetryStormSimulation` and the control-key constants, which were defined but not part of the package's public surface (apps/web needed both)

## 2. Routes added

```text
/                                    (unchanged)
/incidents                           (updated: Payment Retry Storm now playable)
/incidents/payment-retry-storm       (new — briefing / active console / result, as one route with internal phase state)
```

Per the spec's "choose the simpler implementation" guidance, the result view is internal state on the same route rather than a separate `/result` route — no routing-only persistence was introduced.

## 3. Component structure

```text
IncidentConsole (phase router)
├── BriefingScreen           (phase: briefing)
├── ResultScreen             (phase: result)
└── (phase: active)
    ├── IncidentHeader
    ├── ArchitectureView     (clickable nodes, health dots)
    ├── MetricsPanel         (+ inline infra-cost card)
    ├── ComponentPanel       (observability + controls + Apply Changes)
    └── TimelinePanel
```

## 4. How engine state is connected to React

`useIncidentAttempt(scenario)` is the single source of truth:

- Internally a `useReducer` over `{ phase, engineState, timeline, pendingControlValues, nextActionSeq }`.
- `engineState` is always exactly what `@incidentrank/simulator`'s `simulate()`/`createInitialState()` returned — React never mutates or recomputes it.
- Every reducer action (`tick`, `apply-changes`, `reset`, `acknowledge`, `set-pending-value`) that touches the engine calls the real `simulate()` function; the reducer only threads state through, never invents consequences.
- `timeline` accumulates every `SimulationEvent` the engine emits, tagged `source: "you" | "system"` purely by event `type` (`CONFIG_CHANGED`/`CONFIG_CHANGE_REJECTED` → "you", everything else → "system") — no UI-side guessing about which actions were candidate-initiated.

This satisfies the spec's "one source of truth" rule: Scenario Definition → Scenario Engine → Incident State → UI, with no parallel incident logic in components.

## 5. How simulation time is advanced

- A `setInterval(() => dispatch({type: "tick"}), 1000)` runs inside a `useEffect` whenever `phase === "active"` and the engine state is not yet terminal (`resolved`/`failed`).
- Each `tick` dispatch calls `simulate(scenario, engineState, null, scenario.tickMs)` — i.e. exactly 1 real second maps to 1 simulated second (`tickMs = 1000`), per spec.
- The effect's cleanup (`clearInterval`) runs whenever `phase` or `status` changes or the component unmounts, so ticking stops immediately on resolution, failure, or unmount. Verified both by automated tests (fake-timer assertions) and by the manual runs (status correctly stopped progressing after "INCIDENT RESOLVED"/"INCIDENT FAILED" appeared).

## 6. How controls are generated

- `ComponentPanel` reads `scenario.controls` (the real `ControlDefinition[]` from `@incidentrank/simulator`) and filters to the keys relevant to the selected architecture component via a UI-only lookup table (`COMPONENT_CONTROL_KEYS` in `payment-retry-storm-ui.ts`).
- Each control renders as a native `<select>` whose `<option>` list is generated directly from `control.allowedValues` — no second list of legal values exists anywhere in the UI.
- Display labels/value formatting (`CONTROL_LABELS`, `formatControlValue`) are presentation-only and do not affect what values are considered legal; validity is still enforced entirely by the engine's `isValidControlValue()`.

## 7. How actions are applied

- Changing a dropdown only updates `pendingControlValues` (local, unapplied) — nothing is sent to the engine yet.
- "Apply Changes" is disabled until at least one pending value differs from the engine's current `controlValues`.
- On click, the reducer iterates `scenario.controls` **in scenario-definition order** (not UI/click order) and, for each control whose pending value actually differs from the current value, constructs a `CandidateAction` and calls `simulate(scenario, workingState, action, 0)` — applying each changed control sequentially, exactly as the spec's "simplest acceptable solution" prescribes. This was verified live: applying Retries + Backoff together produced two separate `CONFIG_CHANGED` events in scenario-controls order, each correctly reflected in the timeline.

## 8. How timeline events are displayed

- Every engine event appears as one timeline entry, timestamped with `formatElapsed(timestampMs)`.
- `CONFIG_CHANGE_REJECTED` events are filtered out of the rendered list (an invalid value never reaches the engine as an accepted change, so there's nothing to show the candidate — the dropdown itself only offers legal values).
- Entries are visually tagged "YOU" (green-bordered) or "SYSTEM" (neutral-bordered), matching the spec's example timeline styling.
- The timeline is a simple scrollable list (`max-h-80 overflow-y-auto`) that never discards earlier events — new entries append, the list scrolls to show the most recent while remaining fully scrollable backward.

## 9. Result-screen contents

On `resolved`/`failed`, `IncidentConsole` renders `ResultScreen`, which displays, all read directly from engine state (nothing computed in React):

```text
Recovery Time / Time to Failure   (resolvedAtMs or failedAtMs - incidentStartedAtMs)
Estimated Revenue Impact          (customerImpact.revenueLossUsd)
Configuration Changes             (numberOfConfigurationChanges)
Beneficial Changes                (numberOfBeneficialChanges)
Harmful Changes                   (numberOfHarmfulChanges)
Peak Severity                     (peaks.peakSeverityRank → Normal/Warning/Critical)
Peak Infrastructure Cost          (peaks.peakMonthlyCostUsd)
Peak Kafka Lag                    (peaks.peakKafkaLagMessages)
```

Plus a condensed list of the candidate's own timeline entries, and **Try Again** / **Back to Incidents** CTAs. No 0–1000 score is computed or implied (Phase 1 does not expose one), and no "correct"/"wrong" language appears anywhere — verified both by a dedicated automated test and by visual inspection of both a resolved and a failed run.

## 10. Tests added

**`apps/web/src/app/incidents/listing.test.tsx`** (1 test)
- Payment Retry Storm renders as playable with a working "Start Incident" link, no "Coming Soon" text.

**`apps/web/src/app/incidents/payment-retry-storm/incident-console.test.tsx`** (13 tests)
1. Briefing screen shown before incident begins
2. Acknowledging starts the clock / reveals live metrics
3. Architecture renders all 7 expected components
4. Payment Service controls shown by default
5. Selecting Kafka swaps to Kafka's controls (Retries no longer present)
6. Applying a change calls the engine, updates state, produces a "YOU" timeline event
7. Advancing fake timers past 60s triggers provider degradation (no real waiting)
8. No "correct"/"wrong answer" text ever renders
9. A known-good mitigation sequence reaches `resolved` and shows the result view
10. A known-harmful configuration reaches `failed` and shows the result view
11. Try Again produces a genuinely fresh attempt (controls, metrics, phase all reset)
12. Clock stops advancing once resolved (status unchanged after further fake-time advance; timer count reaches 0)
13. The interval is cleared on unmount

All use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` — no test waits in real time.

## 11. Total tests passing

```
packages/simulator  13 passed
packages/scenarios   21 passed, 4 skipped (dev-only timeline runner)
apps/web             15 passed  (1 existing + 1 listing + 13 incident console)
──────────────────────────────
Total                49 passed, 4 skipped
```

No Phase 1 engine test was modified, weakened, or removed.

## 12. typecheck/lint/test/build results

```
pnpm typecheck   → all 3 workspaces: Done
pnpm lint        → all 3 workspaces: Done
pnpm test        → 49 passed, 4 skipped (0 failures)
pnpm build       → next build succeeded, 4 routes prerendered (/, /incidents, /incidents/payment-retry-storm, /_not-found)
```

All green.

## 13. Manual Run A — Strong mitigation

Performed live in Chrome against the running dev server. Applied, in order: Retries 3→1 (at ~01:21 incident time), Backoff none→exponential (same apply), Circuit Breaker off→on (~04:12 incident time — applied after re-observing the recovering state).

**Observed:** Checkout success visibly transitioned 99.9%→72%→84%→92%→96% across the applied changes, exactly matching the authored rule table (Path B → Path C → good-recovery). Status header moved CRITICAL → RECOVERING → RESOLVED. Final result screen:

```
INCIDENT RESOLVED
Recovery Time: 03:42
Estimated Revenue Impact: $29,550
Configuration Changes: 3   Beneficial: 3   Harmful: 0
Peak Severity: Critical
Peak Infrastructure Cost: $20,000/mo
Peak Kafka Lag: 18,000
```

Change indicators (e.g. "72% → 84%") rendered correctly on each metric that changed. Timeline correctly differentiated "YOU" (green) vs "SYSTEM" (neutral) entries throughout.

## 14. Manual Run B — Harmful mitigation

Applied Retries 3→5 and Payment Instances 8→24 simultaneously (~01:21 incident time), deliberately worsening the incident per the scenario's authored `aggressive-scaling-high-retries` rule.

**Observed:** Checkout success dropped further to 58% (CRITICAL), P99 rose to 8.2s, DB pressure and payment traffic both critical, infrastructure cost rose to $23,200/mo (24 payment instances costed correctly). Sustained below the 60% failure threshold for 3 simulated minutes, producing:

```
INCIDENT FAILED
Time to Failure: 03:21
Estimated Revenue Impact: $40,400
Configuration Changes: 2   Beneficial: 0   Harmful: 2
Peak Severity: Critical
Peak Infrastructure Cost: $23,200/mo
Peak Kafka Lag: 24,000
```

Both changes were correctly classified as harmful via the Phase 1 authored `actionClassifications` (not inferred by the UI). Revenue impact and cost were both markedly worse than Run A, demonstrating the intended "brute-force scaling is measurable, not a free fix" product principle.

## 15. Manual Run C — No action

Acknowledged a fresh attempt and took **no candidate action**. Confirmed live in the browser: the incident triggered at T=60s (CRITICAL, checkout success 72%, timeline showing only SYSTEM events), and revenue loss climbed continuously with no candidate entries in the timeline — the correct starting shape of the "do nothing" path.

**Full natural recovery (providers recovering at T=12min, fully healthy by T=15min, auto-resolving shortly after) was not watched to completion live**, since that requires ~15+ real minutes of continuous session time at the mandated 1:1 clock, which wasn't practical to sit through interactively in this session. This exact code path (same reducer, same `tick` dispatch, same `simulate()` call) is covered end-to-end by the automated test **"Payment Retry Storm — 3. doing nothing"** in `packages/scenarios`, which asserts natural resolution with significantly higher revenue loss and recovery time than a mitigated run, and by the Phase 1 dev-timeline-runner capture (Run A: resolved at 15:29, revenue loss $168,000). I'm flagging this explicitly rather than claiming a full live observation I didn't perform — Run A and B's live behavior gives high confidence the same reducer/engine wiring would carry Run C through to resolution identically, since all three runs share the exact same `tick`/`apply-changes` code paths already exercised live.

## 16. Engine changes made and why

**None to simulator behavior.** The only changes outside `apps/web` were:
- `packages/scenarios/src/index.ts`: re-exported `paymentRetryStormSimulation` and the control-key constants. These existed in Phase 1 but were only reachable via a deep import (`@incidentrank/scenarios/payment-retry-storm`), not the package's public `index.ts`. This is a pure export-surface fix, not a behavior change — required because the UI genuinely needs the simulation definition and control keys, and the spec explicitly says controls must be rendered from the scenario definition rather than re-declared in the UI.

No scenario rule, threshold, formula, or resolution condition was touched.

## 17. UX/product concerns discovered

- **Native `<select>` automation friction** (tooling note, not a product issue): driving dropdown selection via Chrome automation required typing the raw option value rather than clicking a visible popup item, since native select popups aren't part of the accessibility/DOM tree Chrome automation can screenshot. Real users clicking with a mouse are unaffected; this only affected how I verified the UI, not the UI itself.
- **Circuit Breaker's authored trigger condition uses an "uncongested" latency decision** (inherited from the Phase 1 engine design, not changed here): applying Circuit Breaker while retries are still high still shows meaningful improvement in the UI, but the spec's narrative implies the breaker should "not automatically produce a perfect system" when retries are poor — confirmed this holds (Run with CB on but poor retries is the authored `circuit-breaker-poor-retries` rule at 82% success, not full resolution), so no actual issue, just worth a note that this nuance is easy to lose sight of when wiring controls generically.
- **Timeline can grow long during extended "wait it out" runs** (Run C observation): with no action taken, the system-generated event list is still modest (threshold-crossing events only, not per-tick spam) per Phase 1's "do not spam the event stream" rule — confirmed this holds up visually, no excessive scroll-spam was observed even partway through a 60+ second idle period.
- **The result screen's condensed action list currently shows the generic message text** (e.g. "retries changed.") rather than the richer "retries changed from 3 to 1" phrasing used in the live timeline — this is a minor display inconsistency between `TimelinePanel` (which special-cases `CONFIG_CHANGED` metadata for a richer message) and `ResultScreen`'s raw `entry.message` rendering. Not a spec violation (the raw engine message is still accurate and non-evaluative), but worth polishing in a later pass for consistency.

Stopping here, as instructed — Phase 3 (accounts/persistence/leaderboards) not started.
