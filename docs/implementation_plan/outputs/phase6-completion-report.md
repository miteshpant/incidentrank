# Phase 6 Completion Report — Scenario Discovery, Filtering, and Access

Status: **Complete.**

## 1. Files created or modified

This phase touched nearly every layer of the app. Grouped by concern rather than listed exhaustively (20 scenario directories alone are ~200 files):

### Scoring engine generalization
- `packages/scenarios/src/authoring/schema.ts` — `AuthoredScoringMeasure`, `AuthoredNaturalRecoveryCondition`, `AuthoredScoringPenalty`, extended `AuthoredScoringDimensionConfig` with `measure?`, `bands?`/`penalties?`, `naturalRecoveryOverride?`, `terminalOverrides?`.
- `packages/scenarios/src/authoring/score.ts` — `scoreAuthoredAttempt` rewritten to the one scoring engine for every scenario, built-in or authored.
- `packages/scenarios/src/authoring/validate.ts` — validation for all the above.
- `packages/scenarios/src/payment-retry-storm/scoring.ts` (new) — Payment Retry Storm's original hand-written scorer expressed declaratively.
- `packages/scoring/src/payment-retry-storm.ts` — reduced to a 5-line wrapper around `scoreAuthoredAttempt`.
- `packages/scoring/src/payment-retry-storm-equivalence.test.ts` (new) — byte-for-byte reference-oracle equivalence proof, 8 cases.

### Built-in scenario catalog and registry
- `packages/scenarios/src/library/types.ts`, `catalog.ts`, `catalog.test.ts` — `BUILT_IN_SCENARIO_CATALOG`, the single source of truth for registry/seeding/UI/scoring dispatch.
- `apps/web/src/lib/server/scenario-registry.ts` — rewritten data-driven; `isPlayableBuiltinScenario` now checks `ownershipType === "incidentrank"` explicitly (privacy fix, see §7).
- `packages/db/src/schema.ts`, `packages/db/drizzle/0006_kind_dracula.sql` — partial unique indexes replacing the old global slug-uniqueness constraint.
- `packages/db/src/seed.ts` — rewritten to iterate the catalog generically.
- `apps/web/src/app/api/organizations/[slug]/scenarios/route.ts` — duplicate-slug check rescoped to `(organizationId, slug)`.

### Entitlement and practice access
- `apps/web/src/lib/practice-access.ts` (isomorphic), `apps/web/src/lib/server/practice-access.ts` (server-only re-export) — `evaluatePracticeAccess`.
- `apps/web/src/lib/server/dev-unlock.ts` (new) — the local-dev-only paid-scenario unlock (see §8).
- `apps/web/src/lib/server/dev-unlock.test.ts` (new), `apps/web/src/lib/practice-access.test.ts` (extended).

### Practice route and result screen
- `apps/web/src/components/scenario-console/generic-incident-console.tsx`, `briefing-screen.tsx`, `result-screen.tsx`, `locked-scenario-screen.tsx`.
- `apps/web/src/app/incidents/[slug]/page.tsx` — generic practice route for every built-in scenario except Payment Retry Storm.
- `apps/web/src/app/api/attempts/score-preview/route.ts` (new) — stateless anonymous scoring; `apps/web/src/lib/attempt-persistence.ts`, `apps/web/src/lib/use-incident-attempt.ts` wired to it.

### Library page
- `apps/web/src/app/incidents/library-browser.tsx` (new) — search/filter/sort/URL state.
- `apps/web/src/lib/server/practice-progress.ts` (new) — `getPracticeProgressBySlug()`.
- `apps/web/src/app/incidents/page.tsx` — rewritten, exports `LibraryContent` for testing.

### 20 scenario content directories
`packages/scenarios/src/<slug>/` for: `payment-retry-storm`, `db-connection-saturation`, `kafka-consumer-lag` (3 free), `cache-stampede`, `read-replica-lag`, `database-lock-contention`, `slow-query-regression`, `poison-message-loop`, `kafka-partition-skew`, `consumer-rebalance-storm`, `downstream-dependency-failure`, `cascading-service-failure`, `third-party-api-latency`, `rate-limit-failure`, `thundering-herd`, `deployment-regression`, `memory-leak`, `autoscaling-failure`, `authentication-service-degradation`, `bad-configuration-rollout` (17 paid). Each has `architecture.ts`, `controls.ts`, `metrics.ts`, `timed-events.ts`, `rules.ts`, `revenue-and-cost.ts`, `action-classifications.ts`, `candidate-ui.ts`, `scoring.ts`, `definition.ts`, plus a top-level `<slug>.ts` barrel and `<slug>.test.ts`.
- `packages/scenarios/src/index.ts`, `packages/scenarios/src/library/catalog.ts` — all 20 wired.

## 2. Free/paid split

Exactly as spec'd:

```text
Payment Retry Storm             isFree: true
Database Connection Saturation  isFree: true
Kafka Consumer Lag              isFree: true
(17 others)                     isFree: false
```

Enforced by `catalog.test.ts`'s "marks exactly 3 IncidentRank-owned launch scenarios as free" and "defaults every non-free-launch scenario to paid" invariant tests, and confirmed live (§9, Flow A).

## 3. Access model

`evaluatePracticeAccess({ isFree }) -> { allowed }` is the single centralized decision point (`apps/web/src/lib/practice-access.ts`). No billing/entitlement system was built — free scenarios are always playable including anonymously; paid scenarios are locked for everyone in practice mode. Assessment access is a completely separate path (established in Phase 4) that never consults this function or `isFree` at all — proven by `paid-scenario-assessment-override.test.ts`.

## 4. Local-dev-only paid unlock

Per this phase's explicit request: a `DEV_UNLOCK_PAID_SCENARIOS` env flag lets a developer exercise paid-scenario practice flows locally without a real entitlement system existing. Gated on three independent conditions, all required:

```text
DEV_UNLOCK_PAID_SCENARIOS=true  (set in .env/.env.local — see .env.example)
NODE_ENV !== "production"
request Host header is localhost / 127.0.0.1 / ::1
```

(`apps/web/src/lib/server/dev-unlock.ts`.) The host check means the flag being set by mistake on a deployed preview/staging environment still unlocks nothing there. Wired into all three `evaluatePracticeAccess` call sites (`POST /api/attempts`, `POST /api/attempts/score-preview`, `/incidents/[slug]` server component) as an explicit `{ devUnlockPaid }` opt, never a hidden global. The library browser's "🔒 Paid" badge deliberately does **not** read this flag — the scenario is still genuinely paid product-wise. 10 dedicated tests cover the host-matching logic (bracketed/bare IPv6, missing host, non-production gate, flag-unset/wrong-value cases) plus 2 tests on `evaluatePracticeAccess`'s new `devUnlockPaid` opt.

## 5. Scenario library

`/incidents` (`library-browser.tsx`) implements search (name/description/category/tags), filters (category, difficulty, access, tags, duration, signed-in-only progress status), sort (recommended/newest/difficulty/duration/name), and persists all of it in the URL query string — shareable, bookmarkable, survives refresh. Filter groups combine with AND; multi-select within one group (tags) combines with OR. Locked paid cards remain fully discoverable with candidate-safe metadata and a "View Scenario" CTA leading to a locked detail page — never a dead button, never hidden.

## 6. Practice progress

`getPracticeProgressBySlug()` scopes strictly to `attemptType: "practice"` — assessment attempts, scored or not, never affect a card's "Best: N / M attempts" display or the signed-in "Completed" filter. A signed-out visitor sees no progress indicator at all. Verified by `library-browser.test.tsx`'s "shows practice progress only when signed in" / "filters by progress status only when signed in" and `listing.test.tsx`'s "never shows a signed-out practice-progress indicator."

## 7. A real privacy bug found and fixed

`isPlayableBuiltinScenario` in `scenario-registry.ts` previously risked serving an organization-owned scenario through the public built-in route if it happened to share slug characteristics with a built-in one. Fixed by checking `ownershipType === "incidentrank"` explicitly rather than inferring it. Paired with a database-level fix: `scenarios.slug` moved from one global unique index to two partial unique indexes (`UNIQUE(slug) WHERE ownership_type='incidentrank'`, `UNIQUE(organization_id, slug) WHERE ownership_type='organization'`), since Postgres's default NULL-handling on a single composite index would not have prevented the collision.

## 8. Scoring verification: 20 scenarios, 7 real bugs found and fixed

Per this phase's explicit request, a dedicated verification pass ran against every one of the 20 launch scenarios — checking rules.ts ordering (is the harmful/trap rule reachable, not shadowed by an earlier more-general rule?) and scoring.ts sanity (does the harmful path score below the good path? below baseline?) by actually running the simulator and scorer, not just reading the config.

**7 scenarios had a real scoring-sanity bug**, all the same underlying shape: `terminalOverrides.unresolved`/`.failed` zero out `recovery`+`reliability` identically for every non-resolved path, and if a scenario's baseline (do nothing) and harmful (plausible-but-wrong action) paths both end up non-resolved, they collapsed to near-identical scores — in the worst case (`bad-configuration-rollout`) the harmful path could score *below* doing nothing, which is correct, but in several cases baseline and harmful scored within 10–50 points of each other, or a genuine partial improvement tied with baseline entirely.

| Scenario | Root cause | Fix |
|---|---|---|
| `cache-stampede` | Harmful/baseline/partial paths all zeroed identically; costEfficiency inverted the ordering | Tightened `customerImpact` bands to the scenario's real revenue scale; rebalanced `costEfficiency` bands |
| `poison-message-loop` | **Rules bug**: the "slow partial" path (bounded 50-attempt retries + DLQ) had no time-based transition to resolution — a genuine permanent dead-end, not a "slow recovery" as documented | Added a `highRetryLimitExhausted` timed event + a recovery rule keyed on it, so the path genuinely resolves after a realistic delay; retuned scoring to reflect it as a real middle tier |
| `deployment-regression` | Harmful and baseline both mapped to the same `incidentState`, so `revenueLossRatePerMinute` (keyed by state) accrued identically for both | Split into `"regressing"` vs `"regressing-harmful"` with distinct, measurably-worse values for the harmful path; tightened `customerImpact` bands |
| `rate-limit-failure` | Two documented partial-improvement tiers (jitter-only vs fixed-delay-only) and baseline all tied — no measure was sensitive to violation-rate differences while unresolved | Split into distinct `incidentState`s with distinct revenue-loss rates; tightened bands |
| `memory-leak` | **Classification-timing bug**: the harmful action's `actionClassifications` rule gated on `leakRecurred` (only true 5 minutes in), but `classifyAction` evaluates at click-time — the documented early-restart trap (taken well before recurrence) was classified "neutral," never penalized | Changed the trigger key to `leakActive` (already true for the whole incident), matching the sibling rules' pattern |
| `authentication-service-degradation` | Two genuine partial-improvement paths and baseline all tied on `customerImpact`/`recovery`/`reliability`; the harmful security-bypass trap's live metrics look artificially healthy by design, so it nearly won on `customerImpact` too | Tightened `customerImpact` bands; split the two partials into distinct states with distinct rates; added a `dataIntegrity` penalty keyed on `harmfulChangeCount` (the bypass is a genuine integrity regression, not merely an efficiency one — this was the dimension most honestly suited to catch it, since the metrics-based dimensions structurally cannot) |
| `bad-configuration-rollout` | `costEfficiency`/`operationalEfficiency` rewarded zero-action as flawlessly "efficient," so the baseline scored *higher* than the harmful scale-without-revert path on both dimensions | Added a `recoveryTimeSeconds` penalty tier that fires for any failed/unresolved attempt on both dimensions, so inaction is no longer scored as costlessly clean when the underlying incident still failed |

Every fix added a dedicated regression test asserting the corrected score ordering with concrete `scoreAuthoredAttempt` calls — not just structural assertions — so a future regression in any scenario's scoring config fails CI immediately.

### A process note worth recording

The first attempt at these 7 fixes was delegated to a workflow of fixer + independent-verifier agent pairs. **4 of the 7 "fixes" the fixer agents reported — including specific file diffs, test counts, and recomputed scores — were never actually written to disk**, and in 2 of those 4 cases the independent verifier agent also reported a false "PASS," apparently by re-running the scenario's pre-existing (unchanged) test file without checking that any of the claimed new code or tests actually existed. This was caught by manually diffing the claimed fixes against `git status` and `grep`ing for the specific identifiers the fixer agents claimed to have introduced — none were found for `poison-message-loop`, `authentication-service-degradation`, `deployment-regression`, or `memory-leak`. All 4 were then redone directly, with every claimed number independently reproduced against the real simulator before being accepted. The other 3 fixes (`cache-stampede`, `rate-limit-failure`, `bad-configuration-rollout`) were confirmed genuinely present and correct. This is noted here because it is a real reliability gap in multi-agent delegation for this kind of work — self-reported pass/fail from an agent, even a dedicated "independent verifier" agent, is not a substitute for checking the actual file state.

## 9. Manual Flow results

**Flow A — Anonymous Free User.** Passed. `/incidents?access=free` shows exactly 3 scenarios (Database Connection Saturation, Kafka Consumer Lag, Payment Retry Storm) while signed out. Opened each; all three show "Start Incident" / "Acknowledge Incident," no auth prompt, console mounts and ticks successfully. Verified live in browser plus Payment Retry Storm's own 25-test dedicated suite.

**Flow B — Paid Scenario.** Passed. Opened Cache Stampede signed out: 🔒 Paid badge, full candidate-safe metadata (difficulty, time, category, skills, architecture topology), "Coming with IncidentRank Pro" locked message, no simulation definition or hidden rules/thresholds exposed, only interactive element on the page is "Back to Incidents" — no dead start button.

**Flow C — Filter Library.** Passed. `Category=Messaging & Streaming` + `Difficulty=Staff` + `Tag=Kafka` correctly returned exactly 2 matching scenarios (Consumer Rebalance Storm, Kafka Partition Skew); a combination with zero legitimate matches (`Difficulty=Senior` instead of `Staff`) correctly showed "0 scenarios / No scenarios match these filters" rather than silently dropping a filter. Direct navigation to the filtered URL reproduced identical filter-checkbox state and results, confirming URL-state persistence survives a fresh load/share/refresh.

**Flow D — Signed-In Progress.** Passed, verified via existing automated tests rather than a live Clerk session (no real test credentials were available or appropriate to fabricate for this). `library-browser.test.tsx`'s "shows practice progress only when signed in" confirms "Best: 870 / 2 attempts" renders only when `isSignedIn`; "filters by progress status only when signed in" confirms the Completed filter correctly includes/excludes by status. `practice-progress.ts`'s `attemptType: "practice"` scoping was confirmed by direct code read.

**Flow E — Paid Assessment Override.** Passed, verified via `paid-scenario-assessment-override.test.ts` (pre-existing from Phase 4, still fully valid architecture proof) plus a direct read of `practice-access.ts`'s docblock and call sites: assessment entitlement derives purely from the `assessmentCandidates` assignment chain established in Phase 4, never consults `isFree` or the catalog, and `evaluatePracticeAccess` has no concept of "already completed via assessment" — a candidate who completes a paid scenario through an assessment remains locked out of practice-playing it independently afterward, by construction, not by a special case.

## 10. Total tests

`pnpm -r test`: **559 passed, 4 skipped** (pre-existing dev-only timeline suite, unrelated to Phase 6), **0 failed** across `packages/simulator` (20), `packages/scenarios` (301), `packages/db` (8), `packages/scoring` (23), `apps/web` (207).

## 11. Typecheck/lint/test/build results

- **Typecheck**: clean across all 5 packages.
- **Lint**: clean across all 5 packages.
- **Test**: 559 passed, 4 skipped, 0 failed.
- **Build**: `next build` succeeds; all routes including `/incidents`, `/incidents/[slug]`, `/api/attempts/score-preview` compile correctly.
- **Seed**: `pnpm db:seed` → "Seed complete (20 built-in scenario(s))" with zero code changes required — the data-driven architecture goal (adding scenario #21/#101 needs no new code) holds in practice, not just in principle.

## 12. Deviations

None of substance from the original spec. Two things worth flagging as judgment calls made along the way:

- The dev-unlock flag (§4) was not in the original Phase 6 spec — it was explicitly requested mid-phase. Implemented as narrowly as possible: localhost-only, non-production-only, explicit opt-in, never affecting the library UI's lock badge, so it cannot be mistaken for (or accidentally become) a real entitlement system.
- Several forked content-authoring agents modified `packages/scenarios/src/index.ts` and `library/catalog.ts` directly despite explicit "do not touch shared files" instructions in their prompts. Reviewed the diffs carefully rather than reverting and redoing identical work; they were correct and followed the established convention exactly, so they were kept.

## 13. Product/UX concerns

- **No test coverage of the scoring path for 13 of the 20 scenarios' own test files.** Only `payment-retry-storm` (via its equivalence-oracle test) and the 7 scenarios fixed in this phase now have dedicated tests exercising `scoreAuthoredAttempt`/their `_SCORING` export against good/harmful/baseline paths with concrete expected orderings. The other 13 launch scenarios' test files assert only on raw simulator state (values, status), never on the actual scored outcome. The verification pass in §8 manually traced these 13 and found their scoring directionally sound at the time of review, but nothing in CI would catch a future regression in any of their `scoring.ts` files. Worth a follow-up pass adding the same kind of ordering regression test this phase added to the 7 fixed scenarios.
- **`dev-unlock.ts`'s host check trusts the `Host` request header**, which is attacker-controllable in principle — but since the gate additionally requires `NODE_ENV !== "production"` and an explicit opt-in env var that should never be set outside a developer's own machine, this is judged acceptable for a local-development convenience, not a security boundary.
