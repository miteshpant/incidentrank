# Phase 3 Completion Report — Accounts, Attempts, Scores and Leaderboard

Status: **Complete.** Per the spec's instruction, Phase 4 was not started.

## 1. Files created or modified

### New packages
- `packages/db/` — Drizzle ORM schema, client, migrations, seed script.
  - `src/schema.ts`, `src/relations.ts`, `src/client.ts`, `src/types.ts`, `src/migrate.ts`, `src/seed.ts`, `src/index.ts`
  - `src/schema.test.ts` (5 integration tests against live Postgres)
  - `drizzle.config.ts`, `vitest.config.ts`, `package.json`
- `packages/scoring/` — deterministic IncidentRank score engine.
  - `src/types.ts`, `src/payment-retry-storm.ts`, `src/test-helpers.ts`, `src/index.ts`
  - `src/payment-retry-storm.test.ts` (13 tests)

### Infrastructure
- `docker-compose.yml` — local Postgres 16, port 5433.
- `apps/web/.env.local` — Clerk keys + `DATABASE_URL` (not committed to the report; contains secrets).

### Auth and routing
- `apps/web/src/proxy.ts` (renamed from `middleware.ts` — Next.js 16 convention) — protects `/attempts(.*)`, `/profile(.*)`, `/api/attempts(.*)`, `/api/profile(.*)`.
- `apps/web/src/app/layout.tsx` — wrapped in `<ClerkProvider>` and `<Suspense>`.

### Server-side data access layer
- `apps/web/src/lib/server/db.ts` — cached Drizzle client singleton.
- `apps/web/src/lib/server/current-user.ts` — `getOrCreateCurrentUser()`.
- `apps/web/src/lib/server/scenario-registry.ts` — `getActiveScenarioBySlug()`.
- `apps/web/src/lib/server/load-owned-attempt.ts` — server-side ownership check, `load-owned-attempt.test.ts` (3 tests).
- `apps/web/src/lib/server/leaderboard.ts` — ranked leaderboard query, `leaderboard.test.ts` (4 tests).
- `apps/web/src/lib/server/attempts.test.ts` (2 tests, scenario versioning + retry independence).

### API routes
- `POST/GET /api/attempts`
- `GET /api/attempts/[attemptId]`
- `POST /api/attempts/[attemptId]/action-groups`
- `POST /api/attempts/[attemptId]/events` (idempotent)
- `POST /api/attempts/[attemptId]/complete` (server-computed score)
- `GET /api/leaderboard/payment-retry-storm`
- `GET/PATCH /api/profile`

### Client persistence wiring
- `apps/web/src/lib/use-incident-attempt.ts` — extended with attempt lifecycle state/effects, gated behind `isSignedIn`.
- `apps/web/src/lib/attempt-persistence.ts` — best-effort fetch wrappers (create/persist group/persist events/complete).

### UI
- `apps/web/src/components/site-header.tsx`, `apps/web/src/components/sign-out-button.tsx`
- `apps/web/src/app/attempts/page.tsx` + `attempts-list.tsx`
- `apps/web/src/app/attempts/[attemptId]/page.tsx` + `attempt-detail.tsx`
- `apps/web/src/app/profile/page.tsx` + `profile-content.tsx` + `profile-form.tsx`
- `apps/web/src/app/incidents/payment-retry-storm/leaderboard/page.tsx`
- Updated: `incident-console.tsx`, `briefing-screen.tsx`, `result-screen.tsx` (score card, sign-in nudges, history link), `incidents/page.tsx`, `app/page.tsx`

### Scenario model
- `packages/scenarios/src/types.ts` — added `isFree: boolean` to `ScenarioDefinition`.
- `packages/scenarios/src/payment-retry-storm.ts` — `isFree: true`.

### Test infrastructure
- `apps/web/src/test/clerk-mock.tsx`, `clerk-mock-impl.tsx`, `server-only-mock.ts`
- `apps/web/src/app/incidents/payment-retry-storm/persistence.test.tsx` (4 tests)
- `vitest.config.ts` updates in both `apps/web` and `packages/db` (dotenv, `server-only` alias, `fileParallelism: false`)

## 2. Auth integration

Clerk (`@clerk/nextjs` v6) provides email + Google sign-in. `clerkMiddleware`/`createRouteMatcher` in `proxy.ts` protects `/attempts`, `/profile`, and their API routes — unauthenticated requests are redirected to sign-in. `ClerkProvider` wraps the app in `layout.tsx`. `useAuth()` drives client-side gating (e.g. hiding persistence effects); `SignedIn`/`SignedOut`/`SignInButton`/`UserButton` drive header and nudge UI.

On first authenticated request, `getOrCreateCurrentUser()` looks up the local `users` row by Clerk's `authProviderId` and creates one if missing (race-safe via `onConflictDoNothing` + refetch), seeded with a display name derived from the Clerk profile.

## 3. Database schema

PostgreSQL via Drizzle ORM. Tables: `users`, `scenarios`, `attempts`, `attempt_action_groups`, `attempt_action_changes`, `attempt_events`. Enums: `attempt_status` (in_progress/resolved/failed/abandoned), `attempt_type` (practice/assessment). Key constraints: unique `authProviderId` on users; unique `(scenarioId_slug, version)` on scenarios; unique `(attemptId, sequence)` on both action groups and events; cascade delete from attempt → action groups → action changes, and attempt → events. `leaderboardVisible` defaults to `false` on `users`.

## 4. Migrations and seed

`packages/db/src/migrate.ts` and `seed.ts`, run via `pnpm db:migrate` / `pnpm db:seed` (both `tsx --env-file=.env`). Seed inserts `payment-retry-storm` v1 with `onConflictDoNothing()` so it's safe to re-run.

## 5. Attempt lifecycle and persistence strategy

Persistence happens at meaningful moments only, not every simulation tick:
1. **Attempt creation** — on first mount of a signed-in session, `POST /api/attempts` creates an `in_progress` row recording `scenarioId` + `scenarioVersion` at that moment.
2. **Action groups** — each batched candidate action (multiple control changes + reasoning, grouped by the Phase 2.1 grouping logic) persists via `POST .../action-groups` with its ordered `attempt_action_changes`.
3. **Events** — simulation/system events batch-flush periodically via `POST .../events`, idempotent via `onConflictDoNothing` on `(attemptId, sequence)`.
4. **Completion** — on terminal state (resolved/failed), `POST .../complete` computes the score server-side from `ScoringInputs` extracted from final simulation state and persists `status`, all 6 dimension scores, `total`, and summary stats (`recoveryTimeMs`, `revenueLossUsd`, peak/count fields).

All persistence is gated behind `isSignedIn`; anonymous users on free scenarios run the full simulation client-side with zero network calls to these endpoints.

## 6. Score formula and bands

`packages/scoring/src/payment-retry-storm.ts`, 6 weighted dimensions summing to 1000: Recovery 300, Customer Impact 200, Data Integrity 200, Reliability 150, Cost Efficiency 100, Operational Efficiency 50. Computed purely from `ScoringInputs` (recovery time, revenue loss, peak metrics, change counts, final status) — the type has no reasoning field, so reasoning text cannot structurally influence the score (verified by a dedicated test).

Key scoring logic: a run is classified as "natural recovery" (`numberOfBeneficialChanges === 0 && recoveryTimeMs >= 12min`) and capped low on Recovery and Reliability regardless of elapsed time, preventing "wait it out" from scoring well. Failed attempts score 0 on Recovery and Reliability but still earn Cost Efficiency and Customer Impact points. Data Integrity currently always awards full points — documented in code as not yet differentiated for this scenario version.

### Sample scores (from `packages/scoring/src/payment-retry-storm.test.ts` fixtures)

| Strategy | Total | Recovery | Customer Impact | Data Integrity | Reliability | Cost Efficiency | Op. Efficiency |
|---|---|---|---|---|---|---|---|
| Strong mitigation | 980/1000 | 300/300 | 180/200 | 200/200 | 150/150 | 100/100 | 50/50 |
| Alternative mitigation | 980/1000 | 300/300 | 180/200 | 200/200 | 150/150 | 100/100 | 50/50 |
| No action (natural recovery) | 440/1000 | 40/300 | 30/200 | 200/200 | 20/150 | 100/100 | 50/50 |
| Harmful mitigation (failed) | 435/1000 | 0/300 | 150/200 | 200/200 | 0/150 | 70/100 | 15/50 |

**Known limitation, reported per spec instruction not to silently tune numbers:** Strong and Alternative mitigation tie exactly at 980/1000, matching on every single dimension. Both resolve within the same top recovery-time band (≤150s from incident start) and apply similarly clean, minimal control changes, so the current band thresholds can't distinguish "best" from "very good." Ranking is otherwise correctly ordered and well-separated (980 ≫ 440 > 435). This is a granularity limitation of the current authored bands, not a bug — it has not been silently adjusted.

## 7. Routes added

- `/attempts` — signed-in user's attempt history (newest first, immutable records).
- `/attempts/[attemptId]` — detail/replay: score breakdown, stats, merged chronological timeline of action groups ("You") and system events, server-side ownership-verified (404/403 on mismatch).
- `/incidents/payment-retry-storm/leaderboard` — public leaderboard, best completed attempt per visible user.
- `/profile` — display name editor, leaderboard visibility toggle, sign out.

All four use `export const instant = false` (Next.js 16 cacheComponents escape hatch for per-request dynamic data) with data-fetching isolated into `<Suspense>`-wrapped child components.

## 8. Leaderboard query and ranking

`getPaymentRetryStormLeaderboard()` uses a `row_number() over (partition by userId order by ...)` CTE to select each user's single best attempt, filtered to `attemptType = "practice"`, `status = "resolved"`, and `leaderboardVisible = true`. Tie-break order: score desc → recoveryTimeMs asc → revenueLossUsd asc → completedAt asc. Only `displayName`, `score`, and `recoveryTimeMs` are exposed — no email or internal IDs.

## 9. Privacy implementation

`users.leaderboardVisible` defaults to `false`. Toggled from `/profile` via `PATCH /api/profile`, taking effect immediately on the next leaderboard query (no caching). When off, scores still save and the user's own `/attempts` history is unaffected — only public leaderboard inclusion is suppressed. Verified live in Manual Flow C (below).

## 10. Free-tier anonymous play (user-requested mid-phase addition)

Per explicit user correction during implementation, Payment Retry Storm (and any future scenario marked `isFree: true`) is playable without signing in. Anonymous play runs the simulation fully client-side with no persistence — no attempt record, no score history, no leaderboard eligibility. Signed-out users see unobtrusive sign-in nudges on the briefing and result screens; `isSignedIn` is threaded through `useIncidentAttempt` to early-return out of all persistence effects when `false`.

## 11. Tests added

| Package | File | Tests |
|---|---|---|
| `packages/db` | `schema.test.ts` | 5 |
| `packages/scoring` | `payment-retry-storm.test.ts` | 13 |
| `apps/web` | `lib/server/attempts.test.ts` | 2 |
| `apps/web` | `lib/server/load-owned-attempt.test.ts` | 3 |
| `apps/web` | `lib/server/leaderboard.test.ts` | 4 |
| `apps/web` | `incidents/payment-retry-storm/persistence.test.tsx` | 4 |
| `apps/web` | `page.test.tsx`, `incidents/listing.test.tsx`, `incident-console.test.tsx` | updated for Clerk mocking |

**Total: 93 tests passing** across all 5 workspace packages (13 + 5 + 21 (1 skipped suite, 4 skipped tests) + 13 + 41).

## 12. Validation results

- **Typecheck:** clean across all 5 packages (`pnpm -r typecheck`).
- **Lint:** clean across all 5 packages (`pnpm -r lint`).
- **Test:** 93 passed, 4 skipped (pre-existing dev-only timeline suite), 0 failed.
- **Build:** `next build` succeeds. Routes correctly classified: static (`/`, `/incidents`, `/incidents/payment-retry-storm`), Partial Prerender (`/attempts`, `/attempts/[attemptId]`, `/profile`, leaderboard), dynamic (all `/api/*` routes), proxy middleware active.

## 13. Manual validation flows

**Flow A — New user sign-up → play → score → history.** Passed during earlier live testing in this session: signed-in play created an `in_progress` attempt, persisted action groups with reasoning and changes, completed with a computed score, and appeared correctly in `/attempts`.

**Flow B — Retry creates an independent, immutable record.** Passed: confirmed via both live UI and direct Postgres queries that distinct attempts (e.g. the 890 and 970 scored runs, plus one `in_progress` abandoned run) are separate, immutable rows, each with their own scenario version, action groups, and events — verified by `attempts.test.ts`'s "retry creates independent record" integration test and by direct inspection of `/attempts` showing 3 distinct rows.

**Flow C — Leaderboard privacy toggle.** Passed, driven live in isolated browser tab 462557026:
1. Baseline: leaderboard showed "Mitesh Pant — 970 — 00:57"; `/attempts` showed 3 records (890 resolved, 1 in-progress, 970 resolved).
2. Toggled `leaderboardVisible` off on `/profile` (auto-saved, confirmed "Saved.").
3. Reloaded leaderboard: entry disappeared — "No public attempts yet. Be the first."
4. Reloaded `/attempts`: all 3 records still present and unchanged — confirms visibility only affects the public leaderboard, never personal history.
5. Toggled back on, confirmed "Saved." — state restored to original.

**Flow D — Score-quality comparison across strategies.** Computed via the real (non-mocked) scenario engine through `packages/scoring`'s test fixtures (strong, alternative, no-action, harmful-failed). Results table in Section 6 above. Ranking is correct and well-separated between intervention and non-intervention outcomes; the strong/alternative exact tie at 980/1000 is called out as a known scoring-granularity limitation rather than silently tuned away, per the spec's explicit instruction.

## 14. Deviations from spec

- **Free-tier anonymous play** — not in the original phase3.md spec; added mid-implementation per explicit user instruction ("It should also allow non signed in user to play but only those marked free"). Implemented as an `isFree` flag on `ScenarioDefinition`, gating all persistence behind `isSignedIn`.
- **`middleware.ts` → `proxy.ts`** — Next.js 16 deprecated the `middleware` file convention during this phase; renamed per Next's own guidance (confirmed via compiled source, pure rename, same export shape) rather than leaving a deprecation warning in the build output. User explicitly approved this via AskUserQuestion.

## 15. Bugs found and fixed during manual testing

1. **Redundant timeline entries** (`attempt-detail.tsx`): raw `CONFIG_CHANGED`/`CONFIG_CHANGE_REJECTED` system events duplicated the richer "You" action-group cards that already showed the same control changes with old/new values and reasoning. Fixed by filtering those event types out of the merged timeline, matching the pattern already used by the live `TimelinePanel` component. Verified fixed via reload.
2. **Clerk `<SignOutButton>` "multiple children" error** on `/profile`: Clerk's `React.Children.only()` check inside `<SignOutButton>` threw a dev-overlay error despite a single `<button>` child being passed — root-caused to a Clerk + Suspense/streaming-SSR + React 19 interaction quirk (confirmed non-transient via hard reload). Fixed by replacing it with a local `components/sign-out-button.tsx` calling `useClerk().signOut()` directly, per explicit user choice. Verified: `/profile` now loads with no dev-overlay error; typecheck/lint/test/build all clean; sign-out flow unaffected.

A third apparent issue — inconsistent action-grouping data observed mid-session — was investigated in depth (reducer logic, component logic, and direct Postgres queries all checked) and found to not be a product bug: the user was concurrently testing in the same shared browser tab, producing interleaved state and stale screenshot captures. Re-running the same sequence in an isolated tab showed correct behavior (one group, both changes, full reasoning) matching the database exactly.

## 16. Product/UX notes for future phases

- The strong/alternative mitigation score tie (Section 6) suggests Recovery and Reliability band thresholds may need finer granularity if differentiating "good" from "best" mitigation strategies becomes a priority — out of scope for this phase per the spec's instruction not to silently tune scores.
- Data Integrity is not yet differentiated for Payment Retry Storm v1 (always awards full 200 points) — documented in code; a future scenario revision could introduce data-integrity-affecting failure modes.

---

Per the spec's explicit instruction, **Phase 4 has not been started.**
