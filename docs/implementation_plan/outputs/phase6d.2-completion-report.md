# Phase 6D.2 Completion Report

Per docs/implementation_plan/phase6d.2.md §17. Scope: shared difficulty-metadata extension, the #63 scoring-gap closure, and scenarios 66-70 (data/event correctness incidents). Does not begin 6D.3.

## 1. Difficulty metadata change and tests

Extended `ScenarioDefinition["difficulty"]` (`packages/scenarios/src/types.ts:56`) and `AuthoredDifficulty` (`packages/scenarios/src/authoring/schema.ts:19`) from `"beginner"|"intermediate"|"senior"|"staff"` to add `"senior_staff"|"principal"` — metadata/UI only, no simulator behavior change, no scoring change, no completion change, fully backward compatible.

**Files changed:**
- `packages/scenarios/src/types.ts` — widened the union.
- `packages/scenarios/src/authoring/schema.ts` — widened `AuthoredDifficulty`.
- `packages/scenarios/src/library/catalog.test.ts` — widened the test's own hardcoded `validDifficulties` allow-list to include both new values.
- `apps/web/src/app/incidents/library-browser.tsx` — added both values to `DIFFICULTY_LABEL` ("Senior Staff"/"Principal") and `DIFFICULTY_RANK` (4/5, above `staff`'s 3), so sort/filter continue to work for the two new tiers.
- `apps/web/src/components/scenario-console/locked-scenario-screen.tsx` — added both values to `DIFFICULTY_LABEL`.
- `apps/web/src/components/scenario-console/briefing-screen.tsx` — added both values to `DIFFICULTY_LABEL`.
- `apps/web/src/app/organizations/[slug]/scenarios/[scenarioId]/edit/sections/basics-section.tsx` — added both values to the authoring `DIFFICULTIES` array, and replaced the previous `d.charAt(0).toUpperCase()+d.slice(1)` auto-capitalization (which would have rendered `"Senior_staff"`) with an explicit `DIFFICULTY_OPTION_LABEL` lookup so the `<select>` renders "Senior Staff"/"Principal" correctly.
- 5 existing Phase 6D.1 scenario files' `difficulty:` fields updated to their intended level (see §1 of the 6D.1 report vs. this report's correction): `multi-region-payment-platform-degradation.ts`→`principal`, `global-checkout-brownout.ts`→`principal`, `multi-tenant-control-plane-overload.ts`→`senior_staff`, `regional-failover-causes-global-overload.ts`→`principal`, `cross-service-retry-amplification.ts`→`senior_staff`.
- 5 corresponding test files updated: each had a hardcoded `expect(...difficulty).toBe("staff")` assertion (and matching test-title text) that needed updating to the new intended value — `cross-service-retry-amplification.test.ts`, `global-checkout-brownout.test.ts`, `multi-region-payment-platform-degradation.test.ts`, `multi-tenant-control-plane-overload.test.ts`, `regional-failover-causes-global-overload.test.ts`.

**Validation performed:** full `pnpm typecheck`/`pnpm lint`/`pnpm test`/`pnpm build` run clean immediately after this change, before any 6D.2 scenario authoring began (confirming the metadata extension alone is safe), and `pnpm --filter @incidentrank/db db:seed` still reported 65 (unchanged — metadata-only, no new scenario yet at that point).

No Postgres/Drizzle schema or seed-script change was needed — `difficulty` has never been a persisted DB column (confirmed via direct inspection of `packages/db/src/schema.ts` and `packages/db/src/seed.ts`); it is catalog-only, in-memory metadata the web app reads directly off `ScenarioDefinition`.

## 2. Exact #63 scoring totals (closing the Phase 6D.1 report gap)

Multi-Tenant Control Plane Overload's executed totals, captured by temporarily instrumenting its own test file with a console.log probe (immediately reverted — confirmed via `git status --short` showing a clean, zero-diff file afterward), run against the real engine:

| Path | Total | Recovery | CustomerImpact | DataIntegrity | Reliability | CostEfficiency | OperationalEfficiency |
|---|---|---|---|---|---|---|---|
| Optimal (full fix) | **880** | 180 | 200 | 200 | 150 | 100 | 50 |
| Lane-only (acceptable) | 715 | 300 | 200 | 50 | 15 | 100 | 50 |
| Quota-only (acceptable) | 550 | 0 | 200 | 200 | 0 | 100 | 50 |
| Baseline (no action) | 400 | 0 | 200 | 50 | 0 | 100 | 50 |
| Worker-scaling (harmful) | 340 | 0 | 200 | 50 | 0 | 55 | 35 |
| Aggressive-batching (harmful) | 535 | 0 | 200 | 200 | 0 | 100 | 35 |

These are the real numbers backing the 6D.1 report's relative-ordering assertions (`optimal > laneOnly > baseline > workerScaling`, `dataIntegrity` discrimination) — all consistent with what was previously only described qualitatively.

## 3. Scenarios 66-70 added

| # | Slug | Name | Difficulty |
|---|------|------|---|
| 66 | `ledger-reconciliation-divergence` | Ledger Reconciliation Divergence | `principal` |
| 67 | `hot-shard-replica-lag-failover-risk` | Hot Shard + Replica Lag + Failover Risk | `principal` |
| 68 | `event-platform-partial-outage` | Event Platform Partial Outage | `senior_staff` |
| 69 | `search-platform-cascade` | Search Platform Cascade | `senior_staff` |
| 70 | `api-migration-dual-write-failure` | API Migration Dual-Write Failure | `principal` |

All 5 match phase6d.2.md's own assigned difficulty levels exactly — no deviation, and no more falling back to `staff` as a ceiling substitute now that the real enum values exist.

## 4. Duplicate-mechanism audits

| Scenario | Closest existing scenarios | Distinct root mechanism | Distinct dominant mitigation | Distinct Principal-level judgment |
|---|---|---|---|---|
| #66 Ledger Reconciliation Divergence | `duplicate-event-processing`, `out-of-order-events`, `distributed-coordination-failure`, `consistency-vs-availability-incident` | A financial event-propagation pipeline (Operational Ledger → Event Stream → Settlement Ledger → Reconciliation → Repair Queue) with TWO independently-tracked historical counters (missing vs. duplicate), vs. each comparison's single detect-and-skip or self-bounding-reorder mechanism | A dedicated Repair Queue process (active-exception-routing + auto-repair) that must be separately engaged — pausing/fixing the publisher alone never drains the backlog | Distinguishing live-traffic health (the decoy) from financial correctness; recognizing "pause everything" is containment, not resolution; resisting blind replay; treating exception-discard as an outright correctness violation, not a missed optimization |
| #67 Hot Shard + Replica Lag + Failover Risk | `hot-database-partition`, `primary-database-failover`, `read-replica-lag` | Combines hot-shard pressure + replica lag + failover-risk-under-lag into ONE scenario with a real stale/lost-write authority consequence, vs. each comparison's single-cause mechanism in isolation | Contain hot-tenant pressure → protect primary → allow replica catch-up → evaluate failover only past a safety threshold, vs. any comparison's single-lever fix | A misleading replica-process-health signal (pinned healthy throughout) actively defeats "turn controls until green" reasoning; candidate must form a write-authority-safety hypothesis before acting, not discover it by trying failover |
| #68 Event Platform Partial Outage | `kafka-consumer-lag`, `event-processing-backpressure`, `message-retry-storm`, `kafka-partition-skew` | 3 independently-timed triggers (broker partition class, Consumer Group B lag, Consumer Group C aggressive retries) across 3 topics/3 consumer groups, with cross-group pressure-transfer (Group B's fix damages Group C's downstream dependency), vs. each comparison's single surge/single-layer mechanism | Diagnosing and acting on broker/consumer/downstream as 3 independent problems, never collapsing into "just add consumers" | Scaling the loudest/most-visible metric (Group B's lag) actively worsens an unrelated shared dependency below even the no-action baseline — candidate must check a metric they didn't touch to notice the regression |
| #69 Search Platform Cascade | `fan-out-request-explosion`, `cascading-service-failure`, `dependency-timeout-cascade` | A single-shared-connection-pool-held-open-by-one-slow-sibling mechanism (Ranking Service moderately slow, Query Coordinator waits longer, pressure transfers to index clusters/feature store), vs. fan-out-request-explosion's genuine call-count-widening-to-5-services mechanism | Intentional quality degradation (disable/degrade ranking) rather than scaling capacity, vs. comparison scenarios' capacity/timeout-tuning fixes | The two "obvious" fixes (scale capacity, flip on partial-result mode) are both authored traps — one worsens the exact pressure it's meant to relieve, the other creates a silent, non-resetting correctness violation invisible on every health dashboard |
| #70 API Migration Dual-Write Failure | `deployment-regression`, `partial-rollout-regression`, `distributed-coordination-failure`, `consistency-vs-availability-incident` | Dual-write authority/divergence/reconciliation during an in-flight migration between two full service+DB stacks, vs. comparisons' single-service rollout regression or ownership-table-fencing mechanisms | Freeze authority → stop divergence → reconcile → verify → THEN choose rollback or continuation, vs. comparisons' single-direction rollback/fencing fix | The two tempting fast-looking fixes (`replay-blind`, rollback+read=legacy) are genuinely deceptive against the obviously-watched metrics (success rate, raw divergence count); violations are irreversible within a run |

All 5 audits were independently re-confirmed by their verifier agents reading the named comparison scenarios' own `rules.ts` directly, not merely trusting the writer's claim. No redesign was required for any of the 5.

## 5. Architecture node/edge counts

| Scenario | Nodes | Edges |
|---|---|---|
| #66 Ledger Reconciliation Divergence | 6 | 5 |
| #67 Hot Shard + Replica Lag + Failover Risk | 11 | 10 |
| #68 Event Platform Partial Outage | 10 | 11 |
| #69 Search Platform Cascade | 7 | 6 |
| #70 API Migration Dual-Write Failure | 8 | 8 |

## 6. Flat-readability verdicts

All 5: **"flat representation sufficient."** No scenario required grouping/containers/nested architecture. Notable reasoning: #67's 4 structurally-identical shard-pair units let the candidate learn one repeated pattern rather than 4 distinct ones; #70's Legacy/New stacks are structurally symmetric, so no grouping would improve readability beyond clear labeling; #68's 10/11-node linear-fan-out stayed within readable bounds specifically because the shared-downstream fan-in is load-bearing for the pressure-transfer mechanic, not incidental complexity. No architecture extension was proposed or needed by any of the 5 authors or verifiers.

## 7. Difficulty classification

| Scenario | Difficulty |
|---|---|
| #66 | `principal` |
| #67 | `principal` |
| #68 | `senior_staff` |
| #69 | `senior_staff` |
| #70 | `principal` |

All verified directly against the new enum values (not `staff`) by each scenario's independent verifier.

## 8. Completion modes

All 5: `candidate_declared` with a real `acceptableCondition`. No scenario was classified `automatic` — all 5 genuinely require the candidate to judge whole-system safety (including the historical-damage counter's bounded/draining status), not just detect an objective recovery threshold.

## 9. Unsafe/acceptable/optimal states

Full per-scenario state breakdowns are written as audit comment blocks in each scenario's own `definition.ts` (matching the established `distributed-coordination-failure`-quality precedent). Summary:

- **#66 Ledger Reconciliation Divergence**: UNSAFE — `baseline-diverging`, `baseline-sustained-diverging`, `replay-unsafe-amplified`, `concurrency-amplified-damage`, `frozen-unrepaired` (new divergence stopped but never engaged repair), and any state with `discardedAcknowledgedEntryCount>0`. ACCEPTABLE — `draining-sustained-window1/2-{normal,expedited}`: new divergence stopped, backlog bounded and demonstrably draining. OPTIMAL — `fully-reconciled`: backlog at zero, correctness fully restored.
- **#67 Hot Shard + Replica Lag + Failover Risk**: UNSAFE — every no-mitigation baseline, `broad-scaling-worsened`, `stale-read-routing-violation`, and ALL `shard2FailoverSafety==="unsafe-promotion"` states regardless of reconciliation progress (the stale-write violation is permanent for the attempt once triggered). ACCEPTABLE — `contained-draining`/`alternate-moderate-throttle-draining`: new damage stopped, failover safety genuinely safe, lag bounded and draining but not yet fully caught up. OPTIMAL — fully-drained, safe-promotion-or-no-failover-needed states.
- **#68 Event Platform Partial Outage**: UNSAFE — `broker-degraded-only`, `broker-and-consumer-b-active`, `all-three-unmitigated` baseline, `pressure-transferred-downstream` (Group B fix damages Group C's downstream), `topic-a-contention-drop-active`, `producer-backpressure-masked` (post-fix addition — masks symptoms without touching root cause). ACCEPTABLE — `all-mitigated-draining`: broker isolated, batch bounded, Group B/C handled, but the three recovery windows haven't all elapsed. OPTIMAL — `all-mitigated-recovered`.
- **#69 Search Platform Cascade**: UNSAFE — `baseline-unmitigated`/`untouched-defaults-no-drain-possible`, `concurrency-raised-alone-worsens-pressure`, `scale-symptom-worsens-pressure`, `unsafe-partial-results-no-cache-bound` (explicit correctness gate — stale/unrelated results served), `index-timeout-tightened-during-pressure-transfer` (post-fix addition — compounds the existing trap). ACCEPTABLE — `degraded-quality-safe-draining`. OPTIMAL — `degraded-quality-safe-drained` (and the permanent "exclude ranking forever" alternate strong path, also OPTIMAL-eligible).
- **#70 API Migration Dual-Write Failure**: UNSAFE — `dual-write-unmitigated-baseline`/`-escalated`, `aggressive-rollout-increase-*` (cold path, ×2), `divergence-active-unmanaged`, `replay-blind-corrupts-data`, `unsafe-sequence-rollback-before-reconcile` (real `silentlyLostAcknowledgedWriteCount`/`exposedDivergentReadCount` violations). ACCEPTABLE — `draining-normal-priority-new-authoritative`/`draining-critical-first-*`, `aggressive-rollout-increase-with-shadow-warmup` (post-fix addition — genuinely safer than cold but not fully safe). OPTIMAL — `fully-reconciled-rollback-legacy` and `fully-reconciled-continue-new` (two distinct, both-legitimate optimal paths).

## 10. Business invariants

| Scenario | Invariants (verbatim or near-verbatim from description) |
|---|---|
| #66 | "The operational ledger is the authoritative transaction record"; "settlement must never invent or double-apply value"; "a transaction acknowledged to the customer may not simply be discarded to make reconciliation metrics look healthy"; "historical financial divergence must be accounted for before the incident can be considered fully resolved" |
| #67 | "Acknowledged writes must not be lost"; "temporary throttling of one tenant is acceptable to protect the platform"; "stale reads may be tolerated only within the authored bound"; "a replica cannot become authoritative until it is sufficiently caught up" |
| #68 | "Critical Topic A events must remain durable"; "lower-priority Topic C may be delayed"; "no consumer group may be allowed to destabilize unrelated topics"; "dropping events merely to reduce lag is not acceptable" |
| #69 | "Basic search results are business-critical"; "advanced ranking/re-ranking is optional during an incident"; "search correctness must not be sacrificed by returning unrelated/stale content outside the allowed bound"; "feature enrichment may be degraded" |
| #70 | "There must be exactly one authoritative write source during incident containment"; "acknowledged writes must not disappear during rollback"; "rollback does not automatically repair data already written only to the new system"; "read routing must not expose unresolved divergent state"; "migration safety is more important than continuing rollout velocity" |

All 5 independently confirmed present via direct read of each root `<slug>.ts` description field by both the author and the independent verifier.

## 11. Historical-damage model per scenario

| Scenario | Historical/cumulative field(s) | Non-reset proof |
|---|---|---|
| #66 | `missingEntryCount`, `duplicateSettlementEntryCount` (derived `reconciliationBacklogCount`) | Test: fixing publishing alone stops NEW divergence but freezes (does not reset) missing/duplicate counts — `afterFix.values.missingEntryCount === before.values.missingEntryCount`, status `"frozen-unrepaired"`. Only the separately-engaged repair-window sequence drains it. |
| #67 | `shard2StrandedAcknowledgedWriteCount` | Proven to climb further the longer an unsafe promotion is sustained (85→140); proven to NOT reset when the live config is fixed (flipping failover back off, or lag draining naturally) — requires an explicit reconciliation step. |
| #68 | `topicAEventsDroppedTotal` (plus engine-maintained peak via `trackPeak: true`) | Test: fixing isolation/batch size AFTER contamination stops new drops, but the historical total does not reset to zero — remains at its accumulated value (340 in the contamination-scarred-but-live-safe state) even once `topicADurabilityPct` reads 100 again. |
| #69 | `staleOrUnrelatedResultsServedCount` (live + engine-maintained peak via `numericWatchFields.trackPeak`) | Only increments while the full unsafe combination (`rankingInclusion=excluded` AND `partialResultMode=on` AND `cache=off`) holds; turning cache on stops new accumulation but the peak/live count does not silently zero. |
| #70 | `unreconciledDivergentRecordCount`, `newOnlyUnreconciledRecordCount` | Test: freezing write mode stops further divergence growth, but the existing backlog remains exactly where it was — confirmed immediately-after-freeze count equals the count much later with no reconciliation running. |

All 5 non-reset claims were independently re-traced by their verifiers through actual rule transitions, not accepted on the writer's word alone — all confirmed real.

## 12. Multi-step path per scenario

- **#66**: fix `eventPublishingMode`→`at-least-once-safe` (stops new divergence) → set `reconciliationMode`→`active-exception-routing` (still frozen) → set `exceptionPolicy`→`auto-repair` (finally begins draining over real elapsed repair time).
- **#67**: throttle hot tenant strictly first → wait for lag to drain under the safety threshold → evaluate failover only once safe → gradually restore tenant traffic.
- **#68**: isolate the broker partition → bound batch size → fix Consumer Group B concurrency AND Consumer Group C's retry mode together (not just one) → engage downstream circuit breaker → wait for all 3 independent recovery windows to elapse.
- **#69**: disable/degrade ranking → reduce feature-store demand → drain coordinator concurrency with the bounded cache engaged → wait for the drain window → restore selectively (or remain permanently degraded, a legitimate OPTIMAL-eligible choice).
- **#70**: freeze write authority → stop divergence → reconcile → verify → then choose EITHER rollback-to-legacy OR controlled continuation-to-new, both legitimate.

## 13. Sequencing audit

Per phase6d.2.md §11's requirement (explicit for #67 and #70, plus "at least two additional... where the authored state graph genuinely supports it," with an explicit instruction not to manufacture it for Search): **4 of 5 scenarios** have real, tested sequencing sensitivity.

- **#67 (mandatory)**: `FAILOVER_SHARD2_KEY=true` immediately after lag onset (`lagDrainWindowElapsed=false`) → `shard2FailoverSafety="unsafe-promotion"`, real stranded-write count. Safe order: throttle strictly first, wait for lag drain, evaluate failover only past the safety threshold. Explicit safe-order and unsafe-order tests both present and passing.
- **#70 (mandatory)**: `unsafe-sequence-rollback-before-reconcile` (rollback=true, readSource=legacy, reconciliationMode=off while `newOnlyUnreconciledRecordCount>0`) → real `silentlyLostAcknowledgedWriteCount`/`exposedDivergentReadCount` violations. Explicit safe-order and unsafe-order tests both present and passing.
- **#68**: scaling `CONSUMER_B_CONCURRENCY_KEY` before fixing `CONSUMER_C_RETRY_MODE_KEY` off `"aggressive"` reaches `pressure-transferred-downstream` (worse than untouched baseline); the same two fixes applied together (order-independent in the safe case) reach genuine recovery.
- **#69**: restoring `RANKING_INCLUSION_KEY="included"` while still carrying the degraded-mode configuration BEFORE `coordinatorDrainWindowElapsed` fires lands on `restore-too-early-retrigger` — a real, tested order-dependence, authored because the state graph genuinely supported it (not manufactured to hit the quota, consistent with phase6d.2.md's explicit instruction not to force this for Search).
- **#66**: no strict unsafe/safe ordering trap in the classic sense — honestly reported "N/A" by its author. There IS a meaningful "premature declare" trap (stopping after step 1 or 2 looks calm but is never Finish-eligible), but this is a completeness requirement, not an order-dependence one. Reported accurately rather than forced.

This exceeds the ≥4-of-5 floor phase6d.2.md implies (both mandatory scenarios plus 2 of the 3 remaining), with #66's honest N/A consistent with the doc's own "do not force a quota if semantics become dishonest" instruction.

## 14. Pressure-transfer audit

Binding for ALL 5 scenarios. **5 of 5 confirmed**, each independently re-verified against real authored numeric values (not prose) by its verifier:

- **#66**: raising `settlementWriteConcurrency` to `"high"` while the publisher bug is still active accelerates damage — baseline `duplicateSettlementEntryCount=14`/`newDivergenceRatePerMinute=9` vs. concurrency-raised `duplicateSettlementEntryCount=48`/`newDivergenceRatePerMinute=26`.
- **#67**: scaling `API_CONCURRENCY_KEY` to `"high"` alone drives `shard2PrimaryQueueDepth` from 540→1,150 and latency from 1,600→2,900ms — strictly worse, without touching the root hot-shard cause.
- **#68**: `pressure-transferred-downstream` — `downstreamHealthPct` drops to 14 vs. the untouched baseline's 35, because scaling Consumer Group B alone pushes more volume into Consumer Group C's already-degraded shared downstream dependency.
- **#69**: raising Query Coordinator concurrency and/or Search API capacity while Ranking stays in the path multiplies (not relieves) held connections and Feature Store QPS — `indexClusterAConnections` 480 vs. baseline 240, `featureStoreQps` 6,800 vs. 3,400.
- **#70**: `draining-critical-first-high-rollout-contention` (`newServiceWriteLatencyMs: 310`) vs. `draining-critical-first-new-authoritative` (`220`) vs. `draining-normal-priority-new-authoritative` (`135`) — a real, authored, 3-point divergence-contention gradient.

## 15. Recovery-lag audit

Binding for ALL 5 scenarios. **5 of 5 confirmed**, each independently re-verified via `timed-events.ts`/`rules.ts` cross-reads:

- **#66**: `draining-sustained-window1/2` require real elapsed repair-time windows after `exceptionPolicy="auto-repair"` is engaged — backlog does not snap to zero.
- **#67**: `REPLICA_CATCHUP_PRIORITY_KEY` requires real elapsed catch-up time before `shard2FailoverSafety` can safely become eligible for promotion.
- **#68**: three independently-computed recovery windows (`BROKER_RECOVERY_WINDOW_ELAPSED_MS`=200s, `CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS`=145s, `DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS`=180s), each gating `all-mitigated-recovered` independently of the others.
- **#69**: `COORDINATOR_DRAIN_WINDOW_ELAPSED_MS` (ranking-degrade onset + 2 minutes) separates `degraded-quality-safe-draining` (pre-drain) from `degraded-quality-safe-drained` (post-drain), a real candidate-visible trending value.
- **#70**: `RECONCILIATION_PARTIALLY_DRAINED_MS` (+90s) and `RECONCILIATION_WINDOW_ELAPSED_MS` (+300s) gate `draining-early`→`draining`→`fully-reconciled`, strictly time-gated, never instant.

## 16. Tempting unsafe paths

- **#66**: `eventPublishingMode="replay-unsafe"` ("catch up fast" by replaying the recent event window) — can't distinguish an event that already safely landed from one that never arrived, so duplication explodes to 210 while missing barely improves to 22 (vs. baseline 22/14) — strictly worse on duplication.
- **#67**: `FAILOVER_SHARD2_KEY=true` tried early — availability looks great (quiet request rate, 50ms latency) but `shard2StrandedAcknowledgedWriteCount` climbs (85→140) and `shard2FailoverSafety` flips to `"unsafe-promotion"` permanently for the attempt.
- **#68**: scaling `CONSUMER_B_CONCURRENCY_KEY` to 16 while leaving Consumer Group C's retry mode untouched — Group B's own lag drops to 220 (looks like a clean win) but `downstreamHealthPct` falls to 14, worse than baseline's 35, because the two groups share a downstream dependency.
- **#69**: raising Query Coordinator concurrency/API capacity to "push through" the latency while Ranking stays in the path — every additional accepted query still waits the same long Ranking timeout, multiplying held connections/Feature Store QPS rather than relieving them.
- **#70**: `reconciliationMode="replay-blind"` — raw `unreconciledDivergentRecordCount` drops from ~120 to 40 (looks like the fastest fix), but `blindReplayCorruptionCount` climbs to 95 and `correctnessStatus` becomes `"violated"` — never scores better than baseline on Data Integrity despite the lower raw count.

## 17. Alternate strong paths

Per phase6d.2.md §8 (≥3 of 5 required). **4 of 5 confirmed**, 1 honestly reported N/A:

- **#67**: a moderate hot-tenant throttle + platform-wide write-throttle + catch-up priority (`alternate-moderate-throttle-recovered`) reaches a fully safe drained state via a different, legitimate tradeoff (higher sustained hot-tenant friction, lower overall latency cost) — scores 940 vs. the primary path's 980.
- **#69**: excluding ranking entirely and remaining permanently in the degraded-quality-safe state is a legitimate, permanent decision the business invariant explicitly sanctions — distinct from the selective-restore primary path, both OPTIMAL-eligible.
- **#70**: Path A (`fully-reconciled-rollback-legacy`) and Path B (`fully-reconciled-continue-new`) are two genuinely distinct, both-legitimate optimal strategies, exactly matching phase6d.2.md's explicit instruction not to encode only one final strategic direction here.
- **#68**: a proven `"ALTERNATE STRONG PATH"` test — isolating the broker + bounding batch + scaling Group B to 8 (not 16) + enabling the downstream circuit breaker + switching Group C to `"bounded"` retries + enabling the DLQ — reaches the identical fully-recovered state via a different combination of levers.
- **#66**: honestly reported "N/A, single dominant strong path" — the repair mechanism (active-routing + auto-repair, optionally expedited) is the only way to genuinely drain the historical backlog; "expedited" vs. "normal" priority is a cost/speed tradeoff within the one path, not a second independent strategy. Reported accurately rather than forced, consistent with phase6d.2.md's "document deviations instead" instruction.

This exceeds the ≥3-of-5 floor.

## 18. Immediate-Finish audit

All 5 confirmed `declared_unstable` on zero-action immediate Finish, matching the expected default — no deviation required for any scenario. Each has dedicated tests proving this both at/before incident start (moot) and well after incident start with zero candidate actions.

## 19. Exact scoring table for all 5

Fixed six-dimension split (Recovery 300 / CustomerImpact 200 / DataIntegrity 200 / Reliability 150 / CostEfficiency 100 / OperationalEfficiency 50 = 1000), identical scorer used by all 5. Actual executed totals (independently re-derived/confirmed by verifiers, not writer-claimed):

| Scenario | Optimal | Acceptable | Baseline | Harmful |
|---|---|---|---|---|
| #66 Ledger Reconciliation Divergence | 860 | 840 (draining) | 360 | 365 (replay-unsafe); 335 (discard-trap) |
| #67 Hot Shard + Replica Lag + Failover Risk | 980 | 980 (ties — never exceeds optimal); alt-strong 940 | 550 | 420 (API-scaling trap) |
| #68 Event Platform Partial Outage | 955 | 820 | 370 | 285 (pressure-transfer); 335 (Topic A contamination) |
| #69 Search Platform Cascade | 945 | 865 | 450 | 275 (scale-symptom, held 85s) |
| #70 API Migration Dual-Write Failure | 845 (rollback-legacy); 825 (continue-new) | 830 (draining); 795 (alternate, critical-first+high-rollout) | 380 | 365 (replay-blind and unsafe-sequence, both) |

#67's acceptable tying optimal (980=980) was explicitly confirmed by the verifier as "never exceeds optimal" — a legitimate tie reflecting that both the primary and the alternate lane-level fix reach equivalently full recovery, not a scoring defect (the genuinely-cheaper alternate strategy scores lower at 940).

## 20. Suspicious-score investigations

Each writer self-checked against 4 failure modes (harmful scoring too high, no-action scoring too high, availability-good/correctness-bad scoring near optimal, acceptable > optimal without reason) before finishing; independently re-confirmed by verifiers for all 5:

- **#66**: `replay-unsafe` (365) and the discard-trap (335) both score below baseline (360)/near it — correctly penalized despite looking like "progress" on raw backlog numbers; discard-trap explicitly reaches `dataIntegrity=0`.
- **#67**: harmful (420) well below baseline (550); acceptable (980) ties but never exceeds optimal (980); alternate-strong (940) correctly scores below the primary path due to its higher sustained friction cost.
- **#68**: `pressure-transferred-downstream` (285) and the Topic A contamination path (335) both score below baseline (370) despite one metric looking locally improved (Group B's own lag) — correctly penalized via the shared-dependency and durability consequences.
- **#69**: harmful (275) scores far below baseline (450); the unsafe-partial-results correctness trap scores `dataIntegrity=50` vs. safe paths' `200` despite near-identical or better availability — confirmed via explicit test assertions.
- **#70**: `replay-blind` (365) never scores better than baseline (380) on Data Integrity despite a lower raw divergence count — the central anti-gaming check for this scenario, explicitly verified.

No suspicious-score issue required a fix in this batch (unlike #61/#62 in 6D.1) — all 5 scenarios' scoring passed sanity-checking on the first pass.

## 21. Feedback coverage

| Scenario | Rules | Action-classification rules | Feedback blocks | Coverage |
|---|---|---|---|---|
| #66 | 20 | 9 | 9 | 100% |
| #67 | 17 | 9 | 9 | 100% |
| #68 | 14 | 13 (12 original + 1 post-fix `acr_13`) | 13 | 100% |
| #69 | 13 | 11 (10 original + 1 post-fix `acr_11`) | 11 | 100% |
| #70 | 23 | 11 (10 original + 1 post-fix `acr_11`) | 11 | 100% |

All feedback confirmed (by direct file read during verification and post-fix re-verification) to describe real system consequences, including historical-damage and sequencing framing where relevant — never a bare "wrong answer."

## 22. Tests per scenario

| Scenario | Tests |
|---|---|
| #66 Ledger Reconciliation Divergence | 42 |
| #67 Hot Shard + Replica Lag + Failover Risk | 38 |
| #68 Event Platform Partial Outage | 39 (34 original + 5 added during the post-verification fix) |
| #69 Search Platform Cascade | 31 (30 original + 1 added during the post-verification fix) |
| #70 API Migration Dual-Write Failure | 36 (34 original + 2 added during the post-verification fix) |
| **Total new tests** | **186** |

## 23. Verifier verdicts

| Scenario | Initial verdict | Final status |
|---|---|---|
| #66 Ledger Reconciliation Divergence | VERIFIED (all 20 checks pass) | VERIFIED, no changes needed |
| #67 Hot Shard + Replica Lag + Failover Risk | VERIFIED (all 20 checks pass) | VERIFIED, no changes needed |
| #68 Event Platform Partial Outage | REJECTED (19/20 pass; `PRODUCER_BACKPRESSURE_KEY` dead control — also noted the writer's self-report claimed an exhaustive dead-control audit that was not actually exhaustive) | Fixed (wired into a real "masks without fixing" rule, consistent with an existing-but-unwired rule name that hinted at the intended design), independently re-verified by orchestrator |
| #69 Search Platform Cascade | REJECTED (19/20 pass; `INDEX_TIMEOUT_MS_KEY` dead control) | Fixed (wired into a genuine compounding-risk mechanic under the scenario's existing pressure-transfer trap), independently re-verified by orchestrator |
| #70 API Migration Dual-Write Failure | REJECTED (19/20 pass; `SHADOW_TRAFFIC_KEY` dead control, not disclosed in the writer's self-report at all) | Fixed (wired into its documented "warm-up" intent — makes a later rollout increase measurably, but not fully, safer), independently re-verified by orchestrator |

All 3 REJECTED verdicts were the same defect category (a defined-but-unreferenced control) as 2 of 6D.1's 5 scenarios — confirmed as a recurring, real authoring-process gap rather than a one-off. All 3 were judged fixable without redesign by their respective verifiers, confirmed correct by the orchestrator, who independently dispatched 3 separate scoped fix-agents (not the original authors) and independently re-grepped all 3 control keys' post-fix usage before wiring into the catalog.

## 24. Orchestrator verification

Performed independently throughout, not trusting any agent's self-report:
- Confirmed via `git status --short` that no author or verifier agent touched any orchestrator-owned shared file (`catalog.ts`, `index.ts`, `types.ts`, `authoring/schema.ts`, any other scenario's directory, any `packages/simulator/src/` engine file) at any point in the batch.
- Independently grepped all 3 reported dead-control defects (`INDEX_TIMEOUT_MS_KEY`, `PRODUCER_BACKPRESSURE_KEY`, `SHADOW_TRAFFIC_KEY`) before dispatching fixes, confirming zero references in each scenario's `rules.ts` at the time of rejection.
- Independently re-grepped all 3 control keys' usage after their respective fixes, confirming real non-zero reference counts in `rules.ts` (1 in search-platform-cascade's new rule condition; 1 in event-platform-partial-outage's now-real `producer-backpressure-masks-without-fixing` rule; 4 occurrences across api-migration-dual-write-failure's two new shadow-warmup rule states).
- Independently re-confirmed action-classification/feedback counts for all 5 scenarios via direct grep (not trusting any agent's self-reported counts — this caught a minor miscount in #68's own verifier report, which claimed 11 rules when the actual grepped count was 12/13 post-fix).
- Ran the full batch-wide `pnpm --filter @incidentrank/scenarios typecheck`/`lint`/`test` cycle myself after all 3 fixes landed, independent of any agent's claimed pass/fail.
- Confirmed `packages/scenarios/src/library/catalog.ts` and `packages/scenarios/src/index.ts` were touched ONLY by the orchestrator throughout this batch, and independently verified the resulting catalog entry count via `grep -cE "^\s*\[" catalog.ts` = 70.
- Confirmed the free-scenario count remains exactly 3 via `grep -n "isFree: true"` across all non-test scenario source files.

## 25. Metadata regression tests

- `packages/scenarios/src/library/catalog.test.ts`'s "gives every entry required difficulty/duration metadata" test (its `validDifficulties` set widened to include `senior_staff`/`principal`) passed against the full, now-70-entry catalog.
- All 5 Phase 6D.1 scenarios' own definition tests, updated to assert their corrected intended difficulty (`principal`/`senior_staff` rather than `staff`), passed.
- `apps/web/src/app/incidents/library-browser.test.tsx`'s existing fixtures (using pre-existing values `senior`/`intermediate`/`staff`) continued to pass unmodified — confirming backward compatibility; no new fixture needed since no UI test exercised the two new values directly, and the production `DIFFICULTY_LABEL`/`DIFFICULTY_RANK` maps were manually verified via direct read to cover both new keys exhaustively (a missing key would be a TypeScript compile error given the `Record<ScenarioDefinition["difficulty"], string>` typing, which is itself a structural regression guard).

## 26. Package test result

`pnpm --filter @incidentrank/scenarios test` → **1833 passed, 4 skipped (pre-existing, unrelated dev-only timeline tests), 0 failed**, across 78 test files (1 skipped file).

## 27. Full test result

`pnpm test` (monorepo-wide) → **2156 passed, 4 skipped, 0 failed**:
- `packages/simulator`: 38 passed
- `packages/scenarios`: 1833 passed, 4 skipped
- `packages/db`: 8 passed
- `packages/scoring`: 23 passed
- `apps/web`: 254 passed

## 28. Typecheck

`pnpm typecheck` → **PASS** across all 5 workspace packages.

## 29. Lint

`pnpm lint` → **PASS** across all 5 workspace packages, 0 errors/warnings.

## 30. Build

`pnpm build` → **PASS**. Next.js production build compiled successfully, all routes generated.

## 31. Seed

`pnpm --filter @incidentrank/db db:seed` → **`Seed complete (70 built-in scenario(s)).`** — matches phase6d.2.md's expected catalog exactly (70 total, 3 free, 67 paid).

## 32. Deviations

1. **3 of 5 scenarios required a post-verification fix before approval** (same defect category as 2 of 6D.1's 5 scenarios): `event-platform-partial-outage` (dead `PRODUCER_BACKPRESSURE_KEY`, plus the writer's self-report inaccurately implied an exhaustive dead-control audit), `search-platform-cascade` (dead `INDEX_TIMEOUT_MS_KEY`), `api-migration-dual-write-failure` (dead `SHADOW_TRAFFIC_KEY`, undisclosed in the writer's self-report). All 3 were fixed by dedicated fix-agents (not the original authors) and independently re-verified by the orchestrator via direct grep/file-read before wiring into the catalog. None required redesigning the scenario's core mechanism — all 3 fixes were additive and isolated, and all pre-existing tests continued passing unmodified.
2. **#66 Ledger Reconciliation Divergence honestly reported no strict sequencing trap and no alternate strong path**, per phase6d.2.md's explicit "do not force a quota if semantics become dishonest; document deviations instead" instruction. The batch-wide quotas (sequencing ≥4/5 effectively implied by 2 mandatory + "at least two additional," alternate-strong-path ≥3/5) are still met across the other 4 scenarios, so this did not require compensating elsewhere.
3. **#69 Search Platform Cascade's sequencing trap (`restore-too-early-retrigger`) was authored because the state graph genuinely supported it**, consistent with phase6d.2.md's explicit instruction not to manufacture order-dependence for Search just to hit a count — reported for completeness, not as a quota-gaming concern.
4. A recurring pattern across both 6D.1 and 6D.2 (now 5 of 10 scenarios across two batches) is the same dead-control defect category, always caught by the independent verifier's systematic per-control grep, never by the writer's own self-report. This is flagged here as a process observation for future batches: author agents should be instructed to run the same systematic per-control grep against `rules.ts` themselves before reporting done, not rely on it being an artifact the verifier alone catches.

## 33. Principal/Senior Staff quality assessment

- **#66 Ledger Reconciliation Divergence**: Strong Principal-level design. The central discipline is distinguishing live-traffic health (the decoy — transaction API success stays high throughout) from financial correctness (the real problem). The two most tempting shortcuts (pause everything, replay blindly) are both authored traps: pausing contains but never resolves; replaying duplicates everything that already safely landed. The historical-backlog-never-auto-resets mechanic forces candidates to engage a genuinely separate repair process rather than assume the fix alone is sufficient. Independently assessed as NOT solvable by randomly trying controls.
- **#67 Hot Shard + Replica Lag + Failover Risk**: Strong Principal-level design. The misleading replica-process-health signal (pinned healthy throughout, even while lag climbs) actively defeats "turn controls until green" reasoning — a candidate must specifically hypothesize about write-authority safety before acting, since the dashboard alone won't reveal the risk. The permanent, non-undoable stranded-write consequence of an early unsafe failover raises the stakes of getting the sequencing wrong.
- **#68 Event Platform Partial Outage**: Strong Senior-Staff design, arguably Principal-adjacent. Three simultaneous, independently-timed problems force genuine triage rather than a single diagnosis. The central trap — scaling the loudest/most-visible metric (Group B's lag) actively worsens an unrelated shared dependency below even the no-action baseline — specifically punishes metric-chasing, since the candidate must check a metric they didn't touch to notice the regression.
- **#69 Search Platform Cascade**: Strong Senior-Staff design. Both "obvious" fixes (scale capacity, flip on partial-result mode) are authored traps, and the correct combination (disable ranking AND engage a bounded cache) isn't discoverable by "try the control that looks related to speed" alone. The sequencing trap (the identical final configuration is safe or unsafe purely as a function of real elapsed time) specifically defeats pure trial-and-error.
- **#70 API Migration Dual-Write Failure**: The strongest design in this batch, consistent with phase6d.2.md's explicit "one of the hardest IncidentRank scenarios so far" framing. The two tempting fast-looking fixes are genuinely deceptive against exactly the metrics a candidate would naturally be watching (success rate, raw divergence count) — `replay-blind` looks like the fastest fix by raw count while actually corrupting data, and rollback-before-reconcile looks available while silently losing acknowledged writes. Supporting two legitimately distinct, both-valid optimal strategies (safe rollback vs. safe continuation) is a genuine design achievement — it resists the temptation to pick one "correct" ending and forces the scoring/completion logic to recognize both as equally valid outcomes of sound reasoning.

All 5 scenarios were independently assessed by their own verifier against the Principal-Level Acceptance Test ("could a strong Senior engineer solve this primarily by trying controls?") with an honest "no" in every case, each backed by a specific mechanism (a misleading-but-plausible trap, a required multi-decision hypothesis, a monotonically-worsening naive escalation, or an irreversible-within-the-run consequence) rather than asserted difficulty from scale alone.

---

Per phase6d.2.md's stop condition: the shared difficulty-metadata extension landed first and was fully validated before any scenario authoring began; the #63 scoring gap is closed; scenarios 66-70 are fully authored, all five independently verified (3 after a scoped fix-and-re-verify cycle), shared catalog wired by the orchestrator, flat architecture reviewed (no extension needed for any of the 5), Principal/Senior-Staff-level audit passed for all 5, all tests green (2156 passed, 0 failed), seed reports 70 (3 free/67 paid). **Stopping here. Not beginning 6D.3 until this report is reviewed.**
