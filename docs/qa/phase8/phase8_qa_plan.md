# Phase 8 QA Plan

Source specs: `docs/implementation_plan/phase8_admin_promotional_access_referrals.md` (binding spec) and `docs/implementation_plan/phase8loc.md` (corrections, which take precedence).

## Scope

Live browser execution of the 16 required QA stories (QA-01 through QA-16) per the corrections doc's Step 24, following the same `claude-in-chrome` MCP-driven methodology established in Phase 7.3.

## Environment

- App: Next.js dev server at `http://localhost:3000`, freshly restarted after Phase 8 schema/env changes.
- Feature flags (apps/web/.env.local): `ADMIN_PORTAL_ENABLED=true`, `PROMOTIONAL_INVITES_ENABLED=true`, `REFERRALS_ENABLED=true`, `TRANSACTIONAL_EMAILS_ENABLED=false` (real Resend sending left off for QA — the "sent" path is exercised via the TestEmailService no-op adapter, matching "dev/test must never send real email unexpectedly").
- `INITIAL_ADMIN_EMAIL=mpant@incidentrank.com`.
- Auth: Clerk test-mode, same `+clerk_test@` convention as Phase 7.3.

## Bootstrap identity

The production bootstrap comparison is exact-string, never normalized — `mpant+clerk_test@incidentrank.com` would NOT match `mpant@incidentrank.com`. Since Clerk test mode requires a distinguishable test email, `INITIAL_ADMIN_EMAIL` will be temporarily overridden in `apps/web/.env.local` for this QA session to a Clerk-test-mode-obtainable value, per the corrections doc's explicit allowance ("If Clerk test mode cannot authenticate the exact production bootstrap email: override INITIAL_ADMIN_EMAIL in the test/dev environment, use the exact verified test identity there, do not weaken production email matching logic"). This override will be reverted after QA completes and is never committed.

## Story matrix

| Story | Description | Status |
|---|---|---|
| QA-01 | Bootstrap first owner | PASS |
| QA-02 | Admin creates and sends one promo invite | PASS |
| QA-03 | Correct engineer redeems invite | PASS |
| QA-04 | Wrong user cannot redeem same invite | PASS |
| QA-05 | Engineer chooses premium incident and confirms pass binding | PASS |
| QA-06 | Incident start consumes pass | PASS |
| QA-07 | Refresh/resume uses original attempt and original consumed pass | PASS (found+fixed a real page-route bug: `/incidents/[slug]/page.tsx` locked out resume after pass consumption; fixed with existing-attempt-first check, regression test added) |
| QA-08 | Engineer resolves incident and referral link appears | PASS |
| QA-09 | Second engineer claims referral and receives exactly one pass | PASS |
| QA-10 | No reward appears after claim/select/start | PASS |
| QA-11 | Failed/unstable referred attempt produces no referrer reward | PASS |
| QA-12 | Resolved acceptable/optimal referral-funded attempt produces exactly one referrer pass | PASS (found+fixed a real bug: reward-pass grant's `sourceId` collided with the claim-pass grant's `sourceId` — both used `referral.id` under `sourceType="referral_reward"`, so the unique `(sourceType, sourceId)` index silently made the reward resolve to the referred user's own claim pass, leaving the referrer with nothing while the referral was marked "rewarded". Fixed by keying the reward grant on `attemptId` instead. Regression test added to referral-qualification.test.ts (verified it fails against the old code, passes against the fix). Re-verified live end-to-end after the fix: referrer received a genuinely new, distinct pass.) |
| QA-13 | Duplicate qualification callback does not create another reward | PASS (verified via automated test suite rather than re-triggered live: referral-qualification.test.ts's "duplicate/replayed qualification calls for the same attempt do not double-reward" and "concurrent qualification calls for the same attempt produce exactly one reward pass" — both passing, exercising the real `WHERE status='claimed'` guard + `qualifying_attempt_id` unique partial index backstop) |
| QA-14 | Admin dashboard correctly shows full lineage/state | PASS (`/admin/referrals` correctly shows Referrer→Referred→Status→Qualifying Attempt→Reward Issued for all 4 referrals created this session, including the one fully Rewarded; `/admin/incident-passes` correctly shows every pass's User/Source/Status/Scenario including the new reward pass as "Referral Reward / Available") |
| QA-15 | Verify direct premium API cannot bypass pass system | PASS (direct `POST /api/attempts` for an unrelated paid scenario correctly 403s even for a user holding an available pass for a *different* scenario) |
| QA-16 | Verify referrer cannot see referred user's result details | PASS (referrer's /profile referral list shows only coarse status strings — "Completed — Reward earned", "Completed", "Joined", "Joined" — never any score, tier, or other detail about the referred users' actual attempts) |

Statuses: NOT_RUN, PASS, FAIL, BLOCKED_ENVIRONMENT, BLOCKED_DEPENDENCY, NOT_APPLICABLE.

## Post-completion UI coverage audit

After the initial 16-story pass, a follow-up check found several UI surfaces that had only been exercised via API/DB verification (or not opened in the browser at all), not actually clicked through. These were then verified live and are recorded here since they aren't one of the 16 numbered stories but are part of the same live-QA discipline:

- **`/admin/admin-users`** — never opened in the browser during the original 16-story pass. Opened live: the invite form, role select, and resulting shareable invite link all render and work. Created a real admin invite for a fresh `@incidentrank.com` test identity, accepted it end-to-end (sign-up → OTP → "Accept Invitation" → redirect to `/admin` as the new admin), and confirmed the Active Admins list updates correctly.
- **Non-owner cannot revoke the owner** — clicking "Revoke" on the owner's row as the newly-accepted non-owner admin correctly showed a red "Owner-only action" error and left the owner row unchanged. Confirms this is a real server-side check, not just a hidden/disabled button.
- **`/admin/promotional-invites` creation form** — the form itself (not just the API) had only been driven via direct `fetch()` calls in the original pass. Filled in the textarea and campaign field by hand, clicked "Preview Recipients" (correctly showed "1 valid · 0 duplicate · 0 invalid" with Back/Send confirm buttons — the real two-phase flow), then clicked "Send 1 Invite(s)" and confirmed the new row appeared in the table with status "Sent".
- **A second paid scenario's lock screen** (`rate-limit-misconfiguration`) — every prior live run only ever touched `enterprise-wide-dependency-deprecation`. Confirmed live: the "Pro — coming soon" no-pass-at-all copy, the "You have an available Incident Pass" copy, the dynamic confirmation dialog (scenario name correctly interpolated: "Use your Incident Pass for Rate-Limit Misconfiguration?"), and — after binding the pass there — visiting a *different* paid scenario correctly showed "Your Incident Pass is already assigned to another scenario." (the bound-elsewhere branch, not previously exercised live).
- **`/attempts`** — confirmed it correctly lists a signed-in user's attempt history (scenario, date, score, outcome, recovery time) for pass-funded attempts, with no missing/broken rendering.

No new defects were found during this follow-up pass — all of the above worked correctly on first click. Temporary env overrides used for this follow-up (`INITIAL_ADMIN_EMAIL`, `DEV_UNLOCK_PAID_SCENARIOS`) were reverted to production values afterward, and the live-QA-created admin/owner rows from this follow-up were deleted; `pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork` re-confirmed 376/376 passing.
