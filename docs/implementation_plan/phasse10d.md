Implement **IncidentRank Phase 10D — Privacy, Terms, Data Minimization & Consent**.

Phase 10C is complete.

IncidentRank now includes:

- user accounts and authentication
- practice incidents
- Engineer Rank
- opt-in global leaderboard
- employer assessments
- candidate invitations and reports
- organizations and organization governance
- platform admins
- organization credits and billing
- individual Pro / Founding billing
- referrals and promotional access
- audit logs
- customer/revenue dashboards

Before production beta, IncidentRank needs a deliberate privacy and legal-consent layer.

The core principle of this phase is:

> Collect and retain only the personal information IncidentRank actually needs to operate.

If data is not necessary, do not store it.

This phase must also introduce:

- Terms of Service
- Privacy Policy
- explicit Terms acceptance
- Privacy Policy acknowledgment
- candidate assessment consent/notice
- organization-owner/business terms acceptance
- versioned consent history
- leaderboard-specific opt-in
- data inventory/classification
- privacy-request support
- retention/deletion rules
- payment-data minimization
- security/privacy review

This phase does **not** attempt to replace legal counsel.

The final legal text should be written conservatively and clearly, but the completion report must explicitly recommend attorney review before production beta.

---

# 1. Core privacy doctrine

Adopt the following engineering rule:

```text
If IncidentRank does not need a data field,
IncidentRank should not collect or persist it.
```

Do not retain data merely because:

- Clerk exposes it
- Stripe exposes it
- Resend exposes it
- a webhook payload contains it
- logging middleware can capture it
- it may possibly be useful one day

Minimize by default.

---

# 2. Data classification

Create a documented data inventory covering all personal/business-sensitive data IncidentRank stores or processes.

Create:

```text
docs/privacy/data_inventory.md
```

For each field/category document:

```text
Data category
Example
Where stored
Purpose
Who can access
Retention
Protection method
External processor
Required?
```

Classify each item as one of:

```text
plaintext_required
encrypted_or_platform_protected
hashed
tokenized_external_reference
ephemeral_only
must_not_store
```

---

# 3. Payment-data doctrine

IncidentRank must never store raw sensitive card/payment credentials.

Do NOT store:

```text
full card number / PAN
CVC / CVV
raw bank account credentials
Stripe webhook payloads containing unnecessary payment-method detail
full PaymentMethod objects
card magnetic stripe / track data
```

Do not hash PAN/CVC and store them.

The correct approach is:

```text
Stripe stores sensitive payment method data
IncidentRank stores references and minimal metadata
```

---

# 4. Allowed payment information

IncidentRank may store only what is needed for:

- access control
- reconciliation
- billing support
- revenue reporting
- auditability

Examples:

```text
stripe_customer_id
stripe_subscription_id
stripe_checkout_session_id
stripe_payment_intent_id
stripe_product_id
stripe_price_id
amount
currency
payment/status
timestamps
organization_id / user_id linkage
```

Optional payment display data should only be stored if there is a real UX/support requirement.

Examples:

```text
card brand
last4
expiry month/year
```

If not currently needed:

> do not add them.

---

# 5. Stripe object minimization

Review every place Stripe objects are persisted.

Do not store serialized full Stripe objects.

Do not store:

```text
raw checkout session JSON
raw payment intent JSON
raw customer JSON
raw invoice JSON
raw webhook body
```

unless there is a documented operational requirement.

Persist normalized minimal fields only.

---

# 6. Webhook logging

Audit all Stripe webhook logging.

Ensure logs never contain:

- full webhook bodies unless explicitly sanitized
- card/payment-method details
- secret values
- authorization headers
- Stripe secret keys
- webhook secrets

Log only identifiers needed for debugging, such as:

```text
event_id
event_type
checkout_session_id
subscription_id
payment_intent_id
organization_id/user_id if needed
processing status
```

---

# 7. Authentication data

IncidentRank uses Clerk.

Do not duplicate authentication data that Clerk already securely manages unless required.

Do not store:

```text
passwords
password hashes
MFA secrets
session tokens
refresh tokens
Clerk session payloads
```

Store only necessary local identity references such as:

```text
user id
Clerk/auth provider id
display name if needed
email if needed
```

Review whether email must be persisted locally.

If email can reliably remain in Clerk and be resolved when required, prefer that unless the product requires local email for transactional workflows.

Do not make architectural changes purely for theoretical minimization if they would break essential flows.

Document the decision.

---

# 8. Hashable data

Use hashing only when the original value does not need to be recovered.

Good candidates include:

```text
invitation tokens
promo tokens
referral claim tokens if appropriate
password-reset-like one-time tokens
verification tokens
```

Continue the existing secure token-hashing approach.

Do not hash data that must later be displayed or sent.

---

# 9. Referral-code review

Phase 8 documented that referral codes were stored plaintext.

Review whether referral codes need to be stored recoverably.

If referral codes are:

```text
secret/bearer credentials
```

then migrate them to hash-at-rest.

If they are:

```text
public shareable identifiers
```

plaintext storage may be appropriate.

Document the threat model and decision.

Do not blindly hash them if the product needs to display the same reusable referral code later.

---

# 10. PII inventory

At minimum review:

```text
name/display name
email
Clerk identity ID
organization membership
organization role
candidate invitation email
assessment participation
assessment score/result
practice attempt history
Engineer Rank
leaderboard profile
referral relationships
billing identifiers
purchase history
audit logs
support/admin actions
IP/network logs if present
device/browser metadata if present
```

For each answer:

```text
Do we need it?
Why?
Where is it stored?
How long?
Who sees it?
Can it be removed?
```

---

# 11. Sensitive assessment data

Employer assessment information must be treated as sensitive user-related data.

Examples:

```text
candidate identity
assessment participation
attempt timeline
score
outcome
dimension breakdown
employer report
```

Access must remain restricted to:

```text
candidate where appropriate
authorized organization owner/admin
authorized IncidentRank platform admin for support
```

Do not expose candidate assessment results publicly.

Do not include employer-assessment information in Engineer Rank.

---

# 12. Engineer Rank privacy

Engineer Rank remains personal profile information.

Default:

```text
private to user
```

Platform admins may inspect only where necessary for support/operations.

Organization owners do NOT automatically gain access to a candidate's personal Engineer Rank.

Do not change this boundary.

---

# 13. Leaderboard consent

The global leaderboard is a separate public-data feature.

Keep:

```text
leaderboardVisible
```

or equivalent as an explicit user-controlled opt-in.

Acceptance of Terms must NOT automatically enable leaderboard participation.

Do not precheck leaderboard consent.

The UI should clearly explain that opting in makes selected profile information publicly visible.

Show exactly what becomes public.

For example:

```text
Display name
IncidentRank band
Normalized leaderboard score
Qualifying incidents count
Evidence breadth
```

Do not expose:

```text
email
billing
assessment reports
practice timelines
private dimension breakdown
organization membership
```

---

# 14. Terms of Service

Create:

```text
/terms
```

with a versioned Terms of Service document.

Create a version identifier such as:

```text
2026-10-v1
```

or:

```text
terms-v1
```

Keep versioning explicit.

Do not rely only on file modification date.

---

# 15. Privacy Policy

Create:

```text
/privacy
```

with a versioned Privacy Policy.

Document:

- categories of information collected
- information users provide
- information organizations provide
- assessment data
- practice data
- Engineer Rank
- leaderboard information
- billing/transaction information
- referral data
- security/audit information
- technical/log information actually collected
- purposes of processing
- service providers/processors
- retention
- disclosure to organizations for assessments
- public leaderboard disclosure when user opts in
- privacy rights/request process
- account deletion
- security
- children/age policy
- updates to policy
- contact information

Do not claim behavior the system does not actually implement.

---

# 16. No-sale policy

IncidentRank's intended policy:

> IncidentRank does not sell users' personal information.

The Privacy Policy should state this clearly if accurate.

However, do not write:

```text
We never share information with third parties.
```

because IncidentRank uses external service providers.

Explain disclosure to service providers such as:

```text
Clerk
Stripe
Resend
hosting/database provider
monitoring provider if used
```

and disclosure to the inviting organization where a user participates in its assessment.

---

# 17. Service provider inventory

Create:

```text
docs/privacy/service_providers.md
```

Inventory all external processors actually used.

For each:

```text
Provider
Purpose
Data shared
Configuration
Retention knowledge if available
Production status
```

Do not list vendors that are not actually used.

---

# 18. Terms acceptance during registration

Every new user must affirmatively accept the Terms.

Recommended UI:

```text
[ ] I agree to the Terms of Service and acknowledge the Privacy Policy.
```

Terms and Privacy Policy must be linked.

Checkbox must:

- start unchecked
- be required
- not be bundled with leaderboard opt-in
- not be implied from simply clicking Sign Up

If Clerk-hosted signup makes inline acceptance difficult, implement an IncidentRank post-auth legal acceptance gate before product access.

---

# 19. Legal acceptance gate

Create a central policy such as:

```text
requireCurrentLegalAcceptance(user)
```

A user who has authenticated but has not accepted the current required Terms must be routed to:

```text
/legal/accept
```

or equivalent.

They should not gain normal product access until accepted.

Allow necessary access to:

```text
terms
privacy
logout
legal acceptance
```

---

# 20. Acceptance schema

Create an append-only table.

Suggested:

```text
legal_acceptances
- id
- user_id
- terms_version
- privacy_version
- acceptance_type
- accepted_at
- acceptance_source
- metadata if strictly necessary
```

Possible acceptance types:

```text
platform_terms
candidate_assessment_notice
organization_business_terms
```

Do not store unnecessary IP/device fingerprint information merely to strengthen evidence.

If IP address retention is considered useful for legal evidence, evaluate it explicitly against privacy minimization.

Default recommendation:

> timestamp + authenticated user + version is sufficient unless counsel advises otherwise.

---

# 21. Do not use a boolean only

Do NOT implement:

```text
users.accepted_terms = true
```

as the sole record.

Acceptance must preserve:

```text
who
what version
when
```

Historical acceptance should remain inspectable.

---

# 22. Terms updates

If required Terms version changes:

```text
current terms version != user's accepted version
```

then require re-acceptance before continued product use.

Privacy Policy acknowledgment can follow the same system where materially appropriate.

Do not require repeated acceptance for typo-only/non-material updates unless deliberately configured.

Use explicit current-version configuration.

---

# 23. Candidate assessment notice

Candidates need an assessment-specific acknowledgment before their first new assessment attempt.

Before starting, clearly state that:

- they were invited by the named organization
- their actions/performance during the assessment will be recorded
- IncidentRank will calculate results/metrics
- the inviting organization will be able to review the assessment report
- assessment results are separate from their private practice profile/Engineer Rank
- starting the assessment acknowledges this use

Require affirmative acknowledgment.

Do not hide this only in general Terms.

---

# 24. Candidate assessment acceptance

Store:

```text
user
assessment
organization
notice_version
accepted_at
```

Recommended table:

```text
assessment_consent_records
```

or reuse a generalized legal-acceptance system if clean.

One candidate should not need to accept repeatedly for page refreshes.

Materially different assessment/legal notice versions may require re-acceptance.

---

# 25. No assessment without acknowledgment

A candidate cannot start a new assessment without the required current notice acceptance.

Server-side enforcement required.

Do not rely only on UI checkbox.

Existing already-started attempts should remain resumable even if Terms/notice versions later change.

Do not strand an in-progress candidate.

---

# 26. Organization business terms

When an initial organization owner accepts organization ownership, require acceptance of applicable organization/business terms.

Additional owners should also accept the current organization terms when joining as owner.

Suggested language concepts:

- organization is responsible for lawful assessment use
- organization must have appropriate authority to invite candidates
- organization must comply with employment/privacy/anti-discrimination law
- assessment results should not be the sole basis for employment decisions
- organization is responsible for its own scenarios/content
- prohibited discriminatory/unlawful use
- payment/credit terms
- assessment credits represent candidate starts
- credits generally non-refundable except as stated
- account/security obligations

Do not treat these bullet points as final legal advice.

---

# 27. Organization acceptance storage

Store versioned acceptance:

```text
user_id
organization_id
terms_version
accepted_at
role_at_acceptance
```

When owner invitation is accepted:

```text
verify email
→ show business terms
→ affirmative acceptance
→ create/activate owner membership
```

or equivalent safe sequence.

---

# 28. Existing users

Existing users need migration behavior.

Do not pretend historical acceptance exists.

After Phase 10D activation:

```text
existing authenticated user
without current legal acceptance
→ legal acceptance gate
```

Do not automatically backfill acceptance.

---

# 29. Existing organizations

Existing org owners/admins should be required to accept current organization terms before performing new organization mutations after the feature is enabled.

Do not break read-only access unnecessarily.

Recommended:

```text
read historical org data → allowed
new org mutations → require current business terms
```

For initial rollout, if simpler and more consistent:

```text
organization owner/admin login
→ required business terms acceptance
→ normal org access
```

Document exact choice.

---

# 30. Age requirement

For beta, set IncidentRank to:

```text
18+
```

unless there is a concrete product requirement to support minors.

Terms should state that users must be at least 18 or the applicable age of majority required by the service.

Do not build parental-consent infrastructure in this phase.

---

# 31. Employment-decision disclaimer

Terms and organization terms should clearly state:

> IncidentRank provides technical assessment and decision-support information. IncidentRank does not make hiring, promotion, termination, or other employment decisions.

Organizations are responsible for how they use assessment results.

Recommended additional principle:

> IncidentRank assessment results should not be used as the sole basis for an employment decision.

Do not claim this language eliminates legal obligations.

---

# 32. Organization compliance obligation

Organization Terms should require customers to comply with applicable:

```text
employment law
anti-discrimination law
privacy law
accessibility obligations
assessment/testing requirements
automated-decision rules where applicable
```

Do not attempt to enumerate every jurisdiction's law in product code.

---

# 33. User content

Terms should address organization-created scenarios.

Organization represents that it has rights to content it uploads/creates.

IncidentRank needs sufficient license to:

- host
- process
- execute
- display to authorized candidates
- retain historical versions for completed assessments

Do not claim ownership over customer-created scenarios unless intentionally desired.

Recommended model:

```text
Customer retains ownership
IncidentRank receives service-operation license
```

---

# 34. IncidentRank intellectual property

Terms should reserve IncidentRank ownership of:

- built-in scenarios
- simulator
- scoring/ranking methodology
- software
- branding
- documentation

Do not expose proprietary scenario solutions through legal/public documentation.

---

# 35. Acceptable use

Terms should prohibit:

- unauthorized account access
- attempting to bypass payment/access controls
- scraping/private scenario extraction
- cheating or automated solving where prohibited
- abusive usage
- illegal use
- attempting to compromise platform security
- uploading content without rights
- using assessments unlawfully or discriminatorily

---

# 36. Beta terms

Because controlled beta follows this phase, Terms should include appropriate beta-service language.

Potential concepts:

```text
service may change
features may be modified
beta availability not guaranteed
reasonable maintenance/outages
no guarantee of employment outcomes
```

Avoid reckless disclaimers.

---

# 37. Payments and credits

Terms should accurately describe:

## Individual

```text
Pro subscription
Founding lifetime access
```

## Organization

```text
assessment credits
1 credit consumed when candidate starts assessment
```

Document that invitations themselves do not consume credits.

Reflect actual implemented refund/cancellation behavior.

Do not promise refunds that are not implemented.

---

# 38. Subscription cancellation

Terms should align with implemented Pro behavior:

```text
cancel at period end
→ access remains until paid period ends
```

Do not contradict Stripe/customer-portal behavior.

---

# 39. Founding access

Terms should accurately describe Founding Engineer as:

```text
lifetime practice access
```

subject to the Terms/service continued operation.

Do not imply ownership/equity or guaranteed perpetual company existence.

---

# 40. Limitation/disclaimer sections

Draft standard sections for:

- service disclaimers
- limitation of liability
- indemnification where appropriate
- suspension/termination
- account responsibility
- governing law
- disputes
- changes to Terms

These must be clearly marked for final attorney review.

Do not present AI-generated legal text internally as legally approved.

---

# 41. Privacy request mechanism

Create a clear privacy contact.

Recommended:

```text
privacy@incidentrank.com
```

If this email does not exist yet, document it as production configuration required.

Privacy Policy should explain users may request:

```text
access
correction
deletion
account closure
privacy questions
```

subject to legal/operational retention obligations.

---

# 42. Account deletion workflow

Implement or document an account deletion request path.

Do not blindly hard-delete all relational records.

Some data may need to remain for:

- financial records
- fraud/security
- audit
- completed employer assessments
- legal obligations
- integrity of organization records

Prefer:

```text
delete or anonymize personal data where appropriate
retain legally/operationally required records
```

Document actual behavior.

---

# 43. Self-service deletion

If straightforward, add:

```text
Settings → Delete Account
```

with strong confirmation.

If a safe self-service deletion flow is too risky for this phase, implement:

```text
Request Account Deletion
```

that records/supports a privacy request.

Do not fake instant deletion if the backend does not actually perform it.

---

# 44. Privacy request records

Recommended lightweight table:

```text
privacy_requests
- id
- user_id
- request_type
- status
- requested_at
- completed_at
- notes/internal_metadata
```

Request types:

```text
access
correction
deletion
other
```

Do not store unnecessary details in free-text notes.

---

# 45. Retention policy

Create:

```text
docs/privacy/data_retention.md
```

Define retention categories for:

```text
user profile
practice attempts
Engineer Rank history
leaderboard profile
assessment attempts/results
organization records
audit logs
billing records
Stripe identifiers
email/invitation records
referral records
security logs
privacy requests
```

Use actual implementable policy.

---

# 46. Avoid indefinite retention by accident

Do not simply write:

```text
we retain data as long as necessary
```

without an internal policy.

Even if public Privacy Policy uses flexible language, internal retention documentation should specify intended retention behavior.

If exact automated deletion is deferred, state:

```text
manual retention policy in beta
```

and record it as post-beta automation work.

---

# 47. Audit log retention

Audit logs have legitimate security/governance value.

Do not delete them casually.

Where possible, remove/minimize unnecessary personal payloads inside audit metadata.

Use stable IDs instead of copying emails/names repeatedly.

---

# 48. Logging review

Search server/application logs for:

```text
email
full request body
authorization headers
Clerk token
Stripe secret
webhook secret
assessment reasoning
candidate report
invite token
promo token
referral secret
```

Remove or sanitize risky logging.

Never log raw bearer/invite tokens.

---

# 49. URL/token leakage

Review invitation/promo/referral URLs.

Do not:

- log full secret-bearing URL unnecessarily
- expose tokens to third-party analytics
- store plaintext secret tokens where hashed verification works

Use secure one-time tokens where appropriate.

---

# 50. Email content minimization

Transactional emails should contain only what the recipient needs.

Do not include:

- assessment score in email
- candidate report
- billing details beyond necessary receipts/links
- sensitive organization audit information

Prefer secure authenticated links back into IncidentRank.

---

# 51. Admin privacy

Platform admins may access personal/customer information for legitimate support/governance.

Do not expand admin access beyond current operational need.

Admin views should continue avoiding:

- raw payment details
- passwords/auth secrets
- unnecessary candidate reasoning
- private practice details unless needed for support

---

# 52. Admin audit

Legal/privacy-sensitive admin actions should be audited.

Examples:

```text
privacy_request_viewed
privacy_request_completed
account_deletion_requested
account_anonymized
legal_version_changed
```

Do not log sensitive request content unnecessarily.

---

# 53. Legal documents configuration

Create central current-version config.

Example:

```text
CURRENT_TERMS_VERSION
CURRENT_PRIVACY_VERSION
CURRENT_ASSESSMENT_NOTICE_VERSION
CURRENT_ORG_TERMS_VERSION
```

Do not hardcode versions independently across pages/routes.

---

# 54. Legal document storage

Documents may live as code/markdown content if that fits the repository.

Ensure:

```text
version is immutable once published
```

Do not edit the text under an existing version identifier after users accepted it.

A changed substantive document must get a new version.

---

# 55. Acceptance API security

Any acceptance route must derive:

```text
authenticated user
```

server-side.

Do not accept arbitrary:

```text
user_id
```

from browser.

Record actual version accepted.

Reject unknown/future versions supplied by client.

---

# 56. Acceptance UX

Avoid dark patterns.

Do not:

- precheck consent
- combine leaderboard opt-in with Terms
- hide key assessment disclosure
- claim optional marketing consent is required

Transactional/legal acceptance and optional visibility/marketing choices must remain distinct.

---

# 57. Marketing consent

Do NOT add marketing email opt-in unless IncidentRank actually intends to send marketing email.

Transactional emails do not require a fake marketing-consent checkbox.

If marketing is added later, make it separate and optional.

---

# 58. Cookies/analytics inventory

Audit whether IncidentRank currently uses:

```text
analytics
advertising pixels
session replay
tracking cookies
third-party behavioral tracking
```

If none are used:

document that.

Do not add a cookie banner merely because websites often have one.

If non-essential tracking exists:

document it and implement required consent behavior appropriate to deployment.

---

# 59. No sale / no advertising profiling

Unless product direction changes:

```text
do not sell personal information
do not use candidate assessment data for targeted advertising
do not use practice/assessment data for third-party advertising profiles
```

Privacy Policy should reflect actual product behavior.

---

# 60. AI/model training

Explicitly decide whether customer/candidate data is used to train models.

Recommended beta policy:

```text
Do not use private user practice data,
organization scenarios,
candidate assessments,
or employer reports
to train external/general-purpose models.
```

If no AI training currently happens, state that clearly internally and ensure Privacy Policy does not imply otherwise.

Do not send private assessment data to AI providers unless a future feature explicitly requires it and legal/privacy review occurs.

---

# 61. Data export

If feasible, implement a basic user-data export.

Could include:

```text
profile
practice attempts
Engineer Rank snapshots
legal acceptances
referral information
personal billing references/history
```

Do not include:

- another user's data
- employer-private information outside their rights
- proprietary scenario answer keys

If full export is too large for beta, implement a documented support process.

---

# 62. Organization data ownership

Organization data remains associated with organization.

A user leaving an organization does not automatically delete:

```text
organization scenarios
assessment history
candidate reports
billing history
audit trail
```

Privacy policy/terms should explain this appropriately.

---

# 63. Candidate account deletion vs employer records

Be careful with deletion.

A candidate may request account deletion, while an organization may have legitimate reasons to retain an assessment record.

Design separation between:

```text
candidate account identity
```

and:

```text
organization assessment record
```

where appropriate.

Anonymization may be preferable to destructive removal when historical organizational integrity must remain.

Document exact behavior and flag for legal review.

---

# 64. Security headers

Review production web security basics:

```text
HTTPS only
secure cookies
HttpOnly where appropriate
SameSite
Content-Security-Policy where practical
X-Content-Type-Options
Referrer-Policy
frame protections
```

Do not invent custom crypto where platform/framework security is sufficient.

---

# 65. Encryption

Confirm:

```text
database encrypted at rest
TLS in transit
Stripe HTTPS
Clerk HTTPS
Resend HTTPS
```

through provider/platform configuration.

For especially sensitive locally stored fields, evaluate application-level encryption only if there is a real threat-model benefit.

Do not introduce homemade encryption.

---

# 66. Secrets

Audit:

```text
.env.example
repository history/current tracked files
logs
admin responses
client bundles
```

for:

```text
Stripe secret keys
Stripe webhook secrets
Clerk secrets
Resend API keys
database credentials
```

No secret should reach the browser bundle.

---

# 67. Public profile enumeration

Review leaderboard/profile APIs.

Opt-out user must not appear through:

- UI
- public API
- search
- direct ID enumeration

Do not rely only on hiding leaderboard row.

---

# 68. Candidate privacy boundary regression tests

Ensure organization users still cannot see:

```text
candidate practice history
candidate private Engineer Rank
candidate billing
candidate passes
candidate referrals
other-org assessments
```

Terms/privacy work must not weaken these boundaries.

---

# 69. Required automated tests — legal acceptance

Test:

1. new authenticated user without acceptance is gated
2. Terms page remains accessible
3. Privacy page remains accessible
4. correct version acceptance succeeds
5. acceptance creates append-only record
6. forged user ID ignored/rejected
7. invalid version rejected
8. old-version user is re-gated when current version changes
9. acceptance does not enable leaderboard
10. repeated same-version acceptance idempotent or safely recorded according to policy
11. historical acceptance preserved

---

# 70. Required tests — assessment consent

Test:

1. candidate can view assessment notice
2. no acceptance → new assessment start blocked
3. acceptance → start allowed
4. wrong user cannot accept for candidate
5. consent bound to correct assessment/org
6. repeated acceptance safe
7. already-started assessment resume not blocked by later notice-version change
8. consent acceptance does not expose report prematurely

---

# 71. Required tests — organization terms

Test:

1. initial owner must accept business terms
2. additional owner must accept business terms
3. admin/member behavior follows chosen policy
4. wrong user cannot accept another owner's terms
5. acceptance version persisted
6. old-version owner re-gated after material version change if policy requires
7. business-term acceptance does not grant unrelated platform permissions

---

# 72. Required tests — leaderboard privacy

Test:

1. default private
2. Terms acceptance does not opt user in
3. explicit opt-in makes allowed fields visible
4. opt-out removes public visibility
5. email never exposed
6. assessment details never exposed
7. skill/dimension detail remains private
8. direct API honors visibility

---

# 73. Required tests — payment minimization

Test or inspect:

1. no PAN persisted
2. no CVC persisted
3. no raw Stripe object persisted
4. webhook raw payload not stored
5. payment metadata limited to allowlisted fields
6. checkout/payment IDs retained correctly
7. customer dashboard still works without raw payment data

---

# 74. Required tests — token safety

Review/test:

```text
owner invites
member invites
promo invites
referrals
password-like/reset-like tokens
```

Ensure appropriate token types are:

- high entropy
- not logged
- hashed at rest when secrecy is required
- expired/revocable where appropriate

---

# 75. Browser QA

Create:

```text
docs/qa/phase10d/
```

Required stories:

## QA-01 — New user Terms gate

Sign up/sign in as new user.

Verify product access blocked until acceptance.

## QA-02 — Terms and Privacy links

Verify both readable before acceptance.

## QA-03 — Acceptance

Accept.

Verify access works and DB record has versions/timestamp.

## QA-04 — Leaderboard remains private

After Terms acceptance, verify not public automatically.

## QA-05 — Leaderboard explicit opt-in

Enable it.

Verify only permitted fields become public.

## QA-06 — Leaderboard opt-out

Disable.

Verify removal from public leaderboard/API.

## QA-07 — Existing user migration

Existing user without acceptance gets gated after rollout.

## QA-08 — Candidate assessment notice

Candidate sees disclosure before first start.

## QA-09 — Candidate refuses/no acceptance

Start blocked.

## QA-10 — Candidate accepts

Start succeeds.

## QA-11 — Existing candidate resume

Start assessment, simulate new notice version, verify resume still works.

## QA-12 — Initial org owner terms

Owner cannot activate/join without required business acceptance.

## QA-13 — Additional owner terms

Additional owner accepts before ownership activation.

## QA-14 — Privacy request

User can submit deletion/access request or follow implemented workflow.

## QA-15 — Admin privacy support

Authorized admin can inspect request state; normal user cannot.

## QA-16 — Payment inspection

Verify DB and admin UI store only minimal Stripe/payment identifiers and amounts.

## QA-17 — Candidate/org privacy regression

Org owner still cannot see candidate personal Rank/practice/billing/referral data.

## QA-18 — Public privacy regression

Public/unauthenticated visitor cannot enumerate private profiles.

---

# 76. Manual privacy/security review

Perform a deliberate review after implementation.

Search code/schema for:

```text
email
name
token
secret
stripe
clerk
assessment
candidate
report
rank
referral
invite
ip
userAgent
authorization
cookie
```

Document findings.

Create:

```text
docs/privacy/privacy_security_review.md
```

Classify issues:

```text
BLOCKER
FIXED
ACCEPTED_FOR_BETA
DEFERRED
```

---

# 77. Legal text disclaimer

The generated Terms and Privacy Policy are drafts.

Place a note in internal documentation:

```text
LEGAL REVIEW REQUIRED BEFORE PRODUCTION BETA
```

Do not show that internal note inside the public Terms unless desired.

Final public legal documents should be reviewed by qualified counsel, especially because IncidentRank includes:

- employer assessments
- candidate performance reporting
- automated scoring
- Engineer Rank
- public leaderboard
- payments
- organization customers
- employment-related usage

---

# 78. Beta-blocking legal configuration

Completion report must identify any remaining configuration such as:

```text
privacy@incidentrank.com setup
legal entity name
business mailing address
governing law / jurisdiction
support contact
effective dates
actual infrastructure vendor names
retention periods
attorney review
```

Do not invent company legal information.

Use placeholders where facts are unknown.

---

# 79. Full validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
pnpm build
pnpm --filter @incidentrank/db db:seed
```

If normal parallel tests are now safe:

```bash
pnpm test
```

Built-in scenario count must remain:

```text
100
```

---

# 80. Completion report

Create:

```text
docs/implementation_plan/phase10d_privacy_terms_data_minimization_completion.md
```

Include:

## Data inventory
- PII categories
- purpose
- storage
- access
- retention
- protection method

## Data minimization
- removed fields/data
- data deliberately not persisted
- Stripe minimization
- Clerk minimization
- logging changes

## Terms
- version
- acceptance flow
- migration for existing users
- re-acceptance policy

## Privacy Policy
- version
- covered data
- service providers
- no-sale statement
- leaderboard disclosure
- assessment disclosure

## Candidate consent
- assessment notice
- acceptance storage
- server enforcement
- resume behavior

## Organization terms
- owner acceptance
- business responsibilities
- versioning

## Leaderboard privacy
- explicit opt-in
- public fields
- opt-out

## Privacy requests
- workflow
- deletion/account handling
- retention constraints

## Security review
- token storage
- secrets
- logs
- payment data
- headers
- encryption configuration

## Browser QA
- all required stories
- defects
- fixes
- retests

## Validation
- tests
- build
- seed

## Legal review
- list every unresolved item requiring attorney/business input

---

# 81. Completion criteria

Phase 10D is complete only when:

1. all stored personal-data categories are inventoried
2. unnecessary stored data is removed where safe
3. raw card data is never stored
4. CVC is never stored
5. raw Stripe objects are not persisted unnecessarily
6. sensitive tokens are hashed where appropriate
7. logs do not leak secrets/tokens/payment data
8. Terms page exists
9. Privacy Policy exists
10. both documents are versioned
11. new users must affirmatively accept Terms
12. acceptance record stores user/version/time
13. historical acceptance records are preserved
14. existing users are gated until current acceptance
15. Terms acceptance does not opt into leaderboard
16. leaderboard remains explicit opt-in
17. public leaderboard fields are minimized
18. candidate assessment notice exists
19. candidate must acknowledge before new assessment start
20. in-progress assessment resume remains safe
21. organization owners accept business terms
22. additional owners accept applicable terms
23. privacy-request mechanism exists
24. deletion/retention behavior is documented honestly
25. service-provider inventory exists
26. candidate privacy boundaries remain intact
27. organization isolation remains intact
28. payment/billing flows still work
29. Engineer Rank still works
30. public profile privacy is verified
31. browser QA passes
32. automated tests pass
33. production build passes
34. scenario count remains 100
35. completion report written
36. unresolved attorney-review items explicitly listed

---

# 82. Explicitly deferred

Do NOT implement in Phase 10D:

```text
complex GDPR automation platform
automated legal-jurisdiction engine
multi-region data residency
enterprise DPA automation
SOC 2 certification
ISO certification
automated Stripe refund reconciliation
cookie-consent platform if no non-essential tracking exists
marketing automation
AI training on private customer/candidate data
```

Document these separately if later needed.

---

# 83. Stop condition

Stop after:

```text
data minimization
Terms
Privacy Policy
legal acceptance
assessment notice
organization terms
privacy request workflow
security/privacy review
browser QA
full validation
completion report
```

Do not begin production deployment automatically.

The next phase after successful Phase 10D is:

```text
Phase 11 — Production Configuration & Controlled Beta Launch
```

Before Phase 11 begins, explicitly report:

```text
READY_FOR_LEGAL_REVIEW
or
NOT_READY_FOR_LEGAL_REVIEW
```

and list every remaining item that must be supplied or approved by the business/attorney before production beta.