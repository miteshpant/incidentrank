# Phase 10A — Platform Admin & Organization Governance: Completion Report

Status: **Complete**. All 11 implementation steps finished, all 469 automated tests pass, full monorepo validation is green, and all 18 required browser QA stories pass (two real defects found and fixed live during QA, both re-verified).

## Platform administration

- **Owner policy**: `mpant@incidentrank.com` remains the sole platform owner, bootstrapped via the pre-existing Phase 8 `bootstrapOwnerIfEligible` flow (untouched this phase) and permanently enforced singular via `admin_users_single_owner_idx` (a partial unique index on `role = 'owner'`, never scoped to active-only — once bootstrapped, closed forever even across revocation).
- **Admin creation policy**: closed a real pre-existing gap — previously *any* active platform admin (owner or plain) could invite another plain admin via `POST /api/admin/admin-users/invitations`. New `requirePlatformOwner()` in `admin-auth.ts` now gates that route: only the owner may invite. Verified live in QA-16 (owner succeeds) and QA-17 (plain admin denied, both UI-hidden and API `403`).
- **Owner protection**: owner-role invite creation was already impossible before this phase (admin-invite role enum never included `"owner"`) and remains so — the admin-invitations route explicitly rejects any role other than `"admin"`. Owner transfer is explicitly out of scope (§49).

## Organization provisioning

- **Removal of self-service creation**: `POST /api/organizations` now unconditionally returns `403` without touching the database; `/organizations/new` is a static informational page (no form); the old `new-organization-form.tsx` client component was deleted; all "Create Organization" nav links/buttons removed from `/organizations` and its list component. Verified live in QA-01 (no UI action, static denial page, direct API `403`).
- **Admin creation flow**: new `POST /api/admin/organizations` (gated by `loadAdminMembership` only — both owner and plain admin may provision, per §2's permission table) calls `createOrganization()`, which validates name/email, derives a collision-resistant slug, and transactionally inserts the org (`status: "pending"`) plus the initial owner invitation. Verified live in QA-02.
- **Initial owner invitation**: created in the same transaction as the organization, `role: "owner"`, audited under both `admin_audit_events` and `organization_audit_events` (`organization_created` + `owner_invited`). Email sent via the new `sendOrganizationOwnerInviteEmail`.
- **Owner activation**: accepting the initial owner invitation (`acceptOrgInvitation` in `org-membership.ts`) atomically creates the membership and, inside the same transaction, flips `organizations.status` from `pending` to `active` — scoped by a `WHERE status = 'pending'` clause so the transition is naturally idempotent and never fires for additional-owner invites (which always target an already-active org). Verified live in QA-03.

## Organization lifecycle

- **pending**: default status for a freshly admin-provisioned organization; blocks all organization-scoped mutations via `requireActiveOrganization()` until the initial owner accepts.
- **active**: default for legacy rows (backfilled via the schema migration's column default) and the steady state after initial-owner acceptance or reactivation.
- **suspended**: platform-admin-only transition (`suspendOrganization()`), requires a non-empty reason, blocks all mutation routes, preserves all read access and already-started candidate attempts. Verified live in QA-08/QA-09/QA-10.
- **closed**: **explicitly deferred**, per the binding scope decision made during planning. No `closed` enum value, no UI, no routes reference it. Only `pending | active | suspended` exist in `organizationStatusEnum`.

## Email

- **First-owner email**: `sendOrganizationOwnerInviteEmail({..., isAdditionalOwner: false})` — subject "You've been assigned as an owner of &lt;Org&gt; on IncidentRank."
- **Additional-owner email**: same function with `isAdditionalOwner: true` — subject "You've been invited to become an owner of &lt;Org&gt; on IncidentRank." Used both for ordinary additional-owner invites (owner-invites-owner flow) and the owner-recovery override.
- **Resend behavior**: `resendOwnerInvite()` never creates a duplicate invitation row — it refreshes the *same* row's `tokenHash`/`expiresAt` (a fresh plaintext token is generated server-side since the old one was never persisted) and re-sends to the same address. A real defect was found and fixed live during QA-02: the admin UI never surfaced the invite link when email delivery failed, making the invitation unusable whenever Resend rejected the address — fixed by threading `inviteUrl` through all three admin routes' JSON responses and displaying it in the UI (see `docs/qa/phase10a/defects.md`).

## Roles

- **owner**: full authority — can invite owner/admin/member, suspend is platform-admin-only but owners manage everything within their org, cannot be the last owner removed.
- **admin**: can invite admin/member but never owner (`canInviteRole`), can mutate scenarios/assessments, cannot change roles.
- **member**: read/practice access only, cannot invite or mutate.
- **Permission matrix**: implemented via `canInviteRole(actorRole, targetRole)` in `organization-auth.ts` — owner→any, admin→admin/member only, member→none. Verified live in QA-05 (owner invites owner, succeeds) and QA-07 (admin attempts owner invite, denied both UI and API).

## Suspension

- **Blocked operations**: scenario create, assessment create, member/owner invite creation, candidate invite — all gated by `requireActiveOrganization()`, called immediately after the existing role-check in 8 route files. Verified live in QA-09 (all four return `403 organization_suspended`).
- **Read-only behavior**: every `GET` route and `loadOrganizationMembership`/`loadOrganizationAccess` never call `requireActiveOrganization` — historical data (scenarios, assessments, members, reports) remains fully visible during suspension. Verified live throughout QA-08/QA-09 (owner still saw 3 members, assessment list, etc. while suspended).
- **Candidate in-progress behavior**: `POST /api/assessment/[assessmentId]/start`'s pre-existing "already started → return existing attempt" early-return runs *before* the new organization-status check, so resuming is structurally guaranteed to never be blocked — only a genuinely new attempt start is blocked. Verified live end-to-end in QA-10: a real attempt was started, the org was suspended mid-attempt, the candidate resumed, the incident fired on schedule, and the candidate successfully finished — all while the organization remained suspended throughout (confirmed via DB: `attempts.status = 'completed'` while `organizations.status = 'suspended'`).
- **Reactivation**: `reactivateOrganization()` requires current status `suspended`, flips to `active`, sets `reactivatedAt`, audits both tables, notifies owners best-effort. Verified live in QA-11.
- **Documented asymmetry**: invitation *revocation* (`DELETE .../members/invitations/[id]`) deliberately does NOT call `requireActiveOrganization` — only invitation *creation* is blocked during suspension, since revoking reduces standing risk rather than creating new state. Explicit code comment documents this as intentional.

## Organization scenarios

- **Private ownership**: org-authored scenarios (`ownershipType: "organization"`) are scoped to exactly one `organizationId`; this architecture pre-dates Phase 10A (Phase 5/6) and was explicitly left untouched per the approved scope decision — Phase 10A only added the suspension guard to the mutation routes.
- **Lifecycle**: draft/published/archived states, unchanged.
- **Versioning**: append-only `scenario_versions`, unchanged; assessment-pinning (an assessment stays on the scenario version it was created against even after a newer version publishes) is covered by the pre-existing `scenario-authoring.test.ts` suite (24 passing tests, confirmed in this phase's full test run) per the binding decision not to rebuild this infrastructure.

## Assessments

- **Org ownership**: `assessments.organizationId` scoping, unchanged; `requireActiveOrganization()` added to assessment creation.
- **Candidate invites**: `requireActiveOrganization()` added to `POST .../assessments/[id]/candidates`; verified blocked during suspension (QA-09) and working normally when active (QA-10's candidate invite).
- **Report permissions**: owners/admins see full employer-facing report (score, dimension breakdown, completion declaration, timeline) for their own org's candidates; cross-org access to any assessment or candidate record returns `404`, verified live in QA-14.

## Privacy/isolation

- **Cross-org tests**: new `organization-isolation.test.ts` (3 tests) covering suspension-blast-radius isolation (suspending org A never affects org B); existing `org-membership.test.ts` and `scenario-authoring.test.ts` "cross-org privacy" suites (already extensive, confirmed still passing) cover member/invitation/scenario isolation. Live QA additionally verified cross-org scenario access (QA-12) and cross-org assessment/report access (QA-14) via both direct API calls and UI navigation, from a genuinely separate real organization and owner identity.
- **Candidate personal-data boundaries**: the employer-facing candidate-detail API response was inspected field-by-field live during QA-15 — contains only assessment-relevant fields (status, timestamps, score, outcome, timeline) plus a minimal `user` object (id, displayName, leaderboardVisible) — no billing, no practice-attempt history, no referral data anywhere in the payload. New `start`-route test (`src/app/api/assessment/[assessmentId]/start/route.test.ts`, 3 tests) additionally covers the candidate-continuity guarantee at the route level.

## Audit

- **Platform audit**: `admin_audit_events`, existing table reused — every organization-governance mutation (`organization_created`, `organization_suspended`, `organization_reactivated`, `owner_invited`, `owner_recovery_invited`) writes a row attributed to the acting admin's real `users.id`. A real bug (admin-id-vs-user-id confusion) was caught by the Step 9 automated tests and fixed before any code shipped with it broken — see "Problems found and fixed" below.
- **Organization audit**: new `organization_audit_events` table, same action vocabulary, scoped per-org, `actorType` discriminates platform_admin / organization_owner / organization_admin / system. Verified live in QA-18: full audit-trail summary queried at session end confirms correct counts and attribution for every tested mutation (`organization_created` ×2, `organization_suspended` ×2, `organization_reactivated` ×2, `owner_invited` ×4).

## Browser QA

All 18 required stories (docs/implementation_plan/phase10a.md §68) executed live against the local dev environment with real Clerk identities, real Resend sending, and DB-state verification after every claim. **18/18 PASS.** Full detail in `docs/qa/phase10a/`:
- `phase10a_qa_plan.md` — environment and identity setup
- `execution_log.md` — step-by-step evidence for every story
- `user_story_matrix.md` — pass/fail table
- `defects.md` — the two defects found and fixed

**Defects found during QA** (both pre-existing gaps in already-"complete" Steps 2–8 code, caught only because live QA exercises the full UI→API→UI round trip that unit/integration tests don't):
1. Invite link never surfaced to the admin when email delivery failed, across all three admin invite routes (create/resend/recovery) — made invitations permanently unusable on delivery failure. Fixed by threading `inviteUrl` through the responses and UI.
2. Invite-preview page's "ROLE:" line rendered blank for owner invitations — a stale client-side type/label map never widened when Phase 10A added the owner role. Fixed.

Both fixes were re-verified live (not just re-tested in isolation) before being marked PASS, and the full automated test suite + typecheck + lint + build were re-run clean after each fix.

## Validation

All green, run at the end of this session (after QA-session test-data cleanup):

```
pnpm typecheck   → clean (5/5 workspace packages)
pnpm lint        → clean (5/5 workspace packages)
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
                 → 469/469 tests passed, 62/62 test files
pnpm --filter @incidentrank/web build
                 → clean production build, all new routes registered correctly
pnpm --filter @incidentrank/db db:seed
                 → "Seed complete (100 built-in scenario(s))." unchanged
```

New/extended test files this phase: `organization-provisioning.test.ts` (15 tests, new), `organization-isolation.test.ts` (3 tests, new), `src/app/api/assessment/[assessmentId]/start/route.test.ts` (3 tests, new), `admin-auth.test.ts` (+4 tests), `organization-auth.test.ts` (+6 tests), `org-membership.test.ts` (regression fix, 42 tests still passing).

## Deferred

- **Phase 10B** — organization assessment-credit purchases ($50 single assessment, $5,000/110-credit bundle, and related billing flows) — explicitly out of scope, not implemented.
- **Phase 10C** — Engineer Rank — explicitly out of scope, not implemented.
- **`closed` organization status** — explicitly deferred per the binding scope decision made during planning; only `pending | active | suspended` exist.

---

## Completion criteria (§74) — all 29 verified

1. ✅ Ordinary users cannot create organizations — QA-01.
2. ✅ Only platform admins can provision organizations — `POST /api/admin/organizations` gated by `loadAdminMembership`; QA-02.
3. ✅ `mpant@incidentrank.com` remains platform owner — bootstrap flow untouched; `INITIAL_ADMIN_EMAIL` reverted to the real value after QA-16/17's temporary test-mode override (never committed, `.env.local` is gitignored).
4. ✅ Only platform owner can add platform admins — `requirePlatformOwner()`; QA-16.
5. ✅ Platform admins cannot add other platform admins — QA-17, both UI-hidden and API `403`.
6. ✅ Newly created org begins `pending` — QA-02, confirmed in DB.
7. ✅ Initial owner receives an invitation email — `sendOrganizationOwnerInviteEmail` invoked, confirmed via Resend's real (test-domain-rejected) API call in QA-02 and via working delivery to real `+clerk_test@` addresses elsewhere in the session.
8. ✅ Initial owner must accept with matching verified email — QA-03 (correct email succeeds) and QA-04 (wrong email denied with `email_mismatch`).
9. ✅ Accepted initial owner activates organization — QA-03, `pending → active` confirmed in DB.
10. ✅ Org owners can invite additional owners — QA-05.
11. ✅ Additional owners receive email — same `sendOrganizationOwnerInviteEmail` path, `isAdditionalOwner: true`.
12. ✅ Org admins cannot invite owners — QA-07, UI-hidden and API `403`.
13. ✅ Multiple owners supported — QA-06, two real owners confirmed in one organization.
14. ✅ Organization cannot become ownerless — pre-existing last-owner-protection invariant (`changeMemberRole`/`removeMember`'s `countOwners` check) untouched by this phase, reused as-is; covered by `org-membership.test.ts`'s "last owner protection" suite (still passing).
15. ✅ Platform admin can suspend organization — QA-08.
16. ✅ Suspended org mutations are server-blocked — QA-09, all four mutation types return `403 organization_suspended`.
17. ✅ Already-started candidate assessment can resume/finish during suspension — QA-10, full live end-to-end verification.
18. ✅ Platform admin can reactivate organization — QA-11.
19. ✅ Org-created scenarios belong to exactly one org — pre-existing architecture, `organizationId` scoping; QA-12 confirms isolation.
20. ✅ Cross-org scenario access fails — QA-12, both wrong-slug (404) and right-slug-wrong-membership (403) paths denied.
21. ✅ Scenario version used by historical assessment cannot silently change — QA-13, existing `scenario-authoring.test.ts` "assessment pinning" coverage (binding scope decision: reuse, don't rebuild).
22. ✅ Org assessment/report access is isolated by org — QA-14, cross-org access 404s via both API and UI.
23. ✅ Org owner cannot see candidate personal practice/billing/referral information — QA-15, field-by-field API payload inspection confirms only assessment-relevant data is exposed.
24. ✅ Platform and organization audit trails exist — QA-18, both tables verified populated and correctly attributed.
25. ✅ Direct URLs/APIs respect all authorization boundaries — every QA story that tested a UI denial also independently tested the underlying API directly (QA-01, 04, 07, 09, 12, 14, 17), confirming the UI is never the only enforcement layer.
26. ✅ Browser QA passes — 18/18, `docs/qa/phase10a/user_story_matrix.md`.
27. ✅ Full validation is green — typecheck/lint/tests/build all clean, see "Validation" above.
28. ✅ Built-in scenario count remains 100 — `db:seed` output: "Seed complete (100 built-in scenario(s))."
29. ✅ Completion report is written — this document.
