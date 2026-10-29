# Phase 10D Completion Report — Privacy, Terms, Data Minimization & Consent

Phase 10D is complete: implemented, tested, live-browser-QA'd, fully validated, and documented. Binding spec: `docs/implementation_plan/phasse10d.md`. Approved plan: `/Users/miteshpant/.claude/plans/keen-painting-piglet.md`. This phase does not replace legal counsel — all legal text is an AI-assisted draft requiring attorney review before production beta (see "Legal review" section below).

## Data inventory

`docs/privacy/data_inventory.md` — a full field-by-field inventory covering identity, practice/assessment data, Engineer Rank/leaderboard, referrals, billing, audit/security, and the new legal/consent tables, each classified per the spec's taxonomy (`plaintext_required | encrypted_or_platform_protected | hashed | tokenized_external_reference | ephemeral_only | must_not_store`). Confirms `users` still has no email column (resolved live from Clerk by `authProviderId`), confirms Stripe minimization is clean (no raw amounts, no raw objects), and documents the referral-code plaintext-at-rest threat-model decision explicitly (not a bearer credential, re-display requirement makes hashing incompatible).

`docs/privacy/service_providers.md` — inventories the four real external processors (Clerk, Stripe, Resend, database hosting) plus an explicit "not in use" list (no analytics, advertising, session replay, or monitoring vendor exists anywhere in the codebase).

`docs/privacy/data_retention.md` — per-category retention policy, explicitly honest about what is manual-in-beta versus automated, with a dedicated section on the exact self-service account-deletion anonymization scope.

## Data minimization

- **Removed**: raw invite-URL/token/email logging from `test-email-service.ts` (the no-op email adapter now logs only non-sensitive identifiers); redundant raw-email duplication from 5 `logAdminAction`/`logOrgAuditEvent` call sites in `organization-provisioning.ts` and the admin-invite route (the email is already resolvable from the linked invitation row by its `targetId`); the unauthenticated organization-invite preview route's unused `email` field (found during the Batch 4 security review, confirmed the client never rendered it).
- **Deliberately not persisted** (confirmed, not newly built): raw card/CVC data, raw Stripe objects, IP addresses, device fingerprints, user-agent strings — none of these are collected or logged anywhere in the codebase, reconfirmed by an independent grep sweep in this phase.
- **Stripe minimization**: re-verified against current code (not just the Phase 10B report) — `webhook-handlers.ts` never reads or persists `amount_total`/`currency`/any raw line-item amount; every money-adjacent table contains only IDs, status enums, and timestamps.
- **Clerk minimization**: unchanged — `users` has no email column; every lookup resolves live via `authProviderId`, batched, never-throwing.
- **Logging changes**: see "Removed" above; `privacy_requests.notes` is server-truncated to 500 characters and only ever receives a short user-supplied string, never request bodies, stack traces, or derived sensitive content.

## Terms

- Version: `2026-10-v1` (`apps/web/src/lib/server/legal-versions.ts`'s `CURRENT_TERMS_VERSION`, the single source of truth every acceptance check compares against).
- Content: `apps/web/src/content/legal/terms.ts`, rendered at `/terms` as plain preformatted text (not parsed markdown/HTML — this is self-authored static content, avoiding an unnecessary dependency or injection surface). Covers eligibility (18+), beta-service language, individual/organization payment terms, content/IP ownership, acceptable use, disclaimers, and the employment-decision disclaimer required by §31. Contains explicit `[PLACEHOLDER]` markers for facts not yet known (legal entity name, effective date, governing law, support contact) rather than inventing them.
- **Acceptance flow**: fires once, at sign-up time only, for users created at or after a configurable cutover instant (`LEGAL_ACCEPTANCE_GATE_CUTOVER_AT`). A brand-new user is redirected to `/legal/accept` from the three "real product access" surfaces (`/profile`, `/organizations`, `/attempts`) before reaching any content; the checkbox starts unchecked, is required, and is never bundled with the leaderboard opt-in.
- **Migration for existing users — confirmed, deliberate deviation from spec §28/QA-07**: the user explicitly chose, when presented with the spec's own literal requirement to retroactively gate every pre-existing user, to gate new users only. This is documented here plainly, not glossed over: a user created before the chosen cutover is never redirected to `/legal/accept`, even with zero acceptance rows on file. Live-verified (`docs/qa/phase10d/execution_log.md` QA-07 inverse): a real pre-existing user with zero acceptance rows reached `/profile` and `/attempts` normally, with no redirect.
- **Re-acceptance policy**: bumping `CURRENT_TERMS_VERSION` immediately makes every prior acceptance "stale" for any user subject to the gate (comparison is exact-string-match against the stored version), requiring re-acceptance before continued gated access. Confirmed via `legal-acceptance.test.ts`.

## Privacy Policy

- Version: `2026-10-v1` (`CURRENT_PRIVACY_VERSION`), content in `apps/web/src/content/legal/privacy.ts`, rendered at `/privacy`, always reachable regardless of gate state.
- Covered: information you/organizations provide, practice/assessment data, Engineer Rank, leaderboard (opt-in only, exact public-field list stated), billing, referrals, security/audit information, the explicit "we do not currently collect IP/device/analytics data" statement, service providers, the no-sale statement, disclosure to inviting organizations, privacy rights, account deletion (anonymization, not instant hard-delete), security, the 18+ age policy, and update/contact sections.
- **No-sale statement**: states plainly that IncidentRank does not sell personal information, while explicitly naming the real service providers data is shared with (never claims "we never share with third parties," which would be false given Clerk/Stripe/Resend/hosting).
- **Service providers**: matches `docs/privacy/service_providers.md` exactly — Clerk, Stripe, Resend, database hosting (named as "our database/hosting provider" since no production vendor has been selected yet).

## Candidate consent

- **Assessment notice**: shown on the assessment-landing page before a candidate's first start on a given assessment — states who invited them, that actions/reasoning are recorded, that IncidentRank calculates results, that the inviting organization can review the report, and that this is separate from the candidate's private practice profile/Engineer Rank (which the organization never sees). Checkbox unchecked by default; "Start Assessment" visibly and functionally disabled until checked (live-confirmed: clicking the disabled button produced no state change).
- **Acceptance storage**: reuses the shared `legal_acceptances` table (`acceptanceType="candidate_assessment_notice"`), scoped by both `organizationId` and `assessmentId` so a candidate invited to two different assessments from two different organizations gets independently tracked consent for each.
- **Server enforcement**: `requireCurrentAssessmentNotice` is called inside `POST /api/assessment/[assessmentId]/start`, positioned after the existing resume-first early return (an already-started attempt is never re-checked) but before the organization-status/credit-consumption logic — a brand-new start genuinely cannot proceed without a current-version acceptance row, enforced server-side regardless of the UI checkbox.
- **Resume behavior**: confirmed both by an automated test (`route.test.ts`: "an already-started attempt remains resumable even if the notice version later changes") and live QA (reloading an in-progress assessment showed the paused-resume screen directly, no re-prompt).

## Organization terms

- **Owner acceptance**: every owner invitation (initial or additional) requires explicit business-terms acceptance — `acceptOrgInvitation` returns `business_terms_required` and creates no membership if the accepting user hasn't checked the box; the acceptance write happens inside the same transaction as membership creation and the `pending`→`active` organization transition, mirrored on the existing `organizationActivated` conditional exactly. Non-owner (admin/member) invitations are entirely unaffected — the requirement is scoped to owners only, per spec §26.
- **Business responsibilities**: the UI checkbox copy covers lawful assessment use and compliance with applicable employment/privacy law, linking to the full Terms for the complete organization-terms language (§26's covered concepts — organization-authored-content responsibility, discriminatory-use prohibition, credit/payment terms — live in the Terms document itself, not duplicated in the UI).
- **Versioning**: `CURRENT_ORG_TERMS_VERSION`, same single-source-of-truth pattern as the other three version constants.
- **Live-verified**: both an initial owner (on a brand-new `pending` organization) and an additional owner (joining an already-`active` organization) were required to check the box before Accept was enabled, and both successfully joined after accepting — confirmed via real DB rows (`organization_business_terms` acceptance type, correct `organizationId`, real timestamps) and via the organization's member count increasing from 1 to 2.

## Leaderboard privacy

- **Explicit opt-in**: unchanged mechanism from Phase 10C (`users.leaderboardVisible`, read only by `global-leaderboard.ts`, written only by the profile PATCH route) — re-confirmed this remains the sole read/write pair after this phase's additions.
- **Public fields hardened**: the `/profile` toggle's copy now explicitly lists the exact public field set (display name, band, normalized score, qualifying-incidents count, evidence breadth) and the exact never-public set (email, billing, assessment reports, practice timelines, dimension/skill breakdown, organization memberships) — previously this was only implied by shorter, vaguer copy.
- **Opt-out**: live-confirmed — toggling off immediately removed the user from `/leaderboard`'s rendered list.
- **New automated regression**: `api/leaderboard/global/route.test.ts` tests the actual HTTP route (not just the underlying function, already covered by Phase 10C's `global-leaderboard.test.ts`) — confirms an opted-out user with a strong rank never appears in the JSON response, and the response shape contains exactly the allowlisted public fields with no `userId` or other internal identifier.

## Privacy requests

- **Workflow**: `privacy_requests` table (mutable status, unlike the append-only `legal_acceptances`) backs `access | correction | deletion | other` requests. `access`/`correction`/`other` are submitted via `/settings/privacy`, created as `pending`, and routed to `/admin/privacy-requests` for manual admin handling (status transition to `completed` via a one-click admin control, logged as `privacy_request_completed`, never logging the request's `notes` content).
- **Deletion/account handling — confirmed real self-service automation, not record-only**: `deleteOwnAccount(userId)` runs as one transaction that (1) scrambles `users.displayName` to a non-identifying placeholder, (2) scrambles `users.authProviderId` to a sentinel that can never match a real Clerk identity again — this is the actual mechanism that "disconnects sign-in," since `getOrCreateCurrentUser()` is the only place `authProviderId` is ever read from an external source and it is always Clerk-derived, so a re-signup can never resurrect the deleted row, (3) flips `leaderboardVisible` to `false`, and (4) writes a `privacy_requests` row with `status="completed"` synchronously. Explicitly does **not** touch `organizationMembers`, `attempts` (practice or assessment), `rankSnapshots`, `organizationCreditLedger`, `paidEntitlements`/`stripeSubscriptions`, `referrals`, or any audit-event row — all remain, pointed at the now-anonymized user id. `legalAcceptances` rows are never deleted under any circumstance — deleting them would destroy the evidence that consent was once given.
- **Retention constraints**: documented explicitly in `docs/privacy/data_retention.md`'s dedicated anonymization-scope section, matching spec §42/§63's "prefer anonymization over destructive removal when organizational integrity, financial record-keeping, or legal-acceptance evidence must remain intact."
- **Strong confirmation UI**: the `/settings/privacy` Delete Account flow requires typing a literal confirm phrase ("DELETE") before the irreversible action is enabled — not a single click.

## Security review

`docs/privacy/privacy_security_review.md` — an independent grep-based sweep (not a restatement of the data inventory) covering: secret/token logging (none found outside the already-fixed `test-email-service.ts`); PII storage duplication (one real issue found and fixed — the org-invite preview route's unused `email` field); admin/org audit-log metadata (confirmed clean, two prior fixes reconfirmed still correct); every new Phase 10D module reviewed directly; account-deletion reversibility/bypass analysis (confirmed genuinely non-reversible); cookie-setting code (zero hits — relies entirely on Clerk's own session cookie); IP/user-agent collection (zero hits, confirms `data_inventory.md`'s claim still holds); `privacy_requests.notes` content hygiene (confirmed, single write path, server-truncated, never carries sensitive content). **No BLOCKER-level findings.** No items deferred from this sweep.

Token storage (invite/admin/promo/referral tokens): unchanged from prior phases — all invite-style tokens are 32-byte crypto-random, SHA-256 hashed at rest, the raw value returned exactly once at creation; referral codes remain deliberately plaintext per the documented threat-model decision above.

## Browser QA

Full 32-story reference across both this phase's own batches (14 legal/consent stories — 4 required by §75 plus the QA-07 inverse, 6 candidate-notice/org-terms stories, 7 leaderboard/privacy-request/security stories) and the full execution logs:

- `docs/qa/phase10d/execution_log.md` — Batch 2 (QA-01–04, QA-07 inverse): all pass. One real defect found and fixed via the automated gate (not live QA): `legalAcceptanceGateCutoverAt()`'s unset-env default was inverted, retroactively gating every pre-existing test fixture; fixed to default to "gate no one" matching this codebase's every-flag-defaults-off convention.
- `docs/qa/phase10d/execution_log_batch3.md` — Batch 3 (QA-08–13) plus a user-requested negative-access sweep (confirming `/organizations`, `/attempts`, `/profile`, and an org-nested billing route all correctly require authentication while signed out, with `/terms` remaining open): all pass. One real test-fixture gap found and fixed via the automated gate: `organization-credits.test.ts`'s shared fixture helper needed the same notice-pre-acknowledgment pattern already used elsewhere.
- `docs/qa/phase10d/execution_log_batch4.md` — Batch 4 (QA-05, 06, 14, 15, 16, 17, 18): all pass. One real issue found and fixed during the security review (not live QA): the org-invite-preview email over-exposure described above.

Every story was verified against real signed-in Clerk test-mode identities with direct database-state verification after each claim — no story was marked passing from reading code alone. Two real UI/logic defects were found purely through live QA across the whole phase (the cutover-default inversion and the test-fixture gap, both caught by the automated validation gate rather than live QA this time, in contrast to Phase 10C where live QA itself caught the defects) plus one real data-minimization issue found during the dedicated security review — demonstrating the value of running all three verification layers (automated tests, live QA, and an independent security sweep) rather than relying on any single one.

## Validation

Full sweep run clean after every batch and after every defect fix: `pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed`.

Final state: typecheck clean, lint clean, **631/631 tests passing** across 80 test files (adding, across this phase: 12 `legal-acceptance.test.ts` + 3 `api/legal/accept/route.test.ts` + 3 `api/assessment/.../start/route.test.ts` notice cases + 4 `api/assessment/.../notice/accept/route.test.ts` + 5 `org-membership.test.ts` business-terms cases + 2 `api/leaderboard/global/route.test.ts` + 5 `account-deletion.test.ts` + 2 `api/account/delete/route.test.ts` + 4 `api/privacy-requests/route.test.ts` + 2 `api/admin/privacy-requests/[requestId]/route.test.ts`), production build clean with zero errors (`/terms`, `/privacy`, `/legal/accept`, `/settings/privacy`, and the new admin pages all present in the route manifest), seed reporting **"100 built-in scenario(s)"** — the catalog invariant held unchanged throughout, as this phase touches no scenario or scoring code.

## Deferred items

Per spec §82, explicitly not attempted this phase: a complex GDPR-automation platform, automated jurisdiction-detection engine, multi-region data residency, enterprise DPA automation, SOC 2/ISO certification, automated Stripe refund reconciliation (remains deferred from Phase 10B), a cookie-consent platform (not needed — no non-essential tracking exists), marketing automation, or AI training on private customer/candidate data (explicitly stated as not happening, in both the Privacy Policy and the data inventory).

## Legal review

**READY_FOR_LEGAL_REVIEW.**

Every item on the spec's completion-criteria checklist (§81, 36 items) is implemented, tested, and live-verified, with every deliberate scope deviation (the sign-up-time-only gate) documented plainly rather than silently passed over. The following remain as explicit business/attorney-input items before production beta — all currently represented as `[PLACEHOLDER]` text in the Terms/Privacy Policy content, never invented:

- **`privacy@incidentrank.com` mailbox setup** — referenced in both legal documents as the privacy contact; does not yet exist as a real, monitored inbox.
- **Legal entity name** — the Terms currently read `[LEGAL ENTITY NAME PLACEHOLDER]`.
- **Business mailing address** — not yet determined.
- **Governing law / jurisdiction** — the Terms' dispute-resolution section is explicitly marked as requiring business and attorney input.
- **Support contact** — referenced as a placeholder in both documents.
- **Effective dates** — both documents currently read `[EFFECTIVE DATE PLACEHOLDER]`.
- **Actual infrastructure vendor names** — the database/hosting provider is referred to generically ("our database/hosting provider") since no production vendor has been selected yet (also a Phase 11 beta-launch item per the Phase 10C completion report).
- **Retention periods** — `docs/privacy/data_retention.md` documents intended behavior but states plainly that automated enforcement of several categories is deferred to a future phase ("manual retention policy in beta").
- **Attorney review of the full Terms of Service and Privacy Policy** — required before production beta per spec §77, especially given IncidentRank's employer-assessment, automated-scoring, payment, and candidate-reporting surface area. The AI-assisted draft status is noted internally (`TERMS_INTERNAL_REVIEW_NOTE`/`PRIVACY_INTERNAL_REVIEW_NOTE` constants in the content files, never rendered publicly) but has not been reviewed by qualified counsel.
- **Confirmed, deliberate scope deviation from spec §28/QA-07** (not a legal-review item, but worth restating plainly here for whoever picks up Phase 11): existing pre-Phase-10D users are never retroactively gated into accepting Terms/Privacy — only users created at or after a configured cutover instant. If the business later decides every user must have an on-file acceptance regardless of signup date, that is new scope for a future phase, not something this phase silently assumed.
