# Phase 10D Browser QA — Execution Log (Batch 3: Candidate Assessment Consent + Organization Business Terms)

Session date: 2026-10-28. Dev server at `localhost:3000`. Fresh fixtures created for this batch: `Phase10D QA Active Org` (active, with a payment-retry-storm assessment + granted credits) and `Phase10D QA Org` (pending, for the initial-owner business-terms flow).

## QA-08 — Candidate assessment notice

Signed up fresh as `qa-phase10d-cand+clerk_test@example.com`, accepted the assessment invite, landed on the assessment landing page. The notice disclosure rendered in full, covering all four required points: invited by the named organization, actions/reasoning recorded, IncidentRank calculates results, the inviting organization can review the report, and the assessment is explicitly stated as separate from the candidate's private practice profile/Engineer Rank. Checkbox rendered unchecked by default.

**PASS.**

## QA-09 — Candidate refuses/no acceptance

With the checkbox unchecked, "Start Assessment" rendered visibly disabled (greyed). Clicked it directly — no state change, no network request, button remained in its disabled visual state. Server-side enforcement independently confirmed via the route-level automated tests (`route.test.ts`: "blocks a brand-new start when the candidate has not acknowledged the current notice" → 403).

**PASS.**

## QA-10 — Candidate accepts

Checked the checkbox (enabled "Start Assessment"), clicked it — the request succeeded, transitioned into the live assessment console (Payment Retry Storm, system architecture panel, live metrics all rendering). Verified directly against the database: a real `legal_acceptances` row was written with `acceptanceType="candidate_assessment_notice"`, `assessmentNoticeVersion="2026-10-v1"`, correctly scoped to the real `organizationId`/`assessmentId` pair, with a real `acceptedAt` timestamp.

**PASS.**

## QA-11 — Existing candidate resume

Reloaded the assessment URL directly (simulating a returning visit mid-attempt) — correctly showed the "Assessment In Progress / paused" resume screen with the elapsed timer and "your previous actions and reasoning have been restored" messaging, no re-prompt of the notice. Server-side guarantee (the resume-first early return runs before the notice check, so a later notice-version change can never strand an in-progress candidate) independently confirmed via the route-level automated test: "an already-started attempt remains resumable even if the notice version later changes."

**PASS.**

## QA-12 — Initial org owner terms

Signed up fresh as `qa-phase10d-owner+clerk_test@example.com`, opened the owner-invite link for the new `pending`-status `Phase10D QA Org`. The business-terms checkbox rendered (role: OWNER), unchecked by default, linking to `/terms`. "Accept Invitation" rendered visibly disabled; clicking it while unchecked had no effect. Checked the box, clicked Accept — succeeded, landed on the org dashboard showing "1 member · your role: owner." Verified directly against the database: the organization's `status` flipped from `pending` to `active`, and a real `legal_acceptances` row was written (`acceptanceType="organization_business_terms"`, `orgTermsVersion="2026-10-v1"`, correct `organizationId`, real `acceptedAt`).

**PASS.**

## QA-13 — Additional owner terms

Created a second owner invite against the now-`active` `Phase10D QA Org` (via `createOrgInvitation`, mirroring the exact function the real admin-facing "invite additional owner" flow calls). Signed up fresh as `qa-phase10d-owner2+clerk_test@example.com`, opened the invite link — the same business-terms checkbox requirement appeared (confirming it is not special-cased to only the organization's very first owner), disabled Accept until checked. Checked and accepted — succeeded, landed on the org dashboard now showing "2 members · your role: owner."

**PASS.**

## Negative-access sweep (requested mid-session)

Signed out fully and attempted direct navigation to several protected routes without authentication, confirming each one redirects to Clerk sign-in rather than leaking content:

- `/organizations` → redirected to sign-in.
- `/attempts` → redirected to sign-in.
- `/profile` → redirected to sign-in.
- `/organizations/phase10d-qa-org/billing` (an org-nested route) → redirected to sign-in.
- `/terms` → remained fully reachable and rendered normally (expected — never gated).

**PASS** (all protected routes correctly blocked; public legal pages correctly remained open).

## Defects found

None in this batch during live QA. One real test-fixture gap was found and fixed earlier during the automated validation gate (not live QA): `organization-credits.test.ts`'s shared fixture helper didn't pre-acknowledge the new assessment notice requirement, causing 4 pre-existing credit-consumption tests to fail with an unrelated 403. Fixed by adding the same pre-acknowledgment pattern already used in `start/route.test.ts`'s own fixture helper.

## Validation after this batch

`pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed` — all clean (616/616 tests, including 5 new business-terms cases in `org-membership.test.ts`, 3 new notice-requirement cases in `start/route.test.ts`, and the fixed `organization-credits.test.ts`), build succeeded, seed reported "100 built-in scenario(s)."
