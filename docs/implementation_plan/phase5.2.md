# IncidentRank — Phase 5.2: Organization Members

Before making changes:

1. Read the root `README.md`.
2. Read `docs/architecture.md`.
3. Review the Phase 4 organization model.
4. Review the existing `organization_members` table and `organization-auth.ts`.
5. Review the Phase 5 authoring authorization rules.
6. Review the Phase 5.1 assessment-runtime authorization model.
7. Do not begin Phase 6.
8. Do not add billing, teams, departments, SSO, SCIM, or enterprise identity management.
9. Do not change assessment/runtime/scenario behavior unless required for membership authorization correctness.

Phase 0 through Phase 5.1 are complete.

---

# Goal

Make organizations usable by real hiring teams.

Today, the organization creator becomes the owner, but there is no product-supported way for another person to join the organization.

Phase 5.2 adds:

- organization member invitations
- invitation acceptance
- pending invitations
- owner/admin/member roles
- role changes
- member removal
- last-owner protection
- organization members UI
- authorization tests

Keep this phase deliberately small.

---

# Core Principle

IncidentRank users remain universal users.

Organization membership is a relationship:

```text
User
  +
OrganizationMember
  =
Organization access
```

Do not create a separate company-user account type.

---

# Existing Roles

Continue using:

```text
owner
admin
member
```

Permissions:

```text
owner
→ full organization administration
→ invite/remove members
→ change member roles
→ manage assessments
→ manage scenarios

admin
→ manage assessments
→ manage scenarios
→ invite members
→ optionally remove ordinary members
→ cannot remove/demote owners unless explicitly allowed below

member
→ view organization
→ view assessments/results
→ view published scenarios
→ no mutations
```

Keep the permission model simple.

Do not add custom permissions.

---

# Membership Invitations

Add a new table conceptually:

```ts
OrganizationInvitation {
  id
  organizationId

  email
  normalizedEmail

  role:
    "admin"
    | "member"

  tokenHash

  invitedByUserId

  expiresAt
  acceptedAt nullable
  revokedAt nullable

  createdAt
}
```

Do not allow invitation directly into `owner`.

Owner promotion should happen only after membership exists.

---

# Invitation Security

Use the same security pattern as assessment invitations:

```text
random opaque token
→ hash with SHA-256
→ store only hash
```

Plaintext token should only be returned at creation time.

Do not store plaintext invitation tokens.

Suggested expiry:

```text
7 days
```

Reuse shared token helpers if clean.

Do not duplicate security utilities unnecessarily.

---

# Email Normalization

Use the same normalization strategy already used for candidate invitations.

At minimum:

```text
trim
lowercase
```

Do not invent provider-specific normalization such as removing Gmail dots or plus aliases.

---

# Duplicate Invitation Rules

For one organization/email:

Do not allow multiple active pending invitations.

Conceptually:

```text
organizationId + normalizedEmail
```

should have at most one active invitation.

If an existing invite:

```text
pending + unexpired
```

return a clean conflict.

If expired/revoked:

it is acceptable to create a new invitation.

Choose a clean schema/query approach and document it.

---

# Existing Members

If the email already belongs to an organization member:

do not create an invitation.

Return a clear response such as:

```text
This user is already a member of the organization.
```

---

# Members Page

Add:

```text
/organizations/[slug]/members
```

Show:

## Members

```text
Name / Email
Role
Joined
Actions
```

## Pending Invitations

```text
Email
Invited Role
Invited By
Expires
Actions
```

Actions may include:

```text
Copy Invite Link
Revoke
```

For Phase 5.2, do not integrate a real email provider.

Continue the existing copyable-link approach.

---

# Organization Dashboard

Add a clear:

```text
Members
```

link from:

```text
/organizations/[slug]
```

Show basic member count if not already present.

---

# Invite Member Flow

Owner/admin clicks:

```text
Invite Member
```

Fields:

```text
Email
Role: Admin | Member
```

Submit creates invitation and displays:

```text
Copy Invitation Link
```

Example:

```text
https://incidentrank.com/organization/invite/<token>
```

Do not expose token hashes.

---

# Invitation Landing Page

Add:

```text
/organization/invite/[token]
```

Signed out:

Show:

```text
You've been invited to join Acme Corp on IncidentRank.

Role:
Admin
```

CTA:

```text
Sign in / Create Account
```

Return to invite after authentication.

---

# Identity Matching

Require the authenticated user's verified Clerk email to match the invitation email.

Reuse the existing candidate-invite pattern where possible.

Do not permit:

```text
invited@example.com
```

to be claimed by:

```text
different@example.com
```

If the invitation has already been accepted:

return a safe already-accepted state rather than creating another membership.

---

# Acceptance

On valid acceptance:

1. verify token
2. verify not expired
3. verify not revoked
4. verify matching authenticated email
5. ensure membership does not already exist
6. create `organization_members` row
7. mark invitation accepted
8. redirect/show organization

This should be atomic.

Use a DB transaction.

---

# Invitation States

Conceptually:

```text
pending
accepted
expired
revoked
```

You may derive some states from timestamps rather than adding an enum if cleaner.

For example:

```text
acceptedAt != null → accepted
revokedAt != null → revoked
now > expiresAt → expired
otherwise → pending
```

Prefer fewer redundant state columns.

---

# Role Management

Owners should be able to change:

```text
admin ↔ member
```

Owners may promote:

```text
admin/member → owner
```

if implemented carefully.

If owner promotion is included, preserve last-owner protection.

Admins should NOT be allowed to:

```text
promote someone to owner
demote an owner
remove an owner
```

Keep ownership mutations owner-only.

---

# Last Owner Protection

An organization must always have at least one owner.

Reject any mutation that would result in zero owners.

Examples:

If there is only one owner:

```text
cannot remove them
cannot change them to admin
cannot change them to member
```

Server-side check is mandatory.

Do not rely on disabled UI alone.

---

# Self-Removal

Recommended behavior:

A non-owner may leave the organization.

An owner may leave only if another owner remains.

If implementing self-removal complicates scope unnecessarily, owner-controlled removal alone is acceptable for this phase, but document the choice.

Do not allow accidental orphaned organizations.

---

# Member Removal

Owner:

```text
can remove admin/member
can remove another owner only if at least one owner remains
```

Admin:

Recommended for Phase 5.2:

```text
can remove member
cannot remove admin
cannot remove owner
```

Member:

```text
cannot remove anyone
```

Use server-side authorization.

---

# Invitation Management

Owner/admin may:

```text
create invitation
revoke pending invitation
```

Do not allow accepted invitations to be "revoked" as a substitute for removing membership.

Once accepted:

```text
membership
```

is authoritative.

---

# API / Server Actions

Use the style already established in the application.

Conceptually add:

```text
GET  /api/organizations/[slug]/members
POST /api/organizations/[slug]/members/invitations

PATCH/DELETE
/api/organizations/[slug]/members/[memberId]

DELETE
/api/organizations/[slug]/members/invitations/[invitationId]

GET/POST
/api/organization/invite/[token]
```

Exact route shape may vary if a cleaner Next.js structure fits the codebase.

Keep authorization in server-side helpers.

---

# Authorization Helpers

Extend or introduce a clean organization authorization layer.

Avoid scattering role checks like:

```ts
if (role === "owner" || role === "admin")
```

through dozens of routes.

Prefer explicit helpers such as:

```ts
canInviteMembers(role)
canManageMember(actorRole, targetRole)
canChangeRole(actorRole, targetRole, nextRole)
```

Keep policy testable independently.

---

# Scenario / Assessment Permissions

Do not regress existing permissions.

After joining as:

```text
admin
```

the new user should immediately be able to:

- create assessments
- invite candidates
- manage scenarios

After joining as:

```text
member
```

the user should be able to:

- view organization
- view assessments/results
- view published scenario details

but not mutate them.

This is an important integration check.

---

# Navigation

Users belonging to an organization should continue seeing:

```text
Organizations
```

in global navigation.

No new global navigation is needed.

Within an organization dashboard provide:

```text
Assessments
Scenarios
Members
```

or equivalent clean navigation.

---

# Privacy

Organization invitations are private.

Another organization member must not be able to retrieve invitations belonging to a different organization.

Candidate users who are not members must not gain organization access merely because they completed an assessment for that company.

This distinction is critical:

```text
AssessmentCandidate
!=
OrganizationMember
```

Completing an assessment never creates organization membership.

---

# Candidate Invitations vs Organization Invitations

Keep these concepts separate:

```text
assessment_candidates
→ people taking hiring assessments

organization_invitations
→ people joining the hiring/company team
```

Do not reuse `assessment_candidates` for team membership.

Shared token/security helpers are fine.

Shared domain tables are not.

---

# Existing Owner Migration

Existing organizations already have creator owners.

No membership migration should be necessary beyond the current data model unless schema changes require it.

Preserve existing owners.

---

# Tests

Add comprehensive coverage.

At minimum:

## Invitation creation

Owner can invite member.

## Admin invitation

Admin can invite member/admin.

## Member invitation denied

Member cannot invite.

## Owner role invitation

Invitation directly to owner is rejected.

## Token security

Plaintext token is not stored.

## Duplicate invite

Same org/email active invite rejected.

## Cross-org invite independence

Same email may be invited separately by different organizations.

## Existing member

Cannot invite existing member.

## Invalid token

Fails safely.

## Expired invitation

Cannot accept.

## Revoked invitation

Cannot accept.

## Email mismatch

Signed-in user with different verified email cannot accept.

## Acceptance

Matching user creates membership.

## Acceptance atomicity

Invitation becomes accepted and membership exists together.

## Double acceptance

Does not create duplicate membership.

## Accepted invite expiry

Already-accepted membership remains valid after token expiry.

## Role permissions

Owner/admin/member permission matrix works.

## Admin cannot manage owner

Admin cannot remove/demote owner.

## Admin cannot manage admin

If following the recommended policy, admin cannot remove another admin.

## Owner can change member role

Owner can promote/demote according to policy.

## Last owner

Last owner cannot be removed.

## Last owner demotion

Last owner cannot be demoted.

## Multiple owners

One owner may be removed/demoted if another remains.

## Member removal

Removal removes only membership, not user's account/history.

## Cross-org privacy

Org A cannot list/modify Org B members/invitations.

## Assessment-candidate separation

Candidate completion does not grant organization membership.

## Admin integration

New admin can create assessment/scenario.

## Member integration

New member can view but not mutate assessment/scenario.

## Regression

All Phase 0–5.1 tests remain green.

---

# Manual Flow A — Invite Admin

1. Owner opens Members page.
2. Invite second user as Admin.
3. Copy invitation link.
4. Open isolated session.
5. Sign in as invited email.
6. Accept.
7. Confirm Admin appears in Members page.
8. Confirm admin can create an assessment/scenario.

---

# Manual Flow B — Invite Member

1. Invite user as Member.
2. Accept invitation.
3. Confirm member can view organization.
4. Confirm member can view assessments/results.
5. Confirm mutation controls are absent.
6. Direct API mutation attempts must also fail.

---

# Manual Flow C — Role Change

1. Owner changes Member → Admin.
2. User gains mutation permissions.
3. Owner changes Admin → Member.
4. Mutation permissions disappear.

Verify without requiring account recreation.

---

# Manual Flow D — Last Owner

1. Organization has one owner.
2. Attempt owner demotion.
3. Reject.
4. Attempt owner removal.
5. Reject.
6. Promote another user to owner.
7. Demote/remove original owner.
8. Succeeds.

---

# Manual Flow E — Invitation Security

1. Create invitation.
2. Try accepting from wrong-email account.
3. Reject.
4. Expire/revoke invitation.
5. Correct-email account cannot accept expired/revoked invitation.
6. Create fresh invite.
7. Correct user accepts.
8. Token expiry afterward does not affect membership.

---

# Documentation

Update `docs/architecture.md` with:

```text
Organization
OrganizationMember
OrganizationInvitation
AssessmentCandidate
```

Explicitly document:

> Assessment candidates and organization members are independent relationships.

Add membership flow:

```text
Organization Owner/Admin
        ↓
Invite by Email
        ↓
Opaque Invite Token
        ↓
Authenticated Matching User
        ↓
OrganizationMember
```

Document role matrix.

Document last-owner invariant.

---

# Important Constraints

Do NOT build:

- teams
- departments
- seat billing
- subscriptions
- enterprise SSO
- SAML
- SCIM
- domain auto-join
- Slack integration
- email provider
- custom permissions
- audit-log product
- organization deletion

This phase is membership collaboration only.

---

# Validation

Run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass.

Do not weaken existing tests.

---

# Completion Report

Return:

1. files created/modified
2. schema changes
3. invitation model
4. token implementation
5. invitation expiry/revocation model
6. acceptance flow
7. email-matching behavior
8. role permission matrix
9. role-change implementation
10. last-owner protection
11. member removal
12. Members UI
13. authorization/privacy boundaries
14. assessment/scenario integration
15. tests added
16. total tests
17. typecheck/lint/test/build results
18. Manual Flow A
19. Manual Flow B
20. Manual Flow C
21. Manual Flow D
22. Manual Flow E
23. deviations
24. product/UX concerns

Do not begin Phase 6.

Stop after Phase 5.2 is complete.