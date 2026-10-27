# Phase 10A Browser QA — Defects Found and Fixed

Two real, previously-shipped defects were caught during live QA (not by the automated test suite, which only exercises function-level return values, not full UI→API→UI round trips). Both were fixed and re-verified live before being marked PASS in `user_story_matrix.md`.

## Defect 1 — Invite link never surfaced when email delivery fails (found during QA-02)

**Symptom**: When `createOrganization`, `resendOwnerInvite`, or `inviteOwnerRecovery` is called and Resend fails to deliver the invite email (e.g. a non-whitelisted test address, or any real transient delivery failure), the admin UI reported "email delivery failed" but never showed the invite link anywhere. Since this codebase never persists a plaintext invite token (only its SHA-256 hash, by design), this made the invitation **permanently unusable** — there was no way for the admin to manually relay the link to the intended owner.

**Root cause**: All three admin routes (`POST /api/admin/organizations`, `owner-invite/resend`, `owner-invite/recovery`) computed the token internally (via `organization-provisioning.ts`) but stripped it from their JSON response before returning to the client. `ResendOwnerInviteResult`/`InviteOwnerRecoveryResult`'s types didn't even include `token`, so it wasn't available to return.

**Fix**: Widened `ResendOwnerInviteResult`/`InviteOwnerRecoveryResult` to include `token: string`; added `inviteUrl` to all three routes' JSON responses (using the existing `appBaseUrl()` helper); updated `new-organization-form.tsx` and `organization-actions.tsx` to display the link whenever `emailSent: false` — mirroring the existing, correct `InviteAdminForm`/`InviteMemberForm` convention that this new admin-organization UI had missed.

**Verification**: Live-reproduced via "Resend Owner Invite" on a real suspended-pending org; link now correctly resolves to a working 43-character token and the subsequent accept flow (QA-03) succeeded using exactly that link.

## Defect 2 — Invite-preview page never displays "Owner" role label (found during QA-03)

**Symptom**: The invite landing page (`/organization/invite/[token]`) showed a blank "ROLE:" line for any owner-role invitation.

**Root cause**: `org-invite-acceptance.tsx`'s `InvitePreview.role` client-side type and `ROLE_LABEL` display map were still `"admin" | "member"` only — never widened when Phase 10A's `createOrgInvitation` started permitting `role: "owner"`. The server-side preview route (`GET /api/organization/invite/[token]`) always correctly returned the real role; only the client's display map was stale, so `ROLE_LABEL["owner"]` silently evaluated to `undefined`.

**Fix**: Widened both the type and the map to include `"owner": "Owner"`.

**Verification**: Live-reproduced on both Acme's (QA-03) and Globex's (QA-04) owner invitations; both now correctly show "ROLE: OWNER".

## Non-defects investigated and dismissed

- Two stale dev-server processes serving pre-fix code were found and killed mid-session (restarted cleanly) — an environment artifact, not a product defect.
- `authProviderId` appearing in the candidate-detail API payload (QA-15) was flagged as worth noting but is pre-existing architecture (Clerk identity linkage), not a Phase 10A regression — out of scope for this QA pass.
