# Phase 6D.1 Completion Report

Per docs/implementation_plan/phase6dsupport.md §22. Scope: scenarios 61-65 (Global and platform incidents). Does not begin 6D.2.

## 1. Exact 5 scenarios added

| # | Slug | Name | Difficulty (target → engine value) |
|---|------|------|---|
| 61 | `multi-region-payment-platform-degradation` | Multi-Region Payment Platform Degradation | Principal → `staff` |
| 62 | `global-checkout-brownout` | Global Checkout Brownout | Principal → `staff` |
| 63 | `multi-tenant-control-plane-overload` | Multi-Tenant Control Plane Overload | Senior Staff → `staff` |
| 64 | `regional-failover-causes-global-overload` | Regional Failover Causes Global Overload | Principal → `staff` |
| 65 | `cross-service-retry-amplification` | Cross-Service Retry Amplification | Senior Staff → `staff` |

**Note on difficulty representation**: the engine's `difficulty` enum (`beginner`/`intermediate`/`senior`/`staff`) has no distinct "Senior Staff" or "Principal" value — `staff` is its ceiling. All 5 scenarios correctly use `staff` (the closest valid value), but the enum cannot currently distinguish "Senior Staff" from "Principal" scenarios. This is a pre-existing engine limitation, not a defect introduced by this batch, and extending the enum would be a shared-engine change out of scope for a scenario-authoring batch — flagged here for awareness, not fixed.

## 2. Files created/modified

**Created** (5 scenarios × 12 files = 60 files, plus 2 scenarios received a targeted post-verification fix adding files to 2 of them — see §30 deviations):
Per scenario: `packages/scenarios/src/<slug>/{architecture,controls,metrics,timed-events,rules,revenue-and-cost,action-classifications,scoring,definition,candidate-ui}.ts` (10 files) + root `packages/scenarios/src/<slug>.ts` + `packages/scenarios/src/<slug>.test.ts`.

**Modified** (orchestrator-owned shared files only):
- `packages/scenarios/src/index.ts` — one new comment-delimited export block (`// Phase 6D batch 1 (scenarios 61-65): global/platform incidents`), 5 export groups following the established `{scenario, simulation, candidateUI, SCORING}` pattern.
- `packages/scenarios/src/library/catalog.ts` — 5 new import blocks + 5 new `BUILT_IN_SCENARIO_CATALOG` entries.

No scenario-author or verifier agent touched either shared file at any point — confirmed via `git status --short` after every verification pass, run by the orchestrating session only.

## 3. Duplicate-mechanism audit per scenario

| Scenario | Closest existing scenarios | Why materially different |
|---|---|---|
| Multi-Region Payment Platform Degradation | `network-partition`, `partial-regional-dependency-failure`, `split-brain-incident`, `primary-database-failover`, `read-replica-lag` | No existing scenario combines an external regional dependency degradation + independent cross-region replication lag + a capacity overload that is *self-inflicted by the candidate's own correct-looking mitigation*. network-partition's trap is binary (dual write authority); this scenario's trap is sequential/compounding (fixing availability creates a second, different failure domain). Independently verified by reading `network-partition/rules.ts` directly during verification. |
| Global Checkout Brownout | `downstream-dependency-failure`, `cascading-service-failure`, `third-party-api-latency`, `dependency-timeout-cascade`, `request-timeout-cascade`, `fan-out-request-explosion` | Every comparison scenario is rooted in ONE dependency actually failing/timing out. Here no single dependency is ever bad enough alone — three independently-moderate degradations compose additively on one synchronous critical path. Independently verified by reading `cascading-service-failure/rules.ts` (keyed on a single `rootServiceErrorRate`) during verification. |
| Multi-Tenant Control Plane Overload | (control-plane/data-plane distinction has no close existing analog) | Novel mechanism: a control-plane-vs-data-plane failure-domain split with an explicit 30%-capacity-ceiling business invariant, not present in any existing scenario. |
| Regional Failover Causes Global Overload | `partial-regional-dependency-failure`, `cross-region-latency-spike`, `network-partition` | Those scenarios model a dependency/consistency problem across regions; this scenario's root mechanism is purely a *capacity* problem — a healthy region's automatic failover absorbing more load than it has reserve capacity for, requiring the candidate to cap failover rather than isolate/route around a degraded dependency. |
| Cross-Service Retry Amplification | `payment-retry-storm`, `message-retry-storm`, `dependency-timeout-cascade`, `request-timeout-cascade` | Every comparison scenario has retry behavior at ONE layer (or nested timeout-budget proportioning without independent per-layer retry ownership). This scenario requires choosing WHICH of four independently-configured layers should own retries — a genuinely distinct multi-boundary-ownership judgment, independently confirmed by reading `dependency-timeout-cascade/rules.ts` directly during verification (its mechanism: nested timeout budgets, one retry control, no ownership-boundary choice). |

No scenario required redesign — all 5 duplicate-mechanism audits were judged credible both by the writer and by independent verifier re-derivation against real file contents.

## 4. Architecture node/edge counts

| Scenario | Nodes | Edges | Target |
|---|---|---|---|
| Multi-Region Payment Platform Degradation | 12 | 14 | ~10-14 ✓ |
| Global Checkout Brownout | 9 | 8 | ~9 ✓ |
| Multi-Tenant Control Plane Overload | 6 | 6 | 6-9 (no tenant nodes added — author judged they weren't materially needed) |
| Regional Failover Causes Global Overload | 10 | 9 | ~10 ✓ (3 regions × API/Cache/DB + Global Router, no extra shared dependency added) |
| Cross-Service Retry Amplification | 6 | 5 | 6 ✓ (linear chain, no queue/pool components added — author judged they weren't needed) |

## 5. Flat-architecture readability result

All 5 scenarios used the existing flat `ArchitectureNode`/`ArchitectureEdge` representation with no extension. Every writer and every independent verifier confirmed "flat representation sufficient" for their assigned scenario — no agent reported a readability failure or requested the 5-point extension-need format.

## 6. Architecture extension recommendation

**None.** No scenario in this batch produced a demonstrated readability problem the flat model could not handle. Per §20's binding instruction, no shared architecture extension was proposed or implemented.

## 7. Difficulty classification

All 5 scenarios: `staff` (engine's ceiling value — see §1's note on the Senior-Staff/Principal distinction not being representable in the current enum).

## 8. Completion-mode classification

All 5 scenarios: `candidate_declared`, each with a real `acceptableCondition`. No scenario was classified `automatic` in this batch — all 5 genuinely required the candidate to judge whether the overall system was safe to hand back, not just detect an objective recovery threshold.

## 9. Unsafe/acceptable/optimal state audit

Full per-scenario state breakdowns are written as audit comment blocks in each scenario's own `definition.ts` (matching the `distributed-coordination-failure` precedent's rigor). Summary:

- **Multi-Region Payment Platform Degradation**: UNSAFE states include `baseline-unmitigated`, `fraud-controls-bypassed`, `unsafe-sequence-divergent-authority`(+full-shift variant), `us-ledger-overloaded` (the harmful pressure-transfer path), `ledger-fixed-partial-shift-unprotected`. ACCEPTABLE: `protected-shift-draining`, `protected-shift-with-event-deferral-draining`, `paused-replication-protected-draining`, `alternate-conservative-shift-draining` — all correctness-safe, capacity genuinely draining-but-bounded. OPTIMAL: `protected-shift-recovered`, `alternate-conservative-shift-recovered` — correctness-safe AND fully drained.
- **Global Checkout Brownout**: UNSAFE: `baseline-degraded-unmitigated`, `concurrency-amplified`, `retry-amplified-moderate`/`-aggressive`, `optimistic-reservation-trap` (correctness violation gated independently of latency), `timeout-tightened`/`timeout-loosened` (genuine tradeoffs, never a mitigation). ACCEPTABLE: `critical-path-trimmed-partial`. OPTIMAL: `critical-path-trimmed-full`.
- **Multi-Tenant Control Plane Overload**: UNSAFE: `unmitigated-churn`(+saturated), `unsafe-drain-before-quota` (sequencing trap), `lane-only-no-quota`, `worker-scaling-trap`(+saturated), `aggressive-batching-trap`. ACCEPTABLE: `quota-10-lane-moderate-batching-drained`, `quota-only-fix-drained`, `optimal-fix-draining` (recovery-lag state of the optimal fix, not yet drained). OPTIMAL: `quota-lane-moderate-batching-drained`.
- **Regional Failover Causes Global Overload**: UNSAFE: uncapped-failover (the required harmful/tempting path), restore-too-fast-after-capacity-returns (retrigger trap), leaving `REGION_A_RESTORATION_KEY` at `offline` after capacity returns (post-fix, no restoration ever occurs). ACCEPTABLE/OPTIMAL: capped-failover + shed + gradual, paced restoration paths (`restore-partial-gradual`, `restore-gradual-after-drain-safe`), differentiated by how conservative the restoration pace/share is.
- **Cross-Service Retry Amplification**: UNSAFE: `baseline-critical` (amp 81), `amplification-worsened` (amp 256), `single-layer-relief-incomplete` (amp 27), `two-layer-relief-incomplete` (amp 9), `timeout-tuned-no-ownership` (amp ~89). ACCEPTABLE: `owned-at-service-c-no-breaker`, `owned-zombie-work-persists`, `owned-backlog-draining` (real recovery-lag state). OPTIMAL: `owned-fully-safe`.

## 10. Business invariants

| Scenario | Invariants (verbatim from description) |
|---|---|
| Multi-Region Payment Platform Degradation | "Payment authorization must not create divergent ledger authority"; "mandatory fraud controls may not be bypassed under any capacity or latency pressure"; "settlement delay may be tolerated within an authored bounded window" |
| Global Checkout Brownout | "Payment authorization and inventory reservation must remain correct at all times and can never be traded away to relieve latency elsewhere"; "Promotions may be disabled outright"; "Tax may use the business-authorized bounded fallback"; "Pricing may serve a short-TTL cached price"; "Checkout may return reduced enrichment... rather than fail end-to-end" |
| Multi-Tenant Control Plane Overload | "existing data-plane traffic must remain available throughout"; "config convergence may slow temporarily, but metadata durability must never be lost"; "one tenant must not starve unrelated tenants' configuration changes"; "no single tenant may consume more than 30% of shared control-plane capacity" |
| Regional Failover Causes Global Overload | "critical customer operations must remain available, no matter which region"; "optional, low-priority traffic may be shed"; "healthy regions must not be driven into failure by the mitigation itself"; "a partial, contained loss of service... is explicitly preferable to... global collapse" |
| Cross-Service Retry Amplification | "customer requests may retry at exactly one controlled ownership boundary"; "the External Provider must be protected from multiplicative amplification"; "cancellation and timeout propagation should prevent zombie work" |

All 5 independently confirmed present via direct read of each root `<slug>.ts` description field during verification — none relies on a hidden success condition to define the business rule.

## 11. Multi-step path per scenario

- **#61**: set ledger write authority BEFORE shifting traffic → shift partial EU traffic → protect US ledger/settlement capacity → observe real catch-up window → Finish.
- **#62**: observe 3 dependencies each only "degraded" → form critical-path-composition hypothesis → disable Promotions → bounded-fallback Tax → cached-fallback Pricing → reduce enrichment → sustain 30s → Finish.
- **#63**: cap hot tenant's quota → (optionally) add dedicated lane for fairness → drain the backlog, with real elapsed time required before it shrinks.
- **#64**: limit automatic failover → protect B/C → shed/degrade optional traffic → recover partial A or increase safe capacity → gradually restore traffic (not instantly).
- **#65**: identify which ONE of 4 layers should own retries → stand down retries at the other 3 → apply circuit breaker + cancellation propagation → observe real backlog-drain window before fully-safe.

## 12. Action-sequencing audit

Per §12's ≥3-of-5 requirement: **4 of 5 scenarios** have real, tested sequencing sensitivity (exceeds the floor):
- **#61**: setting EU traffic shift BEFORE fixing ledger write authority produces a real, counted `divergentLedgerAuthorityCount` violation (14); reversed order produces zero divergence. Both safe and unsafe sequence tests present.
- **#63**: draining the backlog while the hot tenant's quota is still unthrottled never shrinks `schedulerQueueDepth` regardless of elapsed time (`unsafe-drain-before-quota`) — isolate-before-drain is required.
- **#64**: restoring Region A traffic too fast (`instant` pace) after capacity returns retriggers degradation even on a correctly-capped region; gradual pace does not.
- **#65**: choosing retry ownership (standing down retries at 3 of 4 layers) BEFORE tuning Service C's timeout/circuit-breaker reaches safety; tuning timeout/breaker first while retries remain unowned leaves amplification at ~89× (no improvement).
- **#62**: no genuine order-dependent mechanism was authored (the 4 critical-path-trim controls are independent and commutative) — correctly reported as N/A rather than forced.

## 13. Pressure-transfer audit

Per §13's binding ALL-5 requirement: **5 of 5 scenarios** have a real, authored pressure-transfer mechanism with distinct numeric values, independently verified by reading `rules.ts`/`revenue-and-cost.ts` directly for each:
- **#61**: shifting 100% EU traffic to US (`euTrafficPercentage=0`) drives `usLedgerUtilization` to 128 (over capacity) and `settlementBacklogThousands` to 22, vs. a 40%-shift path peaking at 78/6.
- **#62**: `retryPolicy=aggressive` drives `checkoutLatencyMs` to 9200 (vs. baseline 3150) and `paymentAuthSuccessPct` to 86 (vs. 100) — Payment/Inventory, never directly degraded, measurably worsen.
- **#63**: `metadataWriteBatching=large` drives `metadataDbWritePressure` down to 20 but `configConvergenceAgeSeconds` up to 310 (vs. the moderate-batching fix's 45-140 range); `workerConcurrency=scaled-up` drives `metadataDbWritePressure` to 94-99 (higher than doing nothing) and causes real `metadataWriteLossCount` > 0.
- **#64**: uncapped failover drives Region B/C API/DB utilization and cache hit rate to measurably worse values than baseline (API 135 vs 70, DB 150 vs 65, cache 40% vs 92%, success 55% vs 100%).
- **#65**: reducing retries at only 1-2 of 4 layers leaves amplification at 27× or 9× (vs. baseline 81×) — real, incomplete relief, not elimination, proving pressure persists at the un-owned layers.

## 14. Recovery-lag audit

Per §14's ≥4-of-5 requirement: **5 of 5 scenarios** model real recovery lag (exceeds the floor), independently confirmed via timed-events.ts + rules.ts cross-reads:
- **#61**: ledger replication lag/settlement backlog require a real elapsed catch-up window (`CATCHUP_WINDOW_ELAPSED_MS`, 3 simulated minutes) even with the correct fix applied.
- **#62**: `inFlightDrainingRequests` remains 0 throughout the active incident and becomes nonzero only in the post-recovery state, modeling in-flight-request drain after natural dependency recovery.
- **#63**: `schedulerQueueDepth` only genuinely shrinks after `drainWindowElapsed` — the correct fix (quota capped) produces a distinct "just fixed, not yet drained" state before reaching the fully-drained optimal.
- **#64**: Region B/C capacity/health does not snap back instantly after Region A's capacity returns — a real observable recovery window is modeled, and restoring too fast within that window retriggers degradation.
- **#65**: the connection-pool backlog built up during the unresolved window (authored +260 in-flight/+55 zombie) drains only after `STABILIZATION_WINDOW_MS` (20s) — `owned-backlog-draining` is a distinct, real intermediate state from `owned-fully-safe`.

## 15. Tempting unsafe path per scenario

- **#61**: dumping 100% EU traffic to US with zero settlement/throttle protection — looks fully correct on every availability metric, drives US ledger/settlement into overload.
- **#62**: switching `inventoryReservationStrategy` to `optimistic` — Inventory looks faster and "healthy," but silently accumulates real, counted unreconciled reservations (37).
- **#63**: scaling worker concurrency — data plane is healthy from the start, so this touches nothing about the root cause, and adds metadata-DB read load on top of the control plane's existing write pressure, eventually causing real write loss.
- **#64**: "send all Region A traffic to B/C" — the obvious full-failover path, required by the spec to be harmful; drives B/C toward their own capacity limits, risking a second regional failure.
- **#65**: reducing provider retries at exactly one layer (e.g. Service C, closest to the provider) — looks like direct action on "the layer closest to the problem," but amplification barely changes since the other 3 layers still multiply request volume independently.

## 16. Alternate strong paths

Per §16 (not a binding floor for this batch, but genuinely present in 4 of 5):
- **#61**: a more conservative 70%-local/30%-shifted path combined with risk-enrichment shedding reaches OPTIMAL with strictly lower peak US ledger utilization than the primary 40%-shift path, at the cost of slower EU availability recovery.
- **#63**: a stricter 10%-quota path (vs. the 30% ceiling) reaches a genuine, distinct ACCEPTABLE-leaning state with faster relief for everyone else at a cost to the hot tenant's own convergence speed.
- **#64**: partial Region A restoration (`"partial"` mode) vs. full restoration are two genuinely distinct safe paths, differentiated by how much traffic share comes back and how conservative the approach is.
- **#65**: two distinct ACCEPTABLE-tier states exist (ownership consolidated + breaker on/cancellation off, vs. ownership consolidated + cancellation on/breaker off) — both real, both scoring 940/1000, representing different secondary-safeguard choices.
- **#62**: no alternate strong path beyond the acceptable/optimal trim-depth spectrum (partial trim vs. full trim is a single spectrum, not two independent strategies) — correctly not claimed as a second distinct strategy.

## 17. Immediate-Finish results

All 5 confirmed `declared_unstable` on zero-action immediate Finish, matching §11's expected default — no deviation required for any scenario in this batch. Each has a dedicated test proving this (both pre-incident-moot and post-incident-no-action cases where relevant).

## 18. Scoring table

Fixed six-dimension split, used identically by all 5 scenarios (no scenario-specific scorer code):

| Dimension | Points |
|---|---|
| Recovery | 300 |
| Customer Impact | 200 |
| Data Integrity | 200 |
| Reliability | 150 |
| Cost Efficiency | 100 |
| Operational Efficiency | 50 |
| **Total** | **1000** |

Actual executed scores per scenario (quoted from real test runs, independently re-derived by verifiers in at least 2 of 5 cases):

| Scenario | Optimal | Acceptable | Baseline | Harmful |
|---|---|---|---|---|
| #61 Multi-Region Payment | 930 | 880 | 550 | 515 (fraud-bypass trap: 375) |
| #62 Global Checkout | 865 | 805 | 360 | 250 (correctness trap: 295) |
| #63 Control Plane Overload | (verified executing, exact totals in test file) | — | — | — |
| #64 Regional Failover | 845 | 705 | 290 | 190 |
| #65 Cross-Service Retry | 1000 | 940 | 390 | 375 (incomplete-relief trap: 480) |

## 19. Suspicious score investigations

Each writer was required to self-check for 4 failure modes and fix any found; independently spot-confirmed by verifiers for #61, #62, #64, #65:

- **#61**: found and fixed — `fraud-controls-bypassed` initially scored full Data Integrity marks (the measure only checked ledger authority, not fraud bypass); fixed via a unified `correctnessStatus` field gating on either invariant. Also found and fixed — `acceptable` initially outscored `optimal` (980 vs 930-940) due to a faster Finish time; fixed via a `capacityRiskStatus` severity field distinguishing "draining" from "fully recovered."
- **#62**: found and fixed — the correctness trap (`optimistic-reservation-trap`) initially scored too cheaply (its authored revenue-loss rate didn't reflect real downstream customer cost); raised from 700→3200/min, dropping its score to 295 (below baseline). Also found and fixed — acceptable/optimal originally tied at 865=865 (a single boolean dataIntegrity band didn't distinguish partial vs. full trim); rebuilt as a real stacking-penalty measure.
- **#64**: no issues found — harmful (190) < baseline (290) < acceptable (705) < optimal (845), confirmed via explicit test assertions.
- **#65**: no issues found — harmful (375) < baseline (390); acceptable (940) < optimal (1000); the trap state (480) is real partial progress, well below optimal.

## 20. Feedback coverage

| Scenario | Rules | Feedback blocks | Coverage |
|---|---|---|---|
| #61 | 12 | 12 | 100% |
| #62 | 12 | 12 | 100% |
| #63 | 8 | 8 | 100% |
| #64 | 11 | 11 | 100% |
| #65 | 8 | 8 | 100% |

All feedback independently confirmed (by direct file read during verification, for at least #61/#62/#64/#65) to describe real system consequences ("Moving all EU traffic to US restored regional availability but pushed the surviving ledger above its safe write capacity..." style), never a bare "wrong answer."

## 21. Per-scenario test counts

| Scenario | Tests |
|---|---|
| #61 Multi-Region Payment Platform Degradation | 33 |
| #62 Global Checkout Brownout | 32 (29 original + 3 added during the post-verification fix) |
| #63 Multi-Tenant Control Plane Overload | 30 |
| #64 Regional Failover Causes Global Overload | 31 (28 original + 3 added during the post-verification fix) |
| #65 Cross-Service Retry Amplification | 29 |
| **Total new tests** | **155** |

## 22. Verifier verdicts

| Scenario | Initial verdict | Final status |
|---|---|---|
| #61 Multi-Region Payment Platform Degradation | VERIFIED (all 18 checks pass) | VERIFIED, no changes needed |
| #62 Global Checkout Brownout | REJECTED (17/18 pass; `TIMEOUT_BUDGET_MS_KEY` dead control) | Fixed (wired into real rule logic + 3 new tests), independently re-verified by orchestrator |
| #63 Multi-Tenant Control Plane Overload | VERIFIED (all 18 checks pass) | VERIFIED, no changes needed |
| #64 Regional Failover Causes Global Overload | REJECTED (17/18 pass; `REGION_A_RESTORATION_KEY` dead control) | Fixed (wired into real rule logic, surfaced and fixed a real behavioral bug where traffic restored without the candidate declaring restoration intent, + 3 new tests), independently re-verified by orchestrator |
| #65 Cross-Service Retry Amplification | VERIFIED (all 18 checks pass) | VERIFIED, no changes needed |

Both REJECTED verdicts were for the same defect category (a defined-but-unreferenced control) and both were judged fixable without redesign by the original verifiers — confirmed correct by the orchestrator, who independently re-derived both fixes via dedicated fix-agents (not the original authors) and independently re-grepped both control keys post-fix to confirm real rule-table usage before wiring into the catalog.

## 23. Orchestrator filesystem verification

Performed independently, not trusting any agent's self-report:
- `git status --short` after the workflow completed: confirmed all 5 scenarios' complete 12-file sets present, no stray files beyond one `__debug_score.test.ts` (self-removed by the Multi-Region author before reporting done, confirmed absent).
- Read `multi-tenant-control-plane-overload/rules.ts` in full directly (590 lines) — confirmed the misleading-symptom trap, both pressure-transfer mechanisms, and the sequencing trap are genuinely modeled with real distinct values, not asserted.
- Read `global-checkout-brownout/controls.ts` and confirmed the `TIMEOUT_BUDGET_MS_KEY` dead-control finding directly via grep before dispatching a fix.
- Read `regional-failover-causes-global-overload/controls.ts`/`action-classifications.ts` and confirmed the `REGION_A_RESTORATION_KEY` dead-control finding directly via grep before dispatching a fix.
- Post-fix: independently re-grepped both control keys' usage in their respective `rules.ts` files, confirming real non-zero reference counts (4 for `TIMEOUT_BUDGET_MS_KEY`, 10 for `REGION_A_RESTORATION_KEY`).
- Confirmed via `grep -n "difficulty:\|estimatedMinutes:"` and description-field reads across all 5 scenarios that every business invariant is genuinely present in candidate-facing prose.
- Confirmed `packages/scenarios/src/library/catalog.ts` and `packages/scenarios/src/index.ts` were touched ONLY by the orchestrator (never by a scenario-author or verifier agent) throughout this batch.

## 24. Package test result

`pnpm --filter @incidentrank/scenarios test` → **1647 passed, 4 skipped (pre-existing, unrelated dev-only timeline tests), 0 failed**, across 72 test files (1 skipped file).

## 25. Full test result

`pnpm test` (monorepo-wide) → **1970 passed, 4 skipped, 0 failed**:
- `packages/simulator`: 38 passed
- `packages/scenarios`: 1647 passed, 4 skipped
- `packages/db`: 8 passed
- `packages/scoring`: 23 passed
- `apps/web`: 254 passed

## 26. Typecheck

`pnpm typecheck` → **PASS** across all 5 workspace packages.

## 27. Lint

`pnpm lint` → **PASS** across all 5 workspace packages, 0 errors/warnings.

## 28. Build

`pnpm build` → **PASS**. Next.js production build compiled successfully, all routes generated.

## 29. Seed

`pnpm --filter @incidentrank/db db:seed` → **`Seed complete (65 built-in scenario(s)).`** — matches §21's expected catalog exactly (65 total, 3 free, 62 paid).

## 30. Deviations

1. **Two scenarios required a post-verification fix before approval**: `global-checkout-brownout` (dead `TIMEOUT_BUDGET_MS_KEY` control) and `regional-failover-causes-global-overload` (dead `REGION_A_RESTORATION_KEY` control, which also surfaced a real behavioral bug — traffic was being restored even when the candidate never declared restoration intent). Both were fixed by dedicated fix-agents (not the original authors, to get a fresh, unbiased read of the defect) with full context of the exact verifier finding, then independently re-verified by the orchestrator via direct grep/file-read before wiring into the catalog. Neither required redesigning the scenario's core mechanism — both fixes were additive and isolated, and all pre-existing tests continued passing unmodified (29→32 and 28→31 tests respectively, no existing assertions changed).
2. **Difficulty enum limitation**: the engine has no distinct "Senior Staff" vs. "Principal" difficulty value; all 5 scenarios use `staff`, the closest available value. Flagged as a known representational gap, not fixed (would require a shared engine change, out of scope for scenario authoring).
3. **A batch-specific execution spec (`phase6dsupport.md`) was discovered after an initial workflow run had already been launched against a looser, orchestrator-authored script.** That run was stopped mid-flight; its partial (incomplete, 1-2-of-10-files) untracked output was deleted; the batch script was rewritten to match `phase6dsupport.md` exactly before relaunching. No scenario from the discarded run was reused.

## 31. Principal-level quality assessment for each scenario

- **#61 Multi-Region Payment Platform Degradation**: Strong Principal-level design. Requires forming a system hypothesis (two independent root causes, not one) before acting; the obvious fix (shift all traffic) is available-metric-good but creates an entirely new failure domain invisible in availability metrics alone; correctness protection must be sequenced before traffic shifting or real divergent writes occur. A trial-and-error approach would plausibly converge on the harmful full-dump path specifically because it looks like a clean win on every candidate-visible metric. Independently assessed as NOT solvable by randomly trying controls.
- **#62 Global Checkout Brownout**: Strong Principal-level design. The "nothing is down" framing genuinely defeats symptom-chasing; the most natural instinct (retry harder) is authored to make things monotonically worse; the correctness trap (optimistic reservation) actively looks like a free win with zero visible downside, misleading trial-and-error toward the worst-scoring path rather than away from it. Independently assessed as NOT solvable by control-mashing.
- **#63 Multi-Tenant Control Plane Overload**: Solid Senior Staff design. The control-plane/data-plane distinction is a genuine, non-obvious failure-domain-identification requirement; the misleading-symptom trap (data plane reads 100% healthy while control plane is already critical) is real and well-modeled; two independent pressure-transfer mechanisms (aggressive batching, worker scaling) both carry real penalties including an actual durability violation (write loss) for the data-plane-healthy-looking worker-scaling trap.
- **#64 Regional Failover Causes Global Overload**: Strong Principal-level design, and the one with the most directly-stated design requirement in the spec ("the obvious 'send all traffic elsewhere' path must be harmful") — confirmed genuinely implemented with real, distinct worse values. The recovery-retrigger mechanism (restoring too fast undoes the fix) adds a second layer of judgment beyond the initial containment decision.
- **#65 Cross-Service Retry Amplification**: Strong Senior Staff design, and the clearest "ownership, not tuning" lesson in the batch. Naive single-layer or two-layer retry reduction produces visibly-better-but-still-unsafe traps (27×, 9× amplification) specifically engineered to punish partial, ungrounded trial-and-error — a candidate must recognize retries need to be consolidated to exactly one layer, not reduced piecemeal.

All 5 scenarios were independently assessed (by at least one verifier, and for #61/#64 also spot-confirmed by the orchestrator) against the Principal-Level Acceptance Test ("could a strong Senior engineer solve this primarily by trying controls?") with an honest "no" in every case, each backed by a specific mechanism (a misleading-but-plausible trap, a required multi-decision hypothesis, or a monotonically-worsening naive escalation) rather than asserted difficulty from scale alone.

---

Per phase6dsupport.md §24's stop condition: scenarios 61-65 are fully authored, all five independently verified (2 after a scoped fix-and-re-verify cycle), shared catalog wired by the orchestrator, flat architecture reviewed (no extension needed), Principal-level audit passed for all 5, all tests green (1970 passed, 0 failed), seed reports 65. **Stopping here. Not beginning 6D.2 until this report is reviewed.**
