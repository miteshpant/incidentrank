Implement **IncidentRank Phase 10E — Benchmark Data Foundation & Launch Discounts**.

This replaces the prior Phase 10E free-engineer-beta plan.

IncidentRank should deliberately begin building its long-term defensibility through structured benchmark data while preserving a real willingness-to-pay signal.

The intended moat is:

> A proprietary, increasingly calibrated benchmark of production-engineering judgment across incident types, difficulty levels, skill dimensions, and decision sequences.

Do NOT make all engineer practice incidents permanently or universally free.

Instead, introduce aggressive launch discounts while preserving the existing Free / Pro / Founding architecture.

---

# 1. Launch commercial model

Keep existing list prices:

```text
Pro Monthly
$9.99/month

Pro Annual
$79/year

Founding Engineer
$99 one-time

Organization assessment credit
$50 / 1 credit

Organization assessment pack
$5,000 / 110 credits
```

Apply launch offers:

```text
Pro Monthly
75% off first 3 billing months
then $9.99/month

Pro Annual
50% off first annual billing period
then $79/year

Founding Engineer
50% off the one-time purchase

Organization
50% off first assessment-credit purchase only
then normal organization pricing
```

Do not change the canonical/base prices in application logic.

Discounts are promotional overlays.

---

# 2. Engineer access remains monetized

Do NOT add:

```text
FREE_ENGINEER_PRACTICE_ENABLED
```

as a universal all-scenarios-free entitlement.

Preserve the existing access hierarchy:

```text
existing owned/in-progress attempt
→ designated free practice access
→ Founding
→ Pro
→ Incident Pass
→ dev unlock
→ locked
```

Do not make company assessments free.

---

# 3. Monthly Pro launch offer

For:

```text
$9.99/month Pro
```

the launch offer is:

> 75% off the first 3 monthly billing periods.

After those three discounted billing periods:

```text
normal $9.99/month billing resumes automatically
```

This should be implemented using Stripe's supported recurring-discount mechanism rather than by creating a separate permanent discounted monthly Product.

Application UI must clearly state:

```text
75% off your first 3 months.
Then $9.99/month.
```

Do not imply the discount lasts forever.

---

# 4. Annual Pro launch offer

For:

```text
$79/year Pro
```

the launch offer is:

> 50% off the first annual billing period.

Subsequent renewal:

```text
$79/year
```

UI:

```text
50% off your first year.
Then $79/year.
```

Do not create a permanently cheaper annual plan.

---

# 5. Founding Engineer launch offer

Founding Engineer remains:

```text
$99 one-time
first 100
lifetime practice access
```

Launch offer:

```text
50% off
```

The user pays approximately half the normal $99 one-time amount according to Stripe's percent-off calculation.

Founding capacity remains:

```text
maximum 100 issued/reserved according to existing race-safe allocation system
```

Discounting must NOT modify:

- Founding slot allocation
- first-100 enforcement
- lifetime entitlement semantics
- webhook issuance logic

UI should display:

```text
Founding Engineer
$99
50% launch discount
Lifetime practice access
First 100 only
```

Optionally show the effective checkout price if derived reliably from configured discount data.

Do not hardcode a misleading rounded value if Stripe is authoritative.

---

# 6. Organization first-purchase launch offer

Every organization may receive:

> 50% off its first successful assessment-credit purchase.

This applies whether its first purchase is:

```text
1 credit — $50 list price
```

or:

```text
110 credits — $5,000 list price
```

After the organization's first successful purchase:

```text
no launch discount applies to later purchases
```

This is one first-purchase discount per organization, not per owner/admin user.

A user managing multiple organizations may receive the first-purchase offer separately for each organization because the organization is the commercial customer.

---

# 7. First-purchase authority

Do not rely only on Stripe's browser-side coupon behavior to decide whether an organization qualifies.

IncidentRank must independently know whether an organization has completed a prior successful organization-credit purchase.

Use the authoritative existing:

```text
organization_credit_ledger
```

or equivalent server-side purchase history.

Conceptually:

```text
successful organization purchase exists?
YES → no first-purchase discount
NO  → eligible
```

Race safety matters.

Two simultaneous first-purchase checkout requests must not permanently grant two independent "first purchase" benefits if both ultimately complete.

Design and document the exact policy.

---

# 8. Recommended organization-discount policy

Preferred:

```text
discount eligibility determined at checkout creation
```

but backed by a race-safe promotional claim/reservation.

Consider a small table such as:

```text
organization_launch_discount_claims
- organization_id
- status reserved | redeemed | released | expired
- stripe_checkout_session_id
- reserved_at
- redeemed_at
- expires_at
```

with:

```text
UNIQUE organization_id
```

or another safe model.

Flow:

```text
org requests checkout
→ verify no prior successful purchase
→ reserve org launch discount
→ create Stripe Checkout
→ associate session
→ successful verified webhook
→ mark redeemed
```

If Checkout creation fails:

```text
release reservation
```

If Checkout expires/abandoned:

```text
eventually release reservation
```

Do not permanently burn the organization's first-purchase discount because a Checkout Session was opened and abandoned.

If a simpler Stripe + DB-safe approach is available, use it and document why it is race-safe.

---

# 9. Discounts must be server-selected

The browser must NOT submit:

```text
coupon ID
promotion code ID
discount percentage
discount duration
```

as authoritative values.

Client sends only existing plan selection.

Server determines the correct configured launch discount.

For example:

```text
pro_monthly
→ configured monthly price
→ configured monthly-launch coupon

pro_annual
→ configured annual price
→ configured annual-launch coupon

founding_lifetime
→ configured Founding price
→ configured Founding-launch coupon
```

Organization checkout:

```text
single_credit / credit_pack_110
+
server-derived first-purchase eligibility
→ optional configured org-first-purchase coupon
```

---

# 10. Discount environment configuration

Add environment variables for Stripe discount objects.

Exact names may follow repository conventions.

Suggested:

```env
STRIPE_PRO_MONTHLY_LAUNCH_COUPON_ID=
STRIPE_PRO_ANNUAL_LAUNCH_COUPON_ID=
STRIPE_FOUNDING_LAUNCH_COUPON_ID=
STRIPE_ORG_FIRST_PURCHASE_COUPON_ID=
```

Do not hardcode Stripe IDs.

Blank values only in `.env.example`.

---

# 11. Feature flag

Add a server-side launch-promotion flag if useful:

```env
LAUNCH_DISCOUNTS_ENABLED=false
```

When false:

```text
normal list pricing
```

When true:

```text
eligible checkout receives configured launch offer
```

This gives IncidentRank the ability to end the launch promotion without code changes.

Do not tie entitlement validity to this flag after purchase.

---

# 12. Existing customers

Discount qualification should respect existing successful purchases.

For example:

```text
existing active Pro subscriber
→ do not create duplicate Pro subscription merely to get launch pricing
```

Existing Founding holder:

```text
cannot buy Founding again
```

Organization with any successful credit purchase:

```text
not eligible for organization first-purchase discount
```

---

# 13. Do not alter entitlement logic

Stripe discounts affect the amount charged.

They do NOT change:

```text
Pro access
Founding access
organization credit quantity
Founding capacity
subscription lifecycle
```

Example:

```text
50% discounted 110-credit purchase
→ still grants exactly 110 credits
```

Never derive credit quantity from amount paid.

Price ID determines purchased product/credits.

---

# 14. Revenue dashboard

Phase 10C currently has limitations around revenue calculations.

Update the admin dashboard so promotional discounts do not produce misleading revenue.

The dashboard must distinguish:

```text
list/catalog value
actual amount collected
```

Revenue should ultimately use actual successfully collected Stripe amounts where available.

Do NOT calculate:

```text
Founding count × $99
```

once real discounted Founding transactions exist and call that "gross collected."

Likewise do not report:

```text
110-credit purchase = $5,000 collected
```

when the first purchase may actually have received a 50% discount.

This is a required Phase 10E correction.

---

# 15. Persist actual transaction amounts

Add minimal normalized payment data where required.

Examples:

```text
amount_total
currency
discount_amount
```

for successful one-time purchases.

For subscriptions, persist/reconcile actual relevant invoice/payment amounts as appropriate.

Do NOT persist raw Stripe objects.

Keep Phase 10D minimization doctrine.

---

# 16. Revenue terminology

Admin dashboard should show actual:

```text
Gross collected
```

from successful payment records.

Optionally also show:

```text
Discounts granted
```

Do not call list-price estimates collected revenue.

---

# 17. Promotion metrics

Admin dashboard may include:

```text
Monthly launch offers redeemed
Annual launch offers redeemed
Founding launch offers redeemed
Org first-purchase offers redeemed
Total discount value granted
```

This helps determine whether launch discounts are producing conversion.

Do not build a full marketing analytics system.

---

# PART B — BENCHMARK DATA FOUNDATION

# 18. Benchmark objective

Every legitimate qualifying practice attempt should generate structured benchmark evidence.

Do not treat benchmark data as ordinary web analytics.

Preserve:

```text
scenario
scenario version
difficulty
category / skill
action sequence
timing
system state
terminal outcome
score
score dimensions
Engineer Rank context
first-vs-repeat status
```

---

# 19. Inspect existing data before adding schema

IncidentRank already stores significant simulator, attempt, action, scoring and timeline data.

Do not blindly duplicate it.

Build a benchmark projection/fact layer from authoritative operational data.

Denormalization is allowed only where it protects historical interpretation or materially simplifies benchmark analysis.

---

# 20. Pseudonymous benchmark subject

Create a stable pseudonymous benchmark identifier.

Conceptually:

```text
benchmark_subjects
- id
- user_id
- created_at
```

Analytical tables should use:

```text
benchmark_subject_id
```

rather than duplicating:

```text
email
display name
Clerk ID
```

Do not use hashed email as the benchmark identity.

Use a random stable internal identifier.

---

# 21. Benchmark attempt facts

Conceptually:

```text
benchmark_attempt_facts
- id
- attempt_id
- benchmark_subject_id

- scenario_id
- scenario_version_id
- scenario_slug

- difficulty
- category

- scoring_version
- rank_algorithm_version
- benchmark_projection_version

- attempt_number_for_scenario
- is_first_attempt

- started_at
- completed_at
- duration_seconds

- terminal_outcome
- raw_score
- normalized_score

- recovery_score
- customer_impact_score
- data_integrity_score
- reliability_score
- cost_efficiency_score
- operational_efficiency_score

- rank_before
- rank_after

- created_at
```

Use actual repository field names/canonical score dimensions.

---

# 22. Benchmark action facts

Conceptually:

```text
benchmark_action_facts
- id
- benchmark_attempt_fact_id
- sequence_number

- action_id
- action_group_id
- action_type

- elapsed_seconds

- allowlisted system state before
- allowlisted system state after

- authoritative score/risk metadata if already available

- created_at
```

Do not invent subjective labels unsupported by simulator metadata.

---

# 23. Sequence preservation

Order is critical.

The benchmark must distinguish:

```text
inspect
→ constrain blast radius
→ mitigate
→ validate
```

from:

```text
restart
→ scale
→ change configuration
→ investigate
```

Never reduce benchmark evidence to a final score alone.

---

# 24. Practice-only benchmark

V1 uses:

```text
IncidentRank-owned completed practice attempts
```

Exclude:

```text
employer assessments
organization-private scenarios
employer reports
```

Do not mix hiring-assessment data into personal Engineer Rank/benchmark research without a future explicit privacy/legal decision.

---

# 25. First vs repeat

Preserve attempt number for each scenario.

First-attempt evidence is especially valuable.

Make it trivial to query:

```text
first exposure only
```

without discarding repeat-attempt data.

---

# 26. Version everything

Preserve:

```text
scenario_version
difficulty-at-attempt
category/skill-at-attempt
scoring_version
rank_algorithm_version
benchmark_projection_version
```

Add a scoring version constant if none exists:

```text
SCORING_VERSION = "v1"
```

Add:

```text
BENCHMARK_PROJECTION_VERSION = "v1"
```

Do not silently reinterpret old evidence after methodology changes.

---

# 27. Benchmark failure isolation

Benchmark materialization must not destroy a legitimate completed attempt.

Use a rebuildable projection.

Possible strategies:

```text
post-commit materialization
outbox/event
idempotent derived projection
```

Choose the cleanest architecture.

A projection failure may be visible operationally, but completed engineering work must remain valid.

---

# 28. Benchmark rebuild

Implement equivalent functions:

```text
rebuildBenchmarkAttempt(attemptId)
rebuildBenchmarkForUser(userId)
rebuildBenchmarkForScenario(scenarioId)
```

Materialization must be deterministic from authoritative data.

Unique key should prevent duplicate:

```text
attempt_id + projection_version
```

facts.

---

# 29. Scenario calibration

Build internal aggregate queries for each built-in scenario:

```text
total attempts
first attempts
repeat attempts
resolved %
unstable %
failed %
timed out %

median score
score distribution
median duration

dimension medians
rank-band distribution
difficulty
category
```

---

# 30. Decision patterns

Where current structured actions permit, calculate basic descriptive patterns:

```text
common first actions
common action sequences
high-performing action patterns
unsuccessful action patterns
```

No ML.

No AI scoring.

---

# 31. Sample-size honesty

Centralize sample-quality states.

Example:

```text
< 10 first attempts
Insufficient data

10–29
Early signal

30+
Usable beta signal
```

Choose reasonable values and document them.

Never manufacture statistical confidence.

---

# 32. Admin benchmark dashboard

Add:

```text
/admin/benchmark
/admin/benchmark/scenarios
/admin/benchmark/scenarios/[scenarioId]
```

Platform-admin-only.

Overall metrics:

```text
benchmark subjects
qualifying attempts
first attempts
repeat attempts
attempts today
attempts 7d
attempts 30d
distinct scenarios attempted
projection failures
```

Scenario table:

```text
Scenario
Difficulty
Category
First Attempts
Total Attempts
Resolved %
Median Score
Median Duration
Evidence Status
```

Detail:

```text
sample size
first/repeat split
outcomes
score distribution
dimension medians
rank distribution
common first actions
sequence patterns
```

No engineer PII in benchmark dashboards.

---

# 33. Privacy

Phase 10D remains binding.

Benchmark fact tables must not contain unnecessary:

```text
email
name
Clerk identity
billing data
organization billing data
```

Update:

```text
docs/privacy/data_inventory.md
docs/privacy/data_retention.md
docs/privacy/privacy_security_review.md
```

If public Privacy Policy materially changes, publish a new version according to existing legal-version rules.

Do not silently edit already-accepted legal text.

---

# 34. Account deletion

Benchmark evidence should follow the existing anonymization doctrine.

Identity mapping may be disconnected while legitimate pseudonymous calibration evidence remains, subject to the documented privacy/retention policy.

Do not leave accidental re-identification fields in benchmark facts.

---

# 35. Do not collect sensitive demographics

Do not collect:

```text
race
ethnicity
religion
gender
sexual orientation
health
disability
political affiliation
```

for benchmark purposes.

---

# 36. Optional seniority metadata

If useful, optional self-reported professional metadata may be designed later.

Do not add it in this phase unless it can be done with clear consent and minimal privacy scope.

The benchmark foundation itself is more important.

---

# 37. Required discount tests

Test:

1. launch flag off → normal pricing
2. monthly eligible checkout gets configured 75% discount
3. monthly discount lasts only first 3 billing periods
4. annual checkout gets 50% first-period discount
5. annual renewal returns to normal price
6. Founding gets configured 50% one-time discount
7. Founding still consumes exactly one slot
8. Founding entitlement still lifetime
9. org first purchase gets 50%
10. org second purchase gets no discount
11. single-credit first purchase eligible
12. 110-credit first purchase eligible
13. discount is organization-scoped, not user-scoped
14. Org A's purchase does not disqualify Org B
15. abandoned org checkout does not permanently burn first-purchase offer
16. concurrent first-purchase checkout is race-safe
17. arbitrary coupon supplied by client ignored/rejected
18. unknown/missing coupon config fails safely
19. webhook entitlement/credit quantity independent of discount
20. actual amount paid persisted correctly

---

# 38. Required benchmark tests

At minimum:

1. completed qualifying practice attempt materializes
2. assessment excluded
3. org-private scenario excluded
4. scenario version captured
5. difficulty captured
6. category captured
7. scoring version captured
8. rank version captured
9. projection version captured
10. first attempt correctly identified
11. repeat correctly identified
12. sequence preserved
13. action order deterministic
14. timing preserved
15. outcome preserved
16. scoring dimensions preserved
17. no PII duplicated
18. idempotent rematerialization
19. rebuild equivalent
20. benchmark failure cannot destroy completed attempt
21. non-admin denied
22. deletion/anonymization remains privacy-safe

---

# 39. Browser QA — pricing/discounts

Create/extend:

```text
docs/qa/phase10e/
```

Required:

## QA-D01
Monthly Pro launch offer is displayed accurately.

## QA-D02
Monthly TEST checkout receives expected 75% promotion.

## QA-D03
Annual offer accurately states first-year-only discount.

## QA-D04
Annual TEST checkout receives expected discount.

## QA-D05
Founding offer displays 50% promotion and first-100 language.

## QA-D06
Founding TEST checkout charges discounted amount and grants lifetime entitlement.

## QA-D07
New organization first credit purchase receives 50%.

## QA-D08
Same organization's second purchase receives no discount.

## QA-D09
Different organization receives its own first-purchase discount.

## QA-D10
Credit quantity is unchanged by discount.

## QA-D11
Admin revenue dashboard reports actual collected amount, not list-price estimate.

---

# 40. Browser QA — benchmark

## QA-B01
Engineer completes real practice incident → benchmark fact appears.

## QA-B02
Repeat incident → repeat fact preserved.

## QA-B03
Engineer Rank continues working.

## QA-B04
Assessment does not enter benchmark.

## QA-B05
Admin benchmark dashboard updates.

## QA-B06
Scenario calibration detail reflects attempt.

## QA-B07
No engineer identity exposed in benchmark calibration UI.

## QA-B08
Non-admin denied.

## QA-B09
Account anonymization preserves allowed pseudonymous aggregate evidence.

---

# 41. Revenue dashboard correction

This is mandatory because discounts make static list-price revenue calculations incorrect.

Do not ship Phase 10E while admin "Gross collected" still derives discounted purchases from canonical list price.

Actual payment amount must drive gross-collected reporting.

Continue labeling:

```text
gross collected
```

not:

```text
net revenue
```

because automatic refund reconciliation remains deferred.

---

# 42. Product messaging

Do not advertise:

```text
free for all engineers
```

Instead communicate:

```text
Launch offer
```

or:

```text
Early engineer pricing
```

Make the renewal/base price clear.

Avoid deceptive crossed-out pricing or hidden renewal terms.

---

# 43. Monetization strategy documentation

Create/update:

```text
docs/product/beta_monetization_strategy.md
```

Document:

```text
Engineer:
paid with aggressive launch discounts

Companies:
paid assessment credits with 50% first-purchase acquisition offer

Strategic goal:
retain willingness-to-pay signal while accelerating benchmark participation
```

---

# 44. Benchmark moat documentation

Create:

```text
docs/product/benchmark_moat.md
```

Document:

```text
More engineers
→ more first-attempt structured evidence
→ better calibration
→ better Rank
→ more engineer trust
→ more employer trust
→ more assessments
→ more validation
→ stronger benchmark
```

State clearly:

> The benchmark is intended to become IncidentRank's defensible asset.

---

# 45. Production safety

IncidentRank is live.

Do NOT automatically:

```text
deploy production
run production migrations
enable promotion flag
modify live Stripe objects
change live Stripe coupons
enable payments
```

Implement and test safely first.

Provide an exact production rollout checklist.

---

# 46. Validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Built-in scenario count must remain:

```text
100
```

---

# 47. Completion report

Create:

```text
docs/implementation_plan/phase10e_benchmark_launch_discounts_completion.md
```

Include:

- launch discount model
- Stripe configuration expectations
- promotion eligibility
- first-org-purchase race handling
- actual payment amount persistence
- revenue dashboard correction
- benchmark architecture
- pseudonymous identity
- attempt facts
- action facts
- sequence/timing
- versioning
- rebuild/idempotency
- calibration dashboard
- privacy impact
- automated tests
- browser QA
- exact production migration/config rollout

---

# 48. Completion criteria

Phase 10E is complete only when:

1. base pricing remains unchanged
2. monthly launch discount supported
3. monthly discount ends after first 3 billing periods
4. annual first-year discount supported
5. Founding one-time discount supported
6. Founding capacity semantics unchanged
7. organization first-purchase discount supported
8. org discount is organization-scoped
9. second org purchase receives normal pricing
10. abandoned checkout does not incorrectly burn discount
11. discount eligibility is race-safe
12. arbitrary client coupon selection impossible
13. actual paid amounts are persisted
14. gross-collected dashboard uses actual payment data
15. benchmark subject model exists
16. benchmark PII minimized
17. practice attempts materialize benchmark facts
18. assessment attempts excluded
19. first/repeat distinction preserved
20. decision sequence preserved
21. timing preserved
22. scenario version/difficulty/category preserved
23. scoring/rank/projection versions preserved
24. benchmark projection rebuildable
25. benchmark materialization cannot destroy a valid completed attempt
26. calibration aggregates exist
27. admin benchmark dashboard exists
28. no unnecessary PII exposed
29. privacy docs updated
30. monetization strategy documented
31. benchmark moat documented
32. automated tests pass
33. browser QA passes
34. build passes
35. scenario count remains 100
36. completion report written

---

# Stop condition

Stop after implementation, safe TEST MODE Stripe validation, migrations, automated tests, browser QA, privacy review and completion report.

Do not modify production Stripe or deploy production automatically.

Final report must state:

```text
READY_FOR_BENCHMARK_AND_LAUNCH_DISCOUNT_ROLLOUT
```

or:

```text
NOT_READY_FOR_BENCHMARK_AND_LAUNCH_DISCOUNT_ROLLOUT
```

and list exact remaining production actions.