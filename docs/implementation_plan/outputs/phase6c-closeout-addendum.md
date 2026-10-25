# Phase 6C Closeout Addendum

Scope: close the 4 gaps the original completion report left open or stated incorrectly. Does not start Phase 6D.

## 1. Live Assessment QA (section 34 — previously skipped)

Performed end-to-end in the browser, covering both completion modes, using a new organization ("Phase6C QA Org") and a new throwaway candidate account (`incidentrank.qa.6c+clerk_test@example.com`, local Clerk dev instance, `+clerk_test` fixed-OTP pattern — dev-only, no real credentials, no payment data).

**Assessment A — candidate_declared scenario (Rate-Limit Misconfiguration):**
- Created assessment against a paid built-in scenario via the org "Create Assessment" flow — confirms **paid assignment works**.
- Activated, invited the candidate, accepted invite, started the attempt.
- Verified via source read of `scenario/route.ts` that the candidate-facing scenario payload returns only `{scenarioSlug, architecture, controls, candidateUI}` — never rules, conditions, or scoring — confirming **hidden rules stay server-side**.
- Applied a real mitigation (raised per-tenant quota) with reasoning text, clicked Finish — confirms **Finish works**.
- Candidate's post-Finish result screen showed only score/breakdown/revenue-impact, with the explicit line "This result, your actions, your reasoning, and the incident timeline have been shared with the organization that invited you" and **no per-action educational explanation** (unlike the practice "Incident Result" screen's authored feedback) — confirms **candidate gets no educational feedback**.
- Signed in as the org owner; the assessment detail page showed **Outcome: "Not Fully Stabilized"**, **Candidate's Note** (the exact reasoning text typed at Finish), full score breakdown, and an "Interviewer Timeline" section ("what the candidate observed, what they changed, why they said they changed it, and what happened afterward") — confirms **company sees reasoning/outcome/completion note**.

**Assessment B — automatic scenario (Cache Stampede, pre-Phase-6 scenario with no `completion` field):**
- Created and activated a second assessment against an automatic-mode scenario; invited and started as the same candidate.
- Confirmed no Finish UI is rendered for this scenario (automatic mode has no candidate-facing completion control).
- Took zero action; the incident reached its failure condition and the attempt resolved to **"Incident Failed"** with no Finish click — confirms **failure remains automatic**.
- Company-side view showed **Outcome: "Failed"**, zero configuration changes, full score breakdown — same reasoning/outcome/note visibility as Assessment A.

All section 34 checks are now verified live. No bugs found in the assessment runtime, Finish semantics, or feedback-leak boundary.

## 2. Paid-access investigation (section 2 of the request)

**Finding: no access-control bug. The original report's wording was wrong and has been corrected (see report §7/§26).**

Investigated by reading `apps/web/.env.local` directly — found `DEV_UNLOCK_PAID_SCENARIOS="true"` set there, which is why the earlier QA session (and this session's investigation, until the flag was accounted for) could play paid scenarios in practice mode. Read the actual gating chain end to end:

- `apps/web/src/lib/practice-access.ts`'s `evaluatePracticeAccess()` — locks every non-free scenario by default; the only override is an explicit `devUnlockPaid: true` passed in by the caller.
- `apps/web/src/lib/server/dev-unlock.ts`'s `isDevUnlockPaidScenariosRequest()`/`isDevUnlockPaidScenarios()` — require ALL of: `NODE_ENV !== "production"`, `DEV_UNLOCK_PAID_SCENARIOS === "true"`, AND the request host resolving to localhost/127.0.0.1/::1. All three conditions are enforced together, not independently.
- Confirmed all four real call sites (`POST /api/attempts`, `POST /api/attempts/score-preview`, `POST /api/attempts/finish-preview`, and the `/incidents/[slug]` page component) correctly thread `devUnlockPaid` through to `evaluatePracticeAccess`.

**This logic was already correct before this session** — existing unit tests (`practice-access.test.ts`, `dev-unlock.test.ts`) already covered the pure functions in isolation and were green. The real gap was **no end-to-end regression coverage** at the actual route/page boundary proving the gate is wired in under realistic conditions — every prior test exercised the functions directly, never the live request path. Added:

- `apps/web/src/app/api/attempts/route.test.ts` (5 tests) — real authenticated route, real seeded DB: confirms a paid scenario is rejected (403, no attempt row created) with dev-unlock off, rejected off-localhost or in production even with the flag on, and only succeeds when all three conditions hold. A free scenario always succeeds.
- `apps/web/src/app/api/attempts/score-preview/route.test.ts` (5 tests) — same matrix against the anonymous/unauthenticated scoring route.
- `apps/web/src/app/incidents/[slug]/page.test.tsx` (+3 tests) — confirms the page itself renders `LockedScenarioScreen` (not the playable console) for a paid scenario without dev-unlock, and the console only for the full dev-unlock condition.

All 13 new tests independently verified to fail against the pre-fix access logic by temporarily stashing it and re-running (confirmed they correctly detect the unlocked-by-default failure mode), then confirmed passing against the real code.

**Paid-access matrix** (now enforced and regression-tested at the route/page level):

| isFree | devUnlock flag | host | NODE_ENV | Result |
|---|---|---|---|---|
| true | any | any | any | Allowed |
| false | unset | localhost | dev | **Locked** |
| false | true | non-localhost | dev | **Locked** |
| false | true | localhost | production | **Locked** |
| false | true | localhost | dev | Allowed (dev-unlock) |
| false (via assessment) | n/a | n/a | n/a | Allowed (separate assessment-entitlement path, unaffected by practice lock) |

## 3. Completion-mode re-audit (all 20 scenarios, state-graph-based)

Re-read every scenario's own completion-mode audit comment in `definition.ts` (the block citing phase6c.md §8, written during authoring) rather than trusting batch-level consistency. **This surfaced a second factual error in the original report**, corrected in report §7: **18 of 20 scenarios are `candidate_declared`; 2 are `automatic`** (not 20/0 as originally claimed).

| # | Slug | Mode | acceptableCondition? | State-graph justification (not boilerplate) |
|---|---|---|---|---|
| 41 | partial-regional-dependency-failure | candidate_declared | yes | Global-circuit-breaker tier is a real, bounded tradeoff (uniform fix, US sacrificed unnecessarily, real % values cited) vs. region-scoped optimal |
| 42 | dependency-rate-limit-exhaustion | candidate_declared | yes | Feature-suppressed tier is a named, bounded cost (relief via feature removal) vs. caching/coalescing optimal |
| 43 | api-traffic-spike | candidate_declared | yes | 3 distinct load-shedding tradeoffs modeled with real per-state DB-utilization numbers |
| 44 | rate-limit-misconfiguration | candidate_declared | yes | Priority-favored-steady is a genuine bounded tradeoff; emergency-bypass trap explicitly named and excluded despite looking healthy |
| 45 | load-balancer-imbalance | candidate_declared | yes | Connection-draining (forced reconnect, no durable guarantee) vs. mechanism-fixed optimal, distinguished by root-cause string field |
| 46 | cache-revalidation-herd | **automatic** | no | Explicitly contrasts against Missing Database Index's legitimate safe-tier pattern; argues the masked state is "ineffective" (herd recurs at next expiry), not safe — a recurrence-based argument, not a snapshot value |
| 47 | request-timeout-cascade | candidate_declared | yes | Fenced (circuit breaker, dependency not fixed) vs. rebudgeted (real fix), real successRate deltas |
| 48 | large-payload-regression | candidate_declared | no | Payload-truncated trap disqualified by its own 22-41% error rate despite a healthy-looking memory metric |
| 49 | api-gateway-saturation | candidate_declared | no | Auth-bypass trap removes a security control (not a bounded tradeoff); two independently-reachable optimal mechanisms exist instead of a middle tier |
| 50 | webhook-delivery-storm | candidate_declared | no | Backoff/DLQ-threshold partial fixes leave healthy-destination latency 3.6-19x baseline; only isolation reaches genuine safety |
| 51 | bot-traffic-surge | candidate_declared | no | Coarse-challenge tier carries a sustained 6.5% false-positive rate on real customers — explicitly rejected as not bounded/safe |
| 52 | uneven-tenant-traffic | candidate_declared | yes | Isolation/dedicated-lane are real cost-structure tradeoffs with identical fairness outcome; fleet-scaled trap (looks healthy, fixes nothing) explicitly excluded |
| 53 | network-partition | candidate_declared | no | Multiple genuinely-OPTIMAL mechanisms already exist (single-region routing, manual isolation); comment argues explicitly against adding a looser tier since it risks letting an unsafe dual-write state through |
| 54 | quorum-loss | candidate_declared | yes | Below-quorum-but-read-only/structural-refusal is a real availability-for-correctness tradeoff; unsafe trap named with its own counts (unsafeWriteCount=24 while writeAvailability reads 100) |
| 55 | replication-backlog | candidate_declared | no | Explicitly names and rejects "reads-isolated" (0 stale reads) as a tempting-but-wrong acceptable candidate, since the backlog itself stays uncontained |
| 56 | consistency-vs-availability-incident | candidate_declared | no | The real tradeoff space lives entirely within the optimal set (differentiated by scoring, not completion tier); configuration-drift trap (quorum="local-only" despite mode="strong") named explicitly |
| 57 | duplicate-request-processing | candidate_declared | no | Every non-optimal state has a nonzero duplicateRequestRatePct, individually listed; "reduced" is explicitly distinguished from "safe" |
| 58 | idempotency-failure | candidate_declared | yes | Fail-closed-degraded-availability is a real, bounded cost (71% success-rate drop, correctness held) vs. deduplicated (no tradeoff needed); fail-open trap gated by a string field, not availability |
| 59 | distributed-coordination-failure | **automatic** | no | successCondition is fully objective (every correctness counter at 0, ownershipIntegrityMode="reconciled", sustained 30s); comment argues no state represents a deliberate bounded tradeoff — every non-optimal state is simply an incomplete fix |
| 60 | partial-rollout-regression | candidate_declared | no | Masking/isolation paths help real things (memory, contamination) but regressionHealth stays "unresolved"/"masked"; 3 independently-reachable optimal paths proven with per-state numbers, not asserted |

**Totals: 18 candidate_declared, 2 automatic. 9 of 20 have an `acceptableCondition` tier; 11 do not.**

No scenario's classification looked batch-consistent/rubber-stamped rather than genuinely argued — every comment cites real field names and real numeric/string values from that scenario's own rule table, and several explicitly name and reject a *tempting* near-miss acceptable-tier candidate by its own numbers (replication-backlog, consistency-vs-availability-incident, bot-traffic-surge) — a positive signal, since a lazily-copied comment would not bother constructing and then refuting a specific trap. Both `automatic` classifications are genuinely load-bearing: in each case the comment argues *why no acceptable tier exists* rather than merely asserting it, and ties the automatic choice to a specific objective condition in the state graph.

## 4. Final validation

```
pnpm typecheck   → PASS (5/5 packages)
pnpm lint        → PASS (5/5 packages, 0 errors)
pnpm test        → PASS, 0 failing
  packages/simulator  38 passed
  packages/scenarios  1492 passed, 4 skipped
  packages/db         8 passed
  packages/scoring    23 passed
  apps/web            254 passed (13 new regression tests added this pass)
  — total: 1815 passed, 0 failing —
pnpm build       → PASS (compiled successfully, all routes generated)
pnpm db:seed     → Seed complete (60 built-in scenario(s)).
```

## 5. Changes made this pass

- **Fixed a real bug**: `apps/web/src/app/api/assessment/[assessmentId]/route.ts`'s `loadCandidateSafeScenarioMeta` hardcoded Payment Retry Storm's name/difficulty/duration for every built-in-scenario assessment, regardless of which scenario was actually assigned — a pre-existing bug (not introduced by Phase 6C), undetected because every prior assessment test/fixture happened to use Payment Retry Storm. Display-only — the actual runtime/scoring were never affected (that route already resolved correctly by slug). Fixed to resolve generically via `BUILT_IN_SCENARIO_CATALOG` by the assessment's real scenario slug, matching the pattern the sibling `scenario/route.ts` already used correctly. Live-reproduced in the browser (assessment created against Rate-Limit Misconfiguration showed "Payment Retry Storm" everywhere) and live-confirmed fixed.
- **Added regression tests**: 1 test for the assessment-metadata bug (`route.test.ts`, fails against the unfixed code, confirmed via stash/pop), 13 tests for the paid-access gate at the route/page boundary (5 + 5 + 3, all verified to fail against unfixed access logic).
- **Corrected the original completion report** in place: §7 (completion-mode claim, 20/0 → 18/2) and §26 (paid-access wording, retracted the "practice is unlocked" claim and explained the dev-unlock cause).
- **No scenario content, catalog wiring, scoring, or rules changed.** All 20 scenarios' rule tables, success/failure conditions, and scoring configs are untouched from the original authoring pass.
- **Test fixture data left in place per explicit instruction**: "Phase6C QA Org" organization, its 2 assessments ("Phase6C QA - Candidate Declared" against Rate-Limit Misconfiguration, "Phase6C QA - Automatic Mode" against Cache Stampede), and the candidate account `incidentrank.qa.6c+clerk_test@example.com` remain in the local dev database and local Clerk dev tenant as reusable QA fixtures. This is dev-only data: no real customer or payment information, not referenced by any source file, not part of seed data, and not part of any production configuration. The account uses the same disposable `+clerk_test` fixed-OTP pattern established in Phase 6B.1.

## 6. Outstanding items (unchanged from before this pass, not in scope for this closeout)

- Phase 6B.1's web/scenario fixes remain uncommitted from the prior session (unrelated to Phase 6C or this addendum).
- Phase 6D (scenarios 61-80) has not been started, per the explicit stop condition.
