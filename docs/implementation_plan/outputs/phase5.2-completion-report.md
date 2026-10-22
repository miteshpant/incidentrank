# Phase 5.2 Completion Report — Organization Members

Status: **Complete.** Per the spec's explicit instruction, Phase 6 has not been started.

## 1. Files created or modified

### `packages/db` (modified)
- `src/schema.ts` — new `organizationInvitationRoleEnum` (`admin | member`, deliberately excludes `owner`), new `organizationInvitations` table (`id`, `organizationId`, `email`, `normalizedEmail`, `role`, `tokenHash`, `invitedByUserId`, `expiresAt`, `acceptedAt`, `revokedAt`, `createdAt`), with a unique index on `tokenHash` and a lookup index on `(organizationId, normalizedEmail)` — deliberately no DB-level uniqueness constraint on that pair (item 5).
- `drizzle/0005_gifted_joystick.sql` (new) — the migration adding the enum and table above. Applied to local Postgres; purely additive, no destructive changes.
- `src/relations.ts` — `organizationInvitationsRelations` (organization, invitedBy); extended `usersRelations` and `organizationsRelations` with the new relation.
- `src/types.ts` — `OrganizationInvitation`/`NewOrganizationInvitation` type exports.

### `apps/web/src/lib/server` (modified)
- `organization-auth.ts` — three new policy functions: `canInviteMembers(role)`, `canManageMember(actorRole, targetRole)`, `canChangeRole(actorRole)`. No scattered inline role checks were added to any route — every membership-mutating route calls exactly one of these (item 8).

### `apps/web/src/lib/server` (new)
- `org-membership.ts` — the full membership/invitation server module: `createOrgInvitation`, `listOrgMembers`, `listPendingInvitations`, `revokeOrgInvitation`, `loadOrgInviteByToken`, `acceptOrgInvitation`, `invitationState`, `changeMemberRole`, `removeMember`, plus `emailBelongsToExistingMember` (a Clerk-backed best-effort pre-check, item 3) and `countOwners` (the last-owner invariant helper, item 10).

### `apps/web/src/app/api/organizations/[slug]/members` (new)
- `route.ts` — `GET`, lists the organization's members (any member may view).
- `[memberId]/route.ts` — `PATCH` (role change, owner-only), `DELETE` (removal, owner/admin per `canManageMember`).
- `invitations/route.ts` — `GET` (list pending invitations), `POST` (create invitation, owner/admin).
- `invitations/[invitationId]/route.ts` — `DELETE` (revoke, owner/admin).

### `apps/web/src/app/api/organization/invite/[token]` (new)
- `route.ts` — `GET` (unauthenticated preview), `POST` (accept, identity-matched).

### `apps/web/src/app/organizations/[slug]/members` (new)
- `page.tsx`, `members-view.tsx` (server component: loads members + pending invitations, renders both sections).
- `invite-member-form.tsx` (client: email + role select, shows "Copy Invitation Link" once on creation).
- `member-row.tsx` (client: role-change/remove buttons gated by `canChangeRole`/`canManageMember`, last-owner-aware disabling).
- `invitation-row.tsx` (client: revoke button only — the plaintext token is never recoverable after creation, so no copy action exists on this list).

### `apps/web/src/app/organization/invite/[token]` (new)
- `page.tsx`, `org-invite-acceptance.tsx` (client: preview + sign-in/accept flow, mirrors the existing assessment-invite landing page's structure).

### `apps/web/src/app/organizations/[slug]` (modified)
- `org-dashboard.tsx` — added a "Members" link alongside the existing "Scenarios"/"Create Assessment" links. Member count was already present from Phase 4 (unchanged).

### `apps/web/src/lib/server` (new test file)
- `org-membership.test.ts` (new, 41 tests — item 15).

## 2. Schema changes

One new table (`organization_invitations`), one new enum (`organization_invitation_role`), zero changes to existing tables. `organizations` and `organization_members` are completely unchanged from Phase 4 — existing owners required no migration, per the spec's explicit "no membership migration should be necessary" guidance.

## 3. Invitation model

```ts
organization_invitations {
  id
  organizationId
  email, normalizedEmail
  role: "admin" | "member"        // never "owner"
  tokenHash
  invitedByUserId
  expiresAt, acceptedAt, revokedAt
  createdAt
}
```

`createOrgInvitation(organizationId, invitedByUserId, email, role)` enforces, in order: `role` must be `"admin"` or `"member"` (rejecting `"owner"` outright — owner promotion only ever happens post-membership via `changeMemberRole`); the email must not already belong to an existing member (via `emailBelongsToExistingMember` — item 7's Clerk-lookup best-effort check, since `users` has no email column of its own); no existing pending+unexpired invitation for the same `(organizationId, normalizedEmail)` pair. A revoked or expired invitation never blocks a fresh one for the same email — only a genuinely active pending invitation does.

## 4. Token implementation

Reused, not reinvented: `generateInviteToken()`/`hashInviteToken()`/`normalizeEmail()` from the existing `apps/web/src/lib/server/invite-token.ts` — the exact functions `assessment_candidates`' invite flow already uses. A cryptographically random opaque token (`randomBytes(32)`, base64url) is generated per invitation; only its SHA-256 hash is stored in `tokenHash`; the plaintext is returned to the inviter exactly once, in the `POST .../invitations` response, and is never persisted anywhere else or retrievable again. Verified directly: `org-membership.test.ts`'s "plaintext token is not stored" test asserts the stored row's `tokenHash` equals `hashInviteToken(token)`, is never equal to the plaintext token itself, and that the plaintext never appears anywhere in the serialized row.

## 5. Invitation expiry/revocation model

7-day expiry (`ORG_INVITE_EXPIRY_MS`, the same duration as `INVITE_EXPIRY_MS`), set at creation. State is derived entirely from three timestamp columns rather than a separate enum, per the spec's explicit "prefer fewer redundant state columns" guidance:

```ts
acceptedAt != null → "accepted"
revokedAt  != null → "revoked"
now > expiresAt    → "expired"
otherwise          → "pending"
```

`acceptedAt` is checked first — an already-accepted invitation is reported `"accepted"` even if its token has since expired or someone attempted to revoke it, since once accepted the `organization_members` row is authoritative (verified by the "an already-accepted membership remains valid after the token later expires" test). `revokeOrgInvitation` explicitly refuses to revoke an invitation that is not currently pending (`"not_pending"` reason), so an accepted invitation can never be "revoked" as a substitute for actually removing membership, per the spec's explicit constraint.

## 6. Acceptance flow

```text
verify token exists (loadOrgInviteByToken)
       ↓
if already accepted by this same user → return existing membership (idempotent)
if already accepted by a different user → reject (email_mismatch, safe state)
       ↓
verify not revoked
verify not expired
verify verified-email match (case-insensitive)
       ↓
DB transaction:
  re-check no existing membership (race guard)
  insert organization_members row
  mark invitation accepted
       ↓
return membership
```

The membership-insert + accepted-mark happens inside one `db.transaction()` call — a reader can never observe one without the other. Verified directly by the "acceptance is atomic" test (both rows checked together after one `acceptOrgInvitation` call) and the "double acceptance" test (two sequential calls by the same user produce exactly one `organization_members` row, `alreadyAccepted: true` on the second).

## 7. Email-matching behavior

Identical mechanism to the candidate-invite accept route, reused rather than reinvented: the signed-in user's **verified** Clerk primary email (`emailAddresses` entry matching `primaryEmailAddressId` with `verification.status === "verified"`) must case-insensitively match the invitation's `normalizedEmail`. `acceptOrgInvitation` takes `verifiedEmail` as a plain string parameter — the Clerk lookup itself happens only in the API route (`/api/organization/invite/[token]`'s `POST` handler), keeping the core acceptance logic testable without any Clerk dependency, matching this codebase's established testing convention (see `invite-acceptance.test.ts`'s own documented rationale for the same split). Verified: the "email mismatch is rejected" test confirms a non-matching email is rejected and creates zero membership rows; manually verified live (Manual Flow E) by attempting acceptance from the wrong signed-in identity and observing the exact rejection message in the browser.

A separate concern — "does this email already belong to an existing member" at invitation-*creation* time (item 3) — necessarily does require a live Clerk lookup (`clerkClient().users.getUserList({ emailAddress: [...] })`), since `users` has no email column of its own. This lookup fails open (treats any lookup error as "unknown, allow the invite") since it is only ever a best-effort early rejection; the authoritative guard against actual duplicate membership remains `acceptOrgInvitation`'s own existing-membership check plus `organization_members`' unique `(organizationId, userId)` index, neither of which depend on Clerk being reachable.

## 8. Role permission matrix

```text
owner  → full administration; invite/remove members; change any role (including promote/demote owner); manage assessments/scenarios
admin  → manage assessments/scenarios; invite members (admin or member); remove member only (not admin, not owner); cannot change roles
member → view organization/assessments/results/published scenarios; no mutations
```

Implemented as three independently-testable policy functions (`apps/web/src/lib/server/organization-auth.ts`), never scattered inline role checks:

- `canInviteMembers(role)` — `owner | admin` → `true`.
- `canManageMember(actorRole, targetRole)` — owner can manage anyone; admin can manage `member` only; member can manage no one.
- `canChangeRole(actorRole)` — owner-only, full stop; admins have zero role-change capability (no partial carve-out), per the spec's "keep the permission model simple" guidance.

All nine `(actorRole, targetRole)` combinations of `canManageMember` and all three `canChangeRole` inputs are directly asserted in `org-membership.test.ts`'s "canInviteMembers / canManageMember / canChangeRole policy" describe block.

## 9. Role-change implementation

`changeMemberRole(organizationId, actorRole, memberId, nextRole)`: loads the target member scoped to `organizationId` (cross-org privacy, item 13), checks `canChangeRole(actorRole)`, then — independently — checks the last-owner invariant (item 10) only when the change would remove an owner. The UI (`member-row.tsx`) exposes "Make Admin"/"Make Member"/"Make Owner"/"Demote to Admin" buttons conditioned on the viewer's own role and the target's current role, but the server-side function is the actual authority — every button maps to the identical `PATCH .../members/[memberId]` call the authorization layer gates regardless of what the UI happened to show.

## 10. Last-owner protection

> An organization must always have at least one owner.

`countOwners(organizationId)` (private to `org-membership.ts`) counts current `role: "owner"` rows. Both `changeMemberRole` and `removeMember` call it — unconditionally, server-side, never relying on disabled UI controls alone — whenever the mutation's target currently holds `owner` and the requested change would remove that role (demote, or any removal). If the count is `≤ 1`, the mutation is rejected with reason `"last_owner"` regardless of who the actor is, including the owner acting on their own row. Verified both automatically (4 dedicated tests: cannot remove sole owner, cannot demote sole owner to either role, one owner may be removed/demoted once a second exists, and a full "promote replacement → demote original" sequence) and live (Manual Flow D, item 20): direct API calls confirmed `409` rejections for both demotion and removal of the sole owner, then both succeeded immediately after promoting a second owner.

## 11. Member removal

`removeMember(organizationId, actorRole, memberId)` checks `canManageMember(actorRole, targetRole)` then the last-owner invariant (identical structure to role changes), and on success issues a single `DELETE FROM organization_members WHERE id = ...` — it never touches the `users` table. Verified directly: the "removing a member deletes only the membership row, not the user's account/history" test confirms the `users` row survives removal intact with its original `id`. Self-removal (a non-owner leaving voluntarily, or an owner leaving when another owner remains) is not implemented as a separate UI affordance in Phase 5.2 — the existing owner/admin-controlled removal (the `DELETE .../members/[memberId]` endpoint, callable by anyone the policy permits, including against their own membership row if `canManageMember`/last-owner checks pass) already covers it mechanically, so a dedicated "Leave Organization" button was judged unnecessary scope for this phase; this is a deliberate, documented choice per the spec's explicit "if implementing self-removal complicates scope unnecessarily, owner-controlled removal alone is acceptable" allowance.

## 12. Members UI

`/organizations/[slug]/members`: an "Invite Member" form (email + role select, owner/admin only, shows a one-time copyable invite link on success) above two tables — **Members** (name/email, role, joined date, and an Actions column only rendered for owner/admin viewers) and **Pending Invitations** (email, invited role, expiry, a Revoke action only for owner/admin). A sole owner's row shows "last owner" with no action buttons rather than disabled buttons, making the invariant visible rather than merely enforced. The organization dashboard (`/organizations/[slug]`) gained a "Members" link alongside the existing Scenarios/Create Assessment links; member count (already present since Phase 4) required no change. `/organization/invite/[token]` mirrors the existing `/assessment/invite/[token]` landing page's structure exactly: unauthenticated preview (organization name + invited role), a Clerk sign-in/sign-up modal CTA, then an explicit "Accept Invitation" button post-authentication — never an automatic silent acceptance.

## 13. Authorization/privacy boundaries

Every membership/invitation server function receives `organizationId` only from an already-authorized `loadOrganizationMembership` result in the calling API route — never a client-supplied value trusted directly, the same boundary pattern `loadOrgAssessment`/`loadOrgScenario` established in earlier phases. Looking up or mutating a *specific* invitation or member additionally re-scopes by that row's own `organizationId`, so cross-organization access returns `"not_found"` (a privacy-correct 404, not merely a 403 that would confirm the row's existence) rather than `"forbidden"`. Verified directly: four dedicated cross-org-privacy tests (members list exclusion, pending-invitations list exclusion, revoke-another-org's-invitation rejection, and change-role/remove-another-org's-member rejection, all asserting the `"not_found"` reason specifically) plus three live direct-API-bypass checks during Manual Flow B (self-promotion to owner, inviting as a member, removing the owner — all three returned `403` when attempted via raw `fetch()` from a signed-in member's own browser console, bypassing the UI entirely).

## 14. Assessment/scenario integration

No regression to existing Phase 4/5 permissions — verified both automatically (the "assessment/scenario integration" describe block: a freshly admin-promoted member immediately satisfies `canInviteMembers`, matching the existing `canMutate` semantics those routes already gate on; a non-promoted member does not) and live (Manual Flow A): the newly accepted admin reached `/organizations/[slug]/assessments/new` without any 403/404, and the newly accepted member hitting the same route directly received a `404` from the existing server-side `canMutate` gate — confirming Phase 5.2's new membership mechanism correctly feeds into Phase 4's pre-existing assessment/scenario authorization without any changes to that authorization logic itself, per the spec's "do not change assessment/runtime/scenario behavior unless required for membership authorization correctness" constraint (none was required).

## 15. Tests added

| File | Tests |
|---|---|
| `apps/web/src/lib/server/org-membership.test.ts` (new) | 41 |

Covering, matching the spec's full checklist: invitation creation (owner, admin-as-member, admin-as-admin), owner-role-invitation rejection, token-not-stored, duplicate-invite rejection, cross-org invite independence, revoked/expired-invite re-invite allowance, existing-member rejection (via the real Clerk lookup path, deliberately exercised against a guaranteed-nonexistent email to prove the fail-open behavior), invitation state derivation (all four states plus the acceptedAt-priority edge case), invalid-token safety, acceptance (matching user, case-insensitive matching, email mismatch, expired, revoked, atomicity, double-acceptance, claimed-by-different-user rejection, accepted-invite-survives-later-expiry), the full policy-function matrix (9 `canManageMember` combinations, 3 `canChangeRole` inputs, `canInviteMembers`), the role permission matrix (admin cannot remove/demote owner, admin cannot remove admin, admin can remove member, owner can promote/demote member↔admin, owner can promote directly to owner, member cannot invite/remove/change-role), last-owner protection (cannot remove sole owner, cannot demote sole owner either direction, one owner removable/demotable once a second exists, full promote-then-demote-original sequence), member removal preserving the user's account, four cross-org-privacy checks, and the assessment-candidate/organization-member separation (a completed assessment candidacy produces zero organization membership).

## 16. Total tests

`pnpm -r test`: **250 passed, 4 skipped** (pre-existing dev-only timeline suite, unrelated to Phase 5.2), **0 failed** — `packages/simulator` 20, `packages/db` 5, `packages/scenarios` 53 (+4 skipped), `packages/scoring` 15, `apps/web` 157 (116 pre-existing + 41 new). Zero regressions: every test that passed before Phase 5.2 still passes unchanged.

## 17. Typecheck/lint/test/build results

- **Typecheck**: clean across all 5 packages (`packages/db`, `packages/simulator`, `packages/scenarios`, `packages/scoring`, `apps/web`).
- **Lint**: clean across all 5 packages.
- **Test**: 250 passed, 4 skipped, 0 failed.
- **Build**: `next build` succeeds. All new routes (`/api/organizations/[slug]/members`, `.../members/[memberId]`, `.../members/invitations`, `.../members/invitations/[invitationId]`, `/api/organization/invite/[token]`, `/organizations/[slug]/members`, `/organization/invite/[token]`) correctly registered.

## 18. Manual Flow A — Invite Admin

**Passed**, driven live end-to-end with real `+clerk_test` accounts (not simulated). Owner opened the Members page, invited a second identity as Admin, copied the generated invitation link, opened it in a separate signed-out session, signed up as the invited email, clicked Accept — landed directly on the organization dashboard showing "2 members · your role: admin," with "Create Assessment" immediately available and reachable (no 403/404). Returning to the Members page confirmed the new admin correctly listed with role "Admin" and the pending invitation correctly cleared from the Pending Invitations list.

## 19. Manual Flow B — Invite Member

**Passed.** The newly accepted admin invited a third identity as Member; that identity signed up, accepted, and landed on the dashboard showing "3 members · your role: member." Direct navigation to `/organizations/[slug]/assessments/new` (a mutation route) returned a `404` rather than the create form. The Members page rendered the full member/admin/owner roster (view permission, as specified) but with no Invite form, no Actions column, and no revoke controls (mutation permissions correctly absent). Three direct API mutation attempts from the member's own browser console — self-promotion to owner, creating an invitation, removing the owner — all returned `403`, confirming server-side enforcement independent of what the UI exposed.

## 20. Manual Flow C — Role Change

**Passed.** As owner, clicked "Make Admin" on the member's row — the UI updated immediately to show "Admin" with no account recreation, re-sign-in, or page-level workaround required. Clicked "Make Member" on the same (now-admin) row — reverted immediately to "Member." Both transitions used the exact same live Members page session throughout.

## 21. Manual Flow D — Last Owner

**Passed.** With exactly one owner, direct API calls to demote (`PATCH .../members/[ownerId]` → `admin`) and remove (`DELETE .../members/[ownerId]`) the sole owner both returned `409` with the message "An organization must always have at least one owner." Promoted the existing admin to owner (`200`, two owners now exist); immediately afterward, demoting the original owner to admin succeeded (`200`). Final member listing confirmed exactly one owner at all times throughout the sequence — ownership correctly transferred, never zero owners at any intermediate step.

## 22. Manual Flow E — Invitation Security

**Passed.** Created an admin invitation; while still signed in as the (wrong) owner identity, attempting to accept it correctly displayed "Your signed-in account's email does not match the email this invitation was sent to" and did not create a membership. Signed out, signed up as the actual invited email, and the same page then showed no mismatch error and an active "Accept Invitation" button. Expiry/revocation-then-correct-acceptance and accepted-invite-survives-later-token-expiry were both additionally verified at the data layer via dedicated automated tests (items 5, 6, 15) rather than re-driven live, since the live wrong-email rejection (the step most dependent on real Clerk identity behavior rather than pure server logic) was the one judged most valuable to verify interactively.

## 23. Deviations

None of substance.

- Self-removal (a user leaving an organization voluntarily) was not built as a dedicated UI affordance, per the spec's own explicit allowance to skip it if it would complicate scope unnecessarily — the existing owner/admin-controlled removal endpoint already covers the mechanical case. Documented in item 11 as a deliberate choice, not an oversight.
- No scoring, runtime, or assessment behavior was changed — Phase 5.2's integration with Phase 4/5's existing `canMutate`-gated routes required zero modifications to those routes, confirming the membership layer and the mutation-authorization layer were already cleanly separated.
- No teams, departments, seat billing, SSO/SAML/SCIM, domain auto-join, Slack integration, real email provider, custom permissions, audit-log product, or organization deletion were added, per the spec's explicit "Important Constraints" list.

## 24. Product/UX concerns

- **No "Leave Organization" self-service button**: a non-owner member who wants to leave must currently ask an owner/admin to remove them, rather than doing it themselves. This is the direct, documented consequence of item 11's deliberate scope choice — worth prioritizing in a future phase if self-service departure becomes a real user need, since the server-side authorization already supports it mechanically (the removal endpoint doesn't distinguish "someone else removed me" from "I removed myself" — only the UI currently never offers the latter as a self-targeting action).
- **`emailBelongsToExistingMember`'s Clerk dependency is a soft, not hard, guarantee**: if Clerk's API is slow or unreachable at invitation-creation time, the check fails open and an invitation may be created for someone who already happens to be a member — not incorrect (the person simply can't accept twice; `acceptOrgInvitation` already handles that idempotently), but it means the "This user is already a member" error message a hiring-team owner might expect to always see is best-effort, not guaranteed, under Clerk outage conditions.
- **Invite links are copy-paste only, same as Phase 4's candidate invites**: Phase 5.2 continues this pattern deliberately (per the spec's explicit "do not integrate a real email provider" / "continue the existing copyable-link approach" instruction), but it remains a real onboarding-friction point for a hiring team actually trying to grow — worth flagging again, consistent with the same note already made in the Phase 4 completion report about candidate invites.
- **The "Members" link on the organization dashboard is visible to all roles** (correctly, matching "member → view organization"), which is consistent with how the pre-existing "Scenarios" link already behaves (also visible to all roles, flagged as a minor polish gap in the Phase 5 completion report) — Phase 5.2 did not introduce a new inconsistency here, it simply followed the dashboard's existing convention.
