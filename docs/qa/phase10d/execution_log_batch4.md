# Phase 10D Browser QA — Execution Log (Batch 4: Leaderboard Consent, Privacy Requests, Security Review)

Session date: 2026-10-28. Dev server at `localhost:3000`.

## QA-05 — Leaderboard explicit opt-in

Signed in as `qa-phase8-candidate+clerk_test@example.com` (real pre-existing Pro user with established rank). The hardened `/profile` copy correctly listed exactly the public fields (display name, band, normalized score, qualifying-incidents count, evidence breadth) and the never-public fields (email, billing, assessment reports, practice timelines, dimension breakdown, org memberships). Toggle was already ON; confirmed on `/leaderboard` — user appeared at rank 3 ("Developing", 1 incident solved, score 156), with exactly the public columns rendered, nothing else.

**PASS.**

## QA-06 — Leaderboard opt-out

Toggled the same user's "Show me on public leaderboards" switch OFF, saved. Reloaded `/leaderboard` — user no longer present in the list (count dropped from 4 to 3 rows). Toggle was restored back to ON afterward to leave the real user's settings unchanged from how they were found.

**PASS.**

## QA-14 — Privacy request submission

Navigated to `/settings/privacy` as the same user. Page rendered the request-type selector (Access/Correction/Other), notes field, and the Delete Account danger zone. Submitted an "Access my data" request with notes — succeeded immediately, confirmation message shown, and the new request appeared in "Your Requests" with status "Pending."

**PASS.**

## QA-15 — Admin privacy support

Signed in as the real platform admin (`qa-verify-admin+clerk_test@example.com`). `/admin/privacy-requests` showed the real request submitted in QA-14 with correct type, status, date, and notes. Clicked "Mark Completed" — status updated live to "Completed" with a real completion date. Separately confirmed authorization boundaries: signed out entirely → route renders blank body (pre-existing admin-portal convention for signed-out visitors, confirmed identical behavior on `/admin/organizations`, a pre-existing Phase 10A page — not a Phase 10D regression). Signed in as a real non-admin (`qa-phase8-candidate`) → genuine `404`, not the admin content.

**PASS.**

## QA-16 — Payment data inspection

As the admin, re-checked `/admin/dashboard` and `/admin/customers/users` (Phase 10C surfaces, unmodified by Phase 10D) — still show only aggregate/minimal billing data (total purchased in dollars, access tier, subscription status, last-purchase date). No raw card data, CVC, or Stripe object fields rendered anywhere, confirming Phase 10C's minimization holds after Phase 10D's additions.

**PASS.**

## QA-17 — Candidate/org privacy regression

Signed in as the real organization owner (`qa-phase10d-owner+clerk_test@example.com`). Their organization's `/members` page shows only email, role, joined-date, and role-management actions for every member — no Engineer Rank, no practice attempt history, no billing, no referral data for any member, confirming the structural privacy boundary (no organization-facing code path reads `rank_snapshots` or a user's non-assessment `attempts`, confirmed both by this session's grep-based security review and the original Phase 10C completion report) was not weakened by Phase 10D's additions.

**PASS.**

## QA-18 — Public profile enumeration

Attempted direct navigation to a guessed per-user profile URL (`/profile/<real-user-uuid>`) while authenticated as an unrelated user — genuine `404`, confirming no per-user public profile route exists by ID at all; the only public per-user exposure surface is the leaderboard itself, already confirmed opt-in-gated and field-minimal (QA-05/06, plus the new automated `api/leaderboard/global/route.test.ts` regression tests).

**PASS.**

## Defects found

None in this batch during live QA. One real issue was found and fixed during the Batch 4.4 security review sweep (not live QA): the unauthenticated organization-invite preview route (`GET /api/organization/invite/[token]`) returned the invitee's raw email in its JSON response even though the client never rendered it. Fixed by removing the field from both the route response and the client type; re-validated (typecheck/lint clean, full test suite still 631/631 passing).

## Validation after this batch

`pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed` — all clean (631/631 tests, including 5 new `account-deletion.test.ts` cases, 2 new `api/account/delete/route.test.ts` cases, 4 new `api/privacy-requests/route.test.ts` cases, 2 new admin privacy-request status-route cases, and 2 new `api/leaderboard/global/route.test.ts` public-enumeration regression cases), build succeeded with `/settings/privacy` correctly rendered, seed reported "100 built-in scenario(s)."
