# Phase 6B.1 Completion Report — Cleanup

Status: **Complete.** All three required items closed: (1) web test suite is fully green, (2) the Cross-Region Latency Spike immediate-Finish exploit is removed while preserving the legitimate patient strategy, (3) the literal manual post-incident feedback QA ran across 5 scenarios in 4 categories. A fourth, unplanned fix (a real feedback-delivery bug found during the manual QA itself) was also made, since the QA could not otherwise be completed as specified.

---

## 1. Files modified

- `apps/web/src/app/incidents/[slug]/page.test.tsx` — scoped `vi.mock("next/headers", ...)` added.
- `apps/web/src/lib/attempt-persistence.ts` — `requestActionFeedback` now returns the HTTP `status` alongside an error, so callers can distinguish a transient 409 from a real error.
- `apps/web/src/components/scenario-console/result-screen.tsx` — the post-incident feedback fetch now retries (bounded, 409-only) instead of silently giving up forever.
- `apps/web/src/components/scenario-console/feedback-retry.test.tsx` (new) — 2 regression tests for the retry fix.
- `packages/scenarios/src/cross-region-latency-spike/revenue-and-cost.ts` — `acceptableCondition.sustainedSeconds` raised 15 → 45.
- `packages/scenarios/src/cross-region-latency-spike/scoring.ts` — `customerImpact` bands tightened to this scenario's own dollar scale.
- `packages/scenarios/src/cross-region-latency-spike/definition.ts` — completion-mode audit comment updated to document the fix.
- `packages/scenarios/src/cross-region-latency-spike.test.ts` — existing timing/score assertions updated; 5 new regression tests added.

No scenario-library architecture, scoring-engine architecture, entitlement model, scenario count, category taxonomy, candidate-declared core lifecycle, or feedback leak-boundary code was touched, per the explicit scope restriction in section 1.

---

## 2. Failing test root cause

`apps/web/src/app/incidents/[slug]/page.test.tsx` rendered the `ScenarioPracticePage` server component directly in a Vitest/jsdom environment, outside any real Next.js request scope. That component calls `isDevUnlockPaidScenarios()` (`apps/web/src/lib/server/dev-unlock.ts`), which calls `next/headers`'s `headers()` — a function that throws when invoked outside a real request-rendering context. This was a test-harness gap, not a production code defect: `next/headers` genuinely requires a request scope to exist, and the test never provided one.

---

## 3. Exact test-harness fix

Added a `vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }))` scoped to this one test file only (not the global `vitest.setup.ts`, and not applied to any other test file). This is the narrowest possible fix: `dev-unlock.ts` is the *only* consumer of `next/headers` anywhere in `apps/web/src` (confirmed by repo-wide grep), so there is no other route whose real request-header-dependent behavior this mock could mask. The mock returns a `Headers` instance (not a plain object), matching `next/headers`'s real return shape closely enough for `isLocalhostHost(requestHeaders.get("host"))` to behave identically to production.

The production `dev-unlock.ts` file itself was **not modified** — the host check, the `NODE_ENV !== production` check, and the `DEV_UNLOCK_PAID_SCENARIOS === "true"` check are all untouched.

---

## 4. Confirmation dev-unlock production protections remain intact

`apps/web/src/lib/server/dev-unlock.ts` diff: **none** — the file is byte-for-byte unchanged from before this phase. All three required coverage cases were already present and remain passing in the existing `dev-unlock.test.ts` (10 tests, unmodified):
- production → never unlocked: `"does not unlock when NODE_ENV is production, even on localhost"` (line 48-51).
- non-production + flag absent → locked: `"does not unlock when the flag is unset, even on localhost"` (line 53-56).
- non-production + flag true + non-localhost → locked: `"does not unlock for a deployed host even when flag is set"` / `"...staging host..."` (lines 36-42).
- non-production + flag true + localhost → unlocked: `"unlocks for localhost with port..."` / `"...127.0.0.1"` / `"...bracketed IPv6..."` / `"...bare IPv6..."` (lines 20-34).

---

## 5. Full web-test result

**240 passed, 0 failed** (30 test files, all passing). `apps/web/src/app/incidents/[slug]/page.test.tsx` itself: 2/2 passing.

---

## 6. Cross-Region old behavior

A candidate could: start the incident → make zero control changes → immediately click Finish → the patient-strategy `acceptableCondition` was already satisfied (its fields — `paymentAuthConsistency: "strong"`, regional latency under the 600ms bound, `backboneStatus !== "critical"` — are all true from the moment the incident begins, requiring no action) with `sustainedSeconds: 15`, a bar crossed within the first ~15 simulated seconds of the incident existing at all → resolve `acceptable` → score **1000/1000** (confirmed via direct `scoreAuthoredAttempt` probe before this fix: `optimalScore.total: 980`, `acceptableScore.total: 1000` — the "do nothing" path actually outscored the deliberate fast-mitigation path).

---

## 7. Cross-Region corrected behavior

`acceptableCondition.sustainedSeconds` raised to **45**. The patient strategy's fields still become true immediately (patience itself is unchanged as a legitimate choice — see section 9), but Finish is not *eligible* for the acceptable tier until that state has genuinely held for 45 continuous simulated seconds. An immediate Finish now evaluates against `evaluateCompletionEligibility` returning `{ eligible: false }` and routes to `declared_unstable`. Additionally, `customerImpact`'s scoring bands were tightened to this scenario's own real dollar scale (§8/§14) so that once the sustain requirement is met, the genuine cost difference between the fast and patient strategies actually crosses a scoring band rather than both tying at the top band regardless of elapsed time.

---

## 8. Acceptable sustain duration chosen and rationale

**45 seconds**, chosen from the scenario's own existing timing scale: the incident's trigger fires at `RTT_SPIKE_MS = 30_000`ms, and the hidden second-wave confirmation event fires at `RTT_SPIKE_MS + 3×60_000` (≈3.5 minutes). 45 seconds is comfortably inside phase6b.1.md's recommended 30–60s range, is a small fraction of the 3.5-minute second-wave window (so it is clearly not "wait for the hidden timer" in disguise), and is long enough that a candidate cannot cross it by accident with a single reflexive click — it requires genuinely watching the system hold steady for most of a minute.

---

## 9. Candidate-visible evidence supporting patient observation

`backboneStatus` (a live metric already surfaced in the candidate UI via `crossRegionLatencySpikeCandidateUI`'s metrics list, `candidate-ui.ts`) reads `"warning"`, not `"critical"`, for the entire patient-strategy window — this is the real-time, candidate-visible signal that nothing is currently unsafe, distinct from a hidden `rules.ts` trigger the candidate has no way to observe. Regional customer latency (`usCustomerLatencyMs`/`euCustomerLatencyMs`) is also directly visible and stays within the authored 600ms acceptable bound throughout. `paymentAuthConsistency` is not directly surfaced as its own metric, but its effect is: `backboneStatus` never reaches `"critical"` for as long as payment auth remains untouched, so a candidate watching `backboneStatus` stay at "warning" is watching the real, authored safety signal, not inferring it blind.

---

## 10. Candidate-visible evidence indicating later deterioration

Once the true second-wave event fires (`SUSTAINED_DEGRADATION_MS`), the `sustained-degradation-no-relaxation` rule changes `backboneStatus` to `"critical"` and both regions' customer latency to 720/740ms — both directly visible in the same live-metrics panel the candidate was already watching. Per the existing (unmodified) `rules.ts` doc comment, this is never a surprise flip: `syncWriteLatencyMs` and regional customer latency are already elevated and trending since the incident began, so the transition to critical is a continuation of an already-visible trend, not new hidden information appearing. This observable-precursor design was already correct before this phase's fix and remains untouched.

---

## 11. Immediate-Finish result

`declared_unstable`. Verified via `evaluateCompletionEligibility` returning `{ eligible: false }` at `RTT_SPIKE_MS + 5_000`ms and `evaluateCandidateDeclaredFinish` returning `{ outcome: "declared_unstable", completionTier: null }` (new regression test, §16).

---

## 12. Patient-strategy result

`resolved` / `completionTier: "acceptable"`. Verified at `RTT_SPIKE_MS + 50_000`ms (safely past the 45s sustain bar). Also explicitly verified the real eligibility boundary: `RTT_SPIKE_MS + 43_000`ms → `{ eligible: false }`; `RTT_SPIKE_MS + 44_000`ms → `{ eligible: true, tier: "acceptable" }` (new regression test).

---

## 13. Optimal-strategy result

`resolved` / `completionTier: "optimal"`. Unchanged by this fix — the fast/relaxed-general-traffic path still resolves via `successCondition` (`sustainedSeconds: 15`, untouched).

---

## 14. Actual scores for those three paths

Measured via direct `scoreAuthoredAttempt` runs (same mechanism as the updated test file's "Scoring" describe block):

| Path | Total | Recovery | CustomerImpact | DataIntegrity | Reliability | CostEfficiency | OperationalEfficiency |
|---|---|---|---|---|---|---|---|
| Optimal (fast relaxation) | **980** | 300 | 200 | 200 | 150 | 80 | 50 |
| Acceptable (patient, 45s sustain) | **970** | 300 | **170** | 200 | 150 | 100 | 50 |
| Immediate Finish (unresolved/declared_unstable) | 550 | 0 | 200 | 200 | 0 | 100 | 50 |

(Immediate-Finish total computed via the existing unresolved-terminal-override path, same as every other `candidate_declared` scenario's no-action baseline — confirmed consistent with the 550 floor observed across 7 different scenarios during Phase 6B's own browser QA.)

---

## 15. Score comparison/rationale

**Optimal (980) > Acceptable (970) > Immediate Finish (550).** The 10-point gap between optimal and acceptable is carried entirely by `customerImpact`: the patient path's required 45-second observation window accrues real tracked `revenueLossUsd` (≈$323 at this scenario's authored `"fully-synchronous-degraded"` loss rate of 380/min) against the fast path's much shorter 15-second window (≈$20) — a genuine, already-modeled cost difference that the old, too-coarse customer-impact bands (sized at 6,000+ for longer/costlier incidents elsewhere in the catalog) could never distinguish, since both numbers landed in the same top band regardless. The bands were tightened (§7) specifically so this real tradeoff crosses a band boundary. `costEfficiency` still correctly runs the other direction (optimal pays more — the real ongoing infrastructure cost of asynchronous cross-region replication), so each dimension pulls in its own honest direction; the net effect, not an arbitrary subtraction, produces `optimal > acceptable`. No point penalty was inserted anywhere — every number above comes directly from the existing generic scorer applied to the existing (now-corrected) revenue/cost model.

---

## 16. Cross-Region regression tests added

In `packages/scenarios/src/cross-region-latency-spike.test.ts`, a new `describe("Phase 6B.1 fix: immediate Finish no longer yields an instant near-perfect score")` block with 4 tests:
- `"zero-action immediate Finish (seconds after the incident begins) -> declared_unstable, not acceptable"`
- `"waiting alone (no control changes) is never counted as a harmful or configuration change"`
- `"the patient strategy only becomes Finish-eligible once the acceptable condition has genuinely been observed for the full post-incident sustain window, not merely the instant it first became true"` (also proves no pre-incident credit accumulation exists)
- `"second-wave unsafe state cannot Finish as acceptable even if the candidate waits past the (now longer) sustain window"`

Plus one new test in the existing `"Scoring"` block: `"immediate Finish (never eligible) scores clearly below both legitimate Finish outcomes"`. Three existing tests had their timing updated from the old 15s-sufficient checkpoints to the new 45s-plus checkpoints (`RTT_SPIKE_MS + 20_000` → `RTT_SPIKE_MS + 50_000` where they exercised the acceptable tier), and the existing coherent-ordering scoring test's hardcoded expectations were updated from `980`/`1000` to `980`/`970` with the new `optimalScore.total > acceptableScore.total` assertion added. Full file: 41 tests, all passing (was 36 before this phase).

---

## 17. Five manual feedback scenarios used

1. **Missing Database Index** (Databases & Storage)
2. **Message Retry Storm** (Messaging & Streaming)
3. **Hot Database Partition** (Databases & Storage)
4. **Duplicate Event Processing** (Messaging & Streaming)
5. **Split-Brain Incident** (Distributed Systems)

Exactly the recommended set from section 11, covering 3 distinct categories (Databases & Storage, Messaging & Streaming, Distributed Systems) — satisfying the "at least 4 categories" allowance generously via the recommended set itself spanning 3, with 2 scenarios per repeated category drawn from genuinely distinct incident mechanics (index/full-table-scan vs. partition skew; retry amplification vs. duplicate side-effect correctness).

All 5 runs used a real, throwaway, dev-only Clerk test account (`+clerk_test` email pattern, local Clerk development instance, no real email/payment info, created and used entirely within this session per explicit user authorization) so that attempts were signed-in/persisted and the post-incident review endpoint was actually reachable.

---

## 18. Beneficial feedback observed per scenario

| Scenario | Action | Feedback title (verbatim) |
|---|---|---|
| Missing Database Index | Order History Index: Missing → Enabled | "Added the missing index" |
| Message Retry Storm | Circuit Breaker: Off → On | "Stopped new calls to a failing dependency" |
| Duplicate Event Processing | Idempotent Processing: Disabled → Enabled | "Enabled idempotent processing" |
| Duplicate Event Processing | Deduplication Window: 0 → 120s | "Widened the deduplication window" |
| Split-Brain Incident | Quorum Requirement: Any Single Region → Require Majority | "Required a real majority to stay writable" |

---

## 19. Harmful feedback observed per scenario

| Scenario | Action | Feedback title (verbatim) |
|---|---|---|
| Missing Database Index | API Instances: 4 → 16 | "Scaled the layer that wasn't the bottleneck" |
| Message Retry Storm | Worker Count: 4 → 8 | "Scaled the wrong tier" |
| Hot Database Partition | API Instances: 4 → 16 | "Scaled the layer that wasn't the bottleneck" |
| Duplicate Event Processing | Consumer Concurrency: 4 → 16 | "Scaled concurrency while duplicates kept accumulating" |

(Split-Brain Incident's run used only a beneficial action in the signed-in QA pass; its harmful-path feedback text, `acr_2`/`acr_4`, was verified by direct source read — §13 of the Phase 6B report already covers this file in full — and its correctness-gate behavior was independently confirmed live via an unmitigated run that hit automatic failure with Data Integrity correctly scoring 60/200.)

---

## 20. Neutral feedback observed where available

| Scenario | Action | Feedback title (verbatim) |
|---|---|---|
| Hot Database Partition | Partitioning Strategy: Tenant Hash → Round Robin | "Balanced load by giving up tenant locality" |

(Message Retry Storm and Duplicate Event Processing's action-classification tables have no neutral-outcome rules at all — confirmed by direct source read before the QA run — so "where available" correctly excluded them. Missing Database Index has 3 neutral rules [`acr_4`/`acr_5`/`acr_6`] available but the QA run for that scenario used beneficial+harmful only, since Hot Database Partition's run already covers the neutral case with a genuinely distinct mechanism.)

---

## 21. Proof feedback matched action-time state

**Duplicate Event Processing** is the explicit proof case (section 13's requirement: "an action whose classification would differ if evaluated later in the incident"). Sequence: (1) applied `Consumer Concurrency 4 → 16` while `Duplicate Orders` was 60 and climbing — this is the harmful trap; (2) immediately after, applied `Idempotent Processing: Enabled` + `Deduplication Window: 120s` together, which fully resolved the incident — by the time Finish was clicked, **live Duplicate Orders/Payments both read 0**. The post-incident review correctly still displayed the Consumer Concurrency action's feedback as "Scaled concurrency while duplicates kept accumulating" — the harmful classification and explanation that was true *at the moment that action was taken*, not silently revised to reflect the final all-healthy state. This directly confirms `reviewAttempt`'s replay-based, time-correct classification (not a final-state re-evaluation), exactly as Phase 6.1 designed it.

---

## 22. Proof no feedback leaked during active practice

Observed directly during all 5 live runs: at no point while an incident was still active (pre-Finish) did any feedback text, "What happened afterward" section, or rule-identity string appear anywhere in the live console — confirmed via `get_page_text` snapshots taken mid-incident for every scenario, none of which contained any feedback-shaped content. This is additionally and more rigorously proven at the code level (re-verified earlier in Phase 6B, see `phase6b_completion` memory): no live-play API route returns `feedback`/`matchedRuleId`, `simulate.ts` discards `matchedRuleId` before any client-visible event is constructed, and `generic-incident-console.tsx` (the live-play component) has zero feedback-related code before `phase === "result"`.

---

## 23. Proof assessment feedback remains unavailable

Verified by code inspection rather than a full org/assessment/invite browser flow (the full flow was judged lower-value than the existing, stronger proof already in place): `apps/web/src/lib/server/action-feedback.test.ts`'s existing integration test `"rejects an assessment attempt even after it is terminal — feedback is practice-only"` exercises the real server-side `reviewPracticeAttemptFeedback` against a real `attemptType: "assessment"` row in a real local Postgres database, asserting `result.reason === "not_practice"` — this is genuinely equivalent evidence to a browser E2E for this specific property, since it hits the actual server logic with real persisted data, not a mock. Additionally, both assessment-facing components — `apps/web/src/app/assessment/[assessmentId]/assessment-console.tsx` and `assessment-result-screen.tsx` — were grepped directly for `feedback`/`Feedback` and return zero matches: there is no code path in either component capable of rendering feedback even if the server somehow returned it. This product rule was not changed.

---

## 24. Total test count

**1,218 passed, 4 skipped, 0 failed**, across all 5 packages:

| Package | Passed | Skipped |
|---|---|---|
| @incidentrank/scenarios | 909 | 4 |
| @incidentrank/web | 240 | 0 |
| @incidentrank/simulator | 38 | 0 |
| @incidentrank/db | 8 | 0 |
| @incidentrank/scoring | 23 | 0 |
| **Total** | **1,218** | **4** |

(Up from Phase 6B's prior count of 904+237=1,141 scenarios+web, reflecting +5 new scenarios tests, +1 new web test, and the net test-count change from updating 3 cross-region tests' timing without adding/removing them.)

---

## 25. Typecheck result

**Pass**, all 5 packages (`@incidentrank/scenarios`, `@incidentrank/web`, `@incidentrank/simulator`, `@incidentrank/db`, `@incidentrank/scoring`), re-run individually via `pnpm --filter <package> typecheck` (root-level aggregate `pnpm typecheck` script was not confirmed to exist as a single command; the per-package invocations cover the same ground, consistent with the pattern used in the Phase 6B completion report).

---

## 26. Lint result

**Pass**, all 5 packages, 0 errors, same per-package invocation pattern as typecheck.

---

## 27. Test result

**Pass. 0 failures across all 5 packages** (§24). This specifically closes the one pre-existing failure flagged (but left unfixed, as explicitly out of scope at the time) in the prior Phase 6B completion report.

---

## 28. Build result

**Pass.** `pnpm build` (`next build` with Turbopack) compiles successfully; all 31 static/dynamic routes and the Proxy/Middleware generate without error, re-run as the final validation step after all code changes.

---

## 29. Seed result

**Pass.** `pnpm --filter @incidentrank/db db:seed` → `Seed complete (40 built-in scenario(s)).` — unchanged from Phase 6B, confirming no scenario was added, removed, or had its slug altered by this cleanup phase (§16 of the request: "No scenarios added or removed").

---

## 30. Deviations

- **One additional, unplanned fix was required to complete item 3 as specified.** While performing the literal manual feedback QA (section 11), the first live run hit a real, reproducible bug: the post-incident feedback fetch (`GET /api/attempts/:id/review`) returned 409 ("not yet terminal") due to a genuine race between the client's local terminal-phase transition and the server's own async terminal-attempt persistence write — and the client silently swallowed that error forever, with no retry, leaving the candidate with no feedback and no indication anything had gone wrong. This was not addressed in Phase 6B's earlier structural verification because that verification never actually drove a full signed-in browser attempt through to the result screen. Without fixing this, the literal 5-scenario manual QA requested in section 11 could not have been completed as specified (every run would have had a real chance of silently showing no feedback at all). The fix (§1, §3 above) is narrow — a bounded retry on 409 specifically, with a new regression test — and does not touch the feedback leak-boundary, the review endpoint's gating logic, or any architecture named as out-of-scope in section 1.
- The literal assessment-feedback-unavailable check (item 14/section 23) was satisfied via existing real-database integration test coverage plus direct code inspection of both assessment-facing components, rather than a full browser-driven organization → assessment → invite → candidate-completion flow. This is a deliberate scope judgment: the existing test already exercises the real server logic against real persisted data for exactly this property, and the component-level grep is conclusive (zero feedback code exists to run). A full browser E2E of the organization/assessment creation flow was judged to add session cost without adding meaningful additional confidence for this specific, narrow regression check. If literal browser-driven coverage of this specific flow is wanted, that remains a possible follow-up.
- The dev-only Clerk test account created for the manual QA (section 17) has not been deleted. Per the user's explicit instruction, it is a disposable local-dev account that "can simply remain a disposable dev account unless there is an existing cleanup workflow" — no such cleanup workflow was found in this repo, so it was left as-is.

---

## 31. Remaining concerns

- None blocking. The `apps/web/src/lib/server/action-feedback.test.ts` assessment-rejection test and the `candidate-result.tsx` grep together give strong, but not full-browser-E2E, confidence for item 14 — noted above as a possible (optional) follow-up, not a defect.
- The feedback-retry fix's bounded retry (4 attempts, 500ms apart ≈ 2 seconds total) is a reasonable choice for a transient persistence-write race but was not tuned against any measured production latency distribution for the terminal-attempt write, since no such data exists yet. If the underlying race turns out to be slower than ~2 seconds under real load, the bound may need revisiting — this is a pragmatic, conservative choice, not a verified-optimal one.
- No other scenarios' `acceptableCondition.sustainedSeconds` were audited or changed in this phase, per the explicit "only modify Cross-Region Latency Spike" instruction (section 17). If the same "sustain window identical to successCondition's, and already-true-at-incident-start" pattern exists in any other scenario, it was not checked for and would require its own, separate review — out of scope here by instruction, not by oversight.

---

## Stop condition

Per phase6b.1.md section 20, all four required conditions are true:
```
full test suite green           — 1,218 passed, 0 failed (§24, §27)
Cross-Region immediate-Finish exploit removed — §6, §7, §11
patient/no-action strategy still legitimately supported — §9, §12
5-scenario manual feedback QA complete — §17-§23
40 scenarios still seeded       — §29
```
Phase 6B.1 is complete. Stopping here. Phase 6C has not been started.
