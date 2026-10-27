Implement **IncidentRank Phase 10B — Organization Assessment Credits & Billing**.

Phase 10A is complete.

IncidentRank now has:

- platform-admin-provisioned organizations
- `mpant@incidentrank.com` as platform owner
- platform-admin-controlled org creation
- owner/admin/member organization roles
- owner invitation flows
- organization suspension/reactivation
- organization audit trails
- private organization scenarios
- scenario versioning
- assessment ownership/isolation
- candidate invitation flows
- candidate privacy protections
- Stripe TEST MODE integration for individual Pro / Founding Engineer payments

Phase 10B introduces **organization assessment credits and organization billing**.

This phase is not subscription billing for organizations.

Organizations purchase assessment credits whenever they want.

There is no required recurring subscription.

---

# 1. Commercial model

The organization pricing model is:

## Single assessment credit

```text
$50 USD
1 assessment credit
```

## Assessment credit pack

```text
$5,000 USD
110 assessment credits
```

No organization subscription is required.

Organizations may purchase credits as needed.

The 110-credit pack intentionally provides:

```text
110 credits for the price of 100 single credits
```

Do not reinterpret pricing.

---

# 2. Credit definition

One credit represents:

> One candidate beginning one organization assessment attempt.

The credit is consumed when the candidate actually starts the assessment.

Do NOT consume a credit when:

- assessment is created
- candidate is invited
- email is sent
- candidate opens invitation
- candidate accepts invitation
- candidate views assessment landing page

Consume only when:

```text
incident_started_at becomes non-null
```

or the exact authoritative equivalent in the existing assessment lifecycle.

The existing Phase 7/10A start/resume behavior must remain intact.

---

# 3. Core doctrine

The billing invariant is:

```text
1 candidate starts 1 assessment
→ exactly 1 assessment credit consumed
```

Never:

```text
duplicate request
refresh
resume
double-click
webhook replay
two browser tabs
```

consume more than one credit for the same assessment attempt.

---

# 4. Credit ownership

Credits belong to the organization.

Not to:

- individual owner
- individual admin
- candidate
- assessment creator
- Stripe customer user personally

Conceptually:

```text
Organization
    ↓
Credit Balance / Ledger
    ↓
Assessment Attempts
```

Changing organization owners must not move or destroy credits.

---

# 5. Stripe catalog

Create or use dedicated Stripe TEST MODE products/prices for organization assessment credits.

Do NOT reuse:

```text
IncidentRank Pro
IncidentRank Founding Engineer
```

Those are individual practice products.

Organization billing must be separate.

Preferred Stripe catalog:

## Product 1

```text
IncidentRank Assessment Credit
```

Description:

```text
One candidate assessment attempt on IncidentRank.
```

Price:

```text
$50 USD
one-time
```

Metadata:

```text
application = incidentrank
product_family = organization_assessment
billing_type = credits
credits = 1
```

## Product 2

```text
IncidentRank Assessment Credit Pack
```

Description:

```text
110 candidate assessment credits for IncidentRank organizations.
```

Price:

```text
$5,000 USD
one-time
```

Metadata:

```text
application = incidentrank
product_family = organization_assessment
billing_type = credits
credits = 110
```

If exact matching TEST MODE Stripe products/prices already exist:

- reuse them
- do not create duplicates

Do not touch live Stripe objects.

If catalog creation is performed during this phase, first inspect TEST MODE for exact matches.

---

# 6. Environment configuration

Use configuration such as:

```env
STRIPE_ORG_SINGLE_CREDIT_PRODUCT_ID=
STRIPE_ORG_SINGLE_CREDIT_PRICE_ID=

STRIPE_ORG_CREDIT_PACK_PRODUCT_ID=
STRIPE_ORG_CREDIT_PACK_PRICE_ID=
```

Do not hardcode IDs.

Do not commit real IDs or secrets.

Use blank placeholders in `.env.example`.

Existing Stripe secrets remain unchanged.

---

# 7. Feature flags

Add explicit server-enforced organization billing flags.

Suggested:

```env
ORG_BILLING_ENABLED=false
ORG_CREDIT_PURCHASE_ENABLED=false
ORG_CREDIT_CONSUMPTION_ENABLED=false
```

Or use a smaller set if cleaner.

Requirements:

- UI hiding is not sufficient
- checkout route must enforce flag
- credit purchase mutation must enforce flag
- credit consumption policy must be server-authoritative
- disabling purchase should not erase existing credits
- existing assessment attempts must remain resumable

---

# 8. Organization Stripe customer mapping

Do not use an owner's personal Stripe customer for organization purchases.

Create a distinct organization Stripe customer mapping.

Suggested:

```text
organization_stripe_customers
- id
- organization_id
- stripe_customer_id
- billing_email
- created_at
- updated_at
```

Unique:

```text
organization_id
stripe_customer_id
```

Stripe Customer metadata should include:

```text
application = incidentrank
organization_id = <org-id>
organization_slug = <slug if useful>
```

Organization identity is authoritative.

Do not use email alone as the mapping key.

---

# 9. Billing email

Organization billing email should initially default to an organization owner email or explicit billing email.

Prefer storing:

```text
billing_email
```

at the organization billing/customer level.

Do not permanently couple billing to whichever owner made the first purchase.

Future owner changes should not break billing history.

---

# 10. Credit ledger

Use an immutable ledger.

Do NOT implement only:

```text
organizations.credit_balance
```

as the authoritative source.

Suggested:

```text
organization_credit_ledger
- id
- organization_id
- transaction_type
- quantity
- assessment_id
- attempt_id
- stripe_checkout_session_id
- stripe_payment_intent_id
- source_id
- reason
- created_by_user_id
- created_at
```

Transaction types:

```text
purchase
assessment_started
admin_adjustment
refund
reversal
expiration
```

Do not implement expiration unless explicitly required.

Recommended V1 credits:

```text
do not expire
```

---

# 11. Ledger quantities

Use signed quantities.

Examples:

```text
purchase single      +1
purchase pack        +110
assessment started   -1
admin restore        +1
manual adjustment    +/-N
```

Balance:

```text
SUM(quantity)
```

The ledger is authoritative.

If a cached balance is added for performance:

- it must be derived
- it must be transactionally consistent
- ledger remains source of truth

---

# 12. Credit transaction idempotency

Every credit-affecting operation needs a stable idempotency key/source.

Examples:

Purchase:

```text
Stripe Checkout Session ID
```

Assessment consumption:

```text
attempt ID
```

Refund/reversal:

```text
original ledger transaction ID
```

Add DB uniqueness constraints.

At minimum:

```text
one purchase ledger credit per Stripe Checkout Session
one consumption ledger entry per attempt
```

Recommended unique indexes:

```text
UNIQUE(stripe_checkout_session_id)
WHERE transaction_type = purchase
```

and equivalent:

```text
UNIQUE(attempt_id)
WHERE transaction_type = assessment_started
```

Adapt to Drizzle/Postgres capabilities.

---

# 13. Credit balance helper

Create one central helper.

Conceptually:

```text
getOrganizationCreditBalance(organizationId)
```

Returns:

```text
purchased
consumed
adjusted
available
```

Do not implement balance logic separately in UI/routes.

---

# 14. Organization purchase permissions

Recommended:

## Owner

May purchase credits.

## Admin

May purchase credits.

## Member

May not purchase.

Platform admins may inspect billing but should not normally purchase credits on behalf of an org unless an explicit support/admin flow exists.

Use:

```text
active organization
+
owner/admin membership
```

as the purchase authorization.

Suspended organizations cannot purchase credits.

---

# 15. Organization checkout route

Implement a server-authoritative route.

Suggested:

```text
POST /api/organizations/[slug]/billing/checkout
```

Input:

```text
plan = single_credit | credit_pack_110
```

Never accept an arbitrary Stripe Price ID from the browser.

Server mapping:

```text
single_credit
→ STRIPE_ORG_SINGLE_CREDIT_PRICE_ID
→ credits = 1

credit_pack_110
→ STRIPE_ORG_CREDIT_PACK_PRICE_ID
→ credits = 110
```

Reject anything else.

---

# 16. Checkout eligibility

Before creating Stripe Checkout:

```text
authenticate
→ resolve organization
→ verify membership
→ verify owner/admin role
→ requireActiveOrganization()
→ verify org billing flags
→ get/create organization Stripe customer
→ create Checkout Session
```

Use:

```text
mode = payment
```

These are one-time purchases.

---

# 17. Checkout metadata

Stripe Checkout metadata should contain enough safe identifiers to reconcile.

Recommended:

```text
application = incidentrank
purchase_type = organization_assessment_credits
organization_id = <id>
credit_quantity = 1 | 110
```

Optionally include:

```text
purchasing_user_id
```

for audit.

Do not trust metadata without validating:

- Stripe price ID
- organization mapping
- expected purchase type

---

# 18. Organization billing success page

Suggested:

```text
/organizations/[slug]/billing/success
```

The redirect is informational.

Show:

```text
Payment received. We're confirming your assessment credits.
```

If webhook has already processed:

```text
110 assessment credits added.
```

Do NOT mutate ledger from success page.

Verified webhook processing is authoritative.

---

# 19. Webhook integration

Reuse the existing central:

```text
POST /api/stripe/webhook
```

Do not create a second Stripe webhook endpoint for org billing.

Extend the existing verified, idempotent Stripe webhook architecture.

Do not weaken current signature verification or event ledger behavior.

---

# 20. Organization purchase webhook handling

For:

```text
checkout.session.completed
```

if:

```text
mode = payment
purchase_type = organization_assessment_credits
```

then:

1. validate Stripe event signature
2. validate Checkout Session
3. validate configured Price ID
4. derive expected credit quantity from server configuration
5. resolve organization
6. confirm organization Stripe customer mapping
7. confirm payment is successful/eligible
8. insert exactly one purchase ledger entry
9. mark webhook event processed

Do not trust `credit_quantity` metadata as the authoritative quantity.

The configured Price ID determines credits.

---

# 21. Purchase idempotency

Webhook replay must not add credits twice.

Example:

```text
cs_test_123
```

processed twice:

```text
+110 exactly once
```

Add automated replay tests.

---

# 22. Unexpected price handling

Unknown Price ID:

```text
do not credit organization
```

Even if metadata says:

```text
credit_quantity = 110
```

Metadata is not enough.

Only configured organization billing Price IDs can grant credits.

---

# 23. Assessment start credit requirement

A new organization assessment attempt must require:

```text
available organization credit >= 1
```

unless there is an explicit future admin override.

Candidate should not be responsible for purchasing credits.

At candidate start:

```text
valid candidate assignment
+
active organization
+
available credit
→ start allowed
```

---

# 24. Credit consumption timing

Consume when the real candidate attempt begins.

Use the existing authoritative assessment-start path.

The transaction should include:

```text
verify candidate assignment
verify org active
verify balance
create/start attempt
write -1 ledger entry
```

These must be concurrency-safe.

Never:

```text
check balance
COMMIT
later consume
```

as separate unsafe operations.

---

# 25. Race-safe consumption

Critical case:

```text
organization has 1 credit

Candidate A starts assessment
Candidate B starts assessment
at the same time
```

Expected:

```text
one starts
one receives no-credit response
balance = 0
```

Never:

```text
balance = -1
```

Use a DB-safe strategy.

Possible:

- organization credit balance row locked with `FOR UPDATE`
- serialized ledger reservation
- dedicated credit-balance state table + ledger
- Postgres advisory lock
- another safe strategy

Choose the cleanest fit with existing architecture.

The ledger must still remain authoritative/auditable.

---

# 26. Recommended balance-lock model

It may be useful to add:

```text
organization_credit_accounts
- organization_id
- cached_balance
- updated_at
```

with one row per organization.

Then:

```text
BEGIN
SELECT account FOR UPDATE
verify balance >= 1
insert ledger -1
update cached balance
create/start attempt
COMMIT
```

If used:

- ledger remains source of truth
- cached balance must reconcile to ledger
- tests must verify no drift

This is optional if another safe strategy is cleaner.

---

# 27. Existing attempt resume

Critical rule from Phase 10A:

```text
already-started assessment attempt
→ resume allowed
```

Do not require another credit on resume.

The route ordering should remain:

```text
existing attempt?
→ return/resume

otherwise:
→ organization active?
→ credit available?
→ consume one
→ start
```

---

# 28. Duplicate start requests

Two simultaneous start requests for the same candidate assessment must:

```text
create one attempt
consume one credit
```

not:

```text
create one attempt
consume two credits
```

Use attempt idempotency + ledger uniqueness.

Add concurrency test.

---

# 29. Suspended organizations

Phase 10A suspension doctrine remains authoritative.

Suspended org:

- cannot purchase credits
- cannot start new candidate assessment
- cannot consume credits
- existing credits remain intact
- existing attempts may resume/complete
- historical billing remains readable

Reactivation restores purchase/start capability.

---

# 30. Pending organizations

Pending org:

- cannot purchase credits
- cannot consume credits
- cannot start assessments

Initial owner must first activate organization through Phase 10A owner invitation.

---

# 31. Credit purchase does not create assessment

Credits and assessments are separate.

Organization can:

```text
buy 110 credits
```

without creating any assessment immediately.

Balance persists until used.

---

# 32. Assessment creation does not consume credit

Org owner/admin may create any number of assessment definitions without consumption.

Credit consumption is candidate-start based.

Example:

```text
Assessment: Staff Backend Hiring
50 candidate invitations
```

No credit consumed merely from creation/invites.

If only 17 candidates start:

```text
17 credits consumed
```

---

# 33. Candidate invitation does not reserve credit

Do not reserve a credit merely for an invite.

Reason:

- many invitations may never be used
- unused invitations should not lock purchased capacity

Credit availability is evaluated when the candidate actually starts.

---

# 34. No-credit candidate UX

When a valid candidate tries to start but org has no credits:

Do not expose billing internals.

Suggested candidate copy:

```text
This assessment is temporarily unavailable.
Please contact the organization that invited you.
```

Do not show:

```text
Your employer has 0 credits.
```

Org owner/admin should see:

```text
No assessment credits available.
Purchase credits to allow new candidate starts.
```

---

# 35. Organization billing page

Add:

```text
/organizations/[slug]/billing
```

Owner/admin only.

Show:

```text
Assessment credits available

Purchased
Used
Adjusted
Available
```

Products:

```text
1 Assessment Credit
$50

110 Assessment Credits
$5,000
```

Buttons:

```text
Buy 1 Credit
Buy 110 Credits
```

No subscription UI.

---

# 36. Billing history

Show organization billing history.

At minimum:

```text
Date
Type
Credits
Description
Related assessment/candidate if relevant
Purchaser/admin
```

Purchase entries may show:

```text
+110
Purchased assessment credit pack
```

Consumption:

```text
-1
Candidate started <Assessment>
```

Admin adjustment:

```text
+1
Credit restored by IncidentRank support
```

Do not expose sensitive candidate assessment result data in billing history.

---

# 37. Stripe payment history

Do not build a full accounting system.

For purchases show basic Stripe-related information if useful:

```text
purchase date
credits
amount
payment status
```

Do not expose card details.

Stripe remains payment processor/source for monetary transaction details.

IncidentRank ledger remains credit source of truth.

---

# 38. Admin organization billing visibility

Extend platform admin organization detail.

Show:

```text
credit balance
purchased credits
consumed credits
adjustments
organization Stripe customer
recent purchase transactions
```

Platform admins may inspect ledger.

---

# 39. Platform admin credit adjustment

Platform admins need a controlled adjustment tool.

Use cases:

- IncidentRank infrastructure failure
- support correction
- goodwill credit
- billing correction

Allow:

```text
+N
-N
```

but require:

```text
reason
```

Add audit event.

Never edit/delete historical ledger entries.

Adjustment creates a new ledger transaction.

---

# 40. Adjustment safety

Do not allow an adjustment that produces an invalid negative balance unless explicitly designed.

Recommended:

```text
admin negative adjustment cannot make available balance < 0
```

If support needs more complex corrections later, handle separately.

---

# 41. Automatic refund/restore policy

Do not automatically restore a credit simply because candidate:

- fails
- declares unstable
- times out
- performs poorly

Those are legitimate assessment attempts.

Credit represents an attempt, not a successful completion.

---

# 42. Infrastructure-failure credit restoration

If IncidentRank itself fails after consuming a credit but before a meaningful attempt can occur, a platform admin may restore the credit manually.

Do not automatically build complex fault-detection/refund logic in V1.

Record:

```text
admin_adjustment +1
reason = ...
related attempt ID
```

---

# 43. Abandoned candidate attempt

If candidate legitimately starts and abandons:

```text
credit remains consumed
```

Do not refund automatically.

---

# 44. Candidate retry policy

Do not invent free retry behavior.

If employer wants candidate to retry:

- create/allow another attempt according to existing assessment policy
- that new attempt consumes another credit when started

If current assessment model prohibits retries, preserve that.

---

# 45. Audit events

Extend platform and organization audit trails.

Required organization audit actions:

```text
credits_purchased
assessment_credit_consumed
```

Required platform-admin actions:

```text
credit_adjustment
```

Optional:

```text
credit_purchase_failed
```

if operationally useful.

Include:

```text
organization_id
actor
quantity
ledger_entry_id
assessment/attempt id if relevant
timestamp
```

Do not log card/payment secrets.

---

# 46. Organization permissions

Recommended:

```text
owner:
  view billing
  purchase credits

admin:
  view billing
  purchase credits

member:
  no billing access
```

If business policy prefers owner-only purchasing, document and test it.

Default for Phase 10B:

> owner and admin may purchase.

Platform admins may inspect and adjust.

---

# 47. Candidate-facing billing isolation

Candidate must never see:

- credit balance
- purchase history
- Stripe customer ID
- organization payment details
- pricing-pack purchase history

They only see assessment availability.

---

# 48. Cross-organization billing isolation

Critical.

Org A owner/admin cannot view or mutate Org B:

- credit balance
- billing page
- ledger
- Stripe customer
- checkout
- purchase history
- adjustments
- assessment credit consumption

Test via:

- UI
- direct API
- guessed org slug/id
- Stripe-related route calls

---

# 49. Stripe customer isolation

A Stripe Customer mapped to Org A can never be reused for Org B.

Unique organization mapping.

Do not infer organization from purchaser email.

---

# 50. Existing individual Stripe customer separation

A user may simultaneously have:

```text
personal Stripe customer
```

for Pro/Founding,

and:

```text
organization Stripe customer
```

for company credit purchases.

These are separate concepts.

Do not accidentally reuse `stripe_customers` personal mapping for organization purchases.

---

# 51. Admin user purchases for multiple orgs

If one user is owner/admin of multiple orgs:

Each organization's purchase must go to that organization's Stripe customer and ledger.

Never:

```text
user → global org credit balance
```

---

# 52. Organization suspension during checkout

Race case:

```text
org active
→ checkout created
→ org suspended
→ payment completes
```

Recommended policy:

Payment was valid, so:

```text
credits are still added
```

but suspension prevents them from being consumed until reactivation.

Do not lose paid credits.

Document and test.

---

# 53. Organization suspended before checkout creation

If already suspended:

```text
checkout creation denied
```

---

# 54. Org status after webhook

Webhook purchase processing should not require organization to still be active.

Reason:

```text
valid payment already happened
```

Credits should be recorded.

Suspension affects future use, not ownership of purchased credits.

---

# 55. Organization deletion/closure

Phase 10A deferred `closed`.

Do not add deletion semantics here unless necessary.

Credits remain associated with organization record.

---

# 56. Assessment association

Ledger consumption entry should reference:

```text
assessment_id
attempt_id
```

where practical.

This gives traceability:

```text
credit
→ assessment
→ candidate attempt
```

---

# 57. Credit lineage admin view

Admin should be able to trace:

```text
Stripe Checkout
→ Purchase ledger entry
→ Organization balance

Assessment
→ Candidate attempt
→ Consumption ledger entry
```

For support, this lineage is important.

---

# 58. Checkout failure behavior

If Stripe Checkout Session creation fails:

- no credits added
- no purchase ledger entry
- return clean error
- no dangling business state beyond Stripe customer if one was created

No credit reservation is needed for purchases.

---

# 59. Payment completion before webhook

If browser returns before webhook:

show:

```text
Payment received. We're confirming your credits.
```

Do not manually credit from browser.

Refresh may show updated balance once webhook completes.

---

# 60. Stripe webhook replay

Replay purchase event:

```text
same Checkout Session
```

must not duplicate credit.

Test genuine replay/idempotency.

---

# 61. Partial/failed payment

Do not issue credits for incomplete/failed/unpaid session.

Verify payment status according to Stripe Checkout semantics.

---

# 62. Refund handling

For V1, choose and document one policy.

Recommended:

If a Stripe refund is manually performed:

```text
do NOT silently alter credits unless a dedicated refund event/policy is implemented
```

Better option if straightforward:

Process:

```text
charge.refunded
```

or appropriate Stripe event and insert a ledger reversal for **unused** credits only.

However this can become complex if credits were already consumed.

Therefore recommended Phase 10B scope:

> Do not implement automated Stripe refund-to-credit reconciliation yet.

Document refunds as a support/manual-adjustment process.

Do not pretend refund logic exists.

---

# 63. Stripe catalog verification

Before creating org products/prices:

Inspect TEST MODE.

Report:

```text
existing exact match?
```

Reuse exact matching Product/Price.

If none exist, create only:

```text
Assessment Credit
Assessment Credit Pack
```

Do not create:

- subscriptions
- coupons
- promotion codes
- Payment Links
- invoices

Only Product + Price objects if needed.

---

# 64. Test mode only

All Phase 10B Stripe work is TEST MODE only.

Do not:

- create live products
- create live prices
- modify live Stripe configuration
- enable production organization billing

---

# 65. Required automated tests — ledger

Test:

1. new org balance = 0
2. +1 purchase → balance 1
3. +110 purchase → balance 110
4. consumption → -1
5. adjustment → correct balance
6. balance equals ledger sum
7. duplicate purchase session does not double-credit
8. duplicate attempt does not double-consume
9. unrelated org ledger excluded
10. negative adjustment cannot create invalid balance

---

# 66. Required tests — checkout

Test:

1. unauthenticated denied
2. member denied
3. owner allowed
4. admin allowed
5. suspended org denied
6. pending org denied
7. arbitrary price rejected
8. single plan maps to correct configured Price ID
9. pack maps to correct configured Price ID
10. organization Stripe customer created once
11. customer reused
12. Org A customer never reused by Org B
13. checkout metadata contains correct org identity
14. Stripe session creation failure grants no credits

---

# 67. Required tests — purchase webhook

Test:

1. valid single purchase → +1
2. valid pack purchase → +110
3. duplicate webhook → no duplicate
4. unknown price → no credit
5. forged metadata quantity ignored
6. unpaid session → no credit
7. suspended-after-checkout org still receives valid purchased credits
8. wrong Stripe customer/org mapping rejected
9. webhook DB failure retries safely

---

# 68. Required tests — consumption

Test:

1. candidate invite consumes 0
2. invite acceptance consumes 0
3. assessment landing consumes 0
4. first real start consumes 1
5. refresh consumes 0 additional
6. resume consumes 0 additional
7. duplicate start consumes once
8. concurrent same-attempt start consumes once
9. two candidates with one credit → only one starts
10. balance never negative
11. zero-credit org cannot start new attempt
12. candidate sees safe generic unavailable message
13. owner/admin sees no-credit state
14. suspended org does not consume
15. existing started attempt resumes while suspended

---

# 69. Required tests — permissions/isolation

Test:

1. Org A owner cannot view Org B billing
2. Org A admin cannot purchase for Org B
3. Org A cannot inspect Org B ledger
4. candidate cannot access billing
5. member cannot access billing
6. platform admin can inspect
7. platform admin adjustment audited
8. org owner cannot perform platform adjustment
9. org credit state never leaks through candidate APIs

---

# 70. Required concurrency tests

Use genuine DB concurrency.

## Case A

```text
balance = 1
candidate A and B start simultaneously
```

Expected:

```text
1 attempt starts
1 denied
balance = 0
```

## Case B

```text
same candidate
same assessment
two simultaneous starts
```

Expected:

```text
1 attempt
1 consumption entry
```

## Case C

```text
same Stripe event replay/concurrent delivery
```

Expected:

```text
1 purchase ledger entry
```

---

# 71. Browser QA

Create:

```text
docs/qa/phase10b/
```

Files:

```text
phase10b_qa_plan.md
user_story_matrix.md
execution_log.md
defects.md
completion_report.md
```

Required stories:

## QA-01 — Billing page

Active org owner opens billing.

Verify zero/current balance and products.

## QA-02 — Member denied

Normal org member cannot view billing.

## QA-03 — Buy single credit

```text
$50 test checkout
→ Stripe TEST MODE
→ payment
→ webhook
→ +1 credit
```

## QA-04 — Buy pack

Separate org/user:

```text
$5,000 test checkout
→ +110
```

## QA-05 — Candidate invitation

Invite candidate.

Verify balance unchanged.

## QA-06 — Candidate starts

Candidate starts assessment.

Verify balance decremented exactly 1.

## QA-07 — Refresh/resume

Verify no second credit consumed.

## QA-08 — No credits

Balance zero.

Candidate attempts new start.

Verify blocked safely.

## QA-09 — Concurrent start

Use controlled test/DB fixture.

Verify no overspend.

## QA-10 — Suspended org

Suspend org.

Verify:

- billing purchase blocked
- new candidate start blocked
- existing attempt resume allowed
- credits preserved

## QA-11 — Purchase completes after suspension

Create checkout while active.

Suspend.

Complete TEST payment.

Verify credits added but unusable until reactivated.

## QA-12 — Reactivation

Reactivate.

Verify credits usable.

## QA-13 — Admin adjustment

Platform admin grants +1.

Verify balance and audit.

## QA-14 — Cross-org billing isolation

Org A cannot inspect Org B billing/ledger.

## QA-15 — Candidate billing privacy

Candidate cannot see balance/payment data.

## QA-16 — Webhook replay

Replay processed purchase event.

Verify no duplicate credits.

---

# 72. Organization admin dashboard

Extend admin organization detail with:

```text
Assessment Credits
Available
Purchased
Consumed
Adjusted
```

Recent ledger entries.

Do not require direct Stripe dashboard use for routine support.

---

# 73. Billing terminology

Use:

```text
Assessment Credits
```

not:

```text
tokens
coins
points
```

One credit = one candidate assessment start.

Keep terminology consistent everywhere.

---

# 74. Beta implications

Phase 10B is pre-beta critical.

After this phase an organization should be able to:

```text
IncidentRank admin provisions org
→ owner accepts
→ owner/admin buys assessment credits
→ creates assessment
→ invites candidates
→ candidates start
→ credits consumed
→ owners view reports
```

This is the full company-side commercial loop.

---

# 75. Completion report

Create:

```text
docs/implementation_plan/phase10b_org_assessment_credits_completion.md
```

Include:

## Stripe catalog
- products
- prices
- IDs/config names
- TEST MODE verification

## Schema
- organization Stripe mapping
- credit ledger
- optional cached account/balance
- constraints

## Checkout
- authorization
- single
- pack
- customer mapping

## Webhook
- validation
- idempotency
- purchase issuance

## Ledger
- authoritative balance
- transaction types
- lineage

## Credit consumption
- exact trigger
- concurrency
- resume behavior
- no-credit behavior

## Suspension
- purchase blocking
- consumption blocking
- post-checkout payment handling

## Permissions
- owner/admin/member
- platform admin

## Isolation/privacy
- cross-org
- candidate

## Adjustments
- admin support flow
- audit

## Browser QA
- all required stories
- defects
- fixes
- retests

## Validation
- typecheck
- lint
- tests
- build
- seed

## Deferred
- automated Stripe refund reconciliation
- subscriptions for organizations
- Phase 10C Engineer Rank

---

# 76. Full validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
pnpm build
pnpm --filter @incidentrank/db db:seed
```

If root test isolation has been fixed, also run normal:

```bash
pnpm test
```

Built-in scenario count must remain:

```text
100
```

---

# 77. Completion criteria

Phase 10B is complete only when:

1. organization credit products exist in Stripe TEST MODE
2. no live Stripe objects touched
3. owner/admin can buy credits
4. member cannot buy/view billing
5. suspended/pending org cannot purchase
6. org Stripe customer separate from personal customer
7. $50 purchase grants exactly 1 credit
8. $5,000 purchase grants exactly 110 credits
9. webhook replay cannot duplicate credits
10. ledger is authoritative
11. candidate invite consumes zero
12. assessment start consumes exactly one
13. resume consumes zero additional
14. duplicate start consumes once
15. concurrent starts cannot overspend
16. balance never becomes negative
17. zero-credit org cannot start new candidate assessment
18. candidate receives safe non-billing error
19. already-started attempt can resume under suspension
20. suspended org cannot consume credits
21. valid payment completed after suspension still grants purchased credits
22. platform admin can adjust credits
23. adjustments require reason and audit
24. cross-org billing isolation holds
25. candidate cannot see org billing state
26. purchase/consumption lineage is inspectable
27. browser QA passes
28. full validation green
29. 100 built-in scenarios unchanged
30. completion report written

---

# 78. Explicitly deferred

Do NOT implement:

```text
organization subscriptions
monthly organization billing
annual organization billing
automatic Stripe-refund reconciliation
invoices generated by IncidentRank
enterprise contract invoicing
organization usage subscriptions
company SSO
Phase 10C Engineer Rank
```

Stripe-hosted receipts/payment records remain Stripe's responsibility.

---

# Stop condition

Stop after Phase 10B is implemented, tested, live-browser QA'd in Stripe TEST MODE, validated, and documented.

Do not begin Phase 10C automatically.

The next planned phase is:

```text
Phase 10C — Engineer Rank
```