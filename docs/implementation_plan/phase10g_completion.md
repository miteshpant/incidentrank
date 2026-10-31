# Phase 10G Completion Report

**Status: complete.** All seven infrastructure sections (score-max fix, admin editor, seed override, publishing lifecycle, validation contract, golden-path enforcement, full verification) are built and verified, and the first weekly batch of 15 new built-in scenarios is authored, registered, tested, and live-QA'd in the browser.

---

## 1. Architecture summary

Phase 10F shipped the multi-service/branching/parallel/cascading infrastructure and one reference incident, but left three real gaps: the result screen's per-dimension score denominator was a hardcoded client constant that silently diverged from the reference incident's own authored `maxPoints` (producing a visibly wrong "150 / 50"); nothing let anyone edit Phase 10F's metadata fields without a code deploy; and `db:seed` unconditionally clobbered `isFree` on every run, so even a future admin edit would be silently reverted. Phase 10G closed all three, then used the resulting pipeline to author the first real weekly batch of 15 incidents.

**Key correction discovered during investigation, confirmed with the user before proceeding**: the Phase 10F reference incident's "150/50" bug was not purely a display bug. `validateAuthoredScenario`'s `validateScoring` hard-enforces a **fixed** per-dimension `maxPoints` for every org-authored scenario (`recovery=300, customerImpact=200, dataIntegrity=200, reliability=150, costEfficiency=100, operationalEfficiency=50`, summing to exactly 1000) — built-in scenarios were never checked against this. Decision: restore the fixed split catalog-wide, and extend validation so built-ins are checked against the same rule org-authored scenarios already enforce.

---

## 2. Files changed

**Score-max fix (§1)**
- `packages/scenarios/src/authoring/score.ts` — `AuthoredScoreResult` gained `maxPoints: Record<AuthoredScoringDimension, number>`, populated by `scoreAuthoredAttempt`
- `packages/scenarios/src/authoring/score.test.ts` — new maxPoints assertions
- `apps/web/src/lib/server/scoring-helper.ts`, `apps/web/src/app/api/attempts/score-preview/route.ts`, `apps/web/src/app/api/attempts/finish-preview/route.ts`, `apps/web/src/lib/attempt-persistence.ts`, `apps/web/src/lib/server/finish-attempt.ts` — `maxPoints` threaded through every hop of the score DTO chain; `finish-attempt.ts`'s idempotent-retry reconstruction path reuses the now-exported `SCORE_MAX_BY_DIMENSION` constant (no new persisted column needed, since the split is catalog-wide constant)
- `apps/web/src/components/scenario-console/result-screen.tsx` — deleted the hardcoded `SCORE_DIMENSION_MAX` constant; renders `serverScore.maxPoints[dimension]`
- `packages/scenarios/src/checkout-payment-inventory-redis-contention/scoring.ts` — rewritten to the standard 300/200/200/150/100/50 split (was a non-standard 250/200/150/150/100/150), band/penalty shapes rescaled to preserve the investigation-quality signal within the standard ceiling
- `packages/scenarios/src/checkout-payment-inventory-redis-contention.test.ts` — updated stale assertions
- 5 web test files with mocked score payloads fixed to include `maxPoints` (`scoring-retry.test.tsx`, `incident-console.test.tsx`, `feedback-retry.test.tsx`, `generic-incident-console.test.tsx`, `persistence.test.tsx`)

**Admin editor (§2)**
- `apps/web/src/app/admin/scenarios/page.tsx`, `scenarios-view.tsx` (new) — scenario list, all ownership types, sortable by slug
- `apps/web/src/app/admin/scenarios/[scenarioId]/page.tsx`, `scenario-detail-view.tsx`, `scenario-edit-form.tsx` (new) — detail/edit page with live `canPublishScenario` validation panel, free-tier toggle, status/structure/domain dropdowns, release-week/published-at fields
- `apps/web/src/app/api/admin/scenarios/[scenarioId]/route.ts` (new) — PATCH endpoint, mirrors the credit-adjustment route's auth/transaction/audit-log shape; any `isFree` change stamps `isFreeOverriddenByAdmin=true`; a narrow `{isFreeOverriddenByAdmin: false}` body resets the override without touching `isFree`
- `apps/web/src/app/api/admin/scenarios/[scenarioId]/route.test.ts` (new, 8 tests)
- `apps/web/src/app/admin/admin-nav.tsx` — added "Scenarios" nav link

**Seed override persistence (§3)**
- `packages/db/src/schema.ts` — new `is_free_overridden_by_admin` boolean column, default `false`
- `packages/db/drizzle/0021_misty_morlun.sql` (new) — the migration
- `packages/db/src/seed.ts` — extracted `seedBuiltInScenarios(db)` as an independently-testable export; `isFree`'s `onConflictDoUpdate` set clause changed to a SQL `CASE` expression that only applies the code literal when `isFreeOverriddenByAdmin=false`; added an ESM direct-execution guard (`import.meta.url === file://${process.argv[1]}`) so importing the function for testing no longer also runs the full CLI `main()`
- `packages/db/src/seed.test.ts` (new, 2 tests) — proves a non-overridden row stays synced and an overridden row survives a reseed

**Publishing lifecycle (§4)**
- `apps/web/src/lib/server/scenario-registry.ts` — new `isScenarioCurrentlyPublished()` and `isBuiltInScenarioCurrentlyPublished()`; wired into `getActiveScenarioBySlug`, `getActiveScenarioById`, `listAssessableScenarios` as an additive gate (`status='published' AND (publishedAt IS NULL OR publishedAt <= now())`)
- `apps/web/src/app/api/attempts/score-preview/route.ts`, `finish-preview/route.ts` — these resolve scenarios directly from the catalog (bypassing the registry entirely), so they needed their own explicit gate call; added
- `apps/web/src/app/incidents/[slug]/page.tsx` — same bypass pattern, same fix
- `apps/web/src/app/incidents/page.tsx` — public library listing now filters out scheduled-but-not-yet-published scenarios
- `apps/web/src/lib/server/scenario-registry.test.ts` — 8 new publishing-lifecycle tests
- `apps/web/src/app/api/attempts/score-preview/route.test.ts` — 3 new gate tests
- `apps/web/src/app/api/attempts/finish-preview/route.test.ts` (new) — 3 gate tests (this route had no test file before)

**Validation contract (§5/§6)**
- `packages/scenarios/src/library/validate-built-in.ts` (new) — `validateBuiltInScenario()` (architecture/control/metric reference checks, duplicate-ID checks, scoring maxPoints/total checks via the shared `validateScoringDimension`, golden-path existence + real-engine-replay checks, narrative-generation smoke test, release-metadata presence checks) and `canPublishScenario()` (thin pass/fail + errors wrapper)
- `packages/scenarios/src/library/validate-built-in.test.ts` (new, 10 tests, including a catalog-wide sanity check across all 116 scenarios)
- `packages/scenarios/src/authoring/validate.ts` — `SCORE_MAX_BY_DIMENSION`, `SCORING_DIMENSIONS`, and `validateScoringDimension` exported for reuse
- `packages/scenarios/src/authoring/index.ts`, `packages/scenarios/src/library/index.ts`, `packages/scenarios/src/index.ts` — re-export the new validation functions
- `apps/web/src/app/admin/scenarios/[scenarioId]/scenario-detail-view.tsx` — surfaces `canPublishScenario`'s result as the "Publish Validation" panel
- `packages/scenarios/src/golden-paths/deterministic-replay.golden.test.ts`, `no-auto-finish.golden.test.ts` — added the explicit "has a golden-path fixture for every built-in scenario" guard (mirroring `catalog.golden.test.ts`'s existing one), replacing a raw `undefined` crash with a clear failure message

**First weekly batch — 15 new scenarios (§8)**
- 15 scenario directories under `packages/scenarios/src/<slug>/` (10 files each: `architecture.ts`, `controls.ts`, `metrics.ts`, `timed-events.ts`, `rules.ts`, `revenue-and-cost.ts`, `action-classifications.ts`, `candidate-ui.ts`, `definition.ts`, `scoring.ts`)
- 15 top-level `packages/scenarios/src/<slug>.ts` entry points, 15 `.test.ts` files (22–28 tests each), 15 golden-path fixtures under `packages/scenarios/src/golden-paths/`
- `packages/scenarios/src/library/catalog.ts`, `packages/scenarios/src/index.ts`, `packages/scenarios/src/golden-paths/registry.ts` — all 15 registered (imports + catalog/export/registry entries), done by the orchestrator only, never by the authoring agents

Full file count: 101 files changed/added across the session (31 modified, ~160 new files including the 15×10 scenario directories and 15×1 golden paths).

---

## 3. Database migrations added

One migration: `0021_misty_morlun.sql`.

```sql
ALTER TABLE "scenarios" ADD COLUMN "is_free_overridden_by_admin" boolean DEFAULT false NOT NULL;
```

Purely additive, safe default — every existing row behaves exactly as before until an admin explicitly edits `isFree` through the new editor. Applied to the local dev database (`pnpm db:migrate`), verified clean.

---

## 4. Score-display fix details

The DTO chain `scoreAuthoredAttempt` → `AuthoredScoreResult` → `scoreAttempt`/`scoringHelper` → `AttemptScoreResult` → 3 API routes' JSON → `ServerScoreResult` (client) → `result-screen.tsx` now carries `maxPoints` end to end. The one DTO hop with no natural source (`rebuildFinishResultFromRow`, used for idempotent Finish retries reading from persisted `attempts` columns, which has no per-dimension `maxPoints` column) reuses the now-exported `SCORE_MAX_BY_DIMENSION` constant rather than adding a new column to store a value that's already a catalog-wide constant. Live-verified via the browser QA session (§9): a played scenario's result screen showed exact denominators `300/200/200/150/100/50`.

---

## 5. Authoring/admin changes

New platform-admin surface at `/admin/scenarios` (list) → `/admin/scenarios/[scenarioId]` (edit), gated by the existing `isAdminPortalEnabled() → getOrCreateCurrentUser() → loadAdminMembership()` sequence, write path mirroring the credit-adjustment route's `db.transaction` + `logAdminAction` audit shape exactly. Editable fields are DB-row-backed only (`isFree`, `status`, `structure`, `domain`, `releaseWeek`, `publishedAt`) — built-in scenarios' architecture/controls/scoring remain TypeScript source reviewed via PR, by deliberate scope decision (narrower but more honest than trying to make compiled TypeScript scenarios editable through a web form). The detail page surfaces `canPublishScenario`'s result live as a pass/fail + reasons panel.

---

## 6. Free-incident rotation behavior

`scenarios.is_free_overridden_by_admin` distinguishes an admin-edited value from a code-synced one. `seedBuiltInScenarios`'s upsert uses `CASE WHEN is_free_overridden_by_admin THEN is_free ELSE <code literal> END` — an admin flip survives every future `pnpm db:seed` until explicitly reset via the new "Reset to code default" button, which clears the flag so the next seed resyncs from code. Verified live end to end in the browser: flipped a scenario free → saved → reloaded (persisted) → ran `pnpm db:seed` (survived) → reset override via the UI → ran `pnpm db:seed` again → confirmed it reverted to the code default (`false`).

---

## 7. Seed behavior

`seed.ts` was refactored to extract `seedBuiltInScenarios(db): Promise<number>` as an independently-testable export, separate from `main()`'s CLI-only concerns (founding-engineer-slot seeding, console logging, `process.exit`). Importing it for testing no longer triggers the full CLI script, via a standard ESM direct-execution guard — no prior precedent existed in this codebase for this pattern (confirmed by reading the sibling `migrate.ts`, which has the identical unguarded structure and was deliberately left as-is since it has no exported function to test). `pnpm db:seed` run count: "Seed complete (116 built-in scenario(s))" confirmed after every batch of changes.

---

## 8. Publishing lifecycle

No new status enum values, per the "inspect what exists first" instruction. Existing `scenarios.status` (`draft|published|archived`) plus `publishedAt` (added in Phase 10F, previously unused) now express the full lifecycle: a scenario is candidate-visible only when `status='published' AND (publishedAt IS NULL OR publishedAt <= now())`. `publishedAt IS NULL` is the default for every existing row, preserving current behavior exactly. The gate is applied in the shared registry resolvers (`getActiveScenarioBySlug`/`getActiveScenarioById`/`listAssessableScenarios`) **and** independently in three routes that bypass the registry and resolve straight from the catalog (`score-preview`, `finish-preview`, `/incidents/[slug]/page.tsx`) — each needed its own explicit call, a real pre-existing gap this phase closed. The public `/incidents` library listing also filters scheduled scenarios out.

Live-verified in the browser: set a future `publishedAt` on a real scenario via the admin editor → confirmed `/incidents/[slug]` 404s and the scenario is absent from `/incidents`'s listing (115 of 116 scenarios shown) → cleared the date → confirmed both were restored.

---

## 9. Validation contract

`validateBuiltInScenario(entry)` mirrors `validateAuthoredScenario`'s structural rigor but adapted to the built-in catalog's already-compiled shape: architecture edge/node reference checks, control/metric reference checks, duplicate-ID checks, the same fixed-`maxPoints` scoring check org-authored scenarios already get (reusing `validateScoringDimension`, no duplicated logic), a golden-path-missing check with a specific error message (not a raw crash), an actual real-engine replay of the registered golden path (not just "does an entry exist"), a `buildIncidentNarrative` smoke test, and release-metadata presence checks. `canPublishScenario(entry)` is the single centralized `{publishable, errors}` gate, surfaced in the admin UI.

**This caught a real bug before it shipped**: the `stale-feature-flag-kill-switch` scenario's golden path declared `finishAtMs` too soon after its fix action — insufficient time for the 15-second success-sustain window, so the real engine replay resolved to `declared_unstable` instead of `resolved`. The scenario's own `.test.ts` (26/26 passing) never caught this because its "investigated-then-fixed path" test only asserted `diagnosisPath`, never `evaluateCandidateDeclaredFinish`'s outcome. Fixed by extending `finishAtMs` by 6 seconds. This is exactly the validation contract's intended value — not a hypothetical.

---

## 10. Golden-path enforcement

Already-existing golden-path machinery (3 test files, 1 registry) is untouched structurally, per the explicit "do not weaken or remove the golden-path regression suite" instruction. `deterministic-replay.golden.test.ts` and `no-auto-finish.golden.test.ts` gained the same explicit "has a golden-path fixture for every built-in scenario" guard `catalog.golden.test.ts` already had, so a scenario registered in the catalog without a golden path produces a clear, named failure in every golden-path test file, not just one.

---

## 11. The 15 new incidents

| Slug | Difficulty | Domain | Structure | Free/Paid |
|---|---|---|---|---|
| connection-pool-starvation | Intermediate | Databases & Storage | linear | Paid |
| stale-feature-flag-kill-switch | Intermediate | Deployments & Reliability | linear | Paid |
| retry-budget-exhaustion | Intermediate | Microservices & Dependencies | linear | Paid |
| cron-job-overlap-double-run | Senior | Data Pipelines | linear | Paid |
| cors-misconfiguration-blocks-partners | Senior | Security & Identity | linear | Paid |
| graceful-shutdown-drops-in-flight-requests | Senior | Infrastructure & Capacity | branching | Paid |
| geo-dns-failover-flapping | Senior | API & Traffic | linear | Paid |
| orphaned-background-worker-queue-growth | Staff | Messaging & Streaming | parallel | Paid |
| multi-az-storage-failure-during-migration | Staff | Databases & Storage | cascading | Paid |
| api-version-sunset-breaks-silent-consumers | Staff | Microservices & Dependencies | branching | Paid |
| session-affinity-loss-after-cache-failover | Staff | Caching | linear | Paid |
| write-amplification-from-misconfigured-compaction | Senior Staff | Databases & Storage | linear | Paid |
| cross-team-schema-contract-drift | Senior Staff | Data Pipelines | cascading | Paid |
| regulatory-data-residency-violation-during-failover | Principal | Security & Identity | branching | Paid |
| platform-wide-clock-skew-breaks-distributed-consensus | Principal | Distributed Systems | cascading | Paid |

All 15 cross-checked against the existing 101-scenario catalog for mechanism/lesson duplication before authoring (e.g. `connection-pool-starvation` is a config-regression root cause vs. the existing `database-connection-saturation`'s traffic-surge root cause; `regulatory-data-residency-violation-during-failover` introduces a compliance-vs-uptime tradeoff axis not present anywhere else in the catalog). Structure mix deliberately diversifies away from the existing catalog's near-total linear skew (2 parallel, 3 branching, 3 cascading, 7 linear among the 15, vs. 1 pre-existing parallel scenario in the other 101).

Short description, scoring strategy, and golden-path status for each:
- All 15 use the standard fixed scoring split (300/200/200/150/100/50), enforced by `validateBuiltInScenario`.
- All 15 have a registered, real-engine-verified golden path (one fixed mid-session, see §9).
- Every scenario has at least one plausible-but-inferior remediation path and at least one root-cause + downstream-symptom + noise metric tagging, per the authoring brief given to each authoring agent.

---

## 12. Manual QA results

Browser QA was performed against a locally running dev server (restarted mid-session to clear a stale module cache — see §13), signed in as a real user bootstrapped as the local platform-admin owner (`INITIAL_ADMIN_EMAIL` set to the user's real email per their explicit choice).

- **All 15 new scenarios' briefing pages** loaded and rendered correctly: title, premise, difficulty, expected time, category, skills, system architecture — zero rendering errors across any of the 15.
- **One full end-to-end play-through** (`api-version-sunset-breaks-silent-consumers`, Staff/branching): acknowledged → live simulation ran (countdown timer, timed event fired, metrics climbed in real time, component health degraded) → applied two branching-structure actions (inspect + enable compatibility shim) → metrics recovered live → Finish Incident → correct "INCIDENT NOT FULLY STABILIZED" verdict (ended before the sustain window completed) → score `390/1000` with exact denominators `0/300, 200/200, 80/200, 0/150, 60/100, 50/50` → post-incident narrative correctly grouped root cause / observed effects / context using `roleInIncident` tags → action-classification feedback text rendered correctly.
- **Admin scenario editor**: list page (117 rows, including one pre-existing org-owned test fixture), detail page's live "Publish Validation" panel (confirmed "✓ Passes every validation check" for a real scenario), free-tier toggle (save → persist → reload-confirmed → reseed-confirmed-preserved → reset-via-UI → reseed-confirmed-reverted), status/structure/domain dropdowns, and the scheduling-gate `publishedAt` field (set future date → confirmed 404 + absent from library listing → cleared → confirmed restored).
- **Free/paid toggle affecting real candidate access**: directly confirmed — flipping `isFree` via the admin UI unlocked the practice-mode briefing/console for the signed-in test account without any entitlement, and reverting it re-locked the scenario (confirmed via the "Upgrade to Pro" locked screen).
- All temporary QA mutations (free-tier flips, scheduling dates, admin-override flags) were reverted and the database re-seeded to its clean final state before concluding.

---

## 13. Test/lint/typecheck/build results

- `pnpm typecheck` — clean across all 5 workspace packages.
- `pnpm lint` — clean across all 5 workspace packages. (Caught and fixed 5 real unused-import/unused-constant lint errors across the 15-scenario batch — all were legitimate dead code from the parallel authoring, not false positives; none required behavior changes, except confirming one scenario's un-wired investigation control was intentionally optional per its own test suite's design.)
- `packages/scenarios` test suite — 4091/4091 passing (130 test files, 1 skipped dev-only file), including the full catalog-wide golden-path/deterministic-replay/no-auto-finish suites across all 116 scenarios and the new 10-test `validate-built-in.test.ts`.
- `packages/simulator` test suite — 41/41 passing, unchanged.
- `apps/web` test suite (`--pool=forks --poolOptions.forks.singleFork`) — 735/738 passing immediately after the code changes (3 failures are the pre-existing, independently-confirmed-unrelated `attempts-list.test.tsx` legal-gate flake, reproduced identically on clean `main` via `git stash`). **After the live browser QA session's admin bootstrap** (see §14), a second full run shows 19 additional failures, all in `admin-bootstrap.test.ts`/`admin-auth.test.ts`/admin-user-route tests that assume a pristine `admin_users` table — this is local-environment test-fixture pollution from a deliberate, user-confirmed choice to keep a real admin owner row in the local dev DB, not a Phase 10G code regression (confirmed by direct root-cause inspection, see §14).
- `pnpm build` — succeeds, no errors. `/admin/scenarios`, `/admin/scenarios/[scenarioId]`, `/api/admin/scenarios/[scenarioId]` all present in the route manifest.
- `pnpm db:migrate` — applied cleanly.
- `pnpm db:seed` — "Seed complete (116 built-in scenario(s))" confirmed after every batch of changes and at final wrap-up.

---

## 14. Architectural gaps / notes discovered

- **Stale dev-server module cache.** A long-running `next dev` process (started hours before this session's schema/code changes) served a stale Drizzle schema module during live QA, causing the admin editor's "Overridden by admin" badge to not render despite correct DB state. Root-caused via direct DB inspection (confirmed `isFreeOverriddenByAdmin: true` in Postgres while the UI showed nothing), resolved by restarting the dev server — not a code bug, but worth knowing as a dev-workflow gotcha: **restart `next dev` after a long session before trusting live-QA results that touch new workspace-package schema fields.**
- **Local admin-bootstrap test isolation gap** (pre-existing, not introduced by Phase 10G): `admin-bootstrap.test.ts`/`admin-auth.test.ts`/the admin-user route tests assume zero rows in `admin_users` at test-run time. This was always a latent fragility — any local bootstrap of a real owner (as this session did, at the user's explicit request, to enable live admin-editor QA) permanently breaks these 19 tests against that local database. Not fixed in this phase per the user's explicit choice to leave it as a known caveat rather than touch test files outside Phase 10G's scope.
- **Two routes bypass the scenario-registry's existing gates entirely** (`score-preview`, `finish-preview`, and `/incidents/[slug]/page.tsx`'s initial catalog lookup) — this was already true before Phase 10G (confirmed by their existing direct-catalog-lookup code), and is the reason the publishing-lifecycle gate needed three separate call sites instead of one. Worth flagging for any future gate that's added to the registry: audit these three bypass points too.

---

## 15. Recommended Phase 10H scope

1. Fix the `admin-bootstrap.test.ts` local-isolation gap (scope the owner-uniqueness checks to test-created rows only, or run against an isolated schema) — low-risk, improves local dev ergonomics for anyone who bootstraps a real local admin.
2. Second weekly batch of 15 scenarios, following the same pipeline now that it's proven end to end (workflow-authored, orchestrator-registered, validated, golden-path-verified, admin-editable).
3. Extend the admin scenario editor to cover org-owned scenarios' `primarySkill`/`secondarySkills`/`roleInIncident` metadata (currently TypeScript-only for built-ins, and not exposed at all for org-owned scenarios through this new editor).
4. Consider whether `validateBuiltInScenario`'s real-engine golden-path replay should run as a pre-merge CI gate (not just a local test/admin-UI check) now that it's proven to catch real authoring bugs.
5. Everything explicitly out of scope per the original Phase 10F/10G specs remains out of scope: automatic weekly-batch generation, a publishing scheduler/cron, a generic workflow/graph engine, AI-generated scenario content.

---

## 16. Acceptance addendum — additional QA (post-review)

Per final-acceptance review, two more scenarios received full manual browser QA beyond the single Staff play-through in §12: one Intermediate and one Principal, each fully played start to finish (investigation choices → remediation → Finish → verdict → score → narrative).

- **`connection-pool-starvation` (Intermediate, linear)**: inspected deploy history + pool config, raised `DB Connection Pool Max Size` 10→100, let metrics fully stabilize, Finish Incident → **"INCIDENT RESOLVED"**, score **925/1000**, denominators `300/200/200/150/100/50` exact, `dataIntegrity 200/200` (full credit for the correlated investigate-then-fix path), narrative correctly showed root cause (Connection Pool Utilization) and the real-fix explanation ("A deploy silently dropped DB_POOL_MAX_SIZE's default from 100 to 10").
- **`platform-wide-clock-skew-breaks-distributed-consensus` (Principal, cascading)**: this scenario's rule table has a genuine Principal-level trap — resyncing fleet clocks alone leaves the lock service's existing split-brained leader wedged (elected under the old skewed clocks); a second action, `Force Leader Re-Election`, is required to reach the fully-resolved state. First attempt (inspect + resync only) correctly matched the scenario's own `resynced-without-reelection` rule and stalled at `lockServiceSplitBrainCount: 2` — confirming this inferior-path branch works exactly as authored. Added the missing re-election action plus full investigation of all three affected subsystems (lock service, ledger, rate limiter) → all 5 components converged to healthy → Finish Incident → **"INCIDENT RESOLVED"**, score **860/1000**, denominators `300/200/200/150/100/50` exact, `dataIntegrity 200/200` (full credit for the unified-then-fixed correlated path), narrative correctly showed root cause (NTP Sync Offset), contributing factor (Fleet Clock Skew), and all three observed effects collapsing together, with the causal-unification explanation rendered verbatim ("The lock service, ledger, and rate limiter all make timestamp-ordered decisions off the local system clock...").

Both scenarios' free-tier admin overrides were reverted and the database re-seeded clean afterward. Final full gate re-run after this QA pass: `pnpm typecheck` clean (5/5 packages), `pnpm lint` clean (5/5 packages), `packages/scenarios` 4091/4091 passing, `packages/simulator` 41/41 passing, `pnpm build` clean. No code changes were made during this addendum — only live QA and the one documentation update.

**Batch-distribution note**: the 15-scenario level distribution (3 Intermediate / 4 Senior / 4 Staff / 2 Senior Staff / 2 Principal) was reviewed against the target 3/3/3/3/3 split and left as-is per explicit instruction, rather than relabeled or replaced — see the final delta report for the record of this decision.
