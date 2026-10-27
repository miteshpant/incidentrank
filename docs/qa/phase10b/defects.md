# Phase 10B Browser QA — Defects Found and Fixed

No real defects were found during this QA pass. All 16 required stories (QA-01 through QA-16) passed on genuine first execution against the already-implemented Phase 10B code. One investigation during QA-10 initially looked like it might be a real regression and is documented below for transparency, but it was root-caused to a test-session mistake, not a product bug.

## Non-defect investigated and dismissed — "resume blocked by suspension" false alarm (QA-10)

**Symptom observed**: While testing QA-10's "existing attempt resume allowed during suspension" requirement, a direct `POST /api/assessment/49eaf608-226c-4aac-9bcf-f0c86ec8b8ed/start` call returned `403 "This assessment is temporarily unavailable. Please contact the organization that invited you."` — which would have been a genuine violation of phase10b.md §17/§18's explicit guarantee that an already-started attempt (`candidate.attemptId` already set) must always be resumable regardless of organization status.

**Investigation**: Re-read `apps/web/src/app/api/assessment/[assessmentId]/start/route.ts` line-by-line. The code is correct: the `if (candidate.attemptId) { ... return ... }` early return at line 65 runs unconditionally *before* the `assessment.status` check (line 74) and the `organization.status` check (line 84) — so a candidate with an existing attempt can never reach the suspension-denial branch, regardless of what `handleCheckoutSessionCompleted`/suspension logic does elsewhere.

Given the code looked unambiguously correct, the fetch call's actual signed-in identity was checked next (`/profile`, zoomed on the displayed email) — it turned out the browser session was still signed in as `qa-phase10b-candidate3` (a candidate who had never started an attempt, correctly denied by the suspension check) rather than `qa-phase10b-candidate1` (whose attempt was actually in progress). An earlier "sign in as candidate1" step in this same session had silently failed to switch identities (a UI click landed on the wrong element given the sign-in modal's layout shift after typing), and this wasn't caught before making the fetch call.

**Resolution**: Re-ran the exact same sign-in flow with identity verification after every step (checked `/profile`'s displayed email and the Clerk password-prompt's account label before proceeding). With the correct `qa-phase10b-candidate1` identity confirmed, the same `POST .../start` call returned `200` with the full existing attempt object (`status: "in_progress"`, unchanged `startedAt`), and the live UI resumed the in-progress simulation normally (countdown continued from where it left off) while the organization remained suspended throughout. No code was changed.

**Lesson for future QA sessions in this environment**: `claude-in-chrome` sign-in/sign-out via the header avatar menu is not always reliable on the first click when a page layout shifts mid-interaction (e.g., the password-prompt step inserting new form fields). Always verify the actually-signed-in identity (via `/profile` or the account-menu label) immediately before any fetch/action whose result depends on *which* identity is signed in, rather than assuming a prior sign-in sequence succeeded.

## Cleanup performed at end of session

- Platform admin grant (`admin_users` row `9b12b8ed-1ac4-4446-8c36-8cc19cfea9cb`, for `qa-phase10b-platformadmin+clerk_test@example.com`) was revoked (`revokedAt` set) — confirmed via a direct DB query that no active admin row remains for that identity.
- All one-off QA scripts (`packages/db/grant-admin.ts`, `packages/db/revoke-admin.ts`, `packages/db/qa-check.ts`, `packages/db/qa-check-candidate.ts`, `apps/web/qa-webhook-replay.ts`) were deleted after use — not committed.
- Test organizations (`acme-qa-phase10b`, `globex-qa-phase10b`) and test users (`qa-phase10b-*`) are left in the DB per the established convention (clear `qa-phase10b-` prefix, safe to leave for later test runs) — not cleaned up.
- No Stripe catalog (products/prices) changes were made — only Checkout Sessions were created and completed in TEST MODE, as required.
