# Phase 10A Browser QA — Execution Log

Session date: 2026-10-27. Dev server at `localhost:3000`, real Clerk dev-mode sign-ups (`+clerk_test@example.com` convention, fixed test OTP `424242`), real Resend email sending (RESEND_API_KEY live), admin grants via direct DB mutation (same workaround established in Phase 8/9 QA — sandbox cannot self-grant admin_users rows).

## QA-01 — Ordinary user cannot create org

Signed up as `qa-phase10a-ordinary+clerk_test@example.com` (brand-new identity, no org/admin membership).

- `/organizations` — no "Create Organization" button/link anywhere on the page; empty-state copy reads "Organizations are provisioned by IncidentRank — contact support@incidentrank.com to set one up."
- `/organizations/new` — renders a static denial page ("Organization creation is managed by IncidentRank"), not a form.
- Direct `fetch('/api/organizations', {method:'POST', body:{name:'Hacked Org', slug:'hacked-org'}})` from the authenticated browser session → `403 {"error":"Organization creation is managed by IncidentRank. Contact support@incidentrank.com to set up a new organization."}`.

**PASS** — all three layers (UI absence, page-level denial, API-level denial) confirmed independently.

## QA-02 — Platform admin creates org

Granted `qa-phase10a-platformadmin+clerk_test@example.com` an `admin_users` row (`role: admin`) via direct DB insert (sandbox cannot self-grant; user ran the command). Signed in, navigated to `/admin/organizations/new`, created "Acme QA Phase10A" with initial owner `qa-phase10a-owner1+clerk_test@example.com`.

- DB: `organizations.status = 'pending'`, `created_by_admin_user_id` correctly set to the acting admin's `admin_users.id`.
- DB: pending `organization_invitations` row, `role: 'owner'`, `is_recovery_invite: false`.
- Email adapter was genuinely invoked — Resend's real API rejected the `@example.com` test address (`422 validation_error`, expected in a real non-whitelisted-domain test), and the UI correctly reported "email delivery failed" rather than a false "sent".
- `organization_audit_events`: `organization_created` + `owner_invited`, both `actor_type: platform_admin`. `admin_audit_events`: `organization_created` correctly attributed to the acting admin's real `users.id` (confirms the adminUserId bug fixed during Step 9 works end-to-end in a real UI flow, not just in tests).
- Admin detail page (`/admin/organizations/[id]`) renders status PENDING, 0/0/0 counts, Suspend/Resend/Recovery actions, empty members list, audit log.

**Defect found and fixed during this story**: when email delivery failed, neither the "New Organization" success screen nor the "Resend Owner Invite" action ever surfaced the invite link anywhere — the three admin routes (`POST /api/admin/organizations`, `owner-invite/resend`, `owner-invite/recovery`) computed the token internally but never included it in their JSON response, so the plaintext token (never persisted, by design) was permanently unrecoverable once the email failed to send. This made invitation creation genuinely unusable whenever Resend rejected the address. Fixed by widening `ResendOwnerInviteResult`/`InviteOwnerRecoveryResult` to include `token`, adding `inviteUrl` to all three routes' responses, and updating `new-organization-form.tsx`/`organization-actions.tsx` to display it when `emailSent: false` — mirroring the existing `InviteAdminForm`/`InviteMemberForm` convention. Re-verified live: "Resend Owner Invite" now surfaces a working `http://localhost:3000/organization/invite/<43-char-token>` link. Also required restarting the dev server (two stale/duplicate `next` processes were serving pre-fix code).

**PASS** (after defect fix).

## QA-04 — Wrong owner email

Created a second organization ("Globex QA Phase10A", initial owner `qa-phase10a-owner2+clerk_test@example.com`) as the platform admin. Signed in as `qa-phase10a-ordinary+clerk_test@example.com` (a genuinely different identity) and opened the real invite link, then clicked "Accept Invitation".

- UI correctly showed "Your signed-in account's email does not match the email this invitation was sent to", no redirect/success.
- DB confirmed: `organization_members` empty for this org, `organizations.status` still `pending` — no side effect from the failed attempt.
- Confirmed "ROLE: OWNER" now displays correctly on this invite (the QA-03 label-map fix applies here too).

**PASS**.

## QA-03 — Initial owner accepts

Signed up `qa-phase10a-owner1+clerk_test@example.com` (new identity, matching the invitation's email exactly) and visited the real invite link surfaced above.

- Invite landing page correctly rendered "You've been invited to join Acme QA Phase10A" with a working "Accept Invitation" button once signed in.
- After acceptance: redirected to `/organizations/acme-qa-phase10a`, page correctly showed "1 member · your role: owner", no suspended banner.
- DB: `organizations.status` flipped `pending → active`; `organization_members` row created with `role: 'owner'`.

**Second defect found and fixed during this story**: the invite landing page's "ROLE:" line rendered blank for an owner invitation — `org-invite-acceptance.tsx`'s `InvitePreview.role` type and `ROLE_LABEL` map were still `"admin" | "member"` only, never widened when Phase 10A's `createOrgInvitation` started permitting `"owner"`. The server-side preview route (`GET /api/organization/invite/[token]`) always correctly returned the real role — only the client display map was stale. Fixed by widening both to include `"owner": "Owner"`.

**PASS** (after defect fix).

## QA-05 — Owner invites second owner

Signed in as `qa-phase10a-owner1+clerk_test@example.com` (the accepted initial owner), went to `/organizations/acme-qa-phase10a/members`. The invite-role dropdown correctly offered Member/Admin/Owner (owner-only "Owner" option gating works). Invited `qa-phase10a-owner1b+clerk_test@example.com` as `owner`.

- UI showed the real invite link (`InviteMemberForm`'s existing convention — unaffected by the Step 7 admin-flow bug).
- "Pending Invitations" table correctly listed the new invite: email, "Owner" role, expiry, Revoke action.
- DB: new `organization_invitations` row, `role: 'owner'`.

**PASS**.

## QA-06 — Second owner accepts

Signed up `qa-phase10a-owner1b+clerk_test@example.com` and opened the real invite link. "ROLE: OWNER" displayed correctly. Accepted.

- Redirected to the org dashboard: "2 members · your role: owner".
- DB: both members confirmed with `role: 'owner'` — the additional-owner invite flow does not disturb the existing owner or re-trigger the pending→active transition (already active, no-op as designed).

**PASS**.

## QA-14 — Assessment/report isolation

Accepted Globex's pending owner invitation (`qa-phase10a-owner2+clerk_test@example.com`). As owner2, attempted to access Acme's `QA-10 Suspension Continuity Assessment` both via direct API (`GET /api/organizations/globex-qa-phase10a/assessments/[acmeAssessmentId]`) and via the UI route (`/organizations/globex-qa-phase10a/assessments/[acmeAssessmentId]`).

- API: `404 {"error":"Not found"}`.
- UI: real 404 page rendered.

**PASS**.

## QA-12 — Scenario ownership

As owner1, authored a new org-private draft scenario in Acme ("Acme Private Scenario QA-12"). As owner2 (Globex), attempted access two ways:

- `GET /api/organizations/globex-qa-phase10a/scenarios/[acmeScenarioId]` (scoped through Globex's own slug) → `404 Not found`.
- `GET /api/organizations/acme-qa-phase10a/scenarios/[acmeScenarioId]` (attempting Acme's slug directly, as a non-member) → `403 Forbidden`.
- Globex's own "New Assessment" scenario-selector page source never contains "Acme Private Scenario QA-12" anywhere.

**PASS** — both the wrong-org-slug and right-org-slug-wrong-membership paths are independently denied.

## QA-13 — Scenario versioning

Per the approved Phase 10A plan's binding scope decision #2 ("do not modify or re-test scenario versioning/publishing architecture beyond bringing it under suspension policy"), this story is satisfied by existing, already-passing automated coverage rather than a new live editing flow: `scenario-authoring.test.ts`'s `"assessment pinning" > "an assessment created against v1 stays on v1 after v2 publishes"` test (confirmed passing as part of the full 469-test suite run during Step 9). The `QA-10 Suspension Continuity Assessment` created live during this session also independently demonstrates the pinning mechanism end-to-end: it recorded `scenarioId`/`scenarioVersion` at creation time (confirmed via `GET` response showing "Payment Retry Storm · v1") and that pin was never affected by any other action during the session.

**PASS** (via existing automated coverage + incidental live confirmation — no new defect surface here per the approved scope decision).

## QA-15 — Candidate privacy

As owner1, viewed the candidate detail page for the completed QA-10 attempt (`/organizations/acme-qa-phase10a/assessments/[id]/candidates/[candidateId]`):

- Rendered: score (550/1000), full dimension breakdown (Recovery/Customer Impact/Data Integrity/Reliability/Cost Efficiency/Operational Efficiency), completion declaration (outcome, revenue impact, infra cost, Kafka lag), full interviewer timeline — exactly the employer-facing assessment report.
- Direct API response (`GET .../candidates/[id]`) inspected field-by-field: `candidate` object has only assessment-relevant fields (status, timestamps, attemptId) plus a nested `user` with only `id`/`displayName`/`leaderboardVisible`/timestamps — no billing, no practice-attempt history, no referral data anywhere in the payload.

**PASS** — the employer sees the assessment report in full, and nothing beyond it.

## QA-16 — Platform owner admin creation

Required `mpant@incidentrank.com` specifically; Clerk test mode can't authenticate that exact literal, so — per the explicit allowance in phase8loc.md ("override INITIAL_ADMIN_EMAIL in the test/dev environment, use the exact verified test identity there") — temporarily set `INITIAL_ADMIN_EMAIL="mpant-phase10aqa+clerk_test@incidentrank.com"` in `apps/web/.env.local` for this story only (reverted immediately after, never committed). Restarted the dev server, signed up that exact identity, confirmed bootstrap via `/admin`: "signed in as mpant-phase10aqa+clerk_test@incidentrank.com · your role: owner".

As that platform owner, invited `qa-phase10a-newadmin+clerk_test@incidentrank.com` as `admin` from `/admin/admin-users` — the invite-role dropdown correctly offers only "Admin" (no "Owner" — owner transfer is out of scope). Invite link surfaced in the UI; DB confirmed `admin_invites` row created with `role: 'admin'`.

**PASS**.

## QA-17 — Platform admin cannot create platform admin

Still signed in as `qa-phase10a-platformadmin+clerk_test@example.com` (plain `admin` role) from earlier stories. Visited `/admin/admin-users`:

- UI: the entire invite form is absent for a plain admin (gated by `isOwnerRole`) — only the member list with Revoke actions is visible.
- Direct API: `POST /api/admin/admin-users/invitations` with `{role: "admin"}` → `403 {"error":"Only the platform owner may invite platform admins"}`. DB confirmed no invite row created.

**PASS** — this is the exact pre-existing gap Step 2 closed (any active plain admin could previously invite another plain admin); now proven denied end-to-end in a real session, not just by the automated test suite.

## QA-18 — Audit logs

Queried both audit tables at the end of the session for every major mutation performed:

- `organization_audit_events`: `organization_created` ×2, `organization_suspended` ×2, `organization_reactivated` ×2, `owner_invited` ×4 (initial-owner invites for both orgs, plus the QA-02 resend) — all correctly `actor_type: 'platform_admin'`.
- `admin_audit_events`: matching counts for the same action set, correctly attributed to the acting admin's real `users.id` (not their `admin_users.id` — the Step 9 bug fix verified end-to-end).
- Visually confirmed throughout the session via the admin detail page's live AUDIT LOG section after every suspend/reactivate/resend action (see QA-02, QA-08, QA-09/10 sections above) — each action appeared immediately with a correct timestamp and actor type.
- `owner_recovery_invited` was not exercised this session (no genuinely ownerless-suspended-org scenario arose) — covered instead by `organization-provisioning.test.ts`'s dedicated recovery tests (Step 9).

**PASS** — both platform-level and organization-level audit trails are populated correctly for every tested mutation.

## QA-07 — Org admin cannot add owner

As owner, invited `qa-phase10a-admin1+clerk_test@example.com` as `admin`, accepted it as that identity. Confirmed via `/organizations/acme-qa-phase10a/members`: UI-level invite-role dropdown for an admin actor correctly offers only Member/Admin (no "Owner" option — client-side `actorRole="admin"` gating works).

Bypassed the UI and called the API directly as the signed-in admin: `POST /api/organizations/acme-qa-phase10a/members/invitations` with `{role: "owner"}` → `403 {"error":"Forbidden"}`. DB confirmed no invitation row was created for the attempted email.

**PASS** — denial is enforced server-side (`canInviteRole`), not merely hidden in the UI.

## QA-08 — Platform admin suspension

As the platform admin, opened Acme QA Phase10A's detail page and clicked Suspend with reason "QA-08: testing suspension flow".

- Admin detail view: status flipped to SUSPENDED, reason displayed, "Reactivate" replaced "Suspend", new `organization_suspended` audit event appeared immediately.
- As owner1, visited `/organizations/acme-qa-phase10a`: the suspended banner correctly rendered with the exact copy from the spec ("Existing data remains visible, but new scenarios, assessments, candidates, and member invitations cannot be created until it is reactivated."), "3 members · your role: owner" still showed, data still visible.

**PASS**.

## QA-09 — Suspended mutations

As owner, called all four mutation endpoints directly via `fetch` while the organization was suspended:

- `POST .../scenarios` (scenario create) → `403 {"error":"organization_suspended"}`
- `POST .../assessments` (assessment create) → `403 {"error":"organization_suspended"}`
- `POST .../members/invitations` (member invite) → `403 {"error":"organization_suspended"}`
- `POST .../assessments/[id]/candidates` (candidate invite) → `403 {"error":"organization_suspended"}` (re-verified after re-suspending with an existing assessment in place — see QA-10 below)

UI correctly hid the corresponding "create" buttons in all cases (no "Create Scenario", no "Create Assessment" actionable form, no owner-role option when suspended — though the member-invite form itself remained visible, the server is the actual boundary and correctly denies regardless).

**PASS** — all four denied server-side, not merely UI-hidden.

## QA-10 — Existing candidate attempt during suspension

Before suspending, created a real assessment ("QA-10 Suspension Continuity Assessment", Payment Retry Storm), activated it, invited `qa-phase10a-candidate+clerk_test@example.com`, signed up as that candidate, accepted, and started the attempt (confirmed `in_progress` in DB). Then signed in as the platform admin and suspended the organization while the attempt was live.

Signed back in as the candidate and resumed `/assessment/e4febebd-c603-474f-be2a-818a210af9ec`:

- Live simulation resumed normally — pre-incident countdown continued, then the incident fired on schedule (system went CRITICAL, metrics degraded, timeline events appeared) exactly as it would in an unsuspended organization.
- Clicked "Finish Incident" → confirmed → "ASSESSMENT COMPLETE — Assessment submitted successfully."
- DB: `attempts.status = 'completed'`, `outcome: 'declared_unstable'`; `organizations.status` remained `suspended` throughout the entire resume-and-complete flow — the suspension never once interfered with the candidate's continuity.

**PASS** — the one case §18 explicitly protects (already-started attempt survives suspension) is verified end-to-end, not just via the `start` route's early-return logic.

## QA-11 — Reactivation

As platform admin, clicked Reactivate on the (first-round) suspended organization.

- Admin detail view: status flipped `SUSPENDED → ACTIVE`, `organization_reactivated` audit event appeared, "Suspend" button restored.
- Verified separately as owner: suspended banner disappeared, "Create Assessment"/scenario-create actions became available again (this is what allowed the QA-10 setup — creating an assessment required the org to be active first).

**PASS**.
