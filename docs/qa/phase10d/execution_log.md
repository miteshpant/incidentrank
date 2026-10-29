# Phase 10D Browser QA — Execution Log (Batch 2: Legal Acceptance Gate)

Session date: 2026-10-28. Dev server at `localhost:3000`, `LEGAL_ACCEPTANCE_GATE_CUTOVER_AT="2026-10-28T00:00:00Z"` configured in `.env.local` so pre-existing real Phase 10A/10B/10C test users (created days earlier) remain exempt while a freshly-created test identity is gated — exercising the real rollout scenario rather than an artificial one.

## QA-01 — New user Terms gate

Signed up fresh as `qa-phase10d-newuser+clerk_test@example.com` (Clerk test-mode, OTP `424242`). Immediately after verification, navigating to `/profile` redirected to `/legal/accept` — checkbox unchecked by default, "Continue" button disabled until checked. Directly navigating to `/attempts` while still unaccepted also redirected to `/legal/accept` (confirms the gate fires from every wired entry point, not just one).

**PASS.**

## QA-02 — Terms and Privacy links

Verified both `/terms` and `/privacy` render fully, signed out (confirmed via the header showing "Sign in", not an account avatar) — title, version (`2026-10-v1`), and full body text all present. Neither page is behind the gate.

**PASS.**

## QA-03 — Acceptance

Checked the checkbox, clicked Continue — redirected cleanly to `/profile`, which rendered normally (no re-redirect loop). Verified directly against the database:

```
user: qa-phase10d-newuser+clerk_test@example.com, createdAt 2026-10-28T12:38:48Z (after cutover)
legal_acceptances rows:
  { acceptanceType: "platform_terms", termsVersion: "2026-10-v1", acceptedAt: 2026-10-28T12:39:16.001Z }
  { acceptanceType: "privacy_policy", privacyVersion: "2026-10-v1", acceptedAt: 2026-10-28T12:39:16.018Z }
```

Two real rows, correct versions, real timestamps, correctly linked to the real user id.

**PASS.**

## QA-04 — Leaderboard remains private

Immediately after completing Terms/Privacy acceptance (same session, same user), the profile page's "Show me on public leaderboards" toggle was confirmed **off** — Terms acceptance never flips `leaderboardVisible`. Also confirmed at the DB level: `leaderboardVisible: false` on the user row, unaffected by the two acceptance inserts.

**PASS.**

## QA-07 (inverse) — Existing user migration — confirmed scope deviation

Per the user's explicit, confirmed decision (documented in the approved plan's "Gate mechanism" design decision), existing users from before the legal-acceptance feature shipped are **never retroactively gated** — a deliberate deviation from spec §28/QA-07's literal requirement ("existing authenticated user without current acceptance → legal acceptance gate"). This story's honest inverse was verified instead:

Signed in as `qa-phase8-candidate+clerk_test@example.com` — a real user from an earlier Phase 10C QA session, created well before the 2026-10-28 cutover, with zero `legal_acceptances` rows. Navigated to `/profile` → loaded normally, full content rendered (Engineer Rank panel, billing status, display name), **no redirect to `/legal/accept`**. Also verified `/attempts` for the same user → loaded normally, real attempt history rendered, no redirect.

**PASS (confirms the chosen scope deviation behaves exactly as decided, not as an oversight).**

## Defects found

None in this batch — all four required QA-0X stories and the QA-07 inverse passed on first execution. One real defect was found and fixed earlier, during the automated validation gate (not live browser QA): `legalAcceptanceGateCutoverAt()`'s unset-env default was inverted (defaulted to the Unix epoch, which meant "gate everyone" rather than "gate no one"), causing 3 pre-existing automated tests (`attempts-list.test.tsx`) to fail by unexpectedly redirecting a freshly-created test fixture user. Fixed by changing the default to a far-future date (effectively "gate no one" until explicitly configured), matching this codebase's every-other-flag defaults-off convention. Full validation sweep re-run clean after the fix — see the Batch 2 validation section of the completion report.

## Validation after this batch

`pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed` — all clean (604/604 tests, including the new `legal-acceptance.test.ts` (12 cases) and `api/legal/accept/route.test.ts` (3 cases)), build succeeded with `/terms`/`/privacy` correctly prerendered as static, seed reported "100 built-in scenario(s)."
