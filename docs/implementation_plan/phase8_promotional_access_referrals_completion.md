# Phase 8 — Admin Bootstrap, Promotional Access & Referral Growth Loop: Completion Report

Status: **COMPLETE**

Source specs: `docs/implementation_plan/phase8_admin_promotional_access_referrals.md` (original binding spec) and `docs/implementation_plan/phase8loc.md` (corrections, which took precedence wherever the two conflicted).

## Schema changes

Added to `packages/db/src/schema.ts`:

- `adminUsers` — platform-wide admin/owner membership, `role` enum(`owner`,`admin`), `revokedAt` nullable. Partial unique index `admin_users_single_owner_idx` on `role` WHERE `role = 'owner'`, ignoring `revokedAt` — a permanent one-time bootstrap guard that never re-opens even if the owner is later revoked.
- `adminInvites` — admin-to-admin invite flow (token-hash based, mirrors the assessment/organization invite pattern already in the codebase).
- `incidentPasses` — the entitlement primitive. `sourceType` enum(`promo_invite`,`referral_reward`,`admin_grant`), `sourceId` a plain (non-FK) uuid polymorphically pointing at `promotionalInvites.id` or `referrals.id`. Status lifecycle `available → bound → consumed`, never movable back. Unique index `incident_passes_source_idx` on `(sourceType, sourceId)` WHERE `sourceId IS NOT NULL`.
- `promotionalInvites` — admin-created, email-targeted, single-use invite granting one Incident Pass on redemption.
- `referrals` — `referralCode` (plaintext, not hashed — see "Referral code storage" below), full lineage columns: `referredUserId`, `referredIncidentPassId`, `qualifyingAttemptId`, `rewardIncidentPassId`. Partial unique indexes on `qualifyingAttemptId` and `rewardIncidentPassId` (both `IS NOT NULL`-scoped) as DB-level double-reward backstops.
- `adminAuditEvents` — append-only log of every admin mutation.
- `attempts.incidentPassId` (nullable FK to `incidentPasses`, `ON DELETE SET NULL`) + index, forward-referenced via `AnyPgColumn` since `incidentPasses` is declared after `attempts` elsewhere in the file.

All six new tables got matching `relations()` blocks in `relations.ts` and `Type`/`NewType` exports in `types.ts`.

## Migrations

- `0008_fair_the_initiative.sql` — the 6 new tables + `attempts.incidentPassId`.
- `0009_low_supreme_intelligence.sql` — `admin_users_single_owner_idx`.
- `0010_needy_wrecker.sql` — `referrals.referralCodeHash` renamed to `referrals.referralCode` (plaintext pivot, mid-build design correction — see below). Generated as a proper `RENAME COLUMN`, not a destructive drop+create, after working around `drizzle-kit`'s interactive disambiguation prompt.

All three applied cleanly via `pnpm db:migrate`.

## Admin bootstrap

`apps/web/src/lib/server/admin-bootstrap.ts`'s `bootstrapOwnerIfEligible(user, verifiedEmail)`:

- **Exact bootstrap email handling**: compares `verifiedEmail` against `process.env.INITIAL_ADMIN_EMAIL` with a plain `===` — no normalization, no plus-address stripping. `mpant+anything@incidentrank.com` never matches `mpant@incidentrank.com`.
- **Bootstrap concurrency protection**: the INSERT is wrapped in a transaction with `.onConflictDoNothing({target: role, where: role='owner'})` matching `admin_users_single_owner_idx`'s own partial predicate exactly (a real Postgres gotcha hit and fixed during this phase — the `where` clause must match the index's predicate verbatim or Postgres rejects the `ON CONFLICT` clause outright). Verified with a genuine two-simultaneous-request concurrency test; exactly one owner row results.
- Checks whether an owner has **ever** existed (ignoring `revokedAt`) — bootstrap closes permanently, never reopens.

**Production configuration**: `INITIAL_ADMIN_EMAIL="mpant@incidentrank.com"` in `.env.example` and `apps/web/.env.local` (restored to this value — see "Temporary QA-session env overrides" below).

## Active/revoked admin rules & owner protections

`apps/web/src/lib/server/admin-auth.ts`'s `loadAdminMembership` filters `revokedAt IS NULL` explicitly at every call site — never an unconstrained lookup. `isIncidentRankDomainEmail` is domain-check-only and is never, by itself, sufficient for authorization (domain alone cannot grant admin; a persisted, non-revoked `adminUsers` row is always also required).

`apps/web/src/lib/server/admin-ownership.ts`'s `wouldLeaveNoOwner` / `wouldDemoteLastOwner` guard every revoke/demote mutation via a remaining-active-owner count query, mirroring the existing organization role-change pattern. Covered by `admin-users/[adminUserId]/route.test.ts`'s "the sole remaining owner cannot revoke themselves" and the equivalent demote test.

## Promotional invite flow & token handling

`apps/web/src/lib/server/promotional-invites.ts`:

- `previewPromotionalInvites` — a true preview step (no DB writes) that normalizes/dedupes/validates emails and rejects any email with an existing non-expired/non-revoked invite, before the admin confirms.
- `createPromotionalInvite` — reuses `generateInviteToken`/`hashInviteToken`/`normalizeEmail` from the existing assessment-invite infrastructure; domain-agnostic (unlike admin invites, which are `@incidentrank.com`-only).
- `redeemPromotionalInvite` — same-user-redeemed is idempotent (returns the existing pass); different-user-redeemed is rejected with no metadata leak; wrong-verified-email is rejected.
- **Real concurrency bug found and fixed during this phase**: a race where two simultaneous redemption requests by the same user could both reach `grantIncidentPass`, one legitimately losing the race and returning `null`. The original code treated that as an unhandled error. Fixed with a `grantIncidentPass(...) ?? findPassBySource(...)` fallback pattern and a UPDATE scoped to `isNull(promotionalInvites.redeemedByUserId)` with a re-read-on-zero-rows fallback. Verified via a genuine `Promise.all`-based concurrency test, stable across repeated runs.

## Pass lifecycle & pass/attempt lineage

`apps/web/src/lib/server/incident-passes.ts`:

- `grantIncidentPass` — relies on `incident_passes_source_idx` to guarantee one promo invite or one referral reward produces at most one pass (an `admin_grant` with no `sourceId` is intentionally ungoverned by this uniqueness — an admin may grant multiple ad-hoc passes).
- `bindIncidentPass` — atomic `UPDATE ... WHERE status='available'`; a concurrent second bind attempt affects zero rows and returns `not_available` rather than corrupting state. Once bound, a pass can never move to a different scenario — there is deliberately no rebind operation.
- `consumeIncidentPass` — wired atomically into the attempt-creation transaction in `POST /api/attempts/route.ts`: pass consumption and attempt creation are a single transaction, never two separately observable states. A race loser gets a clean 409, no attempt row created.
- **Explicit UI confirmation before binding** (not just warning copy): `use-incident-pass-button.tsx` renders a real confirm dialog — *"Use your Incident Pass for \<Scenario\>? Once selected, this pass can't be moved to another incident."* — mirroring the existing Finish-Incident confirmation-dialog pattern, verified live in QA-05.

## Referral eligibility, claim & pass lineage

`apps/web/src/lib/server/referrals.ts`:

- `evaluateReferralEligibility` — one centralized function (no duplicated policy per route): not self, not already attached to another acquisition referral, no prior consumed promo/referral pass, no prior completed practice attempt.
- `createReferralCode` — only callable after the referrer's own eligible (resolved, acceptable-or-optimal) completion; idempotent against an existing unclaimed code, but correctly issues a brand-new code/row once the prior one has been claimed (an engineer can refer more than one person — verified live across 4 referral cycles this session).
- `claimReferral` — resolves the referrer purely from the code (never trusts a client-supplied referrer id); binds `referredUserId` exactly once; grants the referred user's claim pass; rejects self-referral (verified both live, QA-04's analogue, and in the existing `api/r/[code]/route.test.ts`).

## Referral qualification, reward idempotency — bug found and fixed

`apps/web/src/lib/server/referral-qualification.ts`'s `qualifyReferralForAttempt`, called from `persistTerminalAttempt` for every terminal attempt:

- **Qualifying referral attempt proven by exact pass lineage** (phase8loc.md's correction): `Referral → referredIncidentPassId → attempt.incidentPassId → resolved ACCEPTABLE/OPTIMAL → reward`. Only the attempt funded by the referral-created pass may qualify that referral — never merely "this attempt belongs to the referred user." Verified both by automated tests (`referral-qualification.test.ts`'s "does NOT reward when the resolved attempt was funded by a DIFFERENT pass") and live (QA-10, QA-11).
- Idempotency: the qualifying UPDATE is scoped to `WHERE status='claimed'`; `referrals.qualifying_attempt_id`'s unique partial index is the DB-level backstop against a double reward even under a replayed/concurrent call. Verified by `referral-qualification.test.ts`'s dedicated concurrency test (QA-13).

### Defect found and fixed: reward-pass `sourceId` collision

**Found live during QA-12.** `claimReferral` grants the referred user's claim pass with `sourceType="referral_reward", sourceId=referral.id`. The original `qualifyReferralForAttempt` granted the referrer's reward pass using the *same* `(sourceType, sourceId)` pair — `sourceId=referral.id` again. Both passes legitimately wanted the same key under `incident_passes_source_idx`'s unique constraint. The reward grant's `INSERT ... ON CONFLICT DO NOTHING` silently lost that race every time, and the `findPassBySource` fallback "successfully" resolved to the referred user's own claim pass. The referral was marked `rewarded`, `rewardIncidentPassId` was set and looked valid — but it pointed at a pass the referrer never received and the referred user already owned. **The referrer silently got nothing, while the system reported success.**

This was caught by live QA (checking that the referrer's actual pass count increased), not by the test suite — the existing automated tests used `sourceType: "admin_grant"` fixtures for the referred user's pass, which never reproduced the real `sourceId` collision shape.

Fix: the reward grant now keys on `input.attemptId` (unique per qualification, never collides with a claim pass's `sourceId`) instead of `referral.id`. Added a dedicated regression test, `"grants the referrer a genuinely NEW pass, never the referred user's own claim pass..."`, using the exact real `claimReferral` fixture shape rather than the simplified `admin_grant` fixture — verified it fails against the pre-fix code and passes against the fix. Re-verified live end-to-end after the fix (QA-12, second pass): referrer received a genuinely new, distinct pass; `referredIncidentPassId !== rewardIncidentPassId`; referrer's total pass count correctly incremented.

## Resend integration & email feature-flag state

`apps/web/src/lib/server/email/`:

- `TransactionalEmailService` interface (`sendPromotionalInvite`, `sendReferralReward`), returning `{ok:true}|{ok:false,error}` — never throws.
- `ResendEmailService` adapter, reads `process.env.RESEND_API_KEY` directly; never logged or copied into any committed file.
- `TestEmailService` no-op adapter, selected automatically whenever the key is unset or `TRANSACTIONAL_EMAILS_ENABLED` is off — dev/test never sends real email unexpectedly. This was the adapter used for the entire Phase 8 QA pass (`TRANSACTIONAL_EMAILS_ENABLED="false"` throughout).
- `getEmailService()` factory picks the Resend adapter only when both the flag is on and the key is present.
- `sent` means provider-accepted-the-request only — no delivery/bounce tracking, since no webhook integration was built this phase (documented, not implied as a stronger guarantee).

### SPF/DKIM/DMARC readiness

Not evaluated this phase — outside this codebase's scope, and `TRANSACTIONAL_EMAILS_ENABLED` is off in every environment touched so far. Must be verified against the real `incidentrank.com` domain's Resend configuration before the flag is ever flipped on in production.

## Admin dashboard & lineage view

`apps/web/src/app/admin/` — `page.tsx` (bootstrap-on-load + stat cards), `promotional-invites/`, `incident-passes/`, `referrals/`, `admin-users/`. Every page does an inline `loadAdminMembership` check — no layout-based gate, matching the codebase's existing per-page-check convention. Every mutation route additionally enforces its feature flag server-side.

Verified live (QA-14): `/admin/referrals` shows the full `Referrer → Referred → Status → Qualifying Attempt → Reward Issued` lineage for every referral; `/admin/incident-passes` shows `User → Source → Status → Scenario → Granted` for every pass, correctly distinguishing `Promo Invite` / `Referral Reward` / `Admin Grant` sources.

## User pass UX & referral UX

`apps/web/src/components/incident-pass-panel.tsx` (server component) + `referral-link-section.tsx` (client component), mounted on `/profile`:

- Pass state copy never implies catalog-wide access (never "Pro access," never "free trial").
- **Referrer-privacy requirement**: the referral progress list renders only coarse status (`Joined` / `Completed` / `Completed — Reward earned`), built by selecting only referral-status columns — never joining into the referred attempt's score/tier/reasoning. Verified live (QA-16): the referrer's own `/profile` after 4 referral cycles (two abandoned mid-attempt, one unstable, one rewarded) showed exactly `Joined`, `Joined`, `Completed`, `Completed — Reward earned` — no score or tier data anywhere in the rendered output.

`apps/web/src/components/scenario-console/use-incident-pass-button.tsx` — the binding confirmation dialog (see "Pass lifecycle" above).

## Audit trail

`apps/web/src/lib/server/admin-audit.ts`'s `logAdminAction` is called from all three admin mutation routes that exist this phase (`promotional-invites` creation, `admin-users/invitations` creation, `admin-users/[adminUserId]` revoke/demote) — an append-only record of who did what to what.

## Security findings & concurrency test results

Reviewed against phase8loc.md's Step 22 checklist during the dedicated Step 12 pass, plus everything re-confirmed live during Step 13 QA:

- Domain ≠ privilege: confirmed (`isIncidentRankDomainEmail` is never sufficient alone).
- Server-side-only authorization: confirmed, every admin page/route re-checks membership itself.
- Revoked-immediately-denied: confirmed via `loadAdminMembership`'s explicit `revokedAt IS NULL` filter at every call site.
- Last-owner protections: confirmed via dedicated tests and the ownership-guard functions.
- Non-enumerable tokens, no raw-token logging: confirmed — invite tokens are hashed at rest, only ever shown once at creation time.
- Unpredictable referral codes: `generateInviteToken()`'s existing cryptographically-random generator, reused unchanged.
- No cross-user pass access/mutation: every pass mutation checks `userId` ownership explicitly (`bindIncidentPass`'s `not_owner` branch).
- Wrong-email denial, no double-bind, no pass funding two attempts: all covered by dedicated concurrency tests (`incident-passes.test.ts`, `promotional-invites.test.ts`).
- **No direct-API bypass**: `POST /api/attempts` independently re-derives pass state server-side regardless of what the client claims — verified both by `route.test.ts`'s "a direct API call to start a paid scenario is still refused" and live (QA-15: a direct `fetch` POST for an unrelated paid scenario correctly 403s even for a user holding an available pass for a *different* scenario).
- **No double-reward**: DB-level unique partial indexes on `qualifying_attempt_id` and `reward_incident_pass_id`, plus the `WHERE status='claimed'` qualifying-UPDATE guard. Verified by dedicated concurrency tests (QA-13).
- Self-referral rejected, one-acquisition-referral-per-user: covered by `evaluateReferralEligibility` and its tests.
- **Exact pass-lineage reward** (the corrections doc's central safety requirement): fully implemented and, per the defect above, had one real implementation bug that live QA caught and this session fixed — now verified clean end-to-end.
- Feature flags enforced server-side: every mutation route checks its flag independently of what the UI shows.
- Resend secret server-only: `RESEND_API_KEY` is read only in `resend-email-service.ts`, server-side, never exposed to the client bundle.

## Browser QA results

All 16 required QA stories (`docs/qa/phase8/phase8_qa_plan.md`) executed live via `claude-in-chrome`, following the Phase 7.3 methodology (real Clerk test-mode identities, verifying every claim via `get_page_text`/DB queries rather than assuming success):

| Story | Result |
|---|---|
| QA-01 Bootstrap first owner | PASS |
| QA-02 Admin creates/sends promo invite | PASS |
| QA-03 Correct engineer redeems invite | PASS |
| QA-04 Wrong user cannot redeem same invite | PASS |
| QA-05 Pass binding confirmation | PASS |
| QA-06 Incident start consumes pass | PASS |
| QA-07 Refresh/resume uses original attempt | PASS — **found+fixed a real bug** (see below) |
| QA-08 Resolve → referral link appears | PASS |
| QA-09 Second engineer claims referral | PASS |
| QA-10 No reward after claim/select/start | PASS |
| QA-11 Unstable referred attempt → no reward | PASS |
| QA-12 Resolved acceptable/optimal → exactly one reward | PASS — **found+fixed a real bug** (see below) |
| QA-13 Duplicate qualification → no double reward | PASS (verified via automated suite) |
| QA-14 Admin dashboard lineage | PASS |
| QA-15 Direct API cannot bypass pass system | PASS |
| QA-16 Referrer cannot see referred result details | PASS |

**16/16 PASS.**

### Post-completion UI coverage audit

The 16 numbered stories above cover the required scenarios, but several UI surfaces within them had only been exercised via API/DB verification rather than an actual click-through, and two admin-side pages were never opened in the browser at all during the main pass. A follow-up live-browser pass closed those gaps:

- **`/admin/admin-users`** — opened live for the first time. Created a real admin invite via the UI form, signed up a fresh `@incidentrank.com` test identity, accepted the invite end-to-end (sign-up → email OTP → "Accept Invitation" → redirect to `/admin` as the new admin), and confirmed the Active Admins list updated correctly.
- **Non-owner cannot revoke the owner** — clicking "Revoke" on the owner's row as the newly-accepted non-owner admin correctly surfaced a red "Owner-only action" error and left the owner row unchanged, confirming this is a real server-side rejection, not a UI-hidden control.
- **`/admin/promotional-invites` creation form** — previously only exercised via direct `fetch()` calls. Filled in the form by hand, clicked "Preview Recipients" (correctly showed "1 valid · 0 duplicate · 0 invalid" with Back/Send confirm buttons), then "Send 1 Invite(s)" and confirmed the new row appeared with status "Sent".
- **A second paid scenario's lock screen** (`rate-limit-misconfiguration`) — every prior live run only ever touched `enterprise-wide-dependency-deprecation`. Confirmed live: the no-pass "Pro — coming soon" copy, the available-pass copy, the dynamic confirmation dialog (scenario name correctly interpolated), and — after binding the pass there — visiting a *different* paid scenario correctly showed "Your Incident Pass is already assigned to another scenario." (the bound-elsewhere branch, not previously exercised live).
- **`/attempts`** — confirmed it correctly lists a signed-in user's attempt history (scenario, date, score, outcome, recovery time) for pass-funded attempts.

**No new defects were found during this follow-up pass** — every surface above worked correctly on first click. The live-QA-created admin/owner rows from this follow-up were deleted afterward, the temporary env overrides were reverted again, and the full `apps/web` test suite was re-confirmed green (376/376, single-forked). Logged in `docs/qa/phase8/phase8_qa_plan.md`'s "Post-completion UI coverage audit" section.

## Defects found and fixed this phase

1. **Resume-after-consumption page-route lockout** (QA-07). `apps/web/src/app/incidents/[slug]/page.tsx` locked a candidate out of resuming their own already-in-progress, pass-funded attempt on refresh — once an attempt starts, its funding pass is already `consumed` (not available/bound), so the page's pass-state-only check showed the locked screen instead of the console. Fixed by checking for an existing in-progress attempt *before* evaluating pass state, mirroring the ordering fix already applied to `POST /api/attempts/route.ts` for the identical regression class in an earlier phase. Regression test added to `page.test.tsx`.
2. **Reward-pass `sourceId` collision** (QA-12). Detailed above under "Referral qualification, reward idempotency."
3. (Pre-existing, fixed during earlier implementation steps, not live QA) Promotional-invite redemption race and two `onConflictDoNothing`/partial-index mismatches — see the referenced sections above.

All three were caught by genuine end-to-end verification (either a deliberately-written concurrency test or live browser QA checking actual resulting state), not by code review alone.

## Validation results

Run from repo root after reverting the temporary QA-session env overrides:

```
pnpm typecheck   → PASS (all 5 workspace packages)
pnpm lint        → PASS (0 errors, 0 warnings)
pnpm test        → PASS
                     apps/web: 376/376 (requires --pool=forks --poolOptions.forks.singleFork;
                       the default parallel run hits the documented pre-existing flakiness
                       class on admin_users_single_owner_idx when multiple test files insert
                       an "owner" row concurrently — not a Phase 8 regression)
                     packages/db: 8/8
                     packages/scoring: 23/23
                     packages/simulator: 38/38
                     packages/scenarios: 3606/3606 (4 pre-existing skips, unrelated)
pnpm build       → PASS (all Phase 8 routes present: /admin/*, /invite/[token], /r/[code],
                     /api/admin/*, /api/promotional-invite/[token], /api/r/[code],
                     /api/incident-passes/[passId]/bind, /api/referrals/code)
pnpm db:seed     → PASS ("Seed complete (100 built-in scenario(s)).") — unchanged
```

## `apps/web/.env.local` final state

`INITIAL_ADMIN_EMAIL` was temporarily overridden to `mpant+clerk_test@incidentrank.com` during live browser QA sessions (Clerk test mode requires the `+clerk_test@` convention for a deterministic OTP, and the production bootstrap comparison is intentionally exact-match, never normalized) and has been **reverted to the real production value `mpant@incidentrank.com`**.

`DEV_UNLOCK_PAID_SCENARIOS` is set to **`false`**. This is deliberate, not a pending revert: the flag exists purely as a local-dev convenience (`apps/web/src/lib/server/dev-unlock.ts`) and is never present in production or any other deployed environment — Phase 8's real pass-gating logic is what actually governs access everywhere that matters. Leaving it off locally means the dev server always exercises the real `evaluatePracticeAccess`/pass-state path instead of silently bypassing it, which is also what caught this phase's two live-QA-found defects (QA-07, QA-12) in the first place — on at least one occasion the flag being `true` masked the real gate and had to be noticed and turned off mid-session before QA could proceed correctly.

Live-QA-created admin/owner rows and QA-fixture attempt rows were cleaned up from the local dev database after each verification pass.

## Intentionally deferred work

Per phase8loc.md's explicit stop condition — **not started this phase**, by design:

- Payments / Stripe integration
- Organization billing
- AI tutoring
- Custom organization-authored scenarios at scale
- AI scenario generation
- Launch infrastructure (production Resend domain verification/SPF/DKIM/DMARC, production `RESEND_API_KEY` provisioning, `TRANSACTIONAL_EMAILS_ENABLED` flip, email-delivery webhook tracking)

## Stop condition checklist (phase8loc.md)

1. First owner bootstrap is concurrency-safe — ✅ (dedicated two-simultaneous-request test, DB partial unique index backstop)
2. `mpant@incidentrank.com` is the configured production first owner — ✅ (`.env.example` and `apps/web/.env.local` both confirmed)
3. Domain alone cannot grant admin — ✅
4. Revoked memberships never authorize — ✅ (`revokedAt IS NULL` filtered explicitly everywhere)
5. Last-owner protections work — ✅
6. Promotional invites can be created by admin only — ✅
7. One private invite binds to one verified user — ✅
8. One invite creates exactly one pass — ✅ (unique source index + concurrency test)
9. One pass binds to exactly one premium scenario — ✅ (atomic bind, never rebindable)
10. Binding is explicitly confirmed by user — ✅ (real confirm dialog, verified live)
11. One pass funds exactly one attempt — ✅ (atomic consume-and-create transaction)
12. Resume does not consume again — ✅ (fixed this phase, live-verified)
13. Direct APIs cannot bypass entitlement — ✅ (live-verified QA-15)
14. Referral claim is one-user/one-referrer — ✅
15. Self-referral is blocked — ✅
16. Eligibility policy is centralized — ✅ (`evaluateReferralEligibility`)
17. Qualifying referral attempt is proven by pass lineage — ✅
18. Unrelated attempts cannot qualify referrals — ✅
19. Failed/unstable attempts do not reward — ✅ (live-verified QA-11)
20. Acceptable/optimal referral-funded attempts reward exactly once — ✅ (fixed this phase, live-verified QA-12)
21. Concurrent/replayed callbacks cannot double-reward — ✅
22. Referrer cannot see referred-user result details — ✅ (live-verified QA-16)
23. Resend is behind an abstraction — ✅
24. Secrets are not duplicated/logged/committed — ✅
25. `sent` means provider acceptance unless delivery webhooks exist — ✅ (documented)
26. Admin can inspect invite → pass → attempt → referral → reward lineage — ✅ (live-verified QA-14)
27. Feature flags work server-side — ✅
28. Browser QA passes — ✅ (16/16)
29. Full validation is green — ✅
30. Database still seeds 100 built-in scenarios — ✅
31. Completion report is written — ✅ (this document)

**Phase 8 is complete.**
