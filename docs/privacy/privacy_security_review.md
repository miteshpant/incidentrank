# Privacy/Security Review — Phase 10D

Independent grep-based sweep per `docs/implementation_plan/phasse10d.md` §76, covering `apps/web/src` and `packages/*/src`. Searched for: email, name, token, secret, stripe, clerk, assessment, candidate, report, rank, referral, invite, ip, userAgent, authorization, cookie. Cross-referenced against `docs/privacy/data_inventory.md`, `docs/privacy/data_retention.md`, and `docs/privacy/service_providers.md`, but this is a fresh audit pass, not a restatement of those docs.

Findings are classified `BLOCKER | FIXED | ACCEPTED_FOR_BETA | DEFERRED` per §76.

## 1. Secret/token/credential logging to console

No console call anywhere in non-test code logs a secret, token, or credential.

- `apps/web/src/lib/server/email/test-email-service.ts` — the no-op email adapter (selected when `RESEND_API_KEY` is unset) logs only non-sensitive identifiers (org name, pass count, reason) — never a raw email or invite URL/token. This was an identified-and-fixed issue from Batch 1 of this phase (see completion report). **FIXED**.
- `apps/web/src/app/api/attempts/[attemptId]/{resume,runtime,advance,finish,actions}/route.ts` — log only `attemptId` and a generic failure-reason string. **ACCEPTED_FOR_BETA** (no PII/secret, low-value cleanup only).

## 2. PII (email/name) stored unnecessarily or duplicatively

- `users` table confirmed to still have no email column (`packages/db/src/schema.ts:237-250`) — matches the documented minimization decision, unchanged by this phase.
- Email columns that do exist (`organizationInvitations.email`, `assessmentCandidates.email`, `adminInvites.email`, `promotionalInvites.email`, `organizationStripeCustomers.billingEmail`) are all pre-account-existence invite/billing records with no `userId` to join on yet, or Stripe billing-contact fields distinct from any user identity. None duplicate a per-user email. **NOT_AN_ISSUE**.
- **Found and fixed during this review**: `GET /api/organization/invite/[token]` (the unauthenticated org-invite preview route) returned the invitee's raw `email` in its JSON response, even though the client (`org-invite-acceptance.tsx`) never rendered it — the actual email match happens server-side against Clerk's verified email on accept, not from this preview payload. Low exploitability (gated by possession of a random 32-byte bearer token), but unnecessary exposure. **FIXED** — removed `email` from the route's response and from the client's `InvitePreview` type; re-validated (typecheck/lint clean, no test depended on the field).

## 3. Admin/org audit logs — raw secrets in metadata

Every `logAdminAction`/`logOrgAuditEvent` call site was inspected. All metadata payloads are non-sensitive (`{quantity, reason}`, `{role}`, `{rankBand, qualifyingAttempts}`, `{resend: true}`, Stripe's own non-secret session/payment-intent ids as references, not credentials). No call site passes a raw token, token hash, or referral code.

- `organization-provisioning.ts` (3 call sites) and `admin-users/invitations/route.ts` explicitly removed email duplication from audit metadata during Batch 1 of this phase, with inline comments explaining why (the email is already resolvable from the linked invitation row). **FIXED**.
- `admin/privacy-requests/privacy-requests-view.tsx` logs only `{ count: requests.length }` when the list is viewed — never a request's `notes` content. **FIXED** (built correctly from the start, per design).

## 4. New Phase 10D modules — same checks applied directly

`legal-acceptance.ts`, `legal-gate.ts`, `privacy-requests.ts`, `account-deletion.ts`, the `/legal/accept` and `/settings/privacy` pages, `api/privacy-requests`, `api/account/delete`, `assessment-landing.tsx`'s notice UI, and `org-invite-acceptance.tsx`'s business-terms UI were all reviewed in full.

- `recordLegalAcceptance` never accepts a client-supplied version string — always derived from `legal-versions.ts`'s own constants; `userId` always server-derived from the authenticated session, never from a request body, across every new route (`/api/legal/accept`, `/api/privacy-requests`, `/api/account/delete`, `/api/assessment/[assessmentId]/notice/accept`). **NOT_AN_ISSUE**.

## 5. Account-deletion anonymization — reversibility/bypass analysis

**Confirmed genuinely non-reversible and non-bypassable.**

`deleteOwnAccount` (`account-deletion.ts`) scrambles `authProviderId` to `anonymized_deleted-<internal-uuid>`. `getOrCreateCurrentUser()` (`current-user.ts`) is the only place `authProviderId` is ever written from an external source, and it is always Clerk-derived (`auth()`'s own `userId`), never client-supplied. Real Clerk ids always have the form `user_...`; the anonymized sentinel can never collide with one, and Clerk never reissues a deleted account's old id to a new signup. A re-signup after deletion always creates a genuine new row — the deleted identity can never be resurrected. Verified against `account-deletion.test.ts`'s 5 passing cases (anonymization is transactional; org membership, attempts, and legal acceptances remain, re-pointed at the same row; a completed `privacy_requests` row is written synchronously). **FIXED** (built and verified secure).

## 6. Cookie-setting code

Zero hits for `cookies()`, `Set-Cookie`, `document.cookie`, or any `NextResponse.cookies` call anywhere in this codebase. The app sets no cookies of its own — it relies entirely on Clerk's own middleware/session cookie, set internally by the `@clerk/nextjs` package. **NOT_AN_ISSUE**.

## 7. userAgent / IP capture

No request handler anywhere reads a `user-agent` header, `x-forwarded-for`, or any IP/device-fingerprint value. The only matches for these terms are fictional scenario-simulation narrative text (e.g. `bot-traffic-surge`, `abuse-prevention-false-positive-storm` — incident-simulation story content, not real data collection), the schema's own "deliberately no IP/device-fingerprint column" comment, and the Privacy Policy's own text asserting this. `data_inventory.md`'s claim that no IP/device data is collected remains accurate after this phase's additions. **NOT_AN_ISSUE**.

## 8. `privacy_requests.notes` content hygiene

Single write path end-to-end: `POST /api/privacy-requests` truncates `notes` to 500 characters server-side regardless of client input, and the only UI producer (`privacy-request-form.tsx`) is a plain free-form textarea, also capped client-side. The self-service deletion path never passes `notes` at all. No code path dumps a stack trace, request body, or any derived/sensitive content into this field. **FIXED** (built correctly from the start, per design).

## Summary

| Area | Verdict |
|---|---|
| Console/log secret leakage | FIXED (one real issue found and fixed in Batch 1) |
| `users` table PII minimization | NOT_AN_ISSUE (unchanged, confirmed) |
| Org-invite preview email over-exposure | FIXED (found and fixed during this review) |
| Admin/org audit metadata | FIXED (email duplication removed in Batch 1; new privacy-request logging built clean) |
| New Phase 10D modules (acceptance/privacy-request/deletion routes) | NOT_AN_ISSUE — server-derived identity throughout |
| Account-deletion anonymization security | FIXED — confirmed non-reversible/non-bypassable |
| Cookies | NOT_AN_ISSUE — none set by this app |
| IP/userAgent collection | NOT_AN_ISSUE — none collected |
| `privacy_requests.notes` hygiene | FIXED — truncated, never carries sensitive content |

**No BLOCKER-level findings.** No items are deferred from this sweep.
