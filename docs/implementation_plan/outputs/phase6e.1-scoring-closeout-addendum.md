# Phase 6E.1 Scoring Closeout Addendum

Per `docs/implementation_plan/phase-6e1-scoring-closeout.md`. Narrow scoring/reporting closeout for Phase 6E.1, scoped entirely to `#84 Abuse-Prevention False Positive Storm`. Does not redesign scenarios 81-85 beyond this investigation. Does not begin Phase 6E.2.

## 1. #84 root cause

**Intentional tier/score divergence (Option D).** Not a reporting defect, not a tier defect, not a scoring defect, not an acceptable-state over-score.

The patched forward-fix path is genuinely, correctly `optimal` — its `dataIntegrity` (200) and `reliability` (150) are identical to the rollback-optimal path's, both the maximum attainable value for each dimension, correctly reflecting that the underlying detection-rule defect is genuinely fixed (not merely worked around) and no security violation ever occurred.

It scores 60 points below the acceptable-tier exemption path's total (750 vs 810) because it pays two real, legitimate costs that the exemption path does not:

1. **Real elapsed time.** `patched-forward-fix` cannot be engaged until `PATCHED_RULE_AVAILABLE_MS` (360,000ms / 6 minutes after incident onset at `FALSE_POSITIVE_ONSET_MS`), modeling genuine investigation/diagnosis time to produce a corrected rule version. The exemption path is reachable at `FALSE_POSITIVE_ONSET_MS + 1,000ms`. `recoveryTimeSeconds` (defined in `packages/scenarios/src/authoring/score.ts:125-130` as `(resolvedAtMs - incidentStartedAtMs) / 1000`) is therefore ~380-410s for patched forward-fix vs ~50-80s for the exemption, landing in different authored bands of the `recovery` dimension (`scoring.ts`'s bands: `atMost:120→270`, `atMost:450→230`) — 230 vs 300 points, a real −70.
2. **Real accrued revenue loss.** While waiting the ~6 minutes for the patch, the false-positive-blocked population continues losing revenue at the authored `"false-positives-baseline"` rate of 540 USD/minute (`revenue-and-cost.ts`). This pushes `revenueLossUsd` for the patched path well above the `atMost:400→200` band the exemption path stays inside (resolved almost immediately), landing instead in the `atMost:7,000→40` band — a real −160 on `customerImpact`.

These two real costs (−70 recovery, −160 customerImpact = −230) are not fully offset by patched forward-fix's advantage over the exemption on the two security-correctness dimensions (+40 dataIntegrity, +130 reliability = +170), netting the observed −60. The exemption path is penalized on `dataIntegrity`/`reliability` specifically because it leaves the underlying rule defect unfixed (by design — that is what makes it ACCEPTABLE rather than OPTIMAL), while it is rewarded on `recovery`/`customerImpact` specifically because it resolves fast with low accrued cost. Both paths are internally coherent; they simply trade a different pair of dimensions against each other, and the `customerImpact` dimension's point-width (200) happens to outweigh the `dataIntegrity` gap's width (40) in this particular case.

This is exactly the Option D pattern the closeout spec permits: "the patched forward-fix is genuinely fully safe/optimal for handback while still receiving fewer points because it imposes a legitimate, meaningful operational/customer/cost penalty that the acceptable state does not."

No code, scoring, or tier change was required. This is a **reporting gap**: the original Phase 6E.1 completion report (§22) recorded `—` for #84's harmful-path figure (an incomplete-capture placeholder, not a wrong number) and did not transcribe the tier/score divergence's exact mechanism (§23 asserted "no suspicious score found" without naming the driving dimensions). Both are now corrected — see §5.

## 2. Exact #84 score table

All six required paths executed directly via `scoreAuthoredAttempt`/`evaluateCandidateDeclaredFinish`/`extractFinishScoringInputs` (the real Finish-based path) against `packages/scenarios/src/abuse-prevention-false-positive-storm.test.ts`, re-run for this closeout with full `console.log` evidence (`pnpm --filter @incidentrank/scenarios test -- abuse-prevention-false-positive-storm`):

| Path | Outcome | Tier | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Operational Efficiency | Final State |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| rollback optimal | resolved | optimal | 980 | 300 | 200 | 200 | 150 | 80 | 50 | `targeted-rollback-fixed` |
| patched forward-fix | resolved | optimal | 750 | 230 | 40 | 200 | 150 | 80 | 50 | `patched-forward-fix` |
| acceptable | resolved | acceptable | 810 | 300 | 200 | 160 | 20 | 80 | 50 | `exemption-safe` |
| baseline | declared_unstable | — | 350 | 0 | 90 | 110 | 20 | 80 | 50 | `false-positives-sustained-unaddressed` |
| global-disable harmful | declared_unstable | — | 315 | 0 | 200 | 0 | 0 | 80 | 35 | `rate-limiter-disabled` |
| unreliable-exemption harmful | declared_unstable | — | 315 | 0 | 200 | 0 | 0 | 80 | 35 | `exemption-unreliable` |

Baseline row executed at `SUSTAINED_FALSE_POSITIVES_MS + 60_000` (the existing "baseline (no action) scores poorly" test). Global-disable and unreliable-exemption rows executed at the same elapsed time via `buildScoringInputs`'s unresolved-snapshot path (both deliberately never Finish-eligible — `evaluateCompletionEligibility` returns `{eligible: false}` for both, confirmed in the test suite's runtime assertions), each via the scenario's own named transition state. Note global-disable and unreliable-exemption land on an identical total/breakdown by coincidence of this scenario's authored penalty structure (both trigger the same `"protection-bypassed"` dataIntegrity/reliability floor-to-zero penalty and the same customerImpact band at this elapsed time) — they are reached via genuinely different control sequences and different final states, confirmed distinct in the Final State column.

## 3. Tier-vs-score explanation

**Why does the patched forward-fix qualify as OPTIMAL while scoring below the ACCEPTABLE state?**

- **Which dimension(s) create the 60-point difference**: `recovery` (−70: 230 vs 300) and `customerImpact` (−160: 40 vs 200), partially offset by `dataIntegrity` (+40: 200 vs 160) and `reliability` (+130: 150 vs 20). Net: −70 − 160 + 40 + 130 = **−60**.
- **What real candidate/system tradeoff those dimensions represent**: patched forward-fix requires waiting ~6 real minutes for investigation to produce a validated rule patch, during which the false-positive-blocked legitimate population keeps accruing real revenue loss at 540 USD/min. The exemption path resolves almost immediately but leaves the underlying rule defect unfixed.
- **Why that tradeoff does NOT make the state merely ACCEPTABLE**: the completion-tier boundary is about correctness/safety of the end-state, not elapsed time or accrued cost. `successCondition` (`revenue-and-cost.ts`) requires `abuseProtectionStatus === "fully-restored"`, which only the two genuine fix rules (`targeted-rollback-fixed`, `patched-forward-fix`) ever set — the exemption path sets `"targeted-fix-applied"` instead, which `acceptableCondition` accepts but `successCondition` does not. Patched forward-fix genuinely satisfies the stricter, fully-correct end-state condition, so it is correctly `optimal` regardless of how long it took to get there.
- **Why the acceptable state still deserves a higher numeric score, if that remains intentional**: yes, intentionally — the scoring config's `recovery`/`customerImpact` dimensions reward whichever tier a candidate reaches by how quickly and cheaply they reached it (per `scoring.ts`'s own module comment: "this dimension rewards genuine recovery speed honestly for whichever tier a candidate reaches, and does not by itself try to make optimal 'win' on recovery alone"), while `dataIntegrity`/`reliability` carry the weight of keeping a real security violation scoring worse than any non-violating path, safe or not. A fast, bounded, honest acceptable-tier handback is a legitimate, intentionally-rewarded choice distinct from — and in this specific case scoring higher in total than — a slower-but-fully-correct optimal-tier resolution. This is a deliberate design choice already implicit in the scenario's two-alternate-optimal-path structure, now made explicit and tested.

## 4. Security sanity checks

All three required proofs executed directly against the real runtime/scoring code (not inferred from prose):

**Global-disable detection path** (`RATE_LIMITER_MODE_KEY: "disabled"`):
- Improves false-positive/customer metrics: `disabled.values.legitimateUserSuccessRate` confirmed greater than `baseline.values.legitimateUserSuccessRate` (test: "legitimate-user availability improves while abuseProtectionStatus is bypassed and a historical count accumulates").
- Allows real abuse: `disabled.values.abuseRequestsAllowedRate` confirmed greater than baseline's; `disabled.values.cumulativeAbuseRequestsAllowedCount` confirmed greater than 0.
- Remains unsafe: `evaluateCompletionEligibility` returns `{eligible: false}`; `evaluateCandidateDeclaredFinish` returns `outcome: "declared_unstable"`.
- Scores materially below safe tiers: 315 (global-disable) vs 750-980 (optimal tiers) and 810 (acceptable) — confirmed in §2's table.
- Sustained/compounding: `sustainedDisabled.values.cumulativeAbuseRequestsAllowedCount` confirmed strictly greater than `earlyDisabled`'s at a later elapsed time (test: "the historical count compounds the longer disablement is left active").
- Automatic failure still applies if held through the full investigation window (`failureCondition`: `cumulativeAbuseRequestsAllowedCount >= 2,000` sustained 45s) — confirmed via `state.status === "failed"`.

**Unreliable exemption** (`IDENTITY_TRUST_SCORING_KEY: "disabled"` + `FALSE_POSITIVE_EXEMPTION_KEY: "exempt-flagged-legit"`):
- Cannot be considered safe merely because legitimate traffic recovers: lands in distinct transition state `exemption-unreliable` with `abuseProtectionStatus === "protection-bypassed"`; `evaluateCompletionEligibility` returns `{eligible: false}`.
- Scores 315 — materially below both the real exemption-with-trust-scoring acceptable path (810) and below the plain unaddressed baseline (350) on `dataIntegrity` specifically (0 vs 110), confirmed by the existing test "the unreliable-exemption trap scores worse on dataIntegrity than the plain baseline."

**Historical abuse exposure is non-erasable by later policy restoration**: `cumulativeAbuseRequestsAllowedCount`'s live value does legitimately reset to 0 once the bypass lever is turned back off (same documented, accepted pattern as #73/#74's historical-damage model) — but the true non-resetting record is `state.peaks.peakValues.cumulativeAbuseRequestsAllowedCount`, confirmed via the existing test "tracks peak historical exposure generically via numericWatchFields," which asserts `peaks.peakValues.cumulativeAbuseRequestsAllowedCount > 0` even after the scenario has run past the point where the live value could have reset. This is the same peak-tracking mechanism already verified for #81/#82/#83/#85 in the original Phase 6E.1 completion report.

## 5. Changes made

**Code**: none. No production, scenario, or scoring logic was changed. The root cause is intentional design (Option D), not a defect.

**Scoring**: none. The scoring config (`scoring.ts`) is unchanged.

**Tests**: one permanent regression test added to `packages/scenarios/src/abuse-prevention-false-positive-storm.test.ts` (`"patched forward-fix (optimal) scores below the acceptable-tier exemption path's total, for a specific, legitimate reason..."`). The existing test suite compared the acceptable path only against the rollback-optimal path, never against the patched-forward-fix optimal path — leaving no regression coverage for the exact divergence this closeout investigated. The new test asserts: both tiers are correctly classified (`optimal`/`acceptable`); the total divergence is real and reproducible (`patchedScore.total < acceptableScore.total`); it is driven specifically by `recovery` and `customerImpact` being lower for the patched path; and — critically — that `dataIntegrity`/`reliability` are never lower for the patched path than for the acceptable path, which would indicate an actual security regression rather than a legitimate timing/cost tradeoff. Net test count: 37 → 38 for this file.

**Documentation**: `docs/implementation_plan/outputs/phase6e.1-completion-report.md` corrected — see §9 below.

## 6. Validation

Since this closeout is report-plus-test-only (no scenario/scoring/production logic changed), the full validation matrix was still run for thoroughness:

- `pnpm --filter @incidentrank/scenarios test -- abuse-prevention-false-positive-storm` → **38 passed, 0 failed** (37 existing + 1 new).
- `pnpm --filter @incidentrank/scenarios test` (full package) → **2497 passed, 4 skipped (pre-existing, unrelated), 0 failed**.
- `pnpm --filter @incidentrank/scenarios typecheck` → **PASS**.
- `pnpm --filter @incidentrank/scenarios lint` → **PASS**, 0 errors/warnings.
- `pnpm --filter @incidentrank/db db:seed` → **`Seed complete (85 built-in scenario(s)).`** — catalog count unchanged, as required.

## 7. Alternate-path planning note

Current Phase 6E.1 result: **1 of 5** scenarios (#84 itself) supports a genuine alternate strong path.

Remaining requirement for the overall Phase 6E target (≥12 of 20 scenarios, per phase-6e-strategy-spec.md §17): **11 of the remaining 15** scenarios (86-100) must have genuine alternate strong paths.

This closeout does not force fake alternatives into #81, #82, #83, or #85 — all four honestly report no alternate strong path, consistent with their own designs. 6E.2-6E.4 batch designs should deliberately favor scenarios that naturally admit real choices (cost vs resilience, rollback vs forward-fix, regional vs global strategy, quality vs cost, staged vs immediate action, containment vs controlled continuation) wherever the underlying incident genuinely supports it — this is a planning note only; no scenario authoring for 86-100 was performed as part of this closeout.

## 8. Final recommendation

**PHASE 6E.1 READY FOR APPROVAL**
