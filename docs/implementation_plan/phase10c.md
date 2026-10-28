Implement **IncidentRank Phase 10C — Engineer Rank + Platform Customer & Revenue Dashboard**.

Phase 10B is complete.

IncidentRank now has:

- 100 built-in scenarios
- practice attempts and scoring
- candidate assessments and employer reports
- platform admin governance
- platform-admin-provisioned organizations
- organization owner/admin/member roles
- organization suspension/reactivation
- organization audit trails
- private organization scenarios
- scenario versioning
- individual Stripe Pro / Founding payments
- promotional Incident Passes
- referrals
- organization assessment-credit purchases
- organization credit ledger
- organization Stripe customers
- race-safe credit consumption
- cross-org billing isolation

Phase 10C is the final substantial product phase before controlled beta.

It has two distinct workstreams:

```text
10C.1 — Engineer Rank
10C.2 — Platform Customer & Revenue Dashboard
```

Do not mix their domain logic.

---

# PART A — ENGINEER RANK

# 1. Product goal

IncidentRank should once again meaningfully justify the word:

```text
Rank
```

The goal is **not** to create a naive global leaderboard based on total points.

The goal is to benchmark an engineer's production-incident judgment across:

- difficulty
- incident domains
- engineering skills
- repeated performance
- quality of decisions

The product should answer:

> What level of production judgment is this engineer consistently demonstrating?

---

# 2. Do not use a raw global-score leaderboard

Do not rank engineers simply by:

```text
total score
average score
number of incidents completed
```

because scenarios have different:

- difficulty
- skill requirements
- domains
- alternate strong paths
- complexity

A raw `950` on an intermediate scenario should not necessarily be treated the same as `950` on a Principal-level scenario.

---

# 3. Rank model

Create an **Engineer Rank profile**.

Recommended rank bands:

```text
Developing
Intermediate
Senior
Staff
Senior Staff
Principal
```

Use existing scenario difficulty levels wherever possible.

Do not invent unnecessarily fine-grained ranks.

---

# 4. Rank dimensions

Use the existing scoring system and scenario metadata as the basis.

Where available, map attempts into dimensions such as:

```text
Diagnosis
Mitigation
Safety
Efficiency
Communication / Reasoning
Systems Judgment
```

If the current six scoring dimensions use different canonical names, preserve them.

Do not rename established dimensions merely for UI convenience.

Also derive skill/domain views from existing scenario metadata.

Examples may include:

```text
Distributed Systems
Reliability
Databases
Caching
Messaging
Security
Cost Efficiency
Capacity Planning
ML / Model Systems
Incident Leadership
```

Do not fabricate skill classifications if scenario metadata already provides them.

---

# 5. Source data

Engineer Rank must use only legitimate completed **practice attempts**.

Do not include:

- employer/company assessment attempts
- abandoned attempts unless explicitly part of the model
- candidate assessment scores
- another organization's data

Assessment performance belongs to employer reporting, not the engineer's public/private IncidentRank Rank profile.

---

# 6. Attempt eligibility

Recommended eligibility:

```text
attempt_type = practice
status = completed
```

Use resolved attempts as the core performance evidence.

Be deliberate about:

```text
declared_unstable
failed
timed_out
```

Recommended V1:

- resolved attempts contribute normally
- unsuccessful terminal attempts may contribute negatively or as evidence of incomplete mastery
- do not simply erase poor attempts

Document the policy.

---

# 7. Difficulty normalization

Create one centralized, documented normalization model.

Do not scatter weighting logic across UI code.

Conceptually:

```text
normalized_attempt_score =
raw score
× difficulty factor
× confidence / evidence adjustment
```

Exact mathematics should be simple and interpretable.

Possible difficulty factors:

```text
intermediate   1.00
senior         1.10
staff          1.20
senior_staff   1.30
principal      1.40
```

These are illustrative, not binding.

Before implementing, inspect the existing scenario difficulty distribution and choose reasonable weights.

Document them.

Do not optimize for artificial precision.

---

# 8. Avoid single-attempt rank inflation

One excellent Principal attempt must not instantly make someone Principal-ranked.

Engineer Rank should require evidence breadth.

Use concepts such as:

```text
minimum qualifying attempts
minimum distinct scenarios
minimum skill/domain coverage
consistency
```

Recommended:

- early users show provisional rank
- rank confidence increases with more attempts

Example:

```text
Provisional Staff
3 qualifying incidents

Staff
12 qualifying incidents across 4 skill areas
```

Exact thresholds should be chosen based on existing catalog structure.

---

# 9. Rank confidence

Add a confidence/evidence concept.

Possible values:

```text
Provisional
Established
Strong Evidence
```

or:

```text
low
medium
high
```

User-facing copy should make clear that rank is based on completed IncidentRank incidents, not a universal employment certification.

---

# 10. Rank algorithm transparency

Create a server-side module such as:

```text
engineer-rank.ts
```

with pure functions where practical.

It should accept structured attempt/scenario evidence and return something like:

```text
{
  rankBand,
  provisional,
  confidence,
  normalizedScore,
  dimensionScores,
  skillScores,
  attemptsCount,
  qualifyingAttempts,
  evidenceBreadth
}
```

Do not compute Rank independently in several pages.

---

# 11. Historical progression

Persist or derive Rank history.

Goal:

```text
Senior → Staff → Senior Staff
```

over time.

Recommended options:

```text
rank_snapshots
```

or derivation from attempts.

A snapshot table may be cleaner if Rank changes should remain historically inspectable even if the algorithm later evolves.

If using snapshots, include:

```text
user_id
rank_band
algorithm_version
normalized_score
dimension_json
skill_json
evidence_count
created_at
```

---

# 12. Algorithm versioning

Rank methodology will likely evolve.

Store:

```text
algorithm_version
```

with snapshots/results.

Never make historical rank interpretation impossible after changing the formula.

Start with:

```text
v1
```

---

# 13. User profile

Add an Engineer Rank section to the user's profile.

Example:

```text
Engineer Rank

Staff
Established evidence

Overall judgment score: 82

Diagnosis              85
Mitigation             88
Safety                 91
Efficiency             76
Systems Judgment       84
```

Also show useful skill/domain evidence.

Avoid false precision where evidence is weak.

---

# 14. Provisional state

For a new user:

```text
Engineer Rank
Not enough evidence yet
Complete more incidents to establish your rank.
```

After a small number of attempts:

```text
Provisional Senior
Based on 4 completed incidents.
```

Do not label a user as established Principal after one attempt.

---

# 15. Rank progression UI

Show progression if useful:

```text
Intermediate
→ Senior
→ Staff
```

Do not gamify excessively.

The purpose is professional benchmarking.

---

# 16. Public visibility

Use the existing user/profile visibility concepts if present.

Rank should default to private unless the current product already has an explicit public-profile policy.

If existing `leaderboardVisible` or similar field exists, inspect and reuse it carefully.

Do not make employer assessment results public.

---

# 17. Leaderboard

A global leaderboard is NOT required for Phase 10C.

If an existing leaderboard exists, decide whether to:

- update it to use Engineer Rank meaningfully
- de-emphasize it
- remove stale raw-score concepts

Do not build a misleading raw-score leaderboard just to have one.

Optional future leaderboards may be scoped by:

```text
difficulty
skill
time period
specific incident
```

but defer unless already trivial.

---

# 18. Rank and Pro/Founding

Rank calculation must not depend on whether user is:

```text
Free
Pro
Founding
Promo
Referral
```

Payment changes access, not scoring.

---

# 19. Rank and retries

Inspect current practice retry model.

Do not allow infinite repeated attempts on one scenario to dominate Rank.

Recommended:

- one best/most recent qualifying attempt per scenario, or
- diminishing impact for repeats

Choose a clear policy and document it.

Do not blindly average unlimited retries.

---

# 20. Rank gaming resistance

At minimum protect against:

- repeatedly farming easy scenarios
- repeatedly retrying one scenario until perfect
- one-domain-only rank inflation
- low-evidence high-rank assignment

Do not build heavy anti-cheat infrastructure.

Use sensible evidence rules.

---

# 21. Engineer Rank tests

Required tests:

1. no attempts → no rank
2. one high score → provisional only
3. enough intermediate evidence → intermediate/senior according to model
4. higher-difficulty evidence contributes appropriately
5. repeated same scenario cannot dominate
6. breadth across skills increases confidence
7. failed/unstable policy behaves as documented
8. assessment attempts excluded
9. payment status irrelevant
10. rank deterministic for same evidence
11. algorithm version included
12. historical snapshot preserved
13. cross-user attempts never leak
14. another user's rank cannot be mutated

---

# PART B — PLATFORM CUSTOMER & REVENUE DASHBOARD

# 22. Goal

Platform admins need one place to understand:

```text
Who uses IncidentRank?
Who pays IncidentRank?
How much have they purchased?
What is their current commercial relationship?
```

This is a beta operations/support dashboard.

It is not a full BI/analytics platform.

---

# 23. Admin routes

Add or extend:

```text
/admin/dashboard
/admin/customers
/admin/customers/users
/admin/customers/organizations
```

Optional:

```text
/admin/revenue
```

if separation improves clarity.

Use the existing platform-admin authorization.

Normal users and org users cannot access these routes.

---

# 24. Dashboard summary

Show at minimum:

```text
Total registered users
Total organizations

Free users
Active Pro users
Founding Engineers

Organizations with purchases
Organizations with available credits
Suspended organizations

Assessment credits purchased
Assessment credits consumed
Assessment credits remaining
```

Financial summary:

```text
Recurring Pro revenue
Founding one-time revenue
Organization assessment-credit revenue
Total collected revenue
```

---

# 25. Revenue definitions

Be precise.

## MRR

Only recurring Pro subscriptions count toward MRR.

Do not include:

```text
Founding Engineer purchases
organization credit purchases
```

in MRR.

## One-time revenue

Includes:

```text
Founding Engineer
organization assessment-credit purchases
```

## Total collected

Should represent successful Stripe payments actually collected where reliable data exists.

Do not estimate revenue purely from current balance or product quantity.

---

# 26. Revenue source of truth

Reuse existing Stripe/payment data.

Individual side already has:

```text
stripe customers
subscriptions
paid entitlements
checkout/payment linkage
```

Organization side already has:

```text
organization Stripe customers
organization credit purchase ledger
checkout/payment linkage
```

Do not invent a third billing ledger.

If exact collected amount is not currently persisted for some transaction type, inspect Stripe-linked objects or add minimal normalized payment fields needed for reliable reporting.

Do not derive all-time spend from current list prices if actual payment amount is available.

---

# 27. Individual customer list

Admin should see:

```text
Name
Email
Created
Current access
Subscription plan/status
Founding status
Total purchased
Last purchase/payment
Stripe customer
```

Example:

```text
Jane Engineer
jane@example.com
Pro Annual
Active
$79 total purchased
```

or:

```text
Alex SRE
alex@example.com
Founding Engineer
Lifetime
$99 total purchased
```

---

# 28. Individual customer detail

Clicking a user should show a support-oriented view.

Include:

```text
Identity
Account created
Current entitlement
Pro subscription state
Founding entitlement
Total amount purchased
Stripe customer ID
Payment/purchase history
Incident Pass summary
Referral summary
```

Do not expose:

- raw card data
- payment method secrets
- unnecessary sensitive Stripe payloads

Do not turn this into an engineering-performance admin page.

Engineer Rank may be visible as a small profile summary if appropriate, but keep billing/customer support separate from performance details.

---

# 29. Organization customer list

Admin should see:

```text
Organization
Status
Owners
Created
Credits purchased
Credits consumed
Credits available
Total amount purchased
Last purchase
Stripe customer
```

Example:

```text
Acme Corp
Active
220 purchased
63 consumed
157 available
$10,000 purchased
```

---

# 30. Organization customer detail

Include:

```text
Organization status
Owners/admins
Billing email
Stripe customer ID
Credits purchased
Credits consumed
Credits available
Purchase history
Credit ledger
Assessment count
Candidate-start count
Audit history
```

Do not show unrelated candidate personal billing/practice information.

---

# 31. Customer search

Add admin search.

Support at least:

```text
user email
user display name
organization name
organization slug
Stripe customer ID
```

Search must be server-authorized.

Do not leak customer existence through public APIs.

---

# 32. Filters

Useful filters:

```text
Free
Pro
Founding
Active subscription
Canceled subscription
Organization customer
Suspended organization
Zero-credit organization
Has purchased
Never purchased
```

Keep filters operational.

---

# 33. Time-range summary

Recommended lightweight ranges:

```text
Today
Last 7 days
Last 30 days
All time
```

Use one central date-range helper.

Do not build arbitrary analytics query infrastructure unless easy.

---

# 34. Revenue by category

Show:

```text
Pro subscription revenue
Founding revenue
Organization credit revenue
```

and combined:

```text
Total collected
```

If refunds are not automatically reconciled yet, clearly label metrics as:

```text
gross collected
```

rather than net revenue.

Do not imply refund-adjusted net revenue unless that logic exists.

---

# 35. Active Pro counts

Show:

```text
Monthly Pro
Annual Pro
Total active Pro
```

Do not count Founding users as Pro subscribers.

---

# 36. Founding metrics

Show:

```text
Founding Engineers sold
Founding spots remaining
Founding gross revenue
```

Use the existing authoritative Founding allocation/entitlement system.

Do not calculate sold count from Stripe checkout count alone.

---

# 37. Org credit metrics

Use the authoritative organization credit ledger.

Show:

```text
Credits purchased
Credits consumed
Credits adjusted
Credits available
```

Platform-wide totals should sum organization ledger state safely.

---

# 38. Customer revenue lineage

For user purchases:

```text
Stripe Customer
→ Checkout / Subscription
→ Paid Entitlement
```

For organization purchases:

```text
Organization
→ Stripe Customer
→ Checkout
→ Credit purchase ledger
```

Admin detail should let support trace these relationships.

---

# 39. Admin permissions

Any active platform admin may view customer/revenue dashboards.

Only existing role-specific mutation rules remain.

Do not allow the customer dashboard to grant new destructive capabilities.

Customer/revenue views are primarily read-only.

---

# 40. Platform owner

`mpant@incidentrank.com` remains the platform owner.

Do not change platform governance in Phase 10C.

---

# 41. Customer privacy

Admin dashboard may show information needed for platform operation/support.

Do not show:

- card PAN
- CVC
- full payment method data
- unnecessary candidate reasoning
- employer-private candidate reports in general customer list
- sensitive Clerk authentication data

Keep data minimization in mind.

---

# 42. Stripe API usage

Avoid making dozens of live Stripe API requests every time `/admin/dashboard` loads.

Prefer local synchronized payment data where available.

If additional amount fields are needed, persist them during verified webhook processing rather than turning the dashboard into a real-time Stripe crawler.

---

# 43. Payment amount normalization

If not already stored, consider adding minimal fields such as:

```text
amount_total
currency
```

to relevant purchase/payment records.

For subscriptions, do not double-count recurring revenue.

Be precise about:

```text
transaction revenue
vs
subscription current plan value
vs
MRR
```

---

# 44. MRR

Compute MRR from qualifying active Pro subscriptions.

Example:

```text
monthly Pro $9.99
→ $9.99 MRR

annual Pro $79/year
→ normalize to $79 / 12 MRR
```

Be explicit that this is normalized recurring revenue.

Do not include lifetime or org-credit purchases.

---

# 45. Gross transaction revenue

For a date range, show actual successful payment amounts when available.

Example:

```text
Pro renewals
Founding purchases
Org credit purchases
```

Avoid counting one subscription's current plan value repeatedly as transaction revenue.

---

# 46. Dashboard performance

Use aggregate SQL queries.

Do not load every user/payment into memory just to compute cards.

Add appropriate indexes if queries require them.

Keep beta-scale simple but sane.

---

# 47. Admin customer APIs

Create server-authorized endpoints or server loaders according to current architecture.

Examples:

```text
GET /api/admin/customers/users
GET /api/admin/customers/organizations
GET /api/admin/revenue/summary
```

or server components/loaders if more consistent.

Every path requires active platform-admin membership.

---

# 48. Pagination

Customer tables must be paginated.

Do not render every platform user in one response.

Use stable pagination.

Recommended initial:

```text
25 or 50 rows
```

per page.

---

# 49. Sorting

Support useful sorts such as:

```text
Newest
Oldest
Highest spend
Recently purchased
```

Avoid building arbitrary SQL sorting.

---

# 50. Zero-spend users

Users who never purchased are still customers/users of the platform.

Show them as:

```text
Free
$0 purchased
```

Do not hide them from customer overview.

---

# 51. Organizations with zero purchases

Likewise show provisioned organizations even if they have never bought credits.

This helps beta support.

---

# 52. Revenue currency

Phase 10B and existing individual catalog are USD.

Show:

```text
USD
```

Do not build multi-currency conversion.

If unexpected currencies exist, do not silently add values across currencies.

Either separate or flag them.

---

# 53. Refund caveat

Phase 10B explicitly deferred automated refund reconciliation.

Therefore dashboard revenue should be labeled appropriately.

Recommended:

```text
Gross collected
```

until refund reconciliation exists.

Do not call it:

```text
Net revenue
```

unless refunds are included.

---

# 54. Rank privacy vs admin

Engineer Rank belongs primarily to the engineer.

Platform admins may inspect it for support/debugging if needed.

Do not expose it to organization owners unless an explicit future product decision allows that.

Employer assessment reports remain separate.

---

# 55. Organization owners cannot see Engineer Rank by default

An employer should not automatically gain access to a candidate's personal IncidentRank practice Rank simply because that candidate took an assessment.

This is an important privacy boundary.

Company assessment result:

```text
company-visible
```

Engineer personal Rank/profile:

```text
engineer-controlled/private by default
```

Keep those separate.

---

# 56. Rank recalculation

Rank should update after qualifying practice completion.

Recommended:

```text
persist terminal practice attempt
→ calculate/update rank snapshot
```

Do not calculate synchronously on every profile page load if avoidable.

If existing architecture makes derived calculation simpler at current scale, document the choice.

---

# 57. Rank failure handling

A failure to update a Rank snapshot must not corrupt the completed attempt.

Prefer:

```text
attempt remains valid
rank update can retry/recompute
```

Do not make terminal attempt persistence depend on non-critical Rank UI processing unless safely transactional.

---

# 58. Rank rebuild capability

Provide a server/admin/internal function capable of rebuilding a user's Rank from practice attempt history.

This is important because the algorithm may change.

Do not require editing historical attempts.

---

# 59. Rank data integrity

Rank evidence must be derived from immutable attempt/scenario version data.

Do not evaluate an old attempt against today's modified scenario metadata if historical version metadata is available.

---

# 60. Rank UI language

Avoid claiming:

```text
You are officially a Staff Engineer
```

Prefer:

```text
IncidentRank level: Staff
```

or:

```text
Your IncidentRank performance currently aligns with Staff-level incident judgment.
```

This is a benchmark, not an employment credential.

---

# 61. Rank explanation

Add a short explainer:

```text
Your IncidentRank level is based on the difficulty, breadth,
and consistency of your completed practice incidents.
```

Optionally link to:

```text
How IncidentRank works
```

No need for a complex methodology whitepaper in beta.

---

# 62. Engineer Rank QA

Create:

```text
docs/qa/phase10c/
```

Required Rank stories:

## QA-R01

New user with no attempts → no established Rank.

## QA-R02

One excellent attempt → provisional result only.

## QA-R03

Multiple qualifying attempts → established rank.

## QA-R04

Higher-difficulty evidence changes normalized rank appropriately.

## QA-R05

Repeated same scenario cannot dominate.

## QA-R06

Skill/domain breadth appears.

## QA-R07

Assessment attempt excluded.

## QA-R08

Personal payment status does not affect Rank.

## QA-R09

Rank updates after new qualifying practice completion.

## QA-R10

Historical progression preserved.

## QA-R11

Organization owner cannot see candidate's personal Engineer Rank by default.

## QA-R12

Rank rebuild produces deterministic equivalent result.

---

# 63. Customer dashboard QA

Required:

## QA-C01

Platform admin opens dashboard and sees total users/orgs.

## QA-C02

Normal user cannot access.

## QA-C03

Free user appears with $0 spend.

## QA-C04

Pro user shows correct plan/status and purchase history.

## QA-C05

Founding user shows lifetime status and correct spend.

## QA-C06

Organization with single-credit purchase shows correct spend/credits.

## QA-C07

Organization with 110-credit pack shows correct spend/credits.

## QA-C08

Org credit consumption changes used/available but not purchased revenue.

## QA-C09

Search user by email.

## QA-C10

Search organization by name/slug.

## QA-C11

Search Stripe customer ID.

## QA-C12

Suspended org clearly marked.

## QA-C13

MRR excludes Founding and org credits.

## QA-C14

Founding gross revenue correct.

## QA-C15

Org-credit gross revenue correct.

## QA-C16

Total gross collected reconciles with test fixtures.

## QA-C17

Cross-user customer detail inaccessible to non-admin.

## QA-C18

Pagination works.

---

# 64. Automated Rank tests

At minimum:

1. deterministic calculation
2. difficulty weighting
3. evidence threshold
4. provisional behavior
5. repeated-scenario policy
6. skill breadth
7. failed attempt policy
8. assessment exclusion
9. user isolation
10. algorithm version
11. snapshot creation
12. snapshot history
13. rebuild
14. payment independence

---

# 65. Automated dashboard tests

Test:

1. admin auth required
2. revoked admin denied
3. total user count
4. org count
5. Pro count
6. Founding count
7. organization purchasing count
8. credit sums
9. MRR monthly normalization
10. annual MRR normalization
11. Founding excluded from MRR
12. org credits excluded from MRR
13. gross collected category totals
14. search by email
15. search org name
16. search Stripe customer
17. pagination
18. cross-admin/non-admin isolation
19. suspended org flag
20. zero-purchase customer visibility

---

# 66. Existing Stripe TEST MODE

Use existing Stripe TEST MODE configuration.

Do not create new pricing products in this phase.

Do not touch live Stripe.

Dashboard work should use already-recorded local/Stripe-synchronized data.

---

# 67. Feature flags

Engineer Rank likely does not require a feature flag unless product rollout benefits from one.

If desired:

```env
ENGINEER_RANK_ENABLED=false
```

Dashboard remains within existing admin feature gating.

Do not add unnecessary flags.

---

# 68. Beta positioning

After Phase 10C, the product should have two coherent sides.

## Engineer

```text
Practice incidents
→ measured performance
→ IncidentRank level
→ skill profile
→ progression
```

## Company

```text
Provisioned organization
→ buy assessment credits
→ create assessments
→ invite candidates
→ review employer reports
```

## IncidentRank operator

```text
Admin dashboard
→ users
→ organizations
→ subscriptions
→ Founding
→ org credit purchases
→ revenue summary
→ customer support visibility
```

---

# 69. No new major product scope

Do NOT implement in Phase 10C:

```text
company subscriptions
enterprise invoicing
automatic refund reconciliation
company SSO
public global leaderboard
candidate Rank sharing with employer
AI tutor
AI scenario builder
new built-in incidents
CRM
marketing automation
advanced BI warehouse
```

---

# 70. Validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
pnpm build
pnpm --filter @incidentrank/db db:seed
```

If root parallel-test isolation is fixed:

```bash
pnpm test
```

Built-in scenario count must remain:

```text
100
```

---

# 71. Completion report

Create:

```text
docs/implementation_plan/phase10c_engineer_rank_admin_dashboard_completion.md
```

Include:

## Engineer Rank
- algorithm
- difficulty normalization
- evidence thresholds
- repeat policy
- rank bands
- confidence
- skill dimensions
- snapshot/history model
- algorithm version
- rebuild capability
- profile UX
- privacy

## Platform dashboard
- summary metrics
- user customers
- organization customers
- spend calculations
- MRR
- one-time gross revenue
- credit metrics
- search
- filters
- pagination
- customer detail views

## Security/privacy
- platform admin authorization
- customer data boundaries
- candidate/Rank separation
- Stripe data minimization

## QA
- Rank QA
- dashboard QA
- defects
- fixes
- retests

## Validation
- typecheck
- lint
- tests
- build
- seed

## Beta readiness
- remaining configuration/deployment work

---

# 72. Completion criteria

Phase 10C is complete only when:

1. Engineer Rank exists
2. no-attempt user has no established Rank
3. one attempt cannot create established high rank
4. difficulty normalization exists
5. evidence breadth matters
6. repeated same scenario cannot dominate
7. assessment attempts excluded
8. payment status does not influence Rank
9. algorithm version exists
10. rank history/progression preserved
11. rebuild capability exists
12. profile shows meaningful Rank/skills
13. org owners cannot see candidate personal Rank by default
14. admin dashboard shows users
15. admin dashboard shows organizations
16. individual purchase totals visible
17. organization purchase totals visible
18. Pro plan/status visible
19. Founding status visible
20. org credit balances visible
21. MRR calculated only from recurring Pro
22. one-time revenue separated
23. gross total is not mislabeled as net
24. search works
25. filters work
26. pagination works
27. normal users cannot access platform customer dashboard
28. Stripe secrets/payment details are not exposed
29. browser QA passes
30. automated tests pass
31. build passes
32. built-in scenario count remains 100
33. completion report written

---

# 73. Stop condition

Stop after Phase 10C implementation, browser QA, full validation, and completion report.

Do not begin another major product feature.

The next phase after successful Phase 10C is:

```text
Production Configuration + Controlled Beta Launch
```

At that point, report exactly what remains before the first external beta users and organizations can be invited.