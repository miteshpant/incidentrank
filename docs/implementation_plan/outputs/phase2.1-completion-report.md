# Phase 2.1 — Completion Report

Candidate reasoning + pre-incident countdown, built per
`docs/implementation_plan/phase2.1.md` on top of the completed Phase 2
incident playground. No changes to `packages/simulator`'s behavior, rules,
or engine-level `CandidateAction` type were made — per your explicit
direction, action grouping (Option 2) is an entirely UI/attempt-level
construct layered on top of the unchanged engine event stream.

## 1. Files modified

**`apps/web/src/lib/`**
- `use-incident-attempt.ts` — added `CandidateActionGroup`/`CandidateActionGroupChange` types, `actionGroups` state, `hasIncidentStarted()`/`incidentStartMs()` helpers, reasoning parameter on `apply-changes`, and the controls-locked-until-incident-start gate.

**`apps/web/src/app/incidents/payment-retry-storm/`**
- `component-panel.tsx` — added the reasoning `<textarea>` (label, placeholder, 1000-char limit with live count, locked until incident start), threaded `incidentStarted` prop, `onApplyChanges(reasoning)` signature.
- `timeline-panel.tsx` — rewritten to merge system `TimelineEntry[]` with `CandidateActionGroup[]` chronologically; `CONFIG_CHANGED`/`CONFIG_CHANGE_REJECTED` raw events no longer rendered directly (superseded by grouped "YOU" blocks); each group renders all its field changes plus one `Reason:` block.
- `result-screen.tsx` — now takes `actionGroups` instead of the flat `timeline`; renders the same grouped-changes-plus-reasoning representation as the live timeline, fixing the Phase 2 inconsistency the prior completion report flagged (generic `"retries changed."` text).
- `incident-header.tsx` — added pre-incident countdown rendering (`PRE-INCIDENT` badge + "Incident begins in MM:SS") alongside the existing active-incident header.
- `incident-console.tsx` — wired `incidentStarted`/`incidentStartMs`/`actionGroups` through to the relevant child components.
- `incident-console.test.tsx` — rewritten with 25 tests covering all Phase 2.1 requirements plus the existing Phase 2 behavioral guarantees.

**`docs/architecture.md`** — added principle 7 ("Candidate Reasoning Is Recorded, Not Evaluated"), a Phase 2 scope section (missing from the prior pass), and a Phase 2.1 scope section.

No changes to `packages/simulator`, `packages/scenarios`, or any Phase 0/1 engine test.

## 2. CandidateAction/reasoning model changes

**None to the engine.** `@incidentrank/simulator`'s `CandidateAction` type is untouched — it still has no `reasoning` field, and `simulate()`/`tick.ts`/`actions.ts` are byte-for-byte unchanged from Phase 2.

Reasoning lives entirely in a new UI-level type in `use-incident-attempt.ts`:

```ts
interface CandidateActionGroupChange {
  controlKey: string;
  previousValue: ControlValue;
  newValue: ControlValue;
}

interface CandidateActionGroup {
  id: string;
  elapsedMs: number;
  reasoning: string | null;
  changes: CandidateActionGroupChange[];
}
```

One group is created per successful Apply click. `reasoning` is `null` when the field was left empty (trimmed to detect whitespace-only input), never an empty string, so downstream rendering can cleanly check for its presence.

## 3. How multi-control actions are grouped

The `apply-changes` reducer case is otherwise unchanged from Phase 2: it still iterates `scenario.controls` in scenario-definition order and calls the real `simulate()` once per changed control, exactly as before. The only addition is that, alongside pushing events into `timeline` (unchanged), it now also collects each change's `{controlKey, previousValue, newValue}` into one array and pushes a single `CandidateActionGroup` built from that array plus the reasoning text passed into the action.

This means: N controls changed in one Apply click still produce N `CONFIG_CHANGED` engine events (unchanged, and still the authoritative record for the `numberOfConfigurationChanges`/`numberOfBeneficialChanges`/etc. scoring inputs), but exactly **one** `CandidateActionGroup` — which is what both the live timeline and the result screen render as a single "YOU" block.

## 4. Timeline changes

`TimelinePanel` now merges two sources, sorted by timestamp:
- System events from the engine's `TimelineEntry[]`, with `CONFIG_CHANGED`/`CONFIG_CHANGE_REJECTED` filtered out (superseded by groups).
- `CandidateActionGroup[]`, each rendered as one "YOU" block listing every field change (`Retries changed 3 → 1`) followed by a single `Reason:` line when reasoning was provided.

Verified live: applying Retries + Backoff together with one explanation produced exactly one "YOU" block with both field changes and one reasoning line — not two duplicated reasoning blocks.

## 5. Result-screen changes

`ResultScreen` now accepts `actionGroups` instead of the flat candidate timeline and renders each group as a card: timestamp, a `<dl>` of `field: previous → new` rows, and the reasoning block when present. This is structurally identical to the live timeline's rendering, closing the Phase 2 gap where the result screen showed only generic `"retries changed."` text with no old/new values.

## 6. Countdown implementation

`IncidentHeader` branches on a new `incidentStarted` boolean:
- **Before** incident start: renders `Incident begins in {formatElapsed(remaining)}` and a `PRE-INCIDENT` badge instead of the status label.
- **At/after** incident start: renders the existing elapsed-time + status-label header, unchanged from Phase 2.

`remaining = incidentStartMs - simulationTimeMs`, clamped to `>= 0`.

## 7. How incident start time is obtained

```ts
export function incidentStartMs(scenario: ScenarioSimulationDefinition): number | null {
  return scenario.timedEvents[0]?.atMs ?? null;
}
```

This reads `scenario.timedEvents[0].atMs` — the scenario's **first** authored timed event — rather than any Payment-Retry-Storm-specific constant. Payment Retry Storm's `timedEvents` array is authored with the provider-degradation event first (`INCIDENT_START_MS = 60_000`), so this resolves to `60000` for this scenario, but the UI code contains no reference to that scenario or to the literal `60`. Any future scenario whose first timed event marks its incident start will work identically with zero UI changes.

## 8. How controls are locked/unlocked

```ts
export function hasIncidentStarted(state: SimulationState): boolean {
  return state.transitions.nextTimedEventIndex > 0;
}
```

`nextTimedEventIndex` is an existing Phase 1 engine field that `tickOnce` increments every time it processes a timed event. `> 0` means at least one timed event (i.e. the first one, the incident-start trigger) has fired. `ComponentPanel` disables both the control `<select>`s and the Apply button whenever `!incidentStarted`, and shows "Controls unlock when the incident begins." Architecture inspection (component selection, observability) remains fully available regardless — confirmed live during the countdown.

## 9. Tests added

All 14 required categories from the spec, in `incident-console.test.tsx` (25 tests total, up from 13 in Phase 2):

1. Reasoning field renders with editable controls
2. Reasoning optional — apply works without it
3. Reasoning stored and associated with the candidate action
4. Reasoning appears in the live timeline
5. Reasoning clears after successful Apply
6. Multiple configuration changes group under one reasoning block (not duplicated)
7. Result screen shows field changes + old/new values + reasoning
8. Countdown initial state (`Incident begins in 01:00`)
9. Countdown decreases with fake-timer advancement
10. Controls locked before incident start (Apply disabled)
11. Architecture remains inspectable during countdown
12. Incident activation at T=60s (countdown disappears, degradation occurs, controls unlock)
13. Countdown/incident-start timing is read from scenario data (implicitly verified: the same `incidentStartMs()` helper used by the header also gates `apply-changes` in the reducer, and both behaviors are exercised by the same tests without a hardcoded `60` appearing anywhere in UI code)
14. "No answer feedback" (pre-existing Phase 2 requirement, reconfirmed): a harmful action with a plausible reasoning renders no correct/incorrect/wrong language anywhere

Plus all pre-existing Phase 2 tests (briefing, architecture rendering, component switching, timed incident start, resolution, failure, Try Again, timer cleanup) updated only where the new controls-locked-until-incident-start rule required advancing past T=60s before applying changes.

## 10. Total test results

```
packages/simulator  13 passed
packages/scenarios   21 passed, 4 skipped (dev-only timeline runner, unchanged)
apps/web             27 passed  (1 landing page + 1 listing + 25 incident console)
──────────────────────────────
Total                61 passed, 4 skipped, 0 failed
```

No Phase 0/1/2 test was weakened or removed; all Phase 1 engine behavioral tests remain exactly as they were.

## 11. typecheck/lint/build results

```
pnpm typecheck   → all 3 workspaces: Done
pnpm lint        → all 3 workspaces: Done
pnpm test        → 61 passed, 4 skipped, 0 failed
pnpm build       → next build succeeded, 4 routes prerendered
```

All green.

## 12. Manual Run A result

Acknowledged the incident and observed the full pre-incident countdown live in Chrome:
- Header showed `Incident begins in 01:00` next to a `PRE-INCIDENT` badge immediately after acknowledging.
- Architecture panel remained fully inspectable (clicked through components, observability updated) during the countdown.
- Apply Changes was visibly disabled (grayed) with "Controls unlock when the incident begins." shown, even after selecting a pending control value.
- At T=60s: countdown disappeared, header switched to elapsed-time + `CRITICAL`, checkout success dropped `99.9% → 72%`, all expected system events appeared in the timeline, and controls/Apply Changes became usable immediately.

## 13. Manual Run B result

After incident start, applied Retries `3→1` and Backoff `none→exponential` in one Apply click with reasoning: *"The provider is degraded and retries appear to be amplifying traffic. I want to reduce immediate pressure while spacing retry attempts."*

**Observed live:**
- Timeline rendered exactly one "YOU" block containing both field changes (`Retries changed 3 → 1`, `Backoff changed None → Exponential`) followed by one `REASON:` line — not two duplicated reasoning blocks.
- System consequences (status → degraded, checkout recovering, DB pressure recovered) followed immediately after, correctly separated into their own "SYSTEM" entries.
- Continued with Circuit Breaker `off→on` (no reasoning entered this time) to reach resolution.
- **Result screen** showed both candidate decisions as separate cards: the first with both field changes and the full reasoning text, the second (`Circuit Breaker Off → On`) with no reasoning block (correctly omitted since none was entered) — confirming reasoning remains visible through to the result screen and that omitting it on a later action doesn't affect earlier recorded reasoning.
- Incident resolved in 03:22, $20,650 revenue impact, 3/3 beneficial changes.

## 14. Manual Run C result

After incident start, applied Retries `3→5` and Payment Instances `8→24` together with a deliberately plausible-sounding but harmful explanation: *"Scaling up payment instances and increasing retries should give the provider more chances to succeed under load."*

**Observed live:**
- Checkout success dropped further to 58% (CRITICAL) — the authored `aggressive-scaling-high-retries` rule, correctly triggered.
- The explanation appeared in the timeline exactly as entered, with no annotation, score, or evaluative language attached to it.
- Sustained below the 60% failure threshold for 3 simulated minutes, producing `INCIDENT FAILED`.
- **Result screen** showed the harmful action's full reasoning text verbatim, Harmful Changes correctly counted as 2 (both changes matched authored `actionClassifications` harmful rules), and no "incorrect"/"wrong"/"bad reasoning" text anywhere on the page — confirmed via both live inspection and the existing automated "no answer feedback" test running against this exact scenario.

## 15. Visual descriptions

**Pre-incident countdown** (header, immediately after acknowledging):
```
IncidentRank · SEV-1 · PAYMENT RETRY STORM          Incident begins in 01:00   PRE-INCIDENT
```
Architecture panel below shows all 7 components healthy; Payment Service panel shows all controls visible but disabled, reasoning textarea visible but disabled, "Controls unlock when the incident begins." notice, Apply Changes grayed out.

**Action with reasoning** (incident timeline, after a grouped Apply):
```
01:46  [YOU]
Retries changed 3 → 1
Backoff changed None → Exponential

REASON: "The provider is degraded and retries appear to be amplifying
traffic. I want to reduce immediate pressure while spacing retry attempts."

01:47  [SYSTEM]
Status changed from critical to degraded.
```
"YOU" renders in a green-bordered badge, "SYSTEM" in a neutral-bordered badge — kept visually distinct per spec.

**Result screen with reasoning**:
```
INCIDENT RESOLVED
Incident Result
[stat rows: Recovery Time, Revenue Impact, Configuration Changes, ...]

YOUR ACTIONS
┌─────────────────────────────────────────┐
│ 01:46                                    │
│ Retries            3 → 1                 │
│ Backoff             None → Exponential   │
│                                           │
│ REASON                                   │
│ "The provider is degraded and retries    │
│  appear to be amplifying traffic..."     │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 03:52                                    │
│ Circuit Breaker     Off → On             │
└─────────────────────────────────────────┘
[Try Again]  [Back to Incidents]
```

## 16. Concerns or deviations

- **Grouping approach deviation from my initial proposal**: I initially proposed inferring groups from matching `CONFIG_CHANGED` event timestamps rather than an explicit `CandidateActionGroup` structure. You explicitly redirected me to Option 2 (explicit groups, engine untouched) before implementation began — the delivered code follows Option 2 throughout; no timestamp-inference logic exists anywhere.
- **Native `<select>` browser-automation friction** (tooling note only, not a product issue): verifying dropdown changes live required typing raw option values via keyboard rather than clicking visible popup items, since native select popups aren't part of the automatable DOM tree. One self-inflicted verification error during Manual Run C (a stale click landed on the wrong control after the timeline list grew, so an initial attempt at the harmful config silently didn't apply) was caught by cross-checking with `find` before proceeding — worth noting only because it demonstrates why I re-verified control values explicitly rather than trusting an initial screenshot.
- **`CandidateActionGroupChange.previousValue`/`newValue` are snapshotted per-change, not per-group**: when multiple controls change in one Apply, each change's `previousValue` is captured at the moment that specific control was applied (mid-loop), which is correct since the engine state within the loop does advance control-by-control — but it means a hypothetical (currently impossible, since scenario controls never reference each other) scenario where applying control A changed control B's *displayed* value would show B's pre-A value as "previous," not B's absolute-start-of-Apply value. Not an issue for Payment Retry Storm today; flagged for awareness if a future scenario's rule table ever makes one control's effective value depend on another.
- **Character limit (1000) and placement**: used the spec's suggested 1000-character limit with a live `N/1000` counter, matching "show a small character count only if it can be done unobtrusively." No rich text, plain `<textarea>` only, as required.

Stopping here, as instructed — Phase 3 not started.
