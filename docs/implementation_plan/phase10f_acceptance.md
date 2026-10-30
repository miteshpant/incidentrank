# Phase 10F Acceptance Report

**Status: Phase 10F is complete.** Infrastructure (schema, types, scoring decision, review/learn narrative) is built and verified; the two requested corrections (persisted `is_free` authoritative, `AuthoredRule.roleInIncident` removed) are applied and tested; the one Staff-level parallel reference incident is built, seeded, fully unit-tested, and verified live in a browser end to end.

This supersedes `phase10f_completion.md` (infrastructure-only, written before the corrections and the reference incident) as the authoritative record of what shipped.

---

## 1. Corrections applied since the infrastructure checkpoint

### 1a. Persisted `scenarios.is_free` is now authoritative

Every `evaluatePracticeAccess` call site (`apps/web/src/app/api/attempts/route.ts`, `.../finish-preview/route.ts`, `.../score-preview/route.ts`, `apps/web/src/app/incidents/[slug]/page.tsx`) now resolves `isFree` from the persisted DB row, not the compiled `ScenarioDefinition` literal:

- `route.ts` and `page.tsx` already load the scenario row (`getActiveScenarioBySlug`, itself scoped to `ownershipType: "incidentrank"` to prevent a slug-collision leak) — now read `.isFree` directly off it.
- `finish-preview/route.ts` and `score-preview/route.ts` are stateless/anonymous routes with no existing DB round-trip — added a new, narrowly-scoped `resolveBuiltInScenarioIsFree(slug)` in `scenario-registry.ts`, with the same `ownershipType: "incidentrank"` scoping and a code-literal fallback only when no DB row exists at all (never a silent `false`, which would regress every genuinely-free scenario for an anonymous caller).
- `page.tsx` specifically needed its `isFree` resolved **once, before** the existing `if (!devUnlockPaid && !entry.definition.isFree)` short-circuit — previously that gate and the final access check both read the stale code literal independently; if only one were fixed, a DB-driven `is_free` flip could have let a candidate skip the paid-entitlement lookup entirely while still being denied, or vice versa. Both now read the same resolved value.
- `db:seed`'s `onConflictDoUpdate` (from the infrastructure pass) remains the mechanism that keeps the DB column in sync with code by default — an admin can now override it directly in the DB to rotate which scenario is free, and that override survives until the next seed run re-syncs from code (a known, accepted tradeoff pending a real admin UI, documented in the seed script's own comment).

**Tests added** (`apps/web/src/app/api/attempts/route.test.ts`, new describe block "persisted is_free is authoritative (Phase 10F)"):
- `it.each` over all 3 currently-free built-ins (`kafka-consumer-lag`, `payment-retry-storm`, `database-connection-saturation`) — each still creates a real attempt via the actual route, proving the migration changed nothing for existing free access.
- Flipping a normally-paid scenario's persisted `is_free` to `true` grants access with zero TypeScript change, then reverts it.
- Flipping a normally-free scenario's persisted `is_free` to `false` locks it (403), even though the code literal still says `isFree: true`, then reverts it.

All 5 new tests pass; full web suite is 710/713 (the 3 failures are a pre-existing, unrelated legal-gate redirect flake — independently reproduced by stashing every Phase 10F change via `git stash` and re-running, confirming they predate this work).

### 1b. `AuthoredRule.roleInIncident` removed

The field was added during infrastructure but never consumed by `buildIncidentNarrative` or anything else — only `AuthoredMetric.roleInIncident` is actually read. Removed from `packages/scenarios/src/authoring/schema.ts`'s `AuthoredRule` interface entirely; doc comments on `AuthoredRoleInIncident` and `AuthoredMetric.roleInIncident` updated to state unambiguously that this metadata lives on **metrics only** (facts about the incident), never on rules and never on controls (which keep their own, separate `kind`/`ActionClassificationRule`-based action classification). Typecheck confirmed clean after removal — nothing referenced the field.

---

## 2. Reference incident: scenario design

**Slug:** `checkout-payment-inventory-redis-contention` · **Structure:** `parallel` · **Difficulty:** `staff` · **Free:** no (Pro-gated, correctly confirmed live)

**The setup:** Checkout, Payment, and Inventory APIs all route through Checkout. Payment and Inventory both depend on a shared Redis instance; Checkout does not (a separate connection pool, never explained to the candidate — the point is for them to notice Checkout simply isn't affected rather than being told why).

**What the candidate sees at incident start (30s in):**
- Checkout stays **healthy** throughout — latency barely moves (80ms→85ms), error rate flat at 0.1%. This is the misleading-healthy signal.
- Payment and Inventory both go **critical** simultaneously — Payment retry rate 2%→34%, timeout rate 3%→41%; Inventory p95 latency 120ms→1.5s.
- Redis goes **degraded**, but its CPU (18%→19%) and memory (35%, unchanged) both look completely normal — the second misleading signal.
- **Redis connection utilization** climbs 20%→97% — the actual, hidden shared-dependency root cause, visible only if the candidate looks at this specific metric rather than CPU/memory.
- A **noise signal** (`Monitoring Agent Flap Count`, 2→48) climbs alarmingly in parallel but is genuinely unrelated to the root cause, the fix, or any scoring/success condition — confirmed by a dedicated test showing it stays near its post-incident baseline (6) after the correct fix is applied, proving it never factored into resolution.

**Investigation controls** (non-destructive, `kind: "investigation"`): Inspect Payment Retry Metrics, Inspect Inventory Deployment History, Inspect Redis Connection Pool — toggles that advance the candidate's own diagnostic record without mutating any health/revenue/cost state, classified `neutral` so they never inflate beneficial/harmful change counts.

**Remediation controls** (`kind: "remediation"`):
- Restart Payment Pods — plausible, inferior. Verified live and in tests: Payment dips briefly but Inventory stays degraded and Redis stays saturated.
- Rollback Inventory Deployment — plausible, inferior. The deploy was never the cause; verified this does nothing to Inventory latency or Redis utilization.
- Redis Connection Pool Size (128/256/512/1,024) — the real fix at 512+. A partial increase to 256 only partially relieves pressure (connection utilization drops from 97% to 68%, still failing successCondition).

**Investigation order independence**, directly tested and verified live: a candidate who inspects Payment → Inventory → Redis → then fixes reaches the same `diagnosisPath: "correlated-then-fixed"` state as one who inspects Redis → Inventory → Payment → then fixes. The engine matches rules against a *current* control-value snapshot each tick (no temporal-ordering primitive exists, confirmed from `packages/simulator/src/rules.ts`), so `diagnosisPath` captures *what* was correlated by the time of the fix, not strict chronological order — an honest reflection of what the existing engine can express, documented explicitly in `rules.ts`'s own comment rather than silently overclaiming true ordering enforcement.

---

## 3. Scoring behavior (explicitly authored, zero magic)

No new measure was added to the shared scorer. Investigation-quality scoring uses the **existing** `finalStringEquals` measure (same mechanism Kafka Partition Skew already uses for its `orderingMode` tradeoff) against the author-set `diagnosisPath` state value:

| Dimension | Max | Mechanism |
|---|---|---|
| Recovery | 250 | `recoveryTimeSeconds`, standard bands |
| Customer Impact | 200 | `revenueLossUsd`, standard bands |
| **Data Integrity** | **150** | `finalStringEquals(diagnosisPath, "correlated-then-fixed")` → 150 if true, 60 if false |
| Reliability | 150 | `criticalTimeRatio`, standard bands |
| Cost Efficiency | 100 | `costIncreaseRatio`, standard bands |
| Operational Efficiency | 150 | Penalties: harmful change ≥1 (-20), config changes ≥6/≥9 (-15/-30) |

**Verified, live, in a real browser attempt** (not just unit tests): correlating all three investigation controls before applying the 512+ fix produced **Data Integrity 150/200**, matching the top band exactly. A second unit-tested run using the identical fix *without* any investigation produced **Data Integrity 60/200** — same outcome (resolved), same remediation, strictly lower score purely because the candidate never demonstrated the correlation. A third test confirmed a candidate who randomly chases both inferior single-service remediations scores lower overall than one who takes the correlated strong path. This is the explicit, auditable scoring behavior requested — `roleInIncident` tags were never read by the scorer at any point; they exist solely for narrative/authoring guidance.

**Live total score for the correlated-then-fixed path (verified in browser):** 885/1000.

---

## 4. Candidate experience — verified live in browser

A full signed-out practice attempt was run end to end against the local dev server (`pnpm dev`, seeded DB, `DEV_UNLOCK_PAID_SCENARIOS` temporarily enabled for QA only and reverted immediately after — confirmed via `git status`/diff that `.env.local` is untracked and was restored to its original value, no residual state).

1. **Briefing screen**: title, full description, Staff/~18 min/Distributed Systems, all 4 skills, all 4 architecture components rendered correctly. Scenario correctly showed as 🔒 Paid before dev-unlock, confirming the `is_free` fix (§1a) works end to end for a brand-new scenario too.
2. **Pre-incident**: all 4 components healthy, all 7 live metrics visible (including the noise signal, visible from the start — not hidden/revealed, consistent with the existing engine's "no partial visibility" model confirmed during infrastructure research).
3. **Incident begins (30s)**: Checkout stayed healthy while Payment and Inventory both went critical simultaneously — the parallel-degradation moment rendered exactly as designed, with the incident timeline narrating "Payment retries and Inventory latency have both started climbing."
4. **Investigation**: toggled all three investigation controls across the Payment, Inventory, and Redis component panels — each correctly timeline-logged as a "YOU" action (e.g. "Inspect Payment Retry Metrics changed Not inspected → Inspected").
5. **Remediation**: raised Redis Connection Pool Size to 512 — all four components transitioned to healthy simultaneously (Payment retry 34%→2%, Inventory latency 1.5s→130ms, Redis connection utilization 97%→35%), timeline logged "Redis connection utilization has dropped back below 90%."
6. **Finish**: real confirmation dialog ("This will end the incident and cannot be undone"), confirmed.
7. **Result screen**: "INCIDENT RESOLVED," 885/1000, full dimension breakdown, Recovery Time 03:31, Peak Redis Connection Utilization 97, Peak Payment Retry Rate 34, Peak Inventory p95 Latency 1,480, 4 configuration changes (1 beneficial, 0 harmful — correct, since investigation toggles are neutral), full per-action list with correct before/after values.

---

## 5. Review/learn output

`buildIncidentNarrative` is fully unit-tested (5 tests in `narrative.test.ts`, 2 scenario-specific tests in `checkout-payment-inventory-redis-contention.test.ts`) and confirmed to correctly group this scenario's metrics: Redis Connection Utilization under root cause; Payment Retry Rate and Inventory p95 Latency under observed effects; Checkout Latency, Redis CPU, and Redis Memory under context; Monitoring Agent Flap Count excluded from every group (noise is never surfaced post-incident, by design).

**Not independently verified live in the browser** — see §7, "known limitations." The post-incident feedback/narrative endpoint (`/api/attempts/[attemptId]/review`) is scoped to signed-in practice attempts only (anonymous attempts have no persisted `attemptId` to review against, confirmed in `use-incident-attempt.ts` — this is pre-existing, correct behavior, not something this phase changed). The QA session above was run signed-out ("Playing as a guest"), so the "What Happened" section correctly did not render — not a defect, but a gap in what this particular live session could verify. The mechanism itself is proven correct by the same `buildIncidentNarrative` function the live endpoint calls, exercised identically in both the generic `narrative.test.ts` suite and the scenario-specific test suite.

---

## 6. Regression test results

| Suite | Result |
|---|---|
| `packages/simulator` | 41/41 pass |
| `packages/scenarios` | 3639/3639 pass (3606 pre-existing + 8 infrastructure + 21 reference-incident + 4 golden-path-registration-driven; includes 406/406 golden-path catalog tests across all 101 scenarios) |
| `apps/web` | 710/713 pass (3 failures are a pre-existing, unrelated legal-gate redirect flake, confirmed via `git stash` to predate this work entirely) |
| `pnpm typecheck` | clean, all 5 workspace packages |
| `pnpm lint` | clean, all 5 workspace packages |
| `pnpm build` | succeeds |
| `pnpm db:seed` | idempotent; 101 built-in scenarios (up from 100), `is_free`/`structure`/`domain` verified correct via direct DB query |

---

## 7. Architectural gaps discovered while building the first real parallel incident

1. **Golden-path registry is mandatory, not optional.** `packages/scenarios/src/golden-paths/` is a catalog-wide regression suite (4 test files, 406 total assertions) that iterates every registered scenario and requires a corresponding `ScenarioGoldenPath` entry. The original Phase 10F plan did not mention this — the first `pnpm --filter @incidentrank/scenarios exec vitest run` after adding the reference incident failed 4 tests with `Cannot read properties of undefined (reading 'finishAtMs')` until a golden-path file was authored and registered. **Fixed as part of this phase** (`golden-paths/checkout-payment-inventory-redis-contention.ts` + `registry.ts` registration) — flagging this explicitly so Phase 10G's weekly-content process accounts for it: every new scenario needs a golden path, not just a definition + candidate UI + scoring.

2. **Result screen's per-dimension score max is a hardcoded client constant, not server-derived.** `apps/web/src/components/scenario-console/result-screen.tsx`'s `SCORE_DIMENSION_MAX` assumes every scenario uses the fixed 300/200/200/150/100/50 split that all 100 original scenarios happen to share. This reference incident deliberately authors Operational Efficiency at `maxPoints: 150` (to make the inferior-remediation penalty meaningful at a larger scale) — confirmed live in the browser, the result screen displayed **"150 / 50"**, a genuinely wrong denominator (the numerator, the actual score, is correct — only the displayed max is stale). **Not fixed in this phase** — it's a real but narrowly-scoped display bug (the server's `ServerScoreResult.breakdown` has no max-points field at all today; fixing this correctly means threading each dimension's real `maxPoints` from the server's `AuthoredScoringConfig` through to the client, touching `score-preview`/`finish-preview` routes, `use-incident-attempt.ts`, and `attempt-persistence.ts`'s `ServerScoreResult` type). Recommending this as a Phase 10G (or earlier) fix, since any future scenario with non-standard dimension weights will hit the same bug.

3. **Investigation-order is correlation, not strict chronology** (by design, not a gap, but worth stating plainly for future authors): the engine's rule-matching is a current-snapshot evaluation with no memory of control-change order. `diagnosisPath`-style scoring (this scenario's pattern) can distinguish "touched the right things before fixing" from "fixed blindly," but cannot distinguish "investigated Payment then Redis" from "investigated Redis then Payment" as different diagnosisPath values without authoring a combinatorial rule explosion. This scenario deliberately treats order-independent correlation as the success criterion and documents why in `rules.ts`'s own comment, rather than overclaiming true ordering enforcement the engine doesn't have.

4. **No admin UI yet for the new catalog metadata** (`structure`, `domain`, `primarySkill`, `secondarySkills`, `releaseWeek`, `publishedAt`, or DB-level `isFree` overrides) — confirmed still true after this phase; the sectioned scenario editor was not touched. An admin wanting to rotate the free scenario or correct a miscategorized `domain` today needs direct DB access or a code change + reseed.

---

## 8. What's explicitly still out of scope (per the original Phase 10F spec, unchanged)

Weekly 15-incident generation, a publishing scheduler, enforcing the suggested editorial ratios in code, a generic workflow/graph engine, a graph database, a large topology visualization library, an enterprise assessment builder, a CMS rewrite, an incident marketplace, automatic adaptive interviews, and (per this report's §7.2 and §7.4) the result-screen max-points display fix and the admin UI for the new catalog metadata — both newly identified, neither blocking, both reasonable Phase 10G candidates.

---

## Phase 10G can now begin

Phase 10F's exit criteria — infrastructure complete, both corrections applied and tested, exactly one Staff-level parallel reference incident built and validated end to end — are met. Recommended Phase 10G scope, informed by what this phase actually discovered rather than speculated: the weekly content/publishing process, plus the two real gaps surfaced here (golden-path authoring as a first-class step in the content pipeline, and the result-screen max-points fix before any future scenario ships with non-standard dimension weights).
