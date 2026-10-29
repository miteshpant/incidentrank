# Data Retention Policy

Phase 10D (`docs/implementation_plan/phasse10d.md` §45-§47). Internal, implementable retention policy per category — deliberately specific rather than "we retain data as long as necessary," per §46's explicit instruction. Where automated deletion is not built this phase, that is stated plainly as a manual-retention-in-beta gap, not implied automation.

| Category | Retention | Automated or manual (beta) | Notes |
|---|---|---|---|
| User profile (`users`) | Life of account; anonymized (not deleted) on self-service account deletion | Automated for anonymization (Phase 10D's `deleteOwnAccount`); no automated full-row deletion | Organization membership, attempts, billing, and audit rows referencing this user id are explicitly retained post-deletion — see §63 below |
| Practice attempts | Life of account | Manual (beta) | No automated expiry; a future phase may add time-based archival |
| Engineer Rank history (`rank_snapshots`) | Full history, append-only, never updated or deleted | Manual (beta) — no deletion mechanism exists or is planned this phase | History-preserving by design (Phase 10C); self-service account deletion does not remove these rows, only disconnects the anonymized profile from new public exposure |
| Leaderboard profile (`users.leaderboardVisible`-gated public view) | As long as the flag is `true` | Automated — flipping the flag off immediately removes public visibility (confirmed in Phase 10C QA) | Not a separate retained record — derived live from `rank_snapshots`/`users` at read time |
| Assessment attempts/results | Per the inviting organization's own retention needs; not unilaterally deletable by the candidate | Manual (beta) | §63: candidate account deletion must not silently destroy an organization's legitimate hiring record — see the anonymization approach below |
| Organization records | Life of organization; not deleted when a member leaves | Manual (beta) | A user leaving an organization does not delete `organizationScenarios`, assessment history, candidate reports, billing history, or the audit trail — stated in Terms/organization terms |
| Audit logs (`admin_audit_events`, `organization_audit_events`) | Not casually deleted — retained for security/governance value | Manual (beta) | Phase 10D minimized personal payloads inside audit metadata (stable IDs instead of duplicated emails — see `organization-provisioning.ts` changes) rather than shortening retention |
| Billing records (`paidEntitlements`, `stripeSubscriptions`, `organizationCreditLedger`, `stripeCustomers`, `organizationStripeCustomers`) | Retained for financial/audit/reconciliation purposes — not user-deletable | Manual (beta) | Required for dispute resolution, tax/accounting, and revenue reporting; deletion here would break financial record-keeping, so this is explicitly excluded from self-service account deletion |
| Stripe identifiers | Same as billing records | Manual (beta) | Tokenized references only — no raw payment data to separately retain or purge |
| Email/invitation records (`organizationInvitations`, `adminInvites`) | Life of invitation + its expiry window; accepted/expired/revoked invitations are not purged | Manual (beta) | Needed for audit trail of who was invited and when |
| Referral records (`referrals`) | Life of the referral relationship | Manual (beta) | Plaintext referral code retained per the documented threat-model decision in `data_inventory.md` |
| Security logs | Not currently collected (no IP/device-fingerprint logging exists) | N/A | See `data_inventory.md`'s `must_not_store` summary |
| Legal acceptances (`legal_acceptances`) | **Permanent, append-only — never deleted, including after account deletion** | Automated (by construction — no delete path exists in the code at all) | Acceptance history is the proof-of-consent record; deleting it on account deletion would destroy the very evidence that consent was once given. Self-service account deletion anonymizes the user's identity fields but intentionally leaves `legal_acceptances` rows intact, referencing the (now-anonymized) user id |
| Privacy requests (`privacy_requests`) | Retained for the lifetime of the account plus a reasonable support window after resolution | Manual (beta) | No automated purge this phase; §44 — free-text notes are kept minimal by design |

## Self-service account deletion — exact scope (cross-reference: `data_inventory.md`, completion report)

Per the confirmed design decision, `deleteOwnAccount(userId)`:

- **Anonymizes**: `users.displayName` (scrambled to a non-identifying placeholder), the local auth linkage (so the Clerk identity can no longer resolve to a usable IncidentRank account).
- **Retains, re-pointed at the anonymized user id**: `organizationMembers`, `attempts` (both practice and assessment), `rank_snapshots`, `organizationCreditLedger`, `paidEntitlements`/`stripeSubscriptions`, `referrals`, every audit-event row, and `legal_acceptances`.
- **Rationale**: matches spec §42/§63's explicit guidance to prefer anonymization over destructive removal when organizational integrity, financial record-keeping, or legal acceptance evidence must remain intact. A full hard-delete would risk breaking another organization's legitimate hiring record, this user's own billing/audit history, or the very proof that Terms were once accepted.

## Explicitly deferred (per spec §82, not built this phase)

- Automated time-based deletion/archival jobs for any category above — all retention is manual/policy-based in beta, stated honestly rather than implied as automated.
- Cross-border data residency or region-specific retention rules.
- Automated Stripe refund reconciliation affecting retained billing records.
