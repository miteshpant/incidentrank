# Phase 10C Browser QA — Defects (Batch 1 + Batch 2)

## Defect 1 — Dimension scores rendered with incorrect scaling on the profile panel

**Found during**: established-band full UI render check (first time a user reached `confidence: "medium"`/`provisional: false` during this QA pass).

**Symptom**: the six scoring-dimension values on `/profile`'s Engineer Rank panel rendered as implausible 5-digit numbers (e.g. "Recovery: 25050", "Customer Impact: 16550") instead of sensible 0-300-range values.

**Root cause**: `apps/web/src/components/engineer-rank-panel.tsx` applied `Math.round(value * 100)` to each `dimensionScoresJson` value. That scaling is correct for `normalizedScore` (a genuinely 0–1.6-scale value, used correctly elsewhere on the `/leaderboard` page) but was mistakenly copied to the dimension-score display, where the underlying values are already on the `attempts` table's native per-dimension raw score scale (e.g. `recoveryScore` is 0–300), averaged across a user's qualifying attempts. No additional `× 100` scaling was ever needed for these values.

**Verification that the underlying data was always correct**: the `rank_snapshots.dimensionScoresJson` column itself held correct values throughout (e.g. `{"recovery": 251, "reliability": 111, ...}`) — this was purely a display-layer bug in one component, never a computation or persistence bug. `engineer-rank.test.ts`'s pure-function tests never caught this because they assert on the structured `EngineerRankResult` object's field values, not on rendered pixel text — this class of bug is only catchable by actually looking at the rendered UI, which is exactly why this was found during live browser QA rather than the automated suite.

**Fix**: removed the erroneous `* 100` multiplication; dimension values now render via `Math.round(value)` directly. One-line change in `apps/web/src/components/engineer-rank-panel.tsx`.

**Retest**: re-verified live immediately after the fix (same browser session, same user, same underlying data) — all six dimension values now render correctly (Recovery 251, Customer Impact 166, Data Integrity 167, Reliability 111, Cost Efficiency 68, Operational Efficiency 31), matching the DB's `dimensionScoresJson` exactly. `pnpm --filter @incidentrank/web typecheck` re-confirmed clean after the fix.

**Status**: Fixed and retested within this QA session.

## No other Batch 1 defects found

All other required Rank/leaderboard stories (QA-R01–QA-R14) passed on their first live execution with no code changes needed — including the highest-risk ones (assessment-attempt exclusion tested with maximally adversarial data — a perfect 1000/1000 score that would have been impossible to miss if the filter leaked; the non-admin 403 boundary; the opt-in/opt-out leaderboard visibility toggle, tested in both directions against the same user holding genuinely substantial rank evidence).

## Defect 2 — User customer list shows blank email for every row

**Found during**: Batch 2 dashboard QA, QA-C01/QA-C04 (first live check of `/admin/customers/users`).

**Symptom**: every single row in the user customer list table showed `—` in the Email column, including a real user (`qa-phase8-candidate+clerk_test@example.com`) whose email is genuinely known and resolvable via Clerk.

**Root cause**: `apps/web/src/app/admin/customers/users/customers-users-view.tsx` called `resolveEmailsForUsers(rows.map((r) => r.userId))` — but `row.userId` is the internal `users.id` (a Postgres UUID), not the Clerk `authProviderId` that `resolveEmailsForUsers` actually expects and queries Clerk's `getUserList({ userId: [...] })` with. Passing DB UUIDs into a Clerk-identity lookup meant Clerk legitimately found zero matches every time — the function's try/catch didn't even need to fire (no exception was thrown; `getUserList` simply, correctly, returned an empty result set for IDs that don't exist in Clerk), so the silent-degrade-to-null behavior (by design, for genuine Clerk outages) masked what was actually a caller-side type/ID-domain mixup, not a Clerk failure.

**Why this wasn't caught earlier**: `platform-metrics.test.ts`'s automated tests never call `resolveEmailsForUsers` at all (correctly scoped — email resolution is explicitly the view layer's job, kept out of the pure aggregation module per the plan's own design), and no existing test exercises the full view-component render path end-to-end. This is exactly the class of integration bug that live browser QA exists to catch.

**Fix**: added `authProviderId: string` to the `UserCustomerRow` interface in `platform-metrics.ts`, populated it correctly in the row-construction code (`authProviderId: u.authProviderId`), and corrected both call sites in `customers-users-view.tsx` — the `resolveEmailsForUsers(rows.map((r) => r.authProviderId))` call and the `emails.get(row.authProviderId)` lookup (previously both incorrectly keyed on `row.userId`). The user-detail view (`user-detail-view.tsx`) was already correct — it resolves email via `targetUser.authProviderId` directly, never through a `UserCustomerRow` — so only the list view needed the fix.

**Diagnosis note**: a temporary `console.error` was added to `resolveEmailsForUsers`'s catch block to distinguish "Clerk call is throwing" from "Clerk call succeeds but returns nothing" — confirmed no error ever logged, which is what revealed the real cause (wrong ID domain, not a thrown exception) rather than a transient Clerk/rate-limit issue. The diagnostic log was reverted to the original silent-catch behavior once the real fix was applied.

**Retest**: re-verified live immediately after the fix — every row in `/admin/customers/users` now shows the correct real email (e.g. `qa-phase8-candidate+clerk_test@example.com` shows its own real email, not another user's and not blank); one leftover test-fixture user with no real Clerk identity correctly still shows `—` (expected — it genuinely has no matching Clerk user). `pnpm typecheck` and the full 28-case `platform-metrics.test.ts` suite both re-confirmed clean after the fix (the test suite was unaffected since it never asserted on email values, only on structured row data).

**Status**: Fixed and retested within this QA session.
