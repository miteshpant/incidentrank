# Phase 1 — Completion Report

Payment Retry Storm, built as an authored rules/consequences scenario per
`docs/implementation_plan/phase1.md` (which explicitly superseded the earlier
`phase1a.md` formula-based approach).

## 1. Files created/modified

**`packages/simulator`** (scenario-agnostic engine, fully rewritten from Phase 0 placeholders):
- `types.ts` — full type model (controls, rules, timed events, state, events, scoring inputs)
- `rules.ts` + `rules.test.ts` — ordered rule matching
- `actions.ts` + `actions.test.ts` — control validation + authored action classification
- `cost.ts` + `cost.test.ts` — authored per-unit cost rollup
- `severity.ts` — peak severity ranking helper
- `tick.ts` — one-second tick: timed events, rule matching, revenue/cost accrual, success/failure sustain tracking, transition-only event emission
- `simulate.ts` — `createInitialState()` + `simulate()` orchestrator (action application + N ticks)
- `scoring.ts` — `extractScoringInputs()`
- `index.ts` — public exports
- Removed: old Phase 0 `simulate.test.ts` (obsolete signature)

**`packages/scenarios`**:
- `types.ts` — `ScenarioDefinition` extended with a `simulation: ScenarioSimulationDefinition` field
- `payment-retry-storm.ts` — public scenario export (metadata + simulation)
- `payment-retry-storm/controls.ts` — 8 candidate controls
- `payment-retry-storm/architecture.ts` — topology + component health
- `payment-retry-storm/metrics.ts` — initial healthy metrics
- `payment-retry-storm/timed-events.ts` — incident start (T=60s), recovery start (T=12m), recovery complete (T=15m)
- `payment-retry-storm/rules.ts` — 9 authored rules covering all narrative paths
- `payment-retry-storm/revenue-and-cost.ts` — revenue-loss rates, cost table, success/failure conditions
- `payment-retry-storm/action-classifications.ts` — beneficial/harmful/neutral metadata
- `payment-retry-storm/definition.ts` — assembled `ScenarioSimulationDefinition`
- `payment-retry-storm/test-helpers.ts` — `runScenario()` test helper
- `payment-retry-storm/simulation.test.ts` — 20 behavioral tests (spec items 1–17)
- `payment-retry-storm/timeline-runner.ts` — human-readable dev timeline printer
- `payment-retry-storm/run-timelines.dev.test.ts` — Runs A–D (skipped by default; un-skip to print)
- `payment-retry-storm.test.ts` — unchanged metadata test

**`docs`**:
- `docs/scenarios/payment-retry-storm.md` — new scenario documentation
- `docs/architecture.md` — added principle 6 ("Scenarios Are Authored, Not Simulated Infrastructure") and a Phase 1 scope section

No changes to `apps/web` — per spec, the candidate UI is explicitly out of scope for this phase.

## 2. Final scenario structure

```ts
ScenarioSimulationDefinition {
  tickMs: 1000,
  architecture: { nodes, edges },        // 7 nodes, 6 edges
  controls: ControlDefinition[],         // 8 controls
  initialMetrics: AuthoredMetrics,
  initialComponentHealth: Record<string, ComponentHealth>,
  timedEvents: TimedEvent[],             // 3 timed events
  rules: Rule[],                         // 9 ordered rules
  revenueLossRatePerMinute: Record<string, number>,
  infrastructureCost: { baselineMonthlyUsd, perUnitMonthlyUsd },
  successCondition: SuccessCondition,
  failureCondition: FailureCondition,
  actionClassifications: ActionClassificationRule[],
}
```

Declarative, data-only — no imperative scenario-specific code in the engine.

## 3. All controls

| Control | Key | Allowed values | Initial |
|---|---|---|---|
| Retries | `retries` | 0, 1, 3, 5 | 3 |
| Backoff | `backoff` | none, fixed, exponential | none |
| Circuit breaker | `circuitBreaker` | off, on | off |
| Timeout | `timeoutSeconds` | 1, 2, 3, 5 | 2 |
| Payment instances | `paymentInstances` | 4, 8, 12, 16, 24 | 8 |
| Checkout instances | `checkoutInstances` | 4, 8, 12, 16, 24 | 8 |
| DB connection limit | `dbConnectionLimit` | 250, 500, 750, 1000 | 500 |
| Kafka settlement consumers | `kafkaConsumers` | 4, 8, 12, 16, 24 | 8 |

Invalid values are rejected (never clamped) and emit `CONFIG_CHANGE_REJECTED`.

## 4. All major rules (authored, most-specific-first)

1. `circuit-breaker-good-recovery` — circuitBreaker=on, backoff=exponential, retries≤1 → 96% success, "recovering"
2. `circuit-breaker-poor-retries` — circuitBreaker=on (retries not yet fixed) → 82% success, "storm-controlled"
3. `low-retries-exponential-backoff` — retries≤1, backoff=exponential → 92% success, "storm-reduced"
4. `low-retries-no-backoff` — retries≤1 → 84% success, "storm-reduced"
5. `aggressive-scaling-high-retries` — retries≥3 AND paymentInstances≥16 → 58% success (can trigger failure)
6. `high-retries-worse` — retries≥5 → 63% success, "storm-critical"
7. `low-timeout-tradeoff` — timeoutSeconds≤1 → 66% success, 2.2s P99 (fail-fast tradeoff)
8. `high-timeout-tradeoff` — timeoutSeconds≥5 → 74% success, 7.2s P99 (tied-up-longer tradeoff)
9. `storm-critical-default` — provider degraded, no other match → 72% success, "storm-critical" (baseline)

Checkout instances, Kafka consumers, and DB connection limit never appear as rule conditions — they affect only cost and (for Kafka/DB) their own named metrics bookkeeping, never checkout resolution, per spec.

## 5. Timed events

| Event | Time | Effect |
|---|---|---|
| `PROVIDER_DEGRADED` | T=60s | `provider.degraded = true`; incident starts |
| `PROVIDER_RECOVERED` (start) | T=12min | `provider.recovering = true` |
| `PROVIDER_RECOVERED` (complete) | T=15min | `provider.degraded = false`; fully healthy |

## 6. Success/failure logic

**Success** (sustained 30s): `checkoutSuccessRate >= 95` AND `checkoutP99LatencyMs <= 3000` AND `paymentTraffic != critical` AND `dbPressure != critical`. Kafka lag excluded by design.

**Failure** (sustained 3min): `checkoutSuccessRate < 60`.

Both use plain sustain-counters reset on any tick that breaks the condition — no hardcoded "if these exact settings" branches.

## 7. Tracked scoring inputs

`incidentStartedAtMs`, `resolvedAtMs`, `failedAtMs`, `totalTimeInCriticalMs`, `totalTimeInDegradedMs`, `revenueLossUsd`, `peakSeverityRank`, `numberOfConfigurationChanges`, `numberOfHarmfulChanges`, `numberOfBeneficialChanges`, `initial/final/peakMonthlyInfrastructureCostUsd`, `final/peakKafkaLagMessages`. No 0–1000 score computed.

## 8. Tests added

- **`packages/simulator`**: 13 tests (`rules.test.ts` ×3, `cost.test.ts` ×3, `actions.test.ts` ×7) against a synthetic fixture, proving the engine is genuinely scenario-agnostic.
- **`packages/scenarios`**: 20 behavioral tests in `simulation.test.ts` covering all 17 required categories (healthy start, incident at 60s, do-nothing, retry reduction/increase, exponential backoff, circuit breaker, scale-checkout-only, aggressive-payment-scaling, kafka consumers, DB connections, timeout tradeoff, good recovery, alternative recovery, bad configuration → failure, 3× invalid-control rejection, determinism) + 1 existing metadata test. Plus 4 skipped dev-only timeline tests.

**Total: 34 passing, 4 skipped.**

## 9–12. Run results (from the dev timeline runner)

| Run | Outcome | Resolved/Failed at | Revenue loss | Final cost | Peak Kafka lag | Changes |
|---|---|---|---|---|---|---|
| **A — No action** | resolved | 15:29 | $168,000 | $20,000 | 18,000 | 0 |
| **B — Strong mitigation** (retries→1, backoff→exp, CB→on) | resolved | 02:30 | $25,258 | $20,000 | 18,000 | 3 |
| **C — Harmful mitigation** (paymentInstances→24, retries→5, timeout→5s) | **failed** | 04:05 | $168,000 | $23,200 | 24,000 | 3 |
| **D — Alternative mitigation** (retries→1, timeout→3s, backoff→exp, CB→on) | resolved | 02:50 | $26,425 | $20,000 | 18,000 | 4 |

The four runs show clearly meaningful, distinct outcomes: doing nothing is survivable but costly and slow; a sensible mitigation resolves in under 3 minutes at ~15% of the revenue loss; a harmful "brute force" configuration actually fails the incident entirely while costing more; and a different sensible sequence (D) also resolves, proving multiple viable paths exist, as required.

## 13. typecheck/lint/test/build results

```
pnpm typecheck   → all 3 workspaces: Done
pnpm lint        → all 3 workspaces: Done
pnpm test        → simulator 13 passed, scenarios 21 passed (4 skipped), web 1 passed
pnpm build       → next build succeeded, 3 routes prerendered
```

All green.

## 14. Deviations and why

1. **`phase1a.md` fully discarded** — per your explicit confirmation, this phase implemented `phase1.md` only. The old formula-based simulator code (congestion curves, retry geometric series, concurrency math) was never finished and is not present anywhere in the final implementation.
2. **Directory structure**: scenario-specific authored data was split across several small files under `packages/scenarios/src/payment-retry-storm/` (controls, architecture, rules, metrics, timed-events, revenue-and-cost, action-classifications, definition) rather than one large file, purely for readability — the data itself is still one assembled `ScenarioSimulationDefinition`, not a generic DSL.
3. **`ScenarioDefinition.simulation` field** — per your earlier confirmed decision, extended the existing `ScenarioDefinition` type (rather than a separate parallel export) to carry the simulation definition alongside display metadata.
4. **Incident states are internal strings** (`"storm-critical"`, `"storm-reduced"`, `"storm-controlled"`, `"recovering"`, `"healthy"`, `"resolved"`) used only to key `revenueLossRatePerMinute` and drive event wording — not exposed as a separate candidate-facing field beyond the existing `status` enum (`healthy/degraded/critical/resolved/failed`), matching the spec's note that these "do not need to be candidate-visible state names."
5. Added a `"failed"` status to `IncidentStatus` (Phase 0 only had healthy/degraded/critical/resolved) since Phase 1 explicitly requires a failure condition the Phase 0 type couldn't represent.
6. `dbPressure` in two timeout-tradeoff rules was authored as `"warning"` rather than a literal "high" (the spec's prose used "high" informally) since the `MetricSeverity` type is `normal | warning | critical` — chose not to add a 4th severity level for two rules alone.
7. Dev-only Runs A-D are implemented as a `describe.skip`'d vitest file (with manual un-skip instructions in a comment) rather than a standalone script, because a standalone `tsx`/`node` runner would have required adding a new dev dependency; vitest was already present and sufficient.

## 15. Anything that feels unrealistic or should be reviewed

- The rule table is a *finite, ordered list*, not an exhaustive cross-product of all 4×3×2×4×5×5×4×5 = 48,000 possible control combinations. Untested combinations fall through to the nearest matching rule (usually `storm-critical-default`). This is consistent with "keep Phase 1 small," but means some plausible combinations (e.g. `timeoutSeconds=3` with `retries=1` but `backoff=fixed`) resolve to a rule that wasn't specifically authored for them. Worth reviewing once the candidate UI (Phase 2) reveals which combinations real users actually try.
- `backoff="fixed"` has no dedicated rule of its own — it currently behaves identically to `backoff="none"` unless combined with low retries or the circuit breaker, since no narrative path in `phase1.md` described a "fixed backoff" outcome distinctly from "none." This should be revisited with an authored intermediate rule if fixed backoff is meant to matter.
- `checkoutInstances` has no cost-affecting rule beyond the generic per-instance cost table, and never appears in a resolution rule — intentional per spec ("must not be a magical fix"), but worth confirming this reads clearly to a candidate who scales it expecting some payoff.
- The "Aggressive scaling" and "high retries" rules were authored with `checkoutSuccessRate` at 58% and 63% respectively — close to the 60% failure threshold — which was a deliberate choice to make Test 15 (bad configuration → failure) achievable without being the *only* bad-but-non-failing state. This precise boundary is somewhat arbitrary and could be tuned once real score weighting exists.

Stopping here, as instructed — Phase 2 (candidate UI) not started.
