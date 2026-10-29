# Data Inventory

Phase 10D (`docs/implementation_plan/phasse10d.md` §2/§10). Field-by-field inventory of personal/business-sensitive data IncidentRank stores or processes, classified per §2's taxonomy: `plaintext_required | encrypted_or_platform_protected | hashed | tokenized_external_reference | ephemeral_only | must_not_store`.

## Identity

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Clerk identity id | `user_...` | `users.authProviderId` | Links local account to Clerk session | Self, platform admin | Life of account | `tokenized_external_reference` | Clerk | Required |
| Display name | "Jane Doe" | `users.displayName` | Shown on profile, leaderboard (if opted in), audit trails | Self, platform admin; leaderboard (if opted in) | Life of account; anonymized on self-service deletion | `plaintext_required` | — | Required |
| Email address | `jane@example.com` | **Not stored locally** — resolved live from Clerk via `authProviderId` (`customer-identity.ts`, `current-user.ts`) | Transactional email, admin support lookup | Self (via Clerk), platform admin (resolved on demand) | Governed by Clerk | `tokenized_external_reference` (Clerk is system of record) | Clerk | Required (but not duplicated locally — deliberate minimization decision, see "Email minimization" below) |
| Organization membership | role in org X | `organizationMembers` | Access control, governance | Self, org admins/owners of the same org, platform admin | Life of membership + organization's own retention | `plaintext_required` | — | Required |
| Organization role | owner/admin/member | `organizationMembers.role` | Access control | Same as above | Same as above | `plaintext_required` | — | Required |

**Email minimization decision**: `users` has no email column at all. Every lookup resolves live against Clerk by `authProviderId` (`resolveEmailsForUsers`/`findAuthProviderIdsByEmail` in `customer-identity.ts`; `resolveEmailForNotification` in `organization-provisioning.ts`), batched and never-throwing. This was evaluated per spec §7 and kept this way rather than adding a local email column — email already reliably resolves from Clerk when needed (transactional sends, admin support lookup), and duplicating it locally would only create a second copy to keep in sync and protect. No architectural change was made purely for theoretical minimization at the cost of breaking a flow — every existing flow that needs an email already resolves it live.

## Practice & assessment data

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Practice attempt history | completed scenario, score, outcome, dimension breakdown | `attempts` (filtered `attemptType='practice'`) | Personal progress tracking, Engineer Rank evidence | Self, platform admin for support | Life of account | `plaintext_required` | — | Required |
| Assessment participation | candidate invited to assessment X | `assessmentCandidates` | Employer hiring workflow | Candidate (own), inviting org's authorized owner/admin, platform admin | Per organization's own retention (not candidate-deletable without affecting org's historical record — see §63 below) | `plaintext_required` | — | Required |
| Assessment attempt timeline/score/outcome/dimension breakdown | — | `attempts` (filtered `attemptType='assessment'`) | Employer report generation | Same as above | Same as above | `plaintext_required` | — | Required |
| Employer report | aggregated candidate performance view | Derived at read time from `attempts`/`assessmentCandidates`, never a separate stored "report" blob | Hiring decision support | Inviting org's authorized owner/admin, platform admin | Same as underlying attempt data | `plaintext_required` | — | Required |

**Sensitive-assessment-data boundary** (§11/§12): assessment data is never exposed publicly, never flows into Engineer Rank (the rank-evidence query in `engineer-rank.ts` is `attemptType='practice'`-scoped only — structurally, not by a runtime filter), and organization owners never gain access to a candidate's private Engineer Rank or general practice history — confirmed by grep: no organization-facing code path references `rank_snapshots` or the practice-only `attempts` rows of a user outside their own assessment participation.

## Engineer Rank & leaderboard

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Engineer Rank snapshot | band, confidence, normalized score, dimension/skill breakdown | `rank_snapshots` | Personal benchmark | Self, platform admin (band+confidence only, via rebuild route) | Full history retained (append-only) | `plaintext_required` | — | Required for the feature |
| Leaderboard opt-in flag | `true`/`false` | `users.leaderboardVisible` | Explicit consent gate for public leaderboard | Self (writes it); read only by `global-leaderboard.ts` | Life of account | `plaintext_required` | — | Required for the feature |
| Public leaderboard profile | display name, band, normalized score, qualifying-incidents count, evidence breadth | Derived at read time from `rank_snapshots` + `users`, filtered to opted-in users | Public benchmarking | Anyone (public page) | As long as opted in | `plaintext_required` | — | Required for the feature, opt-in only |

## Referrals

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Referral code | `ABC123XYZ` | `referrals.referralCode` | Shareable identifier the referrer re-displays on their own profile | Referrer (own code), referee (via link), platform admin | Life of referral record | `plaintext_required` (deliberate — see below) | — | Required |
| Referral relationship | referrer ↔ referee user ids, status | `referrals` | Reward eligibility tracking | Referrer/referee (own side), platform admin | Life of referral record | `plaintext_required` | — | Required |

**Referral-code threat-model decision (§9)**: referral codes remain plaintext at rest, not hashed. This is a deliberate, already-documented decision (`packages/db/src/schema.ts` inline comment on the `referrals` table), re-confirmed in this phase rather than changed: a referral code is **not a bearer credential** — `claimReferral` always re-runs full eligibility checks server-side regardless of whether the caller merely possesses the code string, so knowing the code grants nothing by itself. Meanwhile the referrer must be able to repeatedly view/copy their own code from their profile to share it — a one-way hash would make that core UX requirement impossible (the plaintext could never be redisplayed). Migrating to hash-at-rest would therefore require storing a parallel plaintext-displayable copy anyway, which defeats the purpose of hashing. The current design is self-consistent and intentional, not an oversight.

## Billing

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Billing identifiers | Stripe customer/subscription/checkout-session/payment-intent/price/product ids | `stripeCustomers`, `organizationStripeCustomers`, `paidEntitlements`, `stripeSubscriptions`, `organizationCreditLedger` | Access control, reconciliation, billing support, revenue reporting, auditability | Self/org owner (own billing), platform admin | Life of account/organization | `tokenized_external_reference` | Stripe | Required |
| Purchase history | entitlement type, status, amounts (derived from a static price map, never persisted from Stripe directly) | Same tables above, joined with `apps/web/src/lib/server/stripe/revenue-pricing.ts`'s static map | Billing support, revenue dashboard | Self/org owner, platform admin | Same as above | `plaintext_required` (status/date columns), `tokenized_external_reference` (Stripe ids) | Stripe | Required |
| **Raw card/payment credentials** | PAN, CVC, bank account numbers | **Never stored** — Stripe's own hosted Checkout/Customer Portal collects these directly; IncidentRank's servers never receive them | — | — | — | `must_not_store` | Stripe (collects directly) | N/A — must never be required |
| Raw Stripe objects (full session/payment-intent/customer/invoice JSON, raw webhook body) | — | **Never persisted** — confirmed against `webhook-handlers.ts`: only normalized ids/status/dates are read and written, no raw object serialization anywhere | — | — | — | `must_not_store` | — | N/A |

## Audit & security

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Audit logs | admin/org action history | `admin_audit_events`, `organization_audit_events` | Security/governance, dispute resolution | Platform admin (admin events), org owner/admin (own org's events) | Not casually deleted — see `data_retention.md` | `plaintext_required`, metadata minimized (Phase 10D removed redundant raw-email duplication — see `organization-provisioning.ts` changes) | — | Required |
| Invitation/promo/admin tokens | one-time bearer tokens | Hash only (`tokenHash` columns); raw token returned once at creation, never persisted | Secure one-time invitation acceptance | No one post-creation (hash is one-way) | Life of invitation + expiry | `hashed` | — | Required |
| IP address / device metadata | — | **Not currently collected or stored anywhere in the codebase** — confirmed by grep across `packages/db/src/schema.ts` and all route handlers; no request IP/user-agent column exists | — | — | — | `must_not_store` (current policy) | — | Not currently required; §20 explicitly recommends against adding this for consent-evidence purposes absent counsel advice |

## Legal/consent (new in this phase)

| Data category | Example | Where stored | Purpose | Who can access | Retention | Protection method | External processor | Required? |
|---|---|---|---|---|---|---|---|---|
| Legal acceptance record | user accepted Terms v2026-10-v1 at time T | `legal_acceptances` | Proof of consent, re-gating on version change | Self, platform admin | Permanent, append-only (never deleted, including after account deletion — see `data_retention.md`) | `plaintext_required` | — | Required |
| Privacy request record | deletion/access/correction request + status | `privacy_requests` | Track and resolve user privacy requests | Self (own requests), platform admin | Per `data_retention.md` | `plaintext_required`, free-text notes minimized (§44 — no unnecessary detail stored) | — | Required |

## Summary of `must_not_store` items (confirmed absent, not merely avoided going forward)

- Raw card PAN/CVC/bank credentials — never received by IncidentRank's servers (Stripe-hosted collection only)
- Full/raw Stripe object JSON or raw webhook bodies — confirmed not persisted anywhere in `webhook-handlers.ts` or `schema.ts`
- Passwords, password hashes, MFA secrets, session/refresh tokens, raw Clerk session payloads — Clerk-only, never duplicated locally
- IP address / device fingerprint data — not currently collected anywhere
- Raw invite/promo/referral-claim tokens in logs — fixed in this phase (`test-email-service.ts`); hash-at-rest already enforced for invite-style tokens
