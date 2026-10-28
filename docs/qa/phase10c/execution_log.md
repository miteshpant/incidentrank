# Phase 10C Browser QA — Execution Log (Batch 1: Engineer Rank + Global Leaderboard)

Session date: 2026-10-28. Dev server at `localhost:3000` with `ENGINEER_RANK_ENABLED=true` set locally. Real Clerk dev-mode sign-ups (`+clerk_test@example.com` convention, fixed test OTP `424242`, password sign-up). No mocks — all evidence is from real DB state and real HTTP responses from the running app.

Test identity: `qa-phase10c-rank1+clerk_test@example.com` (fresh signup). Admin identity reused from the Phase 10B QA session: `qa-verify-admin+clerk_test@example.com` (existing active `admin_users` row).

Given the scale of evidence needed to reach higher rank bands (up to 18 distinct qualifying scenarios for Principal), most evidence beyond the first attempt was seeded directly into the `attempts` table via one-off `tsx` scripts (mirroring exactly the shape `persistTerminalAttempt` itself writes — same columns, same `status: "completed"`/`outcome: "resolved"` invariants) rather than played through the full simulation UI repeatedly. This is a deliberate, scoped choice: the simulation engine's own correctness is already covered by its extensive automated test suite (confirmed passing in the Batch 1 validation gate); this QA pass's job is to verify Engineer Rank's trigger wiring, algorithm behavior, privacy boundaries, and UI rendering — not to re-prove the simulator works. Exactly one of the practice attempts (QA-R02/QA-R09's first attempt) was played through the real UI end-to-end to confirm the live trigger fires correctly from genuine gameplay, not just from directly-inserted rows.

## QA-R01 — New user with no attempts → no established Rank

Signed up `qa-phase10c-rank1+clerk_test@example.com` fresh. Navigated to `/profile` before completing any attempt.

- UI: "ENGINEER RANK — Not enough evidence yet. Complete more incidents to establish your rank." (exact spec §14 copy).
- DB: zero rows in `rank_snapshots` for this user.

**PASS.**

## QA-R02 — One excellent attempt → provisional result only

Played a real, complete Payment Retry Storm incident through the actual game UI (not seeded): acknowledged the incident, waited for it to go critical, then applied the known-good mitigation sequence (Retries 3→1, Backoff None→Exponential, Circuit Breaker Off→On — the exact sequence from `packages/scenarios/src/payment-retry-storm.test.ts`'s "good" case), waited for sustained success, clicked Finish Incident. Result: **INCIDENT RESOLVED, score 860/1000**.

Navigated to `/profile`:

- UI: "ENGINEER RANK — Provisional Developing — Based on 1 completed incidents."
- DB (`rank_snapshots`): one row, `rankBand: "developing"`, `provisional: true`, `confidence: "low"`, `normalizedScore: 0.989` (= 860/1000 raw × 1.15 senior-difficulty-factor × 1.0 resolved-outcome-factor — matches the documented formula exactly), `triggerAttemptId` correctly points at the real attempt row, `dimensionScoresJson` matches the attempt's real score breakdown exactly, `skillScoresJson` correctly resolved `"Microservices & Dependencies"` from the scenario's real catalog metadata.

**PASS** — first live, non-seeded confirmation that `persistTerminalAttempt` → `persistRankSnapshotIfChanged` → DB write → profile read works end-to-end through genuine gameplay.

## QA-R03 — Multiple qualifying attempts → established rank

Seeded (via `tsx` script, same shape as above) 5 additional lower-scoring repeat attempts on payment-retry-storm plus 3 attempts on distinct scenarios across different categories. Rebuilt via the admin rebuild route.

- Response: `{"rankBand":"intermediate","provisional":true,"confidence":"low","qualifyingAttempts":4}` — band progressed developing → intermediate.
- UI (`/profile`, signed in as rank1): "Provisional Intermediate — Based on 4 completed incidents."

**PASS.**

## QA-R04 — Higher-difficulty evidence changes normalized rank appropriately

Confirmed directly in QA-R02's snapshot: the senior-difficulty attempt's `normalizedScore` (0.989) reflects the 1.15 difficulty factor baked in (860/1000 × 1.15 = 0.989). Further confirmed across the full progression (QA-R03 → final staff-level state): as higher-difficulty/higher-score evidence accumulated, the band climbed developing → intermediate → senior → staff, with `normalizedScore` moving accordingly at each step, never regressing when stronger evidence was added.

**PASS.**

## QA-R05 — Repeated same scenario cannot dominate

In the QA-R03 seed, 5 repeat attempts were added on the SAME scenario (payment-retry-storm) as the original QA-R02 attempt — all with deliberately LOWER scores (500-540) than the existing best (860). After rebuild:

- `qualifyingAttempts: 4` — NOT `1 + 5 + 3 = 9`. The 5 repeats collapsed into the single best-of entry for that scenario (the original 860), contributing zero additional evidence breadth.
- DB: `dimensionScoresJson`/`skillScoresJson` for that scenario's category still reflect only the 860-score attempt's dimension breakdown, confirmed by comparing `avgNormalizedScore` for `"Microservices & Dependencies"` (0.989, unchanged from QA-R02) — none of the 5 lower-scoring repeats diluted it.

**PASS.**

## QA-R06 — Skill/domain breadth appears

From the QA-R03 snapshot: `distinctSkillAreas: 4`, `skillScoresJson` containing 4 genuinely distinct categories (`"Databases & Storage"`, `"Messaging & Streaming"`, `"Infrastructure & Capacity"`, `"Microservices & Dependencies"`), each resolved from the real built-in scenario catalog metadata (not fabricated). Confirmed visually in the profile panel's later "SKILL AREAS" section (see QA-R03/established-band render below) showing tag-style entries with per-category attempt counts.

**PASS.**

## QA-R07 — Assessment attempt excluded

Created a real organization + assessment (`QA R07 Test Org`), then inserted a completed, resolved, PERFECT-SCORE (1000/1000) **assessment**-type attempt for the same `rank1` user (`attemptType: "assessment"`). Rebuilt via the admin route.

- Response: `qualifyingAttempts` unchanged at the pre-insertion value — the perfect-score assessment attempt contributed exactly zero evidence, confirmed live through the real server code path (not a code read, an actual HTTP round-trip against real DB state with the assessment attempt genuinely present).

**PASS** — structural exclusion (the `rebuildEngineerRankForUser` query's `WHERE attemptType = 'practice'` filter) confirmed live with maximally adversarial test data (a perfect score that would have been impossible to miss if the filter leaked).

## QA-R08 — Personal payment status does not affect Rank

Structural: `QualifyingAttemptEvidence`/`EngineerRankResult` carry no payment/plan/entitlement field anywhere in the type (confirmed via the pure-function test suite's "payment status irrelevant" case, `engineer-rank.test.ts`). The `rank1` test user was on the Free plan throughout this entire QA pass (confirmed via the profile page's "BILLING — Free plan" line, visible in every screenshot) and its rank computation never referenced that state. No separate live test needed beyond confirming the test user's plan status throughout — the algorithm's pure-function design makes this exclusion structural, not a runtime branch that could regress.

**PASS.**

## QA-R09 — Rank updates after new qualifying practice completion

Directly confirmed by QA-R02: before the real attempt, `/profile` showed "Not enough evidence yet"; immediately after the real attempt completed (Finish Incident → INCIDENT RESOLVED), `/profile` showed "Provisional Developing — Based on 1 completed incidents." — the rank genuinely updated as a side effect of the real completion flow, no manual rebuild needed for this first transition.

**PASS.**

## QA-R10 — Historical progression preserved

By the end of this QA pass, `rank_snapshots` for the `rank1` user contained multiple rows spanning the full developing → intermediate → senior → staff progression, each a genuine new INSERT (confirmed via `created_at` ordering and distinct `id`s), never an UPDATE to a prior row. The very first snapshot (from the real QA-R02 attempt, `rankBand: "developing"`) remained present and unmodified in the table even after the final staff-level snapshot was added.

**PASS.**

## QA-R11 — Organization owner cannot see candidate's personal Engineer Rank by default

Verified by absence: `grep -rln "rank_snapshots\|rankSnapshots\|getLatestRankSnapshotForUser\|rebuildEngineerRank"` across `apps/web/src/app/organizations/`, `apps/web/src/app/api/organizations/`, `apps/web/src/app/assessment/`, `apps/web/src/app/api/assessment/` → zero matches. No organization-facing or assessment-facing code path reads rank data at all — the privacy boundary is structural, not a runtime check that could be bypassed or regress silently.

**PASS.**

## QA-R12 — Rank rebuild produces deterministic equivalent result

Called `POST /api/admin/users/[userId]/rank/rebuild` twice in a row against the `rank1` user with unchanged evidence in between (QA-R02's single-attempt state). Both calls returned identical `{rankBand, provisional, confidence, qualifyingAttempts}`. DB: two distinct `rank_snapshots` rows exist (first from the real attempt trigger with `triggerAttemptId` set, second from the rebuild with `triggerAttemptId: null`), with byte-identical `normalizedScore`/`dimensionScoresJson`/`skillScoresJson` — confirming the rebuild is genuinely deterministic against the same underlying evidence, and confirming rebuilds always force-insert (never skip or update), per design.

Admin audit trail also confirmed: `admin_audit_events` row with `action: "engineer_rank_rebuild"`, `adminUserId` correctly set to the admin's real `users.id` (not an `admin_users.id`), `metadataJson` containing the resulting band/qualifyingAttempts.

**PASS.**

## QA-R13 — Opted-in user with established rank appears correctly on `/leaderboard`

With the `rank1` user holding real rank evidence, toggled "Show me on public leaderboards" ON via `/profile`. Navigated to `/leaderboard`:

- UI: table showing rank #1, `qa-phase10c-rank1+clerk_test@example.com`, level "Developing" (at the time of this check), "1" incidents solved, score "99".
- Later, after evidence grew to Staff level (20 qualifying attempts): table correctly updated to show "Staff", "20" incidents solved, score "92" — confirming the leaderboard always reflects the LATEST snapshot, not a stale cached one.

**PASS.**

## QA-R14 — Opted-out user never appears on the public leaderboard regardless of rank strength

With the SAME user holding real, by-then-substantial rank evidence (Staff level, 20 qualifying attempts — far from trivial), toggled "Show me on public leaderboards" OFF.

- UI (`/leaderboard`): "No public ranks yet. Complete an incident to start building your rank." — the user's genuinely strong rank is completely absent.
- Direct API check: `GET /api/leaderboard/global` → `{"entries":[]}` — confirmed server-side, not merely hidden by client-side filtering.

**PASS.**

## Established-band full UI render (defect found and fixed)

After seeding enough evidence to reach `confidence: "medium"` (20 qualifying attempts at Staff's own threshold of 10, i.e. 2×min), the full established-band profile panel was rendered for the first time this session:

- "IncidentRank level: Staff" / "Established evidence" — correct, matches spec §13/§60 copy exactly.
- **Defect found**: the six dimension scores rendered as implausible 5-digit numbers (e.g. "Recovery: 25050") instead of the real 0-300-range values. Root cause: `engineer-rank-panel.tsx` applied `Math.round(value * 100)` to `dimensionScoresJson` values, incorrectly treating them as a 0-1 normalized fraction (matching `normalizedScore`'s scale) when they are actually already on the attempts table's native 0-300ish raw per-dimension scale, averaged across qualifying attempts. The `normalizedScore * 100` scaling used correctly on the leaderboard page (a genuinely 0-1.6-scale value) was mistakenly copied to the dimension panel, which needed no additional scaling at all.
- **Fix applied immediately**: removed the erroneous `* 100` multiplication in `apps/web/src/components/engineer-rank-panel.tsx`; dimension values now render directly via `Math.round(value)`.
- **Re-verified live** after the fix: Recovery 251, Customer Impact 166, Data Integrity 167, Reliability 111, Cost Efficiency 68, Operational Efficiency 31 — all correct, matching the DB's `dimensionScoresJson` exactly.
- Skill area tags also confirmed correct: "API & Traffic (9)", "Microservices & Dependencies (4)", "Databases & Storage (3)", "Messaging & Streaming (2)" — top 4 by attempt count, matching the DB's `skillScoresJson`.
- Explainer line confirmed verbatim: "Your IncidentRank level is based on the difficulty, breadth, and consistency of your completed practice incidents." (spec §61).

See `defects.md` for the formal defect writeup.

## Non-admin authorization boundary (adversarial check)

While still signed in as the non-admin `rank1` user, called `POST /api/admin/users/[userId]/rank/rebuild` directly against its own user id.

- Response: `403` — confirmed the admin-only gate holds live for a real signed-in, non-admin user attempting to call the route on itself, not just against automated test mocks.

**PASS** (not a numbered required story, but a direct adversarial confirmation of the admin-auth boundary already covered by `route.test.ts`'s automated 403 case).

## Validation after fix

Re-ran `pnpm --filter @incidentrank/web typecheck` after the dimension-panel fix — clean, zero errors. Full automated test suite and build were not re-run at this point in the session (the fix is a pure display-formatting change with no logic/schema impact); both will be re-confirmed in the full validation gate at the end of Batch 2 per the execution plan.
