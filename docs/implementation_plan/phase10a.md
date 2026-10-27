Implement **IncidentRank Phase 10A — Platform Admin & Organization Governance**.

This phase exists because the current organization model is too open for the intended enterprise product.

Today, any authenticated user can create an organization and automatically become its owner.

That must change.

The intended model is:

```text
IncidentRank Platform Owner
mpant@incidentrank.com
        ↓
IncidentRank Platform Admins
        ↓
Organizations
        ↓
Organization Owners
        ↓
Organization Admins / Members
        ↓
Scenarios / Assessments / Candidates / Reports
```

This phase is **not organization billing**.

Do not implement assessment-credit purchasing yet.

Do not implement Engineer Rank yet.

Those belong to later phases.

Phase 10A is about governance, provisioning, organization ownership, access control, suspension, private organization content, auditability, and lifecycle safety.

---

# 1. Platform owner

The existing IncidentRank platform owner remains:

```text
mpant@incidentrank.com
```

This is the bootstrap owner established by the platform-admin system.

Critical rule:

> Only the platform owner may add or invite another IncidentRank platform admin.

A normal platform admin must NOT be able to:

- create another platform admin
- promote another platform admin
- create another platform owner
- modify the platform owner's role
- revoke the platform owner

The owner may invite/add additional platform admins.

Do not automatically grant platform-admin authority based on `@incidentrank.com` email domain.

Existing doctrine remains:

```text
verified @incidentrank.com email
+
explicit active admin_users membership
```

---

# 2. Platform role model

Keep platform roles simple:

```text
owner
admin
```

Permissions:

## Platform owner

May:

- create IncidentRank admins
- revoke IncidentRank admins
- create organizations
- assign initial organization owner
- suspend organizations
- reactivate organizations
- inspect organization state
- inspect organization audit trail
- perform administrative support actions

## Platform admin

May:

- create organizations
- assign initial organization owner
- suspend organizations
- reactivate organizations
- inspect organization state
- inspect organization audit trail
- perform allowed support actions

May NOT:

- create another platform admin
- revoke/demote the platform owner
- create another platform owner

---

# 3. Remove self-service organization creation

Ordinary authenticated users must no longer be able to create organizations.

The current self-service route:

```text
/organizations/new
```

must no longer permit normal users to create an organization.

Remove or block the server-side organization creation path used by ordinary users.

Do not merely hide the button.

A direct API/server-action call must also fail.

Organization creation becomes:

```text
IncidentRank platform admin
        ↓
Admin portal
        ↓
Create organization
        ↓
Assign initial owner
```

Only active IncidentRank platform admins can create an organization.

---

# 4. Admin organization management UI

Add organization management to the existing IncidentRank platform admin portal.

Suggested routes:

```text
/admin/organizations
/admin/organizations/new
/admin/organizations/[organizationId-or-slug]
```

Follow repository conventions.

Admin organization list should show at minimum:

```text
Organization name
Slug
Status
Initial/current owners
Created at
Created by
Scenario count
Assessment count
Candidate/attempt count if readily available
```

Do not build an analytics warehouse.

This is operational administration.

---

# 5. Organization creation flow

Admin selects:

```text
Organization name
Initial owner email
```

Optional:

```text
Slug
Internal notes
```

if the current model supports them.

Recommended flow:

```text
IncidentRank admin enters org name + owner email
        ↓
validate organization name/slug
        ↓
validate owner email
        ↓
create organization
        ↓
create owner invitation
        ↓
send onboarding email
        ↓
recipient signs in/up
        ↓
verified email matches invitation
        ↓
recipient accepts
        ↓
organization_members role = owner
```

Do not immediately create an active owner membership solely because an admin typed an email address unless the existing user is already authenticated/verified and the product explicitly supports direct assignment.

Preferred model:

> Organization ownership becomes active after the intended owner accepts using the matching verified email.

---

# 6. Organization lifecycle

Introduce an explicit organization status.

Recommended:

```text
pending
active
suspended
closed
```

Semantics:

## pending

Organization created, but initial owner onboarding is not complete.

## active

Normal organization functionality available.

## suspended

Organization remains in the database but operational actions are blocked.

## closed

Organization is no longer operational.

Do not hard-delete organization data as the normal lifecycle mechanism.

---

# 7. Organization status schema

If the existing organizations table lacks lifecycle fields, add something equivalent to:

```text
organizations
- status
- suspended_at
- suspended_by_admin_user_id
- suspension_reason
- reactivated_at
- closed_at
- created_by_admin_user_id
```

Use existing schema conventions.

Optional internal fields are acceptable if useful for auditing/support.

---

# 8. Initial owner invitation

Organization creation must generate a secure initial-owner invitation.

Suggested table or reuse existing organization invitation infrastructure.

If the existing organization invite model can safely support role=`owner`, extend it instead of inventing a duplicate system.

Token requirements:

- high entropy
- unguessable
- hashed at rest where appropriate
- expiration
- one-time acceptance
- email-bound
- idempotent acceptance

Initial owner invitation must include:

```text
organization_id
email
role = owner
invited_by = platform admin
```

The recipient's verified Clerk email must match the invitation email.

---

# 9. Organization onboarding email

When IncidentRank creates an organization and assigns/invites the first owner, send an email from:

```text
IncidentRank <support@incidentrank.com>
```

Reuse the existing Phase 8 transactional email abstraction.

Do not create a second email architecture.

Suggested message:

Subject:

```text
You've been assigned as an owner of <Organization Name> on IncidentRank
```

Body should explain:

- IncidentRank created the organization
- recipient has been invited as its owner
- they should sign in/create an account using the invited email
- accepting activates their owner membership
- include secure invitation link

Do not include sensitive organization information unnecessarily.

---

# 10. Email delivery semantics

Keep existing Phase 8 doctrine:

```text
sent = provider accepted request
```

unless delivery webhooks exist.

Email failure should be recorded.

Do not silently create duplicate owner invitations while retrying email delivery.

Admin should be able to resend the same active invitation safely.

---

# 11. Additional organization owners

Existing organization owners must be able to invite another owner.

Current restriction that owners can only invite `admin` or `member` must be updated.

Organization owners may invite:

```text
owner
admin
member
```

Organization admins may invite according to the policy below.

Recommended:

```text
owner:
  can invite owner/admin/member

admin:
  can invite admin/member
  cannot invite owner

member:
  cannot invite
```

This gives ownership elevation only to another owner.

---

# 12. Additional-owner email

When an existing organization owner invites another owner:

```text
existing owner
   ↓
invite new owner email
   ↓
owner invitation created
   ↓
email sent from support@incidentrank.com
   ↓
recipient signs in with matching verified email
   ↓
accepts
   ↓
role = owner
```

The new owner must receive an email.

Suggested subject:

```text
You've been invited to become an owner of <Organization Name> on IncidentRank
```

Do not silently grant owner status without an accepted verified-email invitation.

---

# 13. Organization role model

Organization roles:

```text
owner
admin
member
```

Recommended responsibilities:

## Owner

Can:

- manage organization owners
- manage admins/members
- create scenarios
- create assessments
- invite candidates
- view assessment reports
- manage organization settings
- eventually buy assessment credits
- view organization audit log

## Admin

Can:

- create scenarios
- create assessments
- invite candidates
- view reports
- manage normal members if allowed
- optionally invite admin/member

Cannot:

- add/remove owners
- close the organization
- bypass suspension
- modify platform-level settings

## Member

Use only for organization-level internal access if current product requires it.

Avoid giving member role broad administrative powers.

---

# 14. Owner safety

An organization must never become ownerless.

Required protections:

- last active owner cannot remove themselves
- last active owner cannot demote themselves
- last active owner cannot be removed by another org owner
- owner transfer/addition must complete before removing the previous last owner
- suspended/closed state does not delete owner relationships

Add DB/policy-level protections where practical.

---

# 15. Platform-admin ownership override

IncidentRank platform admins may:

- inspect current owners
- assign/resend an initial owner invitation
- support owner recovery
- potentially assign a replacement owner

But any platform-admin override must:

- be auditable
- require explicit action
- not silently rewrite historical ownership
- preserve the invariant that an active org has at least one owner

Do not make casual role edits possible without logging.

---

# 16. Organization suspension

Platform admins must be able to suspend an organization.

Suspension must be server-authoritative.

Suggested admin action:

```text
Suspend organization
```

Require:

```text
reason
```

Persist:

```text
status = suspended
suspended_at
suspended_by_admin_user_id
suspension_reason
```

Admin audit event required.

---

# 17. Suspension semantics

When organization status is `suspended`, block NEW operational mutations.

At minimum, suspended orgs cannot:

- create scenarios
- edit/publish scenarios
- create assessments
- invite candidates
- start new organization-created assessments
- send organization invites
- add/remove organization members
- perform future credit purchase/consumption operations
- create other organization-owned operational records

Do not rely on disabled buttons.

All relevant APIs/server actions must enforce suspension.

---

# 18. Suspended candidate behavior

Be deliberate about candidates.

Recommended policy:

```text
new assessment starts:
blocked while organization suspended
```

For an already-started candidate attempt:

```text
allow completion/resume
```

Reason:

Suspending the company should not corrupt an assessment a candidate already legitimately began.

Result/report access by organization users may remain read-only.

Document exact behavior.

---

# 19. Suspension is not deletion

Suspension must NOT:

- delete assessments
- delete scenarios
- delete candidate attempts
- delete reports
- revoke historical ownership data
- erase audit logs

Existing data remains intact.

Organization owners should see a clear suspended state.

Suggested banner:

```text
This organization is currently suspended by IncidentRank.
New assessments, invitations, and scenario changes are disabled.
```

---

# 20. Reactivation

Platform admins can reactivate a suspended organization.

Persist:

```text
status = active
reactivated_at
```

Add audit event.

Reactivation restores normal allowed mutations.

Do not create new organization/member records during reactivation.

---

# 21. Closing organizations

If implemented in Phase 10A, closing should be a soft lifecycle state:

```text
status = closed
```

Do not hard delete.

Closed orgs:

- cannot create operational work
- cannot invite candidates
- cannot create scenarios
- cannot consume future credits
- remain available to platform admins for historical support/audit

If closing introduces unnecessary scope, implement only `pending/active/suspended` and document `closed` as deferred.

---

# 22. Organization scenario ownership

Organization owners/admins must be able to create private organization scenarios.

If organization-created scenarios already exist partially, bring them under the governance model.

Every organization-created scenario must have:

```text
organization_id
```

and belong to exactly one organization.

They must not be globally visible.

---

# 23. Organization scenario visibility

Rules:

- organization owners/admins can view their org scenarios
- appropriate members may view according to role
- candidates can access only the scenario attached to their legitimate assessment assignment
- users in another organization cannot discover/read it
- normal practice users cannot access it
- platform admins may inspect it for support/moderation

Add cross-org isolation tests.

---

# 24. Organization scenario lifecycle

Recommended lifecycle:

```text
draft
active
archived
```

Draft:

- editable
- unavailable to candidate assessment use unless explicitly previewing internally

Active:

- may be used in assessments

Archived:

- cannot be selected for new assessments
- historical assessments remain intact

---

# 25. Scenario versioning

Once an organization-created scenario has been used in an assessment, edits must not retroactively change what prior candidates experienced.

Follow the same integrity doctrine already used by built-in scenarios.

Assessment must capture:

```text
scenario_id
scenario_version
```

Historical reports must reference the exact version used.

Do not mutate old assessment meaning when an org edits a scenario.

If the existing scenario authoring model does not yet support immutable versions, implement or extend it sufficiently for this guarantee.

---

# 26. Organization assessment permissions

Org owners/admins may create assessments.

Assessment must belong to the organization.

At minimum:

```text
assessment.organization_id
```

if not already present.

An org may only create assessments using:

- allowed built-in IncidentRank scenarios
- its own organization-created scenarios

It must not use another org's private scenarios.

---

# 27. Candidate invitation permissions

Org owners/admins may invite candidates.

Candidate invitation continues to be:

- email-bound
- token-based
- verified-email match required
- assessment-specific

Do not weaken existing Phase 7 assessment privacy/security.

---

# 28. Candidate privacy

Organization owners/admins may see results for assessment attempts belonging to their organization.

They must NOT see:

- candidate personal practice history
- candidate Incident Passes
- candidate Pro subscription
- candidate Founding status
- candidate referral history
- candidate assessments belonging to another organization

Cross-context privacy must be explicitly tested.

---

# 29. Organization reports

Org owners/admins may view reports for their organization's assessments.

Reports must remain tied to:

```text
organization
assessment
scenario id/version
candidate
attempt
```

Do not create ambiguous cross-org reports.

Do not modify Phase 7 candidate-side privacy redaction.

Candidate still must not see employer-only score/report data if the existing assessment product intentionally hides it.

---

# 30. Organization access helper

Create or extend one central policy helper.

Avoid scattering:

```text
organization.status === "active"
```

through dozens of routes manually.

Conceptually:

```text
loadOrganizationAccess({
  user,
  organization
})
```

should provide:

```text
membership
role
organizationStatus
canMutate
```

or repository-equivalent.

Separate:

```text
read authorization
mutation authorization
```

because suspended orgs may still permit read-only historical access.

---

# 31. Organization mutation guard

Implement a reusable server-side mutation guard.

Conceptually:

```text
requireActiveOrganization(...)
```

Every organization mutation should use it.

This includes:

- create scenario
- update scenario
- create assessment
- candidate invite
- member invitation
- role mutation
- future credit purchase/consumption

Do not rely on each developer remembering the suspension check separately.

---

# 32. Platform admin organization provisioning route

Create server-authoritative admin endpoints/actions.

Possible:

```text
POST /api/admin/organizations
POST /api/admin/organizations/[id]/suspend
POST /api/admin/organizations/[id]/reactivate
POST /api/admin/organizations/[id]/owner-invite
```

Use repository conventions.

All require active IncidentRank platform admin.

Org creation must no longer be available through an ordinary user route.

---

# 33. Existing `/organizations/new`

Change current behavior.

For normal users:

- remove link/navigation
- direct page should deny or redirect appropriately
- direct API/server action should reject

For platform admins:

Prefer using `/admin/organizations/new`.

Do not reuse the ordinary self-service page as a hidden admin page unless it cleanly fits architecture.

---

# 34. Organization invitation system

Reuse existing organization invitation infrastructure when safe.

Extend roles if necessary.

Required invitation states:

```text
pending
accepted
expired
revoked
```

For owner invitations, enforce:

- inviter authorized
- inviter is org owner OR platform admin for initial/recovery owner
- verified-email match
- idempotent acceptance
- no duplicate active membership
- no cross-org confusion

---

# 35. Organization owner invitation acceptance

Flow:

```text
recipient opens /organization/invite/<token>
        ↓
sign in/up
        ↓
verified email match
        ↓
validate org status/invite
        ↓
accept
        ↓
membership role = owner
```

For initial owner of a `pending` organization:

after successful acceptance:

```text
organization.status = active
```

if all required onboarding conditions are satisfied.

Do this transactionally where practical.

---

# 36. Invite acceptance during suspension

Recommended:

```text
pending normal member/admin/owner invite
+
organization suspended
→ acceptance blocked temporarily
```

Exception:

Platform-admin-driven owner recovery may require an explicit special path.

Keep policy simple unless support-recovery behavior is actually needed.

Do not silently activate normal membership while an org is suspended.

---

# 37. Email integration

Extend existing:

```text
TransactionalEmailService
```

Add methods such as:

```text
sendOrganizationOwnerInvite(...)
sendOrganizationMembershipInvite(...)
sendOrganizationSuspendedNotification(...)  // optional
sendOrganizationReactivatedNotification(...) // optional
```

At minimum Phase 10A requires:

```text
initial owner invitation email
additional owner invitation email
```

Use:

```text
IncidentRank <support@incidentrank.com>
```

Do not create provider-specific domain logic outside the email adapter.

---

# 38. Optional suspension email

Recommended if low effort:

When IncidentRank suspends an organization, email all active owners:

Subject:

```text
Your IncidentRank organization has been suspended
```

Include:

- organization name
- high-level reason
- support contact

When reactivated, optionally notify owners.

If email infrastructure is not production-enabled yet, preserve the event/status and use the test adapter.

Do not make suspension depend on successful email delivery.

---

# 39. Platform audit log

Phase 8 already introduced `adminAuditEvents`.

Extend it.

Required events:

```text
organization_created
initial_owner_invited
organization_suspended
organization_reactivated
organization_closed
organization_owner_recovery_invited
```

if applicable.

Include:

```text
actor admin user
organization id
target user/invite if relevant
reason
timestamp
```

Do not store raw tokens.

---

# 40. Organization audit log

Create an organization-level audit trail if one does not exist.

Suggested:

```text
organization_audit_events
- id
- organization_id
- actor_user_id
- actor_type
- action
- target_type
- target_id
- metadata_json
- created_at
```

Actor types may include:

```text
platform_admin
organization_owner
organization_admin
system
```

Track at minimum:

```text
owner_invited
owner_added
owner_removed
admin_invited
member_invited
role_changed
scenario_created
scenario_updated
scenario_archived
assessment_created
candidate_invited
```

Do not overbuild every read event.

Focus on meaningful mutations.

---

# 41. Ownership changes must be auditable

For every owner addition/removal:

record:

```text
who initiated
which organization
which user
old role
new role
timestamp
```

No silent ownership changes.

---

# 42. Cross-organization isolation

This is a beta-blocking security boundary.

Explicitly test that Org A users cannot access Org B:

- organization record
- members
- owner invitations
- scenarios
- scenario versions
- assessments
- candidates
- candidate invitations
- attempts
- reports
- audit logs

Use direct URL and direct API tests.

Do not rely only on navigation hiding.

---

# 43. Platform admin visibility

Platform admins may inspect organization data for support/governance.

Do not confuse this with organization membership.

A platform admin does not need an `organization_members` row to perform platform-governance actions.

However, if platform admins enter normal org operational views, be explicit whether they are using:

```text
platform override
```

versus pretending to be a member.

Prefer separate admin inspection surfaces where feasible.

---

# 44. Organization identity

Use stable organization IDs for authorization.

Slug is for routing/display only.

Do not authorize solely on user-provided slug.

Resolve:

```text
slug → organization id
```

then membership/access check by ID.

---

# 45. Organization creation uniqueness

Handle:

- duplicate slug
- normalized names if applicable
- concurrent creation requests

Do not silently overwrite.

Return clean validation/conflict states.

---

# 46. Initial-owner duplicate handling

Admin creating an org with an owner email that already belongs to an IncidentRank user is fine.

Still create an owner invitation unless direct assignment is explicitly designed.

Email should go to that verified intended owner.

If that user already owns another organization, that is allowed unless there is an explicit business restriction.

Do not assume one user can own only one organization.

---

# 47. Multiple owners

An organization may have multiple owners.

This is intentional.

Do not add a global single-owner constraint at organization level.

Invariant is:

```text
active organization
→ at least one active owner
```

not:

```text
exactly one owner
```

---

# 48. Admin-only platform admin creation

This requirement is strict:

```text
mpant@incidentrank.com
```

as platform owner is the only identity authorized to create/invite additional IncidentRank platform admins.

Implement a dedicated owner-only policy function.

Example concept:

```text
requirePlatformOwner(...)
```

Do not use generic admin authorization for admin creation.

Tests must show:

```text
platform owner → can invite platform admin
platform admin → cannot invite platform admin
ordinary @incidentrank.com user → cannot invite platform admin
external user → cannot invite platform admin
```

---

# 49. Prevent platform owner lockout

The platform owner cannot be:

- revoked by another admin
- demoted by another admin
- replaced through normal admin UI
- removed by organization role actions

If a future owner-transfer feature is ever built, it should be a separate explicit operation.

Do not implement owner transfer in Phase 10A.

---

# 50. Existing organization migration

Existing local/dev organizations may have been self-created.

Create a migration/data strategy.

Do not delete them blindly.

For development/test:

- preserve records
- ensure valid owner memberships
- assign a sensible status, likely `active`
- `created_by_admin_user_id` may remain null for legacy rows

Document legacy semantics.

For production, if there are no real organizations yet, note that clearly but keep migration safe anyway.

---

# 51. Existing owner role behavior

If existing organization owners were created through self-service:

- preserve their membership
- do not revoke them automatically
- after Phase 10A, they operate under the new governance model

The key change is:

```text
no NEW self-service org creation
```

---

# 52. Organization dashboard suspended state

For suspended org owners/admins:

display clear status.

Example:

```text
Organization suspended

IncidentRank has temporarily suspended this organization.
Historical data remains available, but new scenarios,
assessments, invitations, and membership changes are disabled.
```

Avoid cryptic 403 pages where read-only context can be shown safely.

---

# 53. Organization creation admin UX

Suggested form:

```text
Organization name
Organization slug
Initial owner email
```

After creation:

```text
Organization created
Owner invitation sent to <email>
Status: Pending owner acceptance
```

If email send fails:

```text
Organization created
Owner invitation created
Email delivery failed
[Resend]
```

Do not create a second organization just because the email failed.

---

# 54. Organization detail admin UX

Admin view should show:

```text
Name
Slug
Status
Created
Created by
Owners
Admins
Members
Scenario count
Assessment count
Candidate/attempt count
Suspension state/reason
Audit history
```

Actions:

```text
Suspend
Reactivate
Resend initial owner invite
Invite recovery owner
```

Only show actions appropriate to current status.

---

# 55. Email privacy

Owner-invite email should not disclose:

- candidate data
- assessment reports
- other owners' private information
- internal suspension notes

Only necessary onboarding context.

---

# 56. Scenario authoring authorization

Org owner/admin scenario creation must enforce:

```text
organization.status = active
```

and:

```text
membership role ∈ allowed roles
```

Do not allow a suspended org admin to call the API directly.

---

# 57. Assessment creation authorization

Same doctrine:

```text
active organization
+
owner/admin role
```

Assessment creation must fail cleanly otherwise.

---

# 58. Candidate invitation authorization

Same doctrine:

```text
active organization
+
owner/admin role
+
assessment belongs to same organization
```

Cross-org assessment IDs must not be usable.

---

# 59. Report authorization

Reports:

```text
owner/admin
+
assessment.organization_id matches user's org membership
```

Suspension may still permit read-only report access.

Document this.

---

# 60. Platform suspension override

When organization is suspended:

platform admin inspection must continue to work.

Do not block IncidentRank support staff from inspecting a suspended org.

---

# 61. Required automated tests — platform admin

Test:

1. platform owner can invite platform admin
2. platform admin cannot invite platform admin
3. ordinary IncidentRank-domain user cannot
4. external-domain user cannot
5. revoked platform admin cannot create org
6. platform admin can create org
7. normal authenticated user cannot create org
8. direct ordinary-user creation API fails
9. platform owner cannot be revoked by platform admin

---

# 62. Required tests — organization creation

Test:

1. admin creates pending organization
2. initial owner invite created
3. initial owner email send invoked
4. duplicate request does not duplicate organization unexpectedly
5. duplicate/invalid slug handled
6. email failure preserves org + invite
7. resend uses same invitation
8. wrong email cannot accept
9. correct verified email accepts
10. accepted initial owner gets owner role
11. organization transitions pending → active
12. repeated acceptance idempotent

---

# 63. Required tests — additional owners

Test:

1. owner can invite another owner
2. admin cannot invite owner
3. member cannot invite owner
4. owner invitation sends email
5. wrong verified email denied
6. correct user accepts
7. new membership role = owner
8. duplicate acceptance idempotent
9. org may have multiple owners
10. last owner cannot remove/demote themselves

---

# 64. Required tests — suspension

Test:

1. platform admin can suspend
2. suspension reason persisted
3. org owner cannot suspend their own org through platform action
4. suspended org cannot create scenario
5. suspended org cannot edit active scenario
6. suspended org cannot create assessment
7. suspended org cannot invite candidate
8. suspended org cannot invite member/owner
9. new candidate start blocked
10. already-started candidate attempt can resume/finish
11. historical reports remain readable according to policy
12. platform admin can inspect suspended org
13. reactivation restores mutations
14. audit events written

---

# 65. Required tests — org isolation

Use two organizations.

Test Org A member cannot access Org B:

1. org page
2. members
3. invitations
4. scenarios
5. assessments
6. candidate invites
7. attempts
8. reports
9. audit logs

Include direct API calls, not only pages.

---

# 66. Required tests — scenario versioning

Test:

1. org creates scenario draft
2. activates version 1
3. assessment uses version 1
4. org edits scenario
5. new version created
6. old assessment still references version 1
7. new assessment may use new active version
8. archived scenario unavailable for new assessment
9. historical report still works

---

# 67. Required tests — candidate privacy

Test organization owner/admin can see:

```text
their assessment report
```

but cannot see:

```text
candidate practice history
candidate Pro status
candidate Founding status
candidate passes
candidate referrals
candidate other-org assessments
```

Also ensure candidate still cannot see employer-only assessment scoring if that remains current product policy.

---

# 68. Required browser QA

Create:

```text
docs/qa/phase10a/
```

Suggested:

```text
phase10a_qa_plan.md
user_story_matrix.md
execution_log.md
defects.md
completion_report.md
```

Run live browser QA.

Required stories:

## QA-01 — Ordinary user cannot create org

Sign in as normal engineer.

Verify:

- no create-org action
- `/organizations/new` denied/redirected
- direct API denied

## QA-02 — Platform admin creates org

Sign in as IncidentRank admin.

Create organization with initial owner email.

Verify:

- org pending
- owner invite exists
- email adapter invoked

## QA-03 — Initial owner accepts

Owner signs up/in with matching email.

Accept invitation.

Verify:

- membership owner
- org active

## QA-04 — Wrong owner email

Different user opens owner invite.

Verify denied.

## QA-05 — Owner invites second owner

First owner adds second owner.

Verify invitation and email.

## QA-06 — Second owner accepts

Verify both owners exist.

## QA-07 — Org admin cannot add owner

Verify denied server-side.

## QA-08 — Platform admin suspension

Suspend organization.

Verify banner/state.

## QA-09 — Suspended mutations

Try:

- scenario create
- assessment create
- candidate invite
- owner/member invite

All denied.

## QA-10 — Existing candidate attempt during suspension

Start before suspension.

Suspend org.

Candidate resumes/completes successfully.

## QA-11 — Reactivation

Reactivate.

Verify org mutations work again.

## QA-12 — Scenario ownership

Create org-private scenario.

Verify another org cannot view/use it.

## QA-13 — Scenario versioning

Use scenario in assessment, edit later, verify historical assessment stays pinned.

## QA-14 — Assessment/report isolation

Org A cannot inspect Org B report.

## QA-15 — Candidate privacy

Org owner sees employer assessment report but not candidate personal practice/billing/referral data.

## QA-16 — Platform owner admin creation

`mpant@incidentrank.com` can invite a platform admin.

## QA-17 — Platform admin cannot create platform admin

Verify denial.

## QA-18 — Audit logs

Verify platform + organization audit records for major mutations.

---

# 69. Email QA

At minimum verify through test adapter:

```text
initial owner email
additional owner email
```

If transactional email is enabled in a safe test environment, send real Resend TEST/verified-domain email where appropriate.

Do not block Phase 10A code completion on production DNS email setup.

Document readiness.

---

# 70. Feature flags

If organization-governance rollout needs a flag, introduce one such as:

```env
ORG_ADMIN_PROVISIONING_ENABLED=false
```

or use existing admin feature gating if cleaner.

Do not add feature flags without purpose.

The important server-side policy is:

```text
ordinary users cannot create organizations
```

This should not silently revert because a UI flag changes.

---

# 71. Migration safety

Run migrations against existing development data.

Verify:

- existing org records preserved
- memberships preserved
- assessments preserved
- candidates preserved
- no scenario loss
- no attempt loss

No destructive migration.

---

# 72. Full validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Use repository-required single-fork Vitest mode if the known shared-DB test-isolation issue still exists.

Do not introduce new test flakiness.

Expected built-in scenarios:

```text
100
```

---

# 73. Completion report

Create:

```text
docs/implementation_plan/phase10a_organization_governance_completion.md
```

Include:

## Platform administration
- owner policy
- admin creation policy
- owner protection

## Organization provisioning
- removal of self-service creation
- admin creation flow
- initial owner invitation
- owner activation

## Organization lifecycle
- pending
- active
- suspended
- closed if implemented

## Email
- first-owner email
- additional-owner email
- resend behavior

## Roles
- owner
- admin
- member
- permission matrix

## Suspension
- blocked operations
- read-only behavior
- candidate in-progress behavior
- reactivation

## Organization scenarios
- private ownership
- lifecycle
- versioning

## Assessments
- org ownership
- candidate invites
- report permissions

## Privacy/isolation
- cross-org tests
- candidate personal-data boundaries

## Audit
- platform audit
- org audit

## Browser QA
- all stories
- defects
- fixes
- retests

## Validation
- typecheck
- lint
- tests
- build
- seed

## Deferred
Explicitly list Phase 10B organization billing/assessment credits and Phase 10C Engineer Rank.

---

# 74. Completion criteria

Phase 10A is complete only when:

1. ordinary users cannot create organizations
2. only platform admins can provision organizations
3. `mpant@incidentrank.com` remains platform owner
4. only platform owner can add platform admins
5. platform admins cannot add other platform admins
6. newly created org begins pending
7. initial owner receives an invitation email
8. initial owner must accept with matching verified email
9. accepted initial owner activates organization
10. org owners can invite additional owners
11. additional owners receive email
12. org admins cannot invite owners
13. multiple owners supported
14. organization cannot become ownerless
15. platform admin can suspend organization
16. suspended org mutations are server-blocked
17. already-started candidate assessment can resume/finish during suspension
18. platform admin can reactivate organization
19. org-created scenarios belong to exactly one org
20. cross-org scenario access fails
21. scenario version used by historical assessment cannot silently change
22. org assessment/report access is isolated by org
23. org owner cannot see candidate personal practice/billing/referral information
24. platform and organization audit trails exist
25. direct URLs/APIs respect all authorization boundaries
26. browser QA passes
27. full validation is green
28. built-in scenario count remains 100
29. completion report is written

---

# 75. Explicitly deferred to Phase 10B

Do NOT implement yet:

```text
organization assessment credit purchases
$50 single assessment
$5,000 / 110 assessment credits
Stripe org billing products
credit ledger
credit consumption
credit refunds
organization payment history
```

Design organization governance so these can be added cleanly next.

---

# 76. Explicitly deferred to Phase 10C

Do NOT implement yet:

```text
Engineer Rank
skill profile
normalized ranking
difficulty normalization
leaderboard
rank bands
progression history
```

That is a separate product phase.

---

# Stop condition

Stop after Phase 10A governance implementation, QA, validation, and completion report.

Do not begin organization billing or Engineer Rank.

The next planned phase after successful completion is:

```text
Phase 10B — Organization Assessment Credits & Billing
```