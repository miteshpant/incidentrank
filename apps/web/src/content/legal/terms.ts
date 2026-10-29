/**
 * DRAFT LEGAL TEXT — LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA.
 * Written conservatively per docs/implementation_plan/phasse10d.md
 * §14/§30-§40, but this is not a substitute for attorney review,
 * especially given IncidentRank's employer-assessment, scoring, and
 * payment surface area. Do not treat this as legally approved.
 *
 * Version pinned here must match legal-versions.ts's
 * CURRENT_TERMS_VERSION exactly. A changed substantive document
 * requires a new version identifier — never edit text under a version
 * string that users have already accepted (§54).
 */

export const TERMS_VERSION = "2026-10-v1";

export const TERMS_TITLE = "IncidentRank Terms of Service";

export const TERMS_BODY = `
Effective date: [EFFECTIVE DATE PLACEHOLDER]
Version: ${TERMS_VERSION}

These Terms of Service ("Terms") govern your access to and use of IncidentRank (the "Service"), operated by [LEGAL ENTITY NAME PLACEHOLDER] ("IncidentRank", "we", "us"). By creating an account, you agree to these Terms and acknowledge our Privacy Policy.

## 1. Eligibility

You must be at least 18 years old, or the age of majority in your jurisdiction if higher, to use IncidentRank. We do not knowingly offer the Service to anyone under that age, and we do not operate any parental-consent infrastructure for minors.

## 2. What IncidentRank provides

IncidentRank provides technical incident-response practice simulations, a personal skill benchmark ("Engineer Rank"), and tools for organizations to run technical assessments of candidates. IncidentRank provides technical assessment and decision-support information. IncidentRank does not make hiring, promotion, termination, or other employment decisions. Organizations are responsible for how they use assessment results, and IncidentRank assessment results should not be used as the sole basis for an employment decision.

## 3. Beta service

IncidentRank is currently offered as a controlled beta. The Service may change, features may be modified or removed, and availability is not guaranteed. We perform reasonable maintenance, which may cause temporary outages. We make no guarantee of employment outcomes, hiring results, or career outcomes from use of the Service.

## 4. Accounts

You are responsible for maintaining the security of your account and for all activity under it. You must not attempt to bypass payment or access controls, scrape or extract private scenario content, use automated tools to solve assessments where prohibited, or otherwise compromise the security or integrity of the Service.

## 5. Individual subscriptions

IncidentRank offers an individual "Pro" subscription and a one-time "Founding Engineer" lifetime practice-access offering.

- **Pro subscription**: billed on a recurring basis (monthly or annual). If you cancel, your access continues until the end of your current paid period; cancellation does not retroactively refund the current period.
- **Founding Engineer**: a one-time purchase granting lifetime practice access, subject to these Terms and the continued operation of the Service. This does not confer any ownership, equity, or interest in IncidentRank, and does not guarantee the Service will operate in perpetuity.

## 6. Organization assessment credits

Organizations purchase assessment credits. One credit is consumed when a candidate starts an assessment attempt — sending or creating an invitation does not itself consume a credit. Credits are generally non-refundable except as otherwise stated by IncidentRank in writing.

## 7. Organization responsibilities

If you create or administer an organization account, you represent that you have the authority to do so and to invite candidates on the organization's behalf. Organizations using IncidentRank for hiring-related assessments must comply with applicable employment law, anti-discrimination law, privacy law, accessibility obligations, and any applicable automated-decision-making regulations in their jurisdiction. IncidentRank does not attempt to enumerate every jurisdiction's requirements in this document; organizations are responsible for their own legal compliance. Organizations are responsible for any scenario content they create or upload, and represent that they have the rights necessary to that content.

## 8. Content and intellectual property

**Your content.** If your organization creates or uploads scenario content, you retain ownership of it. By submitting it, you grant IncidentRank a license to host, process, execute, and display that content to authorized candidates, and to retain historical versions for completed assessments.

**Our content.** IncidentRank retains ownership of its built-in scenarios, simulator, scoring and ranking methodology, software, branding, and documentation. Nothing in these Terms transfers that ownership to you.

## 9. Acceptable use

You agree not to: access another person's account without authorization; attempt to bypass payment or access controls; scrape, extract, or republish private scenario content; use automated tools to solve assessments or practice scenarios where this would defeat their purpose; engage in abusive or illegal use of the Service; attempt to compromise the security of the Service; upload content you do not have the rights to; or use assessments in a manner that is unlawful or discriminatory.

## 10. Disclaimers

The Service is provided "as is" without warranties of any kind, express or implied, to the fullest extent permitted by law.

## 11. Limitation of liability

To the fullest extent permitted by law, IncidentRank will not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. [FULL LIMITATION-OF-LIABILITY LANGUAGE REQUIRES ATTORNEY REVIEW.]

## 12. Suspension and termination

We may suspend or terminate access to the Service for violation of these Terms, non-payment, or other reasonable cause. You may stop using the Service at any time; see our Privacy Policy for account deletion options.

## 13. Changes to these Terms

We may update these Terms from time to time. Material changes will require you to accept the updated Terms before continuing to use the Service. The version number above identifies which version of these Terms you have accepted.

## 14. Governing law and disputes

[GOVERNING LAW / JURISDICTION PLACEHOLDER — REQUIRES BUSINESS AND ATTORNEY INPUT.]

## 15. Contact

Questions about these Terms can be sent to support@incidentrank.com.
`.trim();

/**
 * INTERNAL ONLY — never rendered on the public /terms page. See
 * phasse10d.md §77: this draft must be reviewed by qualified counsel
 * before production beta, particularly given IncidentRank's
 * employer-assessment, automated-scoring, and payment surface area.
 */
export const TERMS_INTERNAL_REVIEW_NOTE =
  "LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA — AI-assisted draft, not attorney-reviewed.";
