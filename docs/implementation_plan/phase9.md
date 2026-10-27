Implement **IncidentRank Phase 9 — Stripe Payments, Paid Entitlements & Beta Readiness**.

Phase 8 is complete. IncidentRank now has:

- 100 built-in scenarios
- full engine integrity and golden-path validation
- full end-to-end product QA
- platform admin system
- promotional invitations
- one-scenario Incident Pass entitlements
- referral acquisition and referral rewards
- Resend abstraction
- premium/free access boundaries

Stripe products and prices already exist in **Stripe TEST MODE**.

Do not recreate them.

The following values already exist in local environment configuration:

```env
STRIPE_PRO_PRODUCT_ID=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_ANNUAL_PRICE_ID=
STRIPE_FOUNDING_PRODUCT_ID=
STRIPE_FOUNDING_LIFETIME_PRICE_ID=
```

The actual IDs are already populated locally.

Do not print them unnecessarily.

Do not commit secrets or environment-specific IDs.

# Primary objective

Implement the full application-side Stripe integration in **TEST MODE only**, behind feature flags.

At the end of Phase 9, IncidentRank should be technically ready for a controlled beta.

Do **not** enable live Stripe payments.

Do **not** create or modify Stripe live-mode objects.

Do **not** deploy or launch beta automatically.

Stop after implementation, testing, browser QA, and a beta-readiness report.

---

# 1. Existing Stripe catalog

The existing TEST MODE catalog is authoritative.

## IncidentRank Pro

One Stripe Product:

```text
IncidentRank Pro
```

Two recurring Prices:

```text
$9.99 USD / month
$79.00 USD / year
```

Entitlement:

```text
pro
```

Access:

```text
all IncidentRank practice incidents while subscription is active
```

## IncidentRank Founding Engineer

Separate Stripe Product:

```text
IncidentRank Founding Engineer
```

One one-time Price:

```text
$99.00 USD
```

Entitlement:

```text
founding_lifetime
```

Access:

```text
lifetime access to all current and future IncidentRank practice incidents
```

Limited to:

```text
first 100 successfully issued Founding Engineer entitlements
```

IncidentRank's database is authoritative for this cap.

Stripe product metadata alone is not sufficient.

---

# 2. Product access model

The final access model should be:

```text
Anonymous / free user
→ free practice incidents only

Incident Pass
→ exactly one premium scenario
→ promo / referral / admin grant

IncidentRank Pro
→ all practice incidents
→ only while qualifying subscription access is active

Founding Engineer
→ all current and future practice incidents
→ lifetime

Company assessment
→ completely separate
```

Critical doctrine:

```text
Pro ≠ assessment access
Founding ≠ assessment access
Paid practice access ≠ organization credits
Paid practice access ≠ admin privileges
```

Do not alter company-assessment authorization.

---

# 3. Feature flags

Add explicit server-enforced flags.

Suggested:

```env
PAYMENTS_ENABLED=false
STRIPE_CHECKOUT_ENABLED=false
STRIPE_WEBHOOKS_ENABLED=false
```

Production defaults must remain false until explicitly enabled later.

Rules:

- hiding UI is not enough
- checkout routes enforce flags server-side
- webhook route enforces appropriate environment/config behavior
- existing entitlements remain readable if checkout is disabled
- turning off new checkout must not revoke valid existing paid access

Keep Phase 8 flags separate.

Do not repurpose `DEV_UNLOCK_PAID_SCENARIOS`.

---

# 4. Stripe environment configuration

Expected values:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

STRIPE_PRO_PRODUCT_ID=
STRIPE_PRO_MONTHLY_PRICE_ID=
STRIPE_PRO_ANNUAL_PRICE_ID=
STRIPE_FOUNDING_PRODUCT_ID=
STRIPE_FOUNDING_LIFETIME_PRICE_ID=

PAYMENTS_ENABLED=false
STRIPE_CHECKOUT_ENABLED=false
STRIPE_WEBHOOKS_ENABLED=false
```

If the frontend needs a Stripe publishable key, add:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

only if actually required.

Do not expose `STRIPE_SECRET_KEY`.

Do not expose `STRIPE_WEBHOOK_SECRET`.

Do not copy secrets into code.

Do not write real keys into `.env.example`.

Use blank placeholders only.

---

# 5. Webhook endpoint

Implement exactly one central Stripe webhook endpoint:

```text
POST /api/stripe/webhook
```

Production URL later:

```text
https://incidentrank.com/api/stripe/webhook
```

Local development URL:

```text
http://localhost:3000/api/stripe/webhook
```

Local Stripe events may be forwarded to that endpoint using Stripe's local tooling.

The same route path should be used in every environment.

Only host/credentials differ.

---

# 6. Webhook signature verification

Webhook processing must verify Stripe signatures using:

```text
STRIPE_WEBHOOK_SECRET
```

Do not trust:

- body fields alone
- query parameters
- client-provided payment status
- success redirect state

Use the raw request body as required by the Stripe SDK.

If signature verification fails:

```text
400
```

and perform no mutation.

Never process an unverified Stripe webhook.

---

# 7. Stripe SDK abstraction

Use the official Stripe server SDK.

Create a central server-only Stripe client/helper.

Do not instantiate Stripe clients throughout arbitrary route files.

Conceptually:

```text
apps/web/src/lib/server/stripe/
  client.ts
  config.ts
  checkout.ts
  webhook.ts
  entitlements.ts
```

Follow repository conventions rather than these exact names if necessary.

---

# 8. Database model

Add a paid-entitlement model separate from `incident_passes`.

Do not force subscriptions/lifetime access into the one-scenario Incident Pass model.

Recommended tables:

```text
stripe_customers
paid_entitlements
stripe_subscriptions
stripe_webhook_events
founding_engineer_allocations
```

Exact schema may be consolidated if the repo's conventions strongly favor fewer tables, but preserve the domain boundaries.

---

# 9. Stripe customer mapping

Suggested:

```text
stripe_customers
- id
- user_id
- stripe_customer_id
- created_at
- updated_at
```

Rules:

- one IncidentRank user maps to one Stripe Customer
- customer creation is idempotent
- reuse existing customer on future checkout
- database is authoritative for the mapping
- Stripe customer metadata should include IncidentRank user ID if useful

Recommended Stripe metadata:

```text
application = incidentrank
incidentrank_user_id = <internal-user-id>
```

Do not use email alone as identity.

---

# 10. Paid entitlement model

Suggested:

```text
paid_entitlements
- id
- user_id
- entitlement_type
- status
- source
- stripe_customer_id
- stripe_subscription_id
- stripe_checkout_session_id
- stripe_payment_intent_id
- stripe_price_id
- starts_at
- current_period_end
- ended_at
- created_at
- updated_at
```

Entitlement types:

```text
pro
founding_lifetime
```

Possible entitlement statuses:

```text
active
inactive
canceled
past_due
revoked
```

Use values that match the actual access policy rather than blindly mirroring every Stripe status.

The application should derive user access from this table.

---

# 11. Stripe subscription table

If keeping subscription lifecycle separately:

```text
stripe_subscriptions
- id
- user_id
- stripe_customer_id
- stripe_subscription_id
- stripe_price_id
- stripe_product_id
- stripe_status
- current_period_start
- current_period_end
- cancel_at_period_end
- canceled_at
- ended_at
- created_at
- updated_at
```

Unique:

```text
stripe_subscription_id
```

Also index:

```text
user_id
stripe_customer_id
stripe_status
```

Do not create duplicate rows from repeated webhooks.

---

# 12. Webhook event idempotency

Create:

```text
stripe_webhook_events
- id
- stripe_event_id
- event_type
- processed_at
- processing_status
- error
- created_at
```

Unique:

```text
stripe_event_id
```

Every webhook must be idempotent.

Flow:

```text
verify signature
→ read stripe_event_id
→ attempt event reservation / insert
→ if already processed:
     acknowledge safely
→ process event transactionally
→ mark processed
```

Stripe may deliver events more than once.

Replayed events must not:

- issue duplicate Founding entitlements
- create duplicate subscriptions
- create duplicate customers
- change entitlement state incorrectly
- consume additional Founding slots

---

# 13. Checkout routes

Implement server-authoritative checkout creation.

Suggested routes:

```text
POST /api/stripe/checkout/pro-monthly
POST /api/stripe/checkout/pro-annual
POST /api/stripe/checkout/founding
```

Or one route:

```text
POST /api/stripe/checkout
```

with an allowlisted plan enum.

Prefer one central route if it remains clear.

The client must never be allowed to submit arbitrary Stripe Price IDs.

Use an internal allowlist:

```text
pro_monthly
→ STRIPE_PRO_MONTHLY_PRICE_ID

pro_annual
→ STRIPE_PRO_ANNUAL_PRICE_ID

founding_lifetime
→ STRIPE_FOUNDING_LIFETIME_PRICE_ID
```

Reject anything else.

---

# 14. Checkout authentication

Checkout requires an authenticated IncidentRank user.

Before creating a Checkout Session:

```text
authenticate
→ get IncidentRank user
→ load/create Stripe Customer
→ validate selected plan
→ validate user eligibility
→ create Checkout Session
```

Do not create anonymous paid entitlements in Phase 9.

---

# 15. Pro checkout

For monthly:

```text
mode = subscription
price = STRIPE_PRO_MONTHLY_PRICE_ID
quantity = 1
```

For annual:

```text
mode = subscription
price = STRIPE_PRO_ANNUAL_PRICE_ID
quantity = 1
```

Use the same Stripe Product via different Price IDs.

Attach:

```text
customer
client_reference_id and/or metadata
incidentrank_user_id
plan
```

where useful.

Do not trust these metadata fields as the only source of identity; reconcile against the stored customer/user mapping.

---

# 16. Founding Engineer checkout

Use:

```text
mode = payment
price = STRIPE_FOUNDING_LIFETIME_PRICE_ID
quantity = 1
```

Attach enough metadata to reconcile the payment to the authenticated IncidentRank user.

Founding access becomes active only after verified successful payment processing.

Do not grant it because the browser reached a success page.

---

# 17. Checkout success/cancel URLs

Use application routes such as:

```text
/billing/success
/billing/canceled
```

or repository-equivalent.

The success page should say something like:

```text
Payment received. We're confirming your access.
```

until the DB entitlement is visible.

If webhook processing has already completed:

```text
Your IncidentRank access is active.
```

The redirect is informational only.

Never write paid entitlement state from the success page.

---

# 18. Pro subscription lifecycle

Do not treat `checkout.session.completed` as permanent proof of an active subscription.

Synchronize subscription state from verified Stripe webhook events.

At minimum support the lifecycle necessary for:

```text
subscription created
subscription active
subscription updated
cancel_at_period_end
subscription canceled/deleted
renewal payment succeeds
renewal payment fails
```

Do not overbuild every possible Stripe feature.

The application needs enough state to know:

```text
should this user have Pro access right now?
```

---

# 19. Pro access policy

Centralize this policy.

Create a pure function conceptually like:

```text
evaluatePaidPracticeEntitlement(...)
```

or extend the existing central practice-access evaluation.

Do not scatter Stripe-status checks across components.

Pro access should be based on IncidentRank's synchronized entitlement state.

Recommended principle:

```text
active qualifying subscription
→ Pro access

expired/terminated/non-qualifying subscription
→ no new Pro access
```

Be deliberate about:

```text
past_due
cancel_at_period_end
canceled but still within paid period
```

Recommended V1:

- `active` → access
- canceled-at-period-end but current paid period not ended → access until `current_period_end`
- ended/deleted after period expires → no access
- `past_due` → retain access only if Stripe still considers subscription active and policy explicitly allows it

Implement one documented policy function and tests.

Do not let UI infer this.

---

# 20. Existing attempts after paid access ends

A user must not be locked out of an already-started practice attempt simply because their subscription changes while the attempt is active.

Preserve the Phase 8 doctrine:

```text
existing owned in-progress attempt
→ resume allowed
```

before checking entitlement for a new attempt.

Paid entitlement is required for starting new premium attempts, not for accessing one's existing legitimate attempt history/result.

---

# 21. Founding Engineer entitlement

Founding access should be represented as:

```text
entitlement_type = founding_lifetime
status = active
```

No expiration.

Once validly issued, normal subscription cancellation logic must never affect it.

Founding access should satisfy premium practice access permanently unless explicitly administratively revoked for an exceptional reason.

---

# 22. First-100 Founding Engineer enforcement

This is critical.

Stripe metadata:

```text
founding_limit = 100
```

is informational only.

IncidentRank's database is authoritative.

Do not implement:

```text
SELECT COUNT(*) < 100
→ create checkout
```

as the only control.

That is race-unsafe.

---

# 23. Founding reservation/allocation model

Implement a race-safe capacity model.

Recommended concept:

```text
founding_engineer_allocations
- id
- user_id
- status
- stripe_checkout_session_id
- stripe_payment_intent_id
- reserved_at
- expires_at
- issued_at
- released_at
- created_at
```

Statuses:

```text
reserved
issued
released
expired
```

There must never be more than 100 active:

```text
reserved + issued
```

allocations.

Use a DB-safe allocation mechanism.

Possible strategies:

- pre-create exactly 100 numbered slots
- advisory lock + serialized allocation
- transaction-level locking around a capacity record
- another Postgres-safe strategy

Choose the approach that best fits the existing database architecture.

The final invariant is:

> At most 100 Founding Engineer entitlements can ever be issued.

And checkout capacity must also avoid overselling through many simultaneous open sessions.

---

# 24. Founding reservation timing

Recommended flow:

```text
user requests Founding checkout
        ↓
transactionally reserve one Founding slot
        ↓
create Stripe Checkout Session
        ↓
store session ID on reservation
        ↓
checkout completes successfully
        ↓
verified webhook
        ↓
convert reserved → issued
        ↓
create founding_lifetime entitlement
```

If Checkout Session creation fails:

```text
release reservation
```

If session expires or payment never completes:

```text
reservation eventually released/expired
```

Do not permanently consume a Founding slot because someone opened checkout and abandoned it.

---

# 25. Founding capacity concurrency

Write a genuine concurrency test.

Example:

```text
99 issued/reserved slots exist
two users request checkout simultaneously
```

Expected:

```text
one gets slot #100
one receives sold-out response
```

Never:

```text
101 reservations
```

Also test:

```text
100 issued
→ Founding checkout impossible
```

---

# 26. Founding re-entry / duplicate purchase

An existing Founding Engineer should not be able to purchase a second Founding entitlement.

An active Pro user may purchase Founding if product policy allows it.

Recommended:

```text
Pro → Founding allowed
Founding → second Founding denied
```

When Founding is successfully issued to a Pro subscriber:

- Founding lifetime access immediately becomes sufficient for practice access
- do not automatically cancel the Pro subscription unless explicitly specified
- user can manage/cancel Pro separately

Do not silently alter a paid subscription because they purchased Founding.

---

# 27. Stripe webhook events

Support only events needed for this product.

Likely relevant event families include:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

If the installed Stripe API version/library recommends a slightly different minimal set, follow the current SDK behavior while preserving these business outcomes.

Do not subscribe to dozens of unused events.

---

# 28. checkout.session.completed handling

For subscription checkout:

- correlate customer/user
- correlate plan
- store checkout-session linkage
- retrieve/synchronize subscription if needed
- do not independently create permanent Pro access if subscription state contradicts it

For Founding checkout:

- verify correct price/product/metadata
- verify successful one-time payment state
- correlate reservation
- issue exactly one lifetime entitlement
- mark slot issued

Do not issue Founding access for an unpaid session.

---

# 29. Subscription events

For:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

synchronize:

```text
stripe subscription ID
customer ID
price ID
product ID
status
period dates
cancel_at_period_end
canceled_at
```

Then update IncidentRank Pro entitlement accordingly.

Unknown Price IDs must not silently grant Pro.

Only the configured IncidentRank Pro monthly/annual Price IDs grant Pro.

---

# 30. Invoice events

Handle enough invoice lifecycle to keep subscription state coherent.

Do not create a second billing/accounting system.

Stripe remains authoritative for payment collection.

IncidentRank remains authoritative for product access as synchronized from verified Stripe state.

---

# 31. Access integration

Extend central practice access evaluation.

Conceptual priority:

```text
existing owned in-progress attempt
→ allow resume

free scenario
→ allow

founding lifetime entitlement
→ allow

active Pro entitlement
→ allow

Incident Pass bound/available
→ existing Phase 8 behavior

dev unlock
→ dev-only behavior

otherwise
→ locked
```

Be careful about exact ordering.

An available Incident Pass must not be consumed if Pro/Founding already grants catalog access.

If user has Pro and an unused Incident Pass:

```text
start premium incident using Pro
→ Incident Pass remains unused
```

Same for Founding.

Paid catalog-wide entitlement should take precedence over one-use passes.

---

# 32. Free-user model

Preserve current free-scenario behavior.

The Stripe catalog description references free access, but do not invent a new free-quota system unless it already exists in the codebase/spec.

If the product currently has designated free scenarios, retain that implementation.

Do not silently redesign free access during Phase 9.

---

# 33. Billing UI

Create a simple billing / upgrade surface.

Possible route:

```text
/pricing
```

or repository-equivalent.

Show:

## IncidentRank Pro

```text
$9.99/month
$79/year
```

Benefits:

```text
All practice incidents while subscription is active.
```

Buttons:

```text
Choose Monthly
Choose Annual
```

## Founding Engineer

```text
$99 one time
Lifetime practice access
First 100 Founding Engineers
```

Show availability from the database.

Example:

```text
37 of 100 claimed/reserved
```

or:

```text
63 Founding spots remaining
```

Be careful not to expose misleading race-prone numbers as guarantees.

When sold out:

```text
Founding Engineer — Sold Out
```

No checkout button.

---

# 34. Feature flag UX

When:

```text
PAYMENTS_ENABLED=false
```

normal users should not be able to enter checkout.

Depending on current UI, show:

```text
Pro — coming soon
```

or hide pricing actions.

When enabled in test/dev QA:

- test checkout buttons appear
- only Stripe TEST MODE is used

---

# 35. Billing/account page

Signed-in users should be able to see their current paid status.

Examples:

```text
Free
Pro Monthly
Pro Annual
Founding Engineer
```

For Pro:

```text
Active
Renews on <date>
```

or:

```text
Cancels at end of billing period
Access through <date>
```

For Founding:

```text
Lifetime access
```

Do not expose raw Stripe object IDs in normal UI.

---

# 36. Stripe Customer Portal

Only implement Customer Portal if needed for beta.

Recommended: include it in Phase 9 if straightforward.

Purpose:

- manage subscription
- update payment method
- cancel Pro

Create server route such as:

```text
POST /api/stripe/customer-portal
```

Requirements:

- authenticated user
- existing Stripe Customer mapping
- Stripe-hosted portal
- return URL back to IncidentRank

If the Customer Portal requires separate Stripe dashboard configuration that is not currently available, implement the route and document the remaining Stripe-side configuration rather than blocking Phase 9.

Do not create a custom card-management UI.

---

# 37. Cancellation behavior

If Pro user cancels through Stripe:

```text
cancel_at_period_end = true
```

then:

```text
retain access through current_period_end
```

After the subscription actually ends:

```text
remove Pro entitlement for new premium attempts
```

Existing attempts/history remain accessible.

Founding access remains unaffected.

---

# 38. Upgrade/downgrade handling

Do not build complex proration/plan-switch UX unless required.

For beta:

- monthly checkout
- annual checkout
- Stripe Customer Portal for subscription changes

If Stripe Portal handles plan changes later, synchronize the resulting subscription update webhook.

Do not implement custom proration logic.

---

# 39. Duplicate checkout protection

Avoid creating unnecessary simultaneous subscription checkouts.

If user already has active Pro:

```text
do not create another Pro checkout
→ send to billing/portal instead
```

If user has Founding:

```text
do not create Pro checkout by default
```

because Founding already grants broader/permanent practice access.

If user already has an active Founding reservation:

```text
reuse or surface existing checkout/reservation state
```

rather than consuming another slot.

---

# 40. Stripe object validation

Never trust only metadata.

When processing events, validate configured IDs.

Pro must reference one of:

```text
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_ANNUAL_PRICE_ID
```

Founding must reference:

```text
STRIPE_FOUNDING_LIFETIME_PRICE_ID
```

Optionally also validate Product IDs.

Unexpected Stripe objects:

```text
log safe diagnostic
do not grant IncidentRank entitlement
```

Do not log sensitive payment data.

---

# 41. Webhook transaction boundaries

Webhook mutation should be transaction-safe.

For Founding issuance:

```text
event idempotency reservation
→ validate Checkout/payment
→ validate allocation
→ mark allocation issued
→ create lifetime entitlement
→ mark event processed
```

For Pro updates:

```text
event idempotency reservation
→ synchronize subscription row
→ synchronize entitlement
→ mark event processed
```

No partially-issued entitlements if transaction fails.

---

# 42. Failure/retry behavior

If webhook processing fails:

- return appropriate non-2xx response so Stripe can retry where applicable
- do not mark the event processed
- ensure retry is safe

Do not swallow DB failures and return success.

If event is already successfully processed:

```text
return 2xx
```

without duplicate side effects.

---

# 43. Admin paid-entitlement visibility

Extend `/admin` operational tooling.

Add views for:

```text
Paid Entitlements
Stripe Subscriptions
Founding Engineer Allocations
Webhook Events
```

Admin should be able to inspect:

```text
user
entitlement type
status
Stripe customer
subscription status
price/plan
period end
Founding slot status
checkout session linkage
webhook processing state
```

Do not add destructive manual Stripe manipulation.

Admin may view IncidentRank-side state.

If manual entitlement revocation already fits admin architecture, keep it clearly separate from Stripe subscription cancellation.

---

# 44. Audit trail

Add relevant IncidentRank admin/system audit events.

Examples:

```text
stripe_checkout_created
pro_entitlement_activated
pro_entitlement_changed
pro_entitlement_ended
founding_slot_reserved
founding_entitlement_issued
founding_reservation_released
webhook_processing_failed
```

Do not log:

- secret keys
- webhook secrets
- card data
- full payment method data

---

# 45. Test-mode-only guard

Phase 9 must be implemented and verified only with TEST MODE Stripe credentials.

Add a defensive environment sanity check where appropriate.

For local/dev Phase 9 QA:

- Stripe secret key should be test-mode
- configured Product/Price IDs should be test-mode catalog objects
- no code should intentionally create live-mode Stripe objects

Do not copy the catalog to live.

Do not create live webhook endpoints during implementation.

---

# 46. Required automated tests — Checkout

Test:

1. unauthenticated checkout denied
2. feature flag off denies checkout
3. monthly plan maps only to configured monthly Price ID
4. annual maps only to configured annual Price ID
5. Founding maps only to configured Founding Price ID
6. arbitrary Price ID rejected
7. Stripe Customer created once
8. existing Stripe Customer reused
9. active Pro user cannot accidentally create duplicate Pro subscription checkout
10. Founding user cannot buy second Founding entitlement
11. Founding sold-out blocks checkout
12. Founding reservation is concurrency-safe
13. Stripe Checkout creation failure releases Founding reservation

---

# 47. Required tests — Webhook security/idempotency

Test:

1. missing signature rejected
2. invalid signature rejected
3. valid signature accepted
4. duplicate event handled idempotently
5. unknown Price ID grants nothing
6. replayed Founding completion does not create second entitlement
7. replayed subscription event does not duplicate subscription row
8. webhook DB failure does not mark event processed
9. retry can succeed afterward

---

# 48. Required tests — Pro lifecycle

Test:

1. monthly subscription activation grants Pro
2. annual activation grants Pro
3. configured prices only
4. subscription update syncs status
5. cancel_at_period_end retains access through period end
6. subscription end removes Pro access for new premium attempts
7. existing attempt remains resumable
8. subscription payment/status update cannot affect Founding entitlement
9. Pro user with Incident Pass does not consume pass when starting premium incident
10. Founding user with Incident Pass does not consume pass

---

# 49. Required tests — Founding Engineer

Test:

1. successful Founding payment creates lifetime entitlement
2. Founding entitlement never expires automatically
3. unsuccessful/unpaid checkout grants nothing
4. duplicate webhook creates no duplicate
5. same user cannot receive two Founding entitlements
6. exactly 100 allocations maximum
7. purchaser #100 succeeds
8. concurrent purchaser #101 is blocked
9. abandoned/expired reservation can be released
10. released slot becomes available again
11. issued slot never becomes available
12. Founding grants all practice scenarios
13. Founding does not grant assessment access
14. Founding does not grant organization/admin access

---

# 50. Required tests — Access priority

Verify:

```text
existing attempt > new entitlement check
free scenario > payment requirement
Founding > Incident Pass
Pro > Incident Pass
Incident Pass > locked
```

Specifically test:

- Pro + available pass → premium attempt starts without consuming pass
- Founding + available pass → premium attempt starts without consuming pass
- expired Pro + pass → pass may be used normally
- no entitlement → locked
- free scenario → available regardless of paid entitlement

---

# 51. Browser QA

Perform real browser QA with Stripe TEST MODE.

Create:

```text
docs/qa/phase9/
```

Suggested:

```text
phase9_qa_plan.md
user_story_matrix.md
execution_log.md
defects.md
completion_report.md
```

Required stories:

## QA-01 — Pricing page

Verify:

```text
$9.99 monthly
$79 annual
$99 Founding
```

and correct copy.

## QA-02 — Monthly Pro checkout

Authenticated user:

```text
Choose Monthly
→ Stripe Checkout TEST MODE
→ complete test payment
→ return
→ webhook processes
→ Pro active
```

## QA-03 — Monthly Pro premium access

Verify premium incident starts with no Incident Pass.

## QA-04 — Annual Pro checkout

Repeat using separate user.

Verify annual entitlement.

## QA-05 — Subscription state/account UI

Verify billing/account page correctly reflects plan.

## QA-06 — Pro cancellation

Use Customer Portal or Stripe test tooling.

Verify:

```text
cancel_at_period_end
→ access remains until intended end
```

If practical in test mode, simulate terminal cancellation event and verify access ends.

## QA-07 — Founding checkout

```text
reserve slot
→ Stripe Checkout
→ pay
→ verified webhook
→ lifetime entitlement
```

## QA-08 — Founding premium access

Verify premium incident access without consuming pass.

## QA-09 — Duplicate Founding purchase

Same user cannot buy Founding again.

## QA-10 — Founding capacity

Test near-cap state using fixtures/test setup.

Verify purchaser #100/#101 concurrency behavior.

Do not create 100 real Stripe checkouts merely to test this.

## QA-11 — Webhook replay

Replay a processed test event.

Verify zero duplicate entitlement.

## QA-12 — Invalid webhook signature

Verify rejected and no DB mutation.

## QA-13 — Unknown product/price event

Verify no entitlement.

## QA-14 — Existing attempt survives entitlement loss

Start premium incident under Pro.

Then simulate entitlement end.

Verify attempt still resumes.

## QA-15 — Paid entitlement does not affect assessments

Verify Pro/Founding user cannot access arbitrary company assessment.

## QA-16 — Incident Pass preservation

Give Pro user an Incident Pass.

Start premium incident.

Verify pass remains unused.

---

# 52. Payment UI safety

Do not display card/payment details directly in IncidentRank.

Stripe-hosted Checkout handles payment collection.

IncidentRank should display:

```text
plan
status
renewal/end date
lifetime status
```

No card PAN/CVC/storage.

---

# 53. Environment-switch design

The implementation should be environment-driven.

Later production activation should require only configuration changes and Stripe-side setup, not code edits.

Expected production replacements later:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_or_environment_specific...

STRIPE_PRO_PRODUCT_ID=<live product>
STRIPE_PRO_MONTHLY_PRICE_ID=<live price>
STRIPE_PRO_ANNUAL_PRICE_ID=<live price>
STRIPE_FOUNDING_PRODUCT_ID=<live product>
STRIPE_FOUNDING_LIFETIME_PRICE_ID=<live price>

PAYMENTS_ENABLED=true
STRIPE_CHECKOUT_ENABLED=true
STRIPE_WEBHOOKS_ENABLED=true
```

Potentially:

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

if needed.

No code change should be required merely to switch from test catalog IDs to equivalent live catalog IDs.

However production still requires:

- live Stripe products/prices
- live webhook endpoint configured
- live webhook secret
- production domain
- Stripe account/business readiness

Document this clearly.

---

# 54. Do not automatically create Stripe catalog objects

Phase 9 must not create:

- Products
- Prices
- coupons
- promotion codes
- Payment Links

The TEST MODE catalog already exists.

Use configured IDs.

---

# 55. Full validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Run any Stripe-specific integration tests separately if needed.

Expected built-in scenario count:

```text
100
```

Do not alter scenario count/content.

---

# 56. Phase 9 completion report

Create:

```text
docs/implementation_plan/phase9_stripe_payments_completion.md
```

Include:

## Stripe architecture
- SDK version
- central Stripe client
- test-mode confirmation
- feature flags

## Schema
- customers
- subscriptions
- entitlements
- webhook events
- Founding allocations

## Checkout
- monthly
- annual
- Founding

## Webhooks
- endpoint
- signature verification
- event types
- idempotency
- retries

## Pro lifecycle
- activation
- renewal
- cancellation
- access-end policy

## Founding
- reservation model
- first-100 enforcement
- #100/#101 concurrency evidence
- lifetime entitlement issuance

## Access integration
- free
- Incident Pass
- Pro
- Founding
- assessment isolation

## Browser QA
- all required stories
- defects
- fixes
- retests

## Security
- webhook signature
- arbitrary price rejection
- direct API protections
- secrets
- Stripe-mode safeguards

## Validation
- typecheck
- lint
- tests
- build
- seed

## Deferred production work
- live credentials
- live Stripe catalog
- live webhook setup
- production payment enablement
- production beta deployment

---

# 57. Beta readiness report

After Phase 9 completes, also create:

```text
docs/implementation_plan/beta_readiness_report.md
```

This is important because the next intended milestone is **IncidentRank Beta**.

Assess at minimum:

```text
Product integrity
100-scenario readiness
Practice lifecycle
Paid/free access
Incident Passes
Referrals
Admin
Assessment privacy
Stripe test payments
Pro subscription lifecycle
Founding lifetime entitlement
Founding 100-person cap
Webhook safety
Email readiness
Authentication
Authorization
Resume/idempotency
Mobile
Accessibility sanity
Production configuration gaps
Monitoring/logging gaps
Backup/recovery gaps
Domain/email readiness
Deployment readiness
```

Classify each:

```text
READY
READY_WITH_CONFIGURATION
BLOCKER
DEFERRED_POST_BETA
```

The report must finish with exactly one recommendation:

```text
READY_FOR_CONTROLLED_BETA
READY_AFTER_CONFIGURATION
NOT_READY_FOR_BETA
```

Do not declare beta ready merely because tests pass.

Base the decision on actual remaining production requirements.

---

# 58. Beta blocking criteria

At minimum, these are beta blockers:

- unresolved SEV-0 or SEV-1 product defect
- payment webhook not signature-verified
- duplicate webhook can double-issue entitlement
- Founding cap can exceed 100
- paid user cannot reliably resume incident
- assessment privacy regression
- direct API bypass of paid access
- cross-user entitlement mutation
- live secrets exposed to client/repository
- production auth fundamentally broken
- database migrations fail
- build fails

---

# 59. Items that may be READY_WITH_CONFIGURATION

Examples:

```text
live Stripe keys not installed yet
live Stripe product IDs not installed yet
live webhook not registered yet
Resend SPF/DKIM/DMARC not verified yet
production domain deployment not performed yet
feature flags still false
```

These are expected before beta activation and do not necessarily mean the code phase failed.

The beta-readiness report should clearly distinguish code defects from configuration/deployment tasks.

---

# 60. Stop condition

Stop after:

1. Stripe TEST MODE checkout implementation
2. webhook implementation
3. paid entitlement implementation
4. Pro lifecycle implementation
5. Founding lifetime implementation
6. race-safe first-100 enforcement
7. access-control integration
8. automated tests
9. real browser QA
10. full validation
11. Phase 9 completion report
12. beta-readiness report

Do **not**:

- switch to live mode
- enable production payments
- create live Stripe products/prices
- deploy to production
- send beta invites
- begin broad marketing
- change pricing
- implement company billing

The next decision after this phase should be whether IncidentRank is ready for a **controlled beta**.

If the beta-readiness recommendation is:

```text
READY_FOR_CONTROLLED_BETA
```

or:

```text
READY_AFTER_CONFIGURATION
```

stop and report exactly what remains before the first beta user can be invited.