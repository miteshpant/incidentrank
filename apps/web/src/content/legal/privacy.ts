/**
 * DRAFT LEGAL TEXT — LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA.
 * See terms.ts's header comment; the same caveat applies here.
 * Describes only behavior this codebase actually implements — see
 * docs/privacy/data_inventory.md and docs/privacy/service_providers.md
 * for the underlying audit this text is drawn from. Do not let this
 * document claim behavior the system does not implement (§15 final
 * instruction).
 */

export const PRIVACY_VERSION = "2026-10-v2";

export const PRIVACY_TITLE = "IncidentRank Privacy Policy";

export const PRIVACY_BODY = `
Effective date: [EFFECTIVE DATE PLACEHOLDER]
Version: ${PRIVACY_VERSION}

This Privacy Policy explains what information IncidentRank collects, why, and how it is used.

## 1. Our core principle

IncidentRank collects and retains only the personal information it actually needs to operate the Service. We do not store data merely because a third-party provider happens to expose it.

## 2. Information you provide

When you create an account, our authentication provider (Clerk) collects your email address and any profile information you choose to provide at sign-up. IncidentRank does not store your email address or password locally — your email is resolved from our authentication provider only when needed (for example, to send a transactional notification or for admin support). We never store your password, multi-factor authentication secrets, or session tokens; those remain solely with our authentication provider.

Locally, we store: a display name, your Clerk identity reference, and any profile preferences you set (such as whether your Engineer Rank profile is publicly visible on the leaderboard).

## 3. Information organizations provide

If your organization invites you to a technical assessment, the organization provides your email address to send you the invitation. Organizations are also responsible for the scenario content, if any, that they create.

## 4. Practice and assessment data

When you complete a practice incident simulation, we store your attempt history, score, outcome, and performance breakdown. When you participate in an organization's assessment, we store your assessment attempt data and make it visible to the inviting organization's authorized personnel and to IncidentRank platform administrators for support purposes. We do not expose assessment results publicly, and assessment data is never used to compute your personal Engineer Rank.

## 5. Engineer Rank

Engineer Rank is a personal benchmark computed from your completed practice attempts. By default, your Engineer Rank is private — visible only to you and, where necessary for support, IncidentRank platform administrators. Organizations you participate in assessments for do not automatically gain access to your personal Engineer Rank.

## 6. Benchmark research (pseudonymous)

Separately from Engineer Rank, we use a pseudonymous copy of your completed practice-incident data — which scenario, difficulty, category, your decision sequence and timing, your terminal outcome, and your score breakdown — to calibrate IncidentRank's scenarios and build an aggregate benchmark of production-engineering judgment. This data is linked to your account only by an internal, randomly generated reference, never by your display name, email, or authentication identity, and is never shown as an individual engineer's record in any dashboard or report — only as part of aggregate statistics (for example, "68% of first-time attempts at this scenario resolved the incident"). This applies only to practice incidents on IncidentRank-owned scenarios; your employer-assessment attempts and any organization-private scenario content are never included. We do not use this data for third-party advertising, and we do not sell it.

## 7. Leaderboard (opt-in only)

IncidentRank offers an optional public leaderboard. Your profile never appears on it unless you explicitly opt in through your profile settings. Accepting these Terms or our Privacy Policy does not opt you into the leaderboard — it is a separate, explicit choice, never pre-checked.

If you opt in, the following becomes publicly visible: your display name, your IncidentRank band, your normalized leaderboard score, your qualifying-incidents count, and your evidence breadth (the number of distinct scenario categories you have qualifying attempts in). We never make the following public, even if you opt in: your email address, billing information, assessment reports, practice attempt timelines, your detailed dimension/skill breakdown, or your organization memberships.

You may opt out at any time; doing so removes your profile from the public leaderboard and from the public leaderboard API.

## 8. Billing and transaction information

We use Stripe to process payments. Stripe collects your payment card details directly — IncidentRank's servers never receive or store your full card number, CVC, or raw bank account credentials. We store only billing identifiers issued by Stripe (such as customer and subscription references), purchase status, timestamps, and the actual amount charged (which may reflect a promotional discount), which we use for access control, billing support, and revenue reporting.

## 9. Referral information

If you refer another person to IncidentRank, we store your referral code and the relationship between you and anyone who uses it, to track reward eligibility.

## 10. Security and audit information

We maintain internal audit logs of administrative and organizational actions for security and governance purposes. These logs are not publicly visible.

## 11. Technical and log information

IncidentRank does not currently collect IP addresses, device fingerprints, analytics, advertising identifiers, or session-replay data. If this changes in a future version of the Service, we will update this Privacy Policy before doing so.

## 12. How we use information

We use the information described above to operate the Service: providing practice and assessment functionality, computing Engineer Rank, calibrating scenarios via pseudonymous benchmark research, processing payments, sending transactional emails (never marketing email unless you separately opt into that in the future), maintaining security and audit records, and providing customer support.

## 13. Service providers

We share information with the following service providers, each solely to operate the Service:

- **Clerk** — authentication and identity.
- **Stripe** — payment processing.
- **Resend** — transactional email delivery.
- **Our database/hosting provider** — stores the data described in this policy.

We do not sell your personal information. We do not use your assessment or practice data to train AI models, and we do not use it for third-party advertising or behavioral profiling.

## 14. Disclosure to organizations

If you participate in an organization's assessment, that organization's authorized owners/admins can see your assessment attempt and results for that assessment. This is necessary for the assessment to serve its purpose and is disclosed to you before your first assessment attempt begins.

## 15. Public leaderboard disclosure

See Section 7 above — this is the only way your information becomes publicly visible, and only if you explicitly opt in.

## 16. Your privacy rights

You may request access to, correction of, or deletion of your personal information by contacting support@incidentrank.com or by using the in-product privacy request tools where available. Some information may need to be retained for financial, legal, audit, or organizational-integrity reasons even after a deletion request — see our account deletion behavior below.

## 17. Account deletion

You may request deletion of your account. When you do, we anonymize your directly-identifying profile information (such as your display name) and disconnect your account from further use. We retain certain records — including organization membership history, completed assessment results an organization relied on, billing/credit history, pseudonymous benchmark research records, and audit trails — associated with an anonymized reference rather than your identity, because deleting them could compromise another organization's legitimate hiring records, financial record-keeping, the integrity of our benchmark research, or the evidence that you once accepted these Terms.

## 18. Security

We rely on our infrastructure providers' security measures (encryption in transit via TLS, encryption at rest where provided by our database/hosting provider) and do not implement custom cryptography.

## 19. Children

IncidentRank is intended for users who are at least 18 years old, or the age of majority in their jurisdiction. We do not knowingly collect information from minors.

## 20. Updates to this policy

We may update this Privacy Policy. Material changes will be reflected in a new version number, and where applicable, may require renewed acknowledgment before continued use.

## 21. Contact

Questions about this Privacy Policy can be sent to support@incidentrank.com.
`.trim();

/**
 * INTERNAL ONLY — never rendered on the public /privacy page.
 */
export const PRIVACY_INTERNAL_REVIEW_NOTE =
  "LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA — AI-assisted draft, not attorney-reviewed.";
