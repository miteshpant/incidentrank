# Phase 10C Completion Report — Engineer Rank & Platform Customer/Revenue Dashboard

Phase 10C is complete: implemented, tested, live-browser-QA'd against real data, fully validated, and documented. Binding spec: `docs/implementation_plan/phase10c.md`. Approved plan: `/Users/miteshpant/.claude/plans/keen-painting-piglet.md`.

## Stripe catalog

No new Stripe Products/Prices were created this phase. Part B's revenue figures come entirely from a static USD-cents price map (`revenue-pricing.ts`) confirmed by hand against the real existing TEST MODE catalog (personal Pro monthly/annual, Founding lifetime — from Phase 9 — and the two organization-credit prices created in Phase 10B). No live Stripe API call ever backs a dashboard number; the map is the single source of truth and is documented as something to update by hand if the underlying Stripe Price amounts ever change.

## Schema

One new migration, `packages/db/drizzle/0014_fixed_absorbing_man.sql`, purely additive (verified: 2 new enum `CREATE TYPE`, 1 new table, 2 FKs, 1 index, zero `DROP`s):

- **`rank_band`** enum — `developing | intermediate | senior | staff | senior_staff | principal`.
- **`rank_confidence`** enum — `low | medium | high`.
- **`rank_snapshots`** table (`packages/db/src/schema.ts`) — `id`, `userId` (FK `users.id`, cascade delete), `algorithmVersion`, `rankBand`, `provisional`, `confidence`, `normalizedScore` (real), `dimensionScoresJson`/`skillScoresJson` (jsonb), `attemptsCount`, `qualifyingAttempts`, `evidenceBreadth`, `distinctSkillAreas`, `triggerAttemptId` (FK `attempts.id`, set-null), `createdAt`; indexed on `(userId, createdAt)`.

**Append-only, history-preserving** — rows are never updated in place. "Current rank" = latest row by `(userId, createdAt DESC)`, which the index makes cheap. No snapshot row is ever written for a user with zero qualifying evidence; absence of any row is itself the "not enough evidence" state — never a bogus all-zero row. `algorithmVersion` is stamped on every row (`"v1"` today) so historical rows stay interpretable even if the algorithm changes later. No schema was added for Part B — every revenue/customer aggregation reuses tables that already existed before this phase (`stripeCustomers`, `organizationStripeCustomers`, `paidEntitlements`, `stripeSubscriptions`, `foundingEngineerAllocations`, `organizationCreditLedger`); adding an `amount_total`/`currency` column to persist exact transaction amounts was considered and declined in favor of the static price map, since no schema change was otherwise required this phase.

## Algorithm

`apps/web/src/lib/server/engineer-rank.ts` — `computeEngineerRank(evidence)` is a pure function (no DB access), deterministic over a plain array of `QualifyingAttemptEvidence`. `ENGINEER_RANK_ALGORITHM_VERSION = "v1"`.

**Difficulty factors** (chosen against the real 100-scenario built-in catalog's actual distribution — beginner 1, intermediate ~9-11, senior 24, staff 28, senior_staff 16, principal 23 — heavily skewed toward the top three tiers, which is why the scale is a wide linear spread rather than a tight 1.0–1.4 band):

| Difficulty | Factor |
|---|---|
| beginner | 0.85 |
| intermediate | 1.00 |
| senior | 1.15 |
| staff | 1.30 |
| senior_staff | 1.45 |
| principal | 1.60 |

**Outcome factors**: `resolved=1.0`, `declared_unstable=0.5`, `failed=0.25`, `timed_out=0.25` — never negative, never zero. A poor attempt is never erased from the record; it contributes a small positive floor rather than a penalty, since this codebase has no precedent anywhere for negative/decay scoring mechanics.

**Normalization formula**: `normalizedAttemptScore = (rawScore / 1000) × difficultyFactor × outcomeFactor`.

**Repeat-scenario policy (best-of-per-scenario)**: for a given `(userId, scenarioId)`, only the single highest-`normalizedAttemptScore` qualifying attempt counts. Repeated retries on one scenario can never contribute more than that one best result — gaming-resistant by construction, not by a runtime cap. `qualifyingAttempts`/`evidenceBreadth` count distinct scenarios with ≥1 qualifying attempt; retries never inflate either count.

**Band thresholds** (minimum qualifying scenarios / minimum distinct skill areas, i.e. `ScenarioLibraryMetadata.category` values):

| Band | Min qualifying scenarios | Min distinct skill areas |
|---|---|---|
| developing | 1 | 1 |
| intermediate | 3 | 2 |
| senior | 6 | 3 |
| staff | 10 | 3 |
| senior_staff | 14 | 4 |
| principal | 18 | 4 |

**Score ranges** (0–1.60 normalized scale, since the principal difficulty factor tops at 1.60 × a resolved outcome factor of 1.0):

| Band | Range |
|---|---|
| developing | [0.00, 0.35) |
| intermediate | [0.35, 0.55) |
| senior | [0.55, 0.75) |
| staff | [0.75, 0.95) |
| senior_staff | [0.95, 1.15) |
| principal | [1.15, 1.60] |

**Achieved band = min(threshold-implied band, score-implied band)**, by ordinal. A user cannot reach Principal by score alone without the required breadth, nor by breadth alone without the required score — both the "one-domain rank inflation" and "low-evidence high-rank" failure modes are closed structurally.

**Confidence**, relative to the achieved band's own threshold minimum:

- `qualifyingAttempts < min` → no snapshot written at all (not enough evidence for any band).
- `[min, 2×min)` → `confidence="low"`, `provisional=true`.
- `[2×min, 4×min)` → `confidence="medium"`, `provisional=false`.
- `≥ 4×min` → `confidence="high"`, `provisional=false`.

A single qualifying attempt at developing's `min=1` lands in `[1,2)` — exactly the spec's own "one high score should only ever produce a provisional rank" example.

**Evidence scoping is structural, not a runtime check inside the pure function**: `rebuildEngineerRankForUser(tx, userId)` queries `attempts WHERE attemptType='practice' AND status='completed' AND ownershipType='incidentrank'` (joined to `scenarios`) — assessment attempts, org-authored scenarios, and payment/entitlement status are never part of the evidence-gathering query in the first place, so `computeEngineerRank` itself never has the information needed to violate those boundaries even in principle. Category/difficulty are resolved from the built-in catalog's own code-defined `ScenarioDefinition` (via `getBuiltInScenarioEntry`), never from mutable DB rows, so a later edit to a scenario's metadata can't retroactively change the interpretation of a past snapshot.

## Recalculation & fault isolation

The original plan assumed 3 call sites for `persistTerminalAttempt`; a 4th was found at `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts:136`. Rather than duplicate the trigger at each site, the hook lives once, inside `persistTerminalAttempt` itself, immediately after the existing referral-qualification call — gated on `updated` (the function's own race-winner signal: only the writer whose `UPDATE ... WHERE status='in_progress'` actually affected a row triggers anything) and `attempt.attemptType === "practice"`. This automatically covers all 4 call sites with one change.

**No try/catch.** An earlier draft wrapped the rank-recalculation call in a try/catch intended to isolate a rank failure from the attempt's own completion. This was identified as incorrect before shipping: a try/catch around a query sharing the caller's `tx` does not provide real isolation, since Postgres poisons the whole transaction on any statement error regardless of a JS-level catch — "catching" the error would only mask a doomed transaction, not save it. This tradeoff was surfaced to the user directly; the user chose to match the existing precedent at the exact same code location — referral-qualification failures already can roll back the whole terminal-persistence transaction today, and rank recalculation now gets identical treatment, not special-cased isolation. In practice this targets a brand-new additive table with no complex constraints, so failures are expected to be rare (connection-level only). No job queue was introduced; none exists anywhere else in this codebase.

## Rebuild

`rebuildAndPersistRank(userId)` runs in its own `db.transaction`, recomputes from scratch, and unconditionally force-inserts a fresh snapshot (even if identical to the prior one) with `triggerAttemptId: null` — a rebuild must be unconditionally honest about current state, never silently skip a write because nothing looks different. Exposed via `POST /api/admin/users/[userId]/rank/rebuild`, gated on `isAdminPortalEnabled() && isEngineerRankEnabled()` plus the standard `getOrCreateCurrentUser` → `loadAdminMembership` chain (bare `.ok`, no owner-level gating needed). Logs `logAdminAction("engineer_rank_rebuild", ...)` on every call.

## Profile UX

`EngineerRankPanel` (`apps/web/src/components/engineer-rank-panel.tsx`), inserted into `profile-content.tsx` between `ProfileForm` and `IncidentPassPanel`. Three states: no snapshot ("not enough evidence yet"); provisional (`"Provisional {Band} — based on {qualifyingAttempts} completed incidents"`); established (`"IncidentRank level: {Band}"`, confidence label, all six dimension scores under their existing established names — Recovery, Customer Impact, Data Integrity, Reliability, Cost Efficiency, Operational Efficiency — top skill-area tags, and the spec's explainer line). A display-scaling bug (dimension values multiplied by 100 when they were already on their native 0–300ish scale) was found during live QA and fixed — see Browser QA below.

## Privacy

The profile panel reads only the caller's own `userId` from `getOrCreateCurrentUser()`, never a route parameter. The only other Rank read path is the admin rebuild route (band/confidence only — no dimension or skill breakdown is ever exposed to an admin through any route). No organization-facing rank code exists anywhere — confirmed by grep across the codebase for `rank_snapshots`/`rankSnapshots`/`getLatestRankSnapshotForUser`/`rebuildEngineerRank`: zero references in `org-membership.ts`, `organization-auth.ts`, or any organization-facing route or view. The privacy boundary is enforced by absence of a code path, not by a runtime check that could be bypassed.

## Global Engineer Rank Leaderboard — scope added beyond spec §17, at the user's direct request

Spec §17 states a global leaderboard is **not required** for this phase, and lists "rework the existing single-scenario leaderboard to reflect Engineer Rank" as one allowed option if a leaderboard is touched at all. During planning, the user explicitly asked for more than that option on its own: *"we need a global leaderboard where all engineers can be evaluated against one another — there needs to be exactly one leaderboard... it should just show how many problems have [they] solved and at what level and give a score."* This is documented here plainly as a deliberate scope deviation requested by the user, not a silent expansion of the base spec.

What shipped, replacing (not supplementing) the prior single-scenario leaderboard:

- **Removed entirely**: `apps/web/src/lib/server/leaderboard.ts`, `leaderboard.test.ts`, `GET /api/leaderboard/payment-retry-storm`, and `apps/web/src/app/incidents/payment-retry-storm/leaderboard/page.tsx`, via `git rm`. There is now exactly one leaderboard in the product, matching the user's explicit "exactly one leaderboard" framing.
- **New**: `apps/web/src/lib/server/global-leaderboard.ts` — `getGlobalLeaderboard(limit=100)`, built on a `row_number() over (partition by userId order by createdAt desc)` CTE to select each user's single latest `rank_snapshots` row, filtered to `leaderboardVisible=true`, sorted band-first (by ordinal) with `normalizedScore` descending as the within-band tiebreak only — a Principal-band engineer with a lower score always outranks a Staff-band engineer with a higher one; raw score never crosses a band boundary.
- **New route**: `GET /api/leaderboard/global`. **New page**: `apps/web/src/app/leaderboard/page.tsx` — a top-level route (not scenario-nested, since it's no longer scenario-specific), linked from the main site nav (`site-header.tsx`) so the one leaderboard is actually discoverable.
- **Visibility is opt-in**, reusing the pre-existing `users.leaderboardVisible` boolean exactly as the old leaderboard did — the user explicitly chose opt-in over showing everyone automatically. This is a deliberately *separate* boundary from Engineer Rank's own default privacy (profile detail stays visible only to the user themself and admins regardless of this flag); opting into the leaderboard exposes only `{displayName, rankBand, confidence, normalizedScore, qualifyingAttempts, evidenceBreadth}` — never the dimension/skill breakdown, never attempt-level detail.
- **Display**: the headline is band + `qualifyingAttempts` ("problems solved," counted post-best-of-collapse so retries can't inflate it), with `normalizedScore` as a secondary number — directly satisfying "show how many problems have [they] solved and at what level and give a score" while keeping the sort itself band-first so the board can't be gamed into a raw-count contest.
- **Ranking order choice**: the user, via AskUserQuestion, explicitly chose "rank band first, score as tiebreak" over a single blended numeric score — confirmed and implemented exactly as selected.

## Dashboard

`apps/web/src/lib/server/platform-metrics.ts` is the one aggregation module, mirroring `organization-credits.ts`'s `tx: TxOrDb = db` convention with no auth logic inside it (auth lives entirely at the route/view layer).

- **Platform summary** (`getPlatformSummary`): Total Users, Total Organizations, Free Users, Active Pro (Monthly/Annual/Total), Founding Engineers, Organizations With Purchases, With Available Credits, Suspended, Credits Purchased/Consumed/Available.
- **Revenue summary** (`getRevenueSummary(range)`): MRR is computed with **zero join** to `paidEntitlements`/`organizationCreditLedger` — a structural exclusion of Founding/org-credit revenue, stronger than a runtime filter — summed from `stripeSubscriptions WHERE stripeStatus='active'` against the static price map (`proMonthlyMrrUsdCents()=999¢`, `proAnnualMrrUsdCents()=round(7900/12)=658¢`). Founding gross = `COUNT(*) WHERE status='issued' FROM foundingEngineerAllocations × 9900¢` — never derived from `paidEntitlements` or Stripe checkout counts. Org-credit gross identifies plan unambiguously by ledger `quantity` (1→$50, 110→$5,000, the only two values `recordOrganizationCreditPurchase` ever writes). MRR is always a current run-rate — never scoped by the date-range selector — while Founding/org-credit gross and total-gross-collected are range-scoped. All monetary values are integer USD cents throughout; division by 100 happens only at render time.
- **Customer lists**: `listUserCustomers`/`listOrganizationCustomers`, each with fixed-allowlist sort (`newest|oldest|highest_spend|recently_purchased`) and filter query params — never a generic client-driven filter builder. Email resolution (`customer-identity.ts`'s `resolveEmailsForUsers`/`findAuthProviderIdsByEmail`) is batched, Clerk-backed, and silently degrades to `null` on a Clerk outage rather than breaking the page; exact-match only for email search (inherits Clerk's own API limitation, documented as a V1 boundary).
- **Detail views**: user detail shows entitlement/subscription/purchase-history/incident-pass/referral summary, plus an optional "Engineer Rank (support reference only)" section (band + confidence only, visually separate from billing data). Organization detail reuses `getOrganizationCreditBalance` and links out to the existing `/admin/organizations/[organizationId]` governance page rather than duplicating suspend/reactivate controls — two lenses (support/billing vs. governance) on the same organization.
- **Admin gating**: every new admin page repeats the exact existing convention — `isAdminPortalEnabled() → notFound()`, `getOrCreateCurrentUser()` null-check, `loadAdminMembership(user) → notFound()` on `!ok` — no shared layout, no separate API-fetch layer, matching the established non-DRY style of the rest of the admin portal.

**Gross-collected precision, stated plainly**: Founding and org-credit gross are exact (both are one-time, immutable, timestamped events). Pro recurring revenue has no persisted per-invoice history anywhere in the schema, so this phase does not attempt to reconstruct exact historical Pro billing totals beyond the current-state MRR figure — this is a known limitation, not silently glossed over.

## Security/privacy

- No card PAN/CVC, Clerk password/session/MFA fields, candidate reasoning/event timelines, or another organization's employer-private report content is ever selected by any dashboard query — customer queries join only counts and billing-relevant fields.
- The Engineer Rank privacy boundary (self + admin only) and the leaderboard opt-in boundary (`leaderboardVisible`) are independent, non-overlapping flags — confirmed directly in live QA, in both directions (opted-in user with real evidence appears; opted-out user with stronger evidence never appears, checked both via UI and via a direct API call).
- Non-admin access to every new admin route (dashboard, both customer list pages, both detail pages, the rank-rebuild route) returns a genuine `404` (`notFound()`), never a 403 page that would leak the route's existence — verified live for `/admin/dashboard` and `/admin/customers/users/[userId]` against a real non-admin organization-owner identity, and by automated test for the remaining routes.

## Browser QA

Two batches, 32 required stories total, executed live against the running dev server with real signed-in identities and direct DB-state verification after every claim — no story was marked passing from reading code alone.

**Batch 1 — Engineer Rank + Leaderboard (QA-R01–QA-R14)**: full log in `docs/qa/phase10c/execution_log.md`. All 14 stories passed, including the highest-risk ones: assessment-attempt exclusion tested against a maximally adversarial fixture (a perfect 1000/1000 assessment score, which would have been impossible to miss in the profile panel if the practice-only filter leaked); the non-admin 403/404 boundary on the rebuild route; and the leaderboard opt-in/opt-out toggle tested in both directions against the same user holding substantial real rank evidence (a genuine 860/1000 resolved Payment Retry Storm play-through was used to generate real qualifying evidence rather than synthetic DB rows). One real defect was found and fixed: the dimension-score display multiplied already-correctly-scaled values by 100 a second time (`docs/qa/phase10c/defects.md`, Defect 1) — root-caused to a copy-paste of the `normalizedScore` scaling logic onto a value with a different native scale, fixed, and re-verified live in the same session.

**Batch 2 — Platform Customer & Revenue Dashboard (QA-C01–QA-C18)**: full log in `docs/qa/phase10c/dashboard_execution_log.md`, run against the real, pre-existing Phase 9/10A/10B dataset (35 users, 7 organizations) rather than synthetic fixtures. 16 of 18 stories were independently confirmed live with exact dollar-figure reconciliation (MRR $16.57 = 999¢ + 658¢; Founding gross $99.00; org-credit gross $10,150.00 = $5,050 + $5,050 + $50; total gross $10,249.00 = Founding + org-credit, MRR correctly excluded as a non-additive run-rate). Two stories were not independently confirmed against a literal live case due to the specific shape of the available dataset, and are documented as such rather than silently marked passing: QA-C05 (no currently-active Founding user existed at QA time — covered instead by the correct aggregate Founding-gross count plus correct rendering of an inactive Founding row, and by automated test for the "lifetime" label logic itself) and QA-C18 (the real dataset, at 35 users/7 orgs, is smaller than the 50-row page size, so a second page was never observed live — covered by `platform-metrics.test.ts`'s dedicated pagination test instead; seeding 50+ synthetic rows solely to exercise an already-tested code path was judged not worth it). One real defect was found and fixed: the user customer list passed internal DB UUIDs (`users.id`) into `resolveEmailsForUsers`, which expects Clerk `authProviderId` values, so every email cell silently rendered blank (`docs/qa/phase10c/defects.md`, Defect 2). Root-caused by confirming the Clerk API itself worked correctly (ruling out a rate-limit/outage theory), then confirming no exception was ever thrown in the resolution helper's catch block (ruling out a Clerk-side failure), which isolated the bug to a caller-side ID-domain mixup. Fixed by adding `authProviderId` to `UserCustomerRow`, correcting both call sites, and re-verifying live.

Both defects were defects no automated test could have caught by design — the pure/integration tests assert on structured data (`EngineerRankResult` fields, query row shapes), never on rendered pixel text or cross-module ID-domain consistency — which is exactly why live browser QA exists as a separate, mandatory step rather than a formality after green tests.

## Validation

Full sweep run clean after each batch, and again after each of the two defect fixes:

```
pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed
```

Final state: typecheck clean, lint clean, 589/589 tests passing (16 pure `engineer-rank.test.ts` + 9 `engineer-rank-db.test.ts` + 6 rebuild-route tests + 7 `global-leaderboard.test.ts` + 28 `platform-metrics.test.ts` + all pre-existing suites), production build clean with zero errors, seed reporting "100 built-in scenario(s)" (catalog invariant unchanged by this phase).

## Deferred items

- **Refund reconciliation** remains deferred — no dashboard figure here or in any prior phase accounts for a Stripe refund; gross-collected figures reflect gross charges only, as in Phase 10B.
- **Recurring Pro revenue precision**: the dashboard's Pro-related gross figures are current-state (MRR-style), not reconstructed historical invoice totals — there is no persisted per-invoice ledger anywhere in the schema to reconstruct from. Stated plainly here rather than implied to be exact.
- **QA-C05/QA-C18** (above) were covered by automated test and adjacent live evidence rather than a literal live case, due to the real dataset's shape at QA time — not a gap in implementation, a gap in this pass's ability to observe that one specific case live without manufacturing synthetic data solely for the observation.
- **Email search remains exact-match only** (inherited from Clerk's own API, which has no partial-email search) — a user must be searched by their full real email; this is a V1 boundary, not a regression from any prior phase's search capability (none existed before this phase).
