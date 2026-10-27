# Phase 8 — Admin Bootstrap, Promotional Access & Referral Growth Loop

## Status

**PLANNED — do not begin until explicitly approved.**

## Purpose

IncidentRank now has:

- 100 built-in scenarios
- completed engine-integrity validation
- completed 100/100 golden-path solvability validation
- completed full user-story and end-to-end product QA
- practice resume/idempotency behavior
- candidate assessment result privacy
- working free/premium access boundaries
- premium incidents still intentionally not purchasable yet

Phase 8 introduces the first controlled growth infrastructure:

1. secure IncidentRank admin access
2. founder/admin-created promotional invitations
3. one-incident promotional passes
4. one-user / one-link redemption rules
5. referral links
6. referral-earned incident passes
7. transactional email delivery from `support@incidentrank.com`
8. admin visibility into invite / redemption / referral state

This phase is intentionally **pre-payments**.

The purpose is to let selected engineers try IncidentRank before checkout exists, measure whether they actually use and share it, and establish reusable entitlement primitives that later paid access can build on.

---

# 1. Core product doctrines

## 1.1 One promotional invite = one user

A private promotional invitation must be redeemable by exactly one intended user.

Once bound:

```text
invite token
   ↓
verified invited email
   ↓
one IncidentRank user
```

No second user may redeem the same private invite.

## 1.2 One Incident Pass = one premium incident

A pass must not unlock the entire premium catalog.

The intended lifecycle is:

```text
available pass
   ↓ user chooses one eligible premium scenario
bound pass
   ↓ user starts that scenario
consumed pass
```

The user may browse/select before starting, but once a scenario is bound, the pass cannot silently move to another scenario.

## 1.3 Referral reward is earned, not merely clicked

The referrer should not receive a new pass when the referred engineer:

- clicks a link
- creates an account
- signs in
- selects a scenario
- starts an attempt
- abandons an attempt

The default qualification rule should be:

> The referred engineer must complete an eligible incident with a **resolved** outcome, either `acceptable` or `optimal`.

Once that happens, the referrer earns exactly one new Incident Pass.

## 1.4 Admin authority is explicit

Having an `@incidentrank.com` email address does **not** automatically make a user an admin.

Admin authorization requires both:

1. verified `@incidentrank.com` identity
2. explicit persisted admin membership

The initial bootstrap owner is:

```text
mpant@incidentrank.com
```

---

# 2. Phase boundaries

## In scope

- admin bootstrap
- admin authorization
- first owner creation
- future admin invitations
- promotional invite creation
- bulk email entry
- unique invite links
- transactional email sending
- one-incident passes
- invite redemption
- scenario binding
- pass consumption
- referral-link creation
- referral claiming
- referral qualification
- referral reward issuance
- admin tracking dashboards
- revoke / expire flows
- anti-abuse basics
- server-side authorization
- test coverage
- end-to-end QA
- feature flags

## Explicitly out of scope

Do **not** implement in Phase 8:

- Stripe or any payment provider
- $99 checkout
- $5 AI subscription
- organization per-attempt billing
- organization usage ledger
- organization-created scenarios
- AI scenario builder
- AI incident tutor
- enterprise SSO
- certificates
- broad marketing automation
- CRM
- newsletter tooling
- public campaign/referral marketplace
- social sharing automation
- production launch campaign
- pricing-page redesign
- paid subscriptions
- refunds
- tax handling
- invoices

The Phase 8 entitlement model should be reusable by future paid access, but payments themselves are deferred.

---

# 3. Feature flags

Introduce explicit feature flags.

Suggested:

```env
ADMIN_PORTAL_ENABLED=false
PROMOTIONAL_INVITES_ENABLED=false
REFERRALS_ENABLED=false
TRANSACTIONAL_EMAILS_ENABLED=false
```

Optional:

```env
INITIAL_ADMIN_EMAIL=mpant@incidentrank.com
```

Rules:

- flags default to `false` in production until explicitly enabled
- server-side enforcement must not depend only on hiding UI
- disabling a feature must block server mutations for that feature
- already-created data should remain intact when a feature is disabled
- admin bootstrap must not remain an open authorization backdoor after first owner creation

Do not reuse `DEV_UNLOCK_PAID_SCENARIOS` as a promotional entitlement mechanism.

---

# 4. Admin bootstrap and authorization

## 4.1 First admin bootstrap

Initial owner:

```text
mpant@incidentrank.com
```

Recommended bootstrap flow:

```text
mpant@incidentrank.com signs in
        ↓
Clerk confirms verified email
        ↓
server checks INITIAL_ADMIN_EMAIL match
        ↓
server checks no admin owner exists yet
        ↓
create owner membership
        ↓
bootstrap condition permanently closes
```

Persist the result in the database.

Do not rely on `INITIAL_ADMIN_EMAIL` for every future request.

## 4.2 Suggested admin table

```text
admin_users
- id
- user_id
- role
- created_by_user_id
- created_at
- revoked_at
```

Suggested roles:

```text
owner
admin
```

Initial record:

```text
user = mpant@incidentrank.com user
role = owner
created_by_user_id = NULL
```

## 4.3 Admin domain restriction

Any user granted admin membership must have a verified email ending in:

```text
@incidentrank.com
```

This is a necessary condition, not sufficient authorization.

Reject external-domain admin invitations.

Server authorization should be:

```text
authenticated user
   ↓
verified IncidentRank-domain email
   ↓
active admin_users membership
   ↓
allow admin route/action
```

## 4.4 Admin invitation flow

Future owners/admins should be explicitly invited.

```text
Admin Settings
   ↓
Invite Admin
   ↓
enter person@incidentrank.com
   ↓
validate domain
   ↓
send admin invitation
   ↓
recipient signs in
   ↓
create admin membership
```

Suggested table:

```text
admin_invites
- id
- email
- role
- token_hash
- invited_by_user_id
- status
- expires_at
- accepted_by_user_id
- accepted_at
- created_at
```

Statuses:

```text
pending
accepted
expired
revoked
```

## 4.5 Owner protection

Required safeguards:

- last active owner cannot demote themselves
- last active owner cannot revoke themselves
- admin cannot promote arbitrary external-domain users
- revoked admin membership immediately removes admin access
- deleting/archiving a user must not leave orphaned privileged authorization

---

# 5. Admin portal

Suggested routes:

```text
/admin
/admin/promotional-invites
/admin/promotional-invites/new
/admin/incident-passes
/admin/referrals
/admin/admin-users
```

Every `/admin/*` route must enforce authorization server-side.

Unauthorized users:

- do not see admin data
- receive 403 or clean not-found depending on project convention
- cannot call admin mutation APIs directly

---

# 6. Promotional invite model

Suggested table:

```text
promotional_invites
- id
- email
- token_hash
- campaign
- status
- created_by_user_id
- redeemed_by_user_id
- incident_pass_id
- sent_at
- opened_at
- redeemed_at
- expires_at
- created_at
- updated_at
```

Suggested statuses:

```text
created
sent
redeemed
expired
revoked
send_failed
```

Recommended indexes:

```text
email
status
campaign
created_at
redeemed_by_user_id
```

Token rules:

- high entropy
- cryptographically random
- never predictable
- store a hash rather than raw token where practical
- never log raw invite tokens

---

# 7. Creating promotional invites

## 7.1 Admin UI

Admin should be able to:

- enter one email
- paste many emails
- optionally set campaign name
- optionally set expiration
- optionally constrain eligible scenarios
- preview recipients
- send invitations

Recommended first version:

```text
Campaign name
Recipient emails
Expiration date
Eligibility:
  - any premium incident
```

## 7.2 Bulk email handling

When admin pastes multiple addresses:

- normalize whitespace
- lowercase for canonical comparison
- deduplicate
- validate email format
- show invalid entries before sending
- do not create duplicate active invites for the same email/campaign unintentionally

Return a summary:

```text
12 valid
2 duplicate
1 invalid
```

Admin confirms before sending.

---

# 8. Email delivery

## 8.1 Sender

Visible From:

```text
IncidentRank <support@incidentrank.com>
```

Use a transactional email provider.

Do not build raw SMTP logic into application code unless already established.

## 8.2 Email authentication requirements

Before enabling production sending, configure:

- SPF
- DKIM
- DMARC

Do not mark the email feature production-ready without sender-domain authentication.

## 8.3 Email content

Suggested subject:

```text
You're invited to try an IncidentRank incident
```

Body concept:

```text
You've been invited to try one IncidentRank production incident at no cost.

Choose one incident, work through it, and see how you handle the tradeoffs.

[Choose your incident]

This invitation is intended for <email>.
```

Use the term:

```text
Incident Pass
```

Do not call it a subscription or generic free trial.

## 8.4 Sending states

```text
created
  ↓ successful provider acceptance
sent
```

Failure:

```text
created
  ↓ provider/API failure
send_failed
```

Admin should be able to retry a failed send without creating a second entitlement.

---

# 9. Promotional invite redemption

Suggested route:

```text
/invite/<token>
```

Flow:

```text
open invite
   ↓
validate token
   ↓
not expired/revoked/redeemed by another user
   ↓
authenticate
   ↓
verified user email matches invite email
   ↓
atomically redeem invite
   ↓
grant one Incident Pass
   ↓
show scenario chooser
```

## 9.1 Email match

The signed-in user's verified email must match the invite recipient.

Mismatch copy:

> This invitation was sent to a different email address. Sign in with the invited account to continue.

## 9.2 Redemption idempotency

Repeated requests by the same invited user must not create multiple passes.

Required behavior:

```text
first redemption:
  create/pass bind
subsequent redemption:
  return existing redeemed/pass state
```

Use transaction + uniqueness constraints.

---

# 10. Incident Pass model

Suggested table:

```text
incident_passes
- id
- user_id
- source_type
- source_id
- scenario_id
- status
- granted_at
- bound_at
- consumed_at
- expires_at
- revoked_at
- created_at
- updated_at
```

Source types:

```text
promo_invite
referral_reward
admin_grant
```

Statuses:

```text
available
bound
consumed
expired
revoked
```

---

# 11. Pass binding

When the user chooses an eligible premium incident:

```text
available pass
   ↓
server verifies:
- pass owner
- pass available
- scenario premium/eligible
- scenario active
   ↓
set scenario_id
set status = bound
set bound_at
```

Binding must be atomic.

Two concurrent scenario-selection requests must not bind the same pass to two scenarios.

---

# 12. Pass consumption

Recommended trigger:

```text
incident_started_at becomes non-null
```

At attempt start:

```text
verify pass belongs to user
verify pass bound to this scenario
verify pass status = bound
create/start attempt
mark pass consumed
```

These should occur atomically where practical.

## 12.1 Resume behavior

A consumed pass must continue to authorize the attempt it originally started.

Refreshing/resuming must not require a second pass.

```text
new attempt:
  requires available/bound entitlement

existing attempt:
  resume based on ownership + original entitlement history
```

---

# 13. Promotional access evaluation

Extend premium access centrally.

Conceptually:

```text
evaluatePracticeAccess({
  user,
  scenario,
  existingAttempt,
  paidEntitlement,
  incidentPass,
  devUnlock
})
```

Possible outcomes:

```text
free
existing_attempt
incident_pass_available
incident_pass_bound
paid_entitlement
locked
dev_unlocked
```

Important:

- server is authoritative
- client lock is UX only
- direct API attempts must enforce the same rule

---

# 14. Referral link creation

After the user's first eligible completed promo/referral incident:

```text
Invite another engineer

If they complete their first IncidentRank incident successfully,
you'll earn another Incident Pass.

[Copy referral link]
```

Suggested URL:

```text
https://incidentrank.com/r/<referralCode>
```

Do not include user IDs or emails in the URL.

Referral codes must be random, high entropy, and revocable.

---

# 15. Referral data model

Suggested:

```text
referrals
- id
- referral_code_hash
- referrer_user_id
- referred_user_id
- status
- referred_incident_pass_id
- qualifying_attempt_id
- reward_incident_pass_id
- clicked_at
- claimed_at
- qualified_at
- rewarded_at
- expires_at
- created_at
- updated_at
```

Statuses:

```text
created
claimed
qualified
rewarded
rejected
expired
revoked
```

---

# 16. Referral claim flow

```text
Engineer B opens A's link
   ↓
store referral context
   ↓
B signs in / creates account
   ↓
server validates eligibility
   ↓
bind referral to B
   ↓
grant B one Incident Pass
   ↓
B chooses one incident
```

Do not trust a client-supplied referrer ID.

---

# 17. Referral eligibility

At minimum reject:

- self-referral
- same referred user attached to multiple referrers
- expired referral
- revoked referral
- duplicate claim
- referrer no longer valid if policy requires active account

Recommended policy:

> A user can be acquired through only one referral.

---

# 18. Existing-user policy

Recommended V1:

> Referral acquisition is for users who have not previously consumed a promotional/referral Incident Pass and have not previously completed a practice incident.

If an ineligible existing user opens a referral link:

```text
You're already an IncidentRank user, so this referral can't be claimed.
```

Admin-granted passes remain separate.

---

# 19. Successful referral qualification

Recommended qualification:

```text
referred attempt:
status = completed
outcome = resolved
completion_tier IN (acceptable, optimal)
```

Then:

```text
referral.status = qualified
qualifying_attempt_id = attempt.id
```

After reward creation:

```text
referral.status = rewarded
reward_incident_pass_id = new pass
```

Failed/declared-unstable attempts do not qualify.

---

# 20. Reward idempotency

A single qualifying referral must produce exactly one reward pass.

Protect at:

- application layer
- transaction layer
- database constraints

Possible safeguards:

```text
UNIQUE(qualifying_attempt_id)
UNIQUE(reward_incident_pass_id)
```

Qualification/reward should run in one transaction where possible.

---

# 21. Referral reward timing

Grant the reward immediately after the qualifying attempt is persisted terminally.

Preferred integration point:

```text
persist terminal attempt
   ↓
attempt resolved?
   ↓
attempt belongs to referred user?
   ↓
active claimed referral?
   ↓
qualify referral
   ↓
create reward pass exactly once
```

Do not rely on client result-screen code.

---

# 22. Referral UX

## Referrer

Suggested:

```text
Your Incident Passes

Available: 1

Referrals:
- Joined
- Started
- Completed — Reward earned
```

Do not expose referred user's score, tier, reasoning, or detailed result.

## Referred user

```text
You've received one Incident Pass.

Choose one premium incident to try.
```

---

# 23. Admin promotional dashboard

Admin should see:

```text
Invite email
Campaign
Status
Sent at
Redeemed?
Redeemed by
Selected scenario
Attempt started?
Attempt completed?
Referral created?
Expiration
```

Aggregate stats:

```text
Invites sent
Invites redeemed
Redemption rate
Incidents started
Incidents completed
Resolved completions
Referrals claimed
Referral-qualified users
Reward passes issued
```

Keep this operational, not a full analytics system.

---

# 24. Admin actions

Allow:

- send invite
- resend failed/unopened invite
- revoke unused invite
- expire invite
- view redemption state
- view pass state
- revoke unused pass
- manually grant one pass
- revoke referral code if abuse is suspected

Do not let admin silently alter a consumed attempt.

---

# 25. Admin audit trail

Suggested table:

```text
admin_audit_events
- id
- admin_user_id
- action
- target_type
- target_id
- metadata_json
- created_at
```

Log at minimum:

- promo invite created
- promo invite sent
- promo invite revoked
- pass granted
- pass revoked
- admin invited
- admin role changed
- admin revoked
- referral manually revoked

Do not log raw secrets.

---

# 26. Email provider abstraction

Create a small server-side interface.

```ts
interface TransactionalEmailService {
  sendPromotionalInvite(...)
  sendReferralReward(...)
}
```

Keep provider-specific code behind the boundary.

This enables:

- test adapter locally
- provider swap later
- cleaner domain logic

---

# 27. Privacy rules

Do not expose:

- full invite lists to non-admins
- raw promo/referral tokens
- referred user's scores to referrer
- referred user's detailed attempt result to referrer
- admin audit events to normal users

Referrer may see only progress such as:

```text
Invited
Joined
Completed
Reward earned
```

---

# 28. Anti-abuse protections

Required:

- no self-referral
- one referral acquisition per referred user
- one reward per referral
- one pass per private invite
- verified invited email match
- high-entropy tokens/codes
- server-side entitlement checks
- transaction-safe claim/reward
- expiration support
- revoke support

Do not add invasive fingerprinting.

---

# 29. Transaction boundaries

The following must be concurrency-safe.

## Invite redemption

```text
validate invite
bind user
create incident pass
mark redeemed
```

## Pass binding

```text
validate pass
bind scenario
```

## Pass consumption / attempt start

```text
validate pass
create/start attempt
consume pass
```

## Referral claim

```text
validate referral
bind referred user
create referred pass
mark claimed
```

## Referral qualification + reward

```text
validate qualifying attempt
mark qualified
create one reward pass
mark rewarded
```

Write concurrency tests.

---

# 30. Integration with attempts

Do not add `organization_id` in this phase.

Recommended nullable linkage:

```text
attempt.incident_pass_id
```

Benefits:

- prove which pass funded which attempt
- prevent one pass funding multiple attempts
- support future analytics
- support support/debugging

If added, use FK + index.

---

# 31. Retry policy

Recommended V1:

> One Incident Pass funds one attempt start.

If user fails/abandons:

- pass remains consumed
- no automatic replacement

Admin may manually grant a replacement for a verified technical/support issue.

Do not silently grant unlimited retries.

---

# 32. Scenario eligibility

Default pass:

```text
any active premium scenario
```

Exclude:

- free scenarios
- archived/inactive scenarios
- internal/admin-only scenarios
- future organization-private scenarios

If user selects a free scenario:

- do not bind/consume the pass
- allow free access normally

---

# 33. Admin bootstrap tests

Required:

1. no admin exists + correct initial email → owner created
2. no admin exists + wrong email → denied
3. owner already exists + bootstrap email → no duplicate owner
4. external-domain user cannot become admin
5. admin route requires active membership
6. revoked admin loses access
7. last owner cannot self-demote
8. last owner cannot self-revoke
9. admin invite acceptance is idempotent

---

# 34. Promotional invite tests

Required:

1. admin creates invite
2. non-admin cannot create invite
3. invite email validation
4. duplicate pasted emails deduplicated
5. token generated securely
6. correct email can redeem
7. wrong verified email cannot redeem
8. expired invite cannot redeem
9. revoked invite cannot redeem
10. same invite cannot create two passes
11. repeated redemption is idempotent
12. send failure does not duplicate invite/pass
13. resend does not create duplicate entitlement

---

# 35. Incident Pass tests

Required:

1. promo redemption creates exactly one available pass
2. available pass can bind to one premium scenario
3. pass cannot bind to two scenarios
4. free scenario does not consume pass
5. starting bound premium scenario consumes pass
6. consumed pass cannot start another scenario
7. resume original attempt works with consumed pass
8. expired/revoked pass cannot start new attempt
9. direct API attempt creation enforces pass
10. concurrent bind requests are safe
11. concurrent attempt-start requests do not double-consume

---

# 36. Referral tests

Required:

1. eligible user gets referral code after qualifying use
2. self-referral rejected
3. referred user can claim valid code
4. claim grants exactly one pass
5. duplicate claim idempotent
6. referred user cannot belong to two acquisition referrals
7. existing ineligible user rejected under chosen policy
8. failed attempt does not qualify
9. declared_unstable does not qualify
10. acceptable resolved attempt qualifies
11. optimal resolved attempt qualifies
12. qualification creates exactly one reward pass
13. duplicate terminal persistence does not double-reward
14. concurrent qualification does not double-reward
15. referrer cannot see referred user's score
16. revoked referral cannot be claimed

---

# 37. Email tests

Using provider/test adapter:

1. invite email uses `support@incidentrank.com`
2. recipient is correct
3. unique link is included
4. raw secret is not logged
5. send failure updates `send_failed`
6. resend works without duplicate pass
7. email-disabled feature flag prevents send
8. dev/test mode never sends real email unexpectedly

---

# 38. Access-control QA

Manually verify:

- normal user cannot open `/admin`
- normal user cannot call admin APIs
- admin can create/send invite
- invite only redeems for intended verified email
- user cannot enumerate other invites
- user cannot mutate another user's pass
- user cannot claim another user's referral reward
- direct premium attempt API respects Incident Pass rules

---

# 39. End-to-end QA stories

## QA-01 — First owner bootstrap

```text
sign in as mpant@incidentrank.com
→ bootstrap owner
→ open admin portal
```

Verify persisted admin membership.

## QA-02 — Send one promo invite

```text
admin enters engineer email
→ send
→ email received
→ unique link opens
```

## QA-03 — Redeem promo invite

```text
recipient signs in with matching verified email
→ redeem
→ one pass visible
```

## QA-04 — Wrong email redemption

```text
other user opens link
→ denied
→ no pass created
```

## QA-05 — Choose premium incident

```text
one available pass
→ choose premium incident A
→ pass bound to A
→ cannot switch to B
```

## QA-06 — Start incident

```text
start A
→ pass consumed
→ attempt created
```

## QA-07 — Refresh/resume

```text
refresh
→ original attempt resumes
→ no second pass consumed
→ no duplicate attempt
```

## QA-08 — Successful completion creates referral capability

```text
complete resolved
→ referral UI visible
→ referral link copyable
```

## QA-09 — Referred user claim

```text
B opens A referral
→ B signs up/signs in
→ B receives one pass
```

## QA-10 — Referral does not reward early

Check after:

- claim
- scenario selection
- start

Referrer still has no reward pass.

## QA-11 — Referred user fails

```text
B fails/declares unstable
→ no reward
```

## QA-12 — Referred user resolves

```text
B resolves acceptable/optimal
→ A receives exactly one new pass
```

## QA-13 — Duplicate reward attempt

Replay/retry terminal callback.

Verify no second pass.

## QA-14 — Admin reporting

Verify dashboard states accurately reflect:

```text
sent
redeemed
bound
started
completed
referral qualified
reward issued
```

---

# 40. Operational metrics

Track basic counters:

```text
promo_invites_created
promo_invites_sent
promo_invites_redeemed
promo_passes_granted
promo_passes_consumed
promo_attempts_resolved
referral_links_claimed
referral_attempts_resolved
referral_rewards_issued
```

Simple DB-derived admin stats are sufficient.

---

# 41. User-facing pass UX

User account/dashboard should show:

```text
Incident Passes

1 available

Use this pass to try one premium incident.
```

If bound:

```text
1 Incident Pass
Bound to: <Scenario Name>
[Continue]
```

If consumed:

```text
Used on: <Scenario Name>
```

Do not call it "Pro" access.

---

# 42. Coming-soon premium UX integration

For non-entitled user:

```text
Pro — coming soon
```

For user with available Incident Pass:

```text
Use Incident Pass
```

For pass bound to this scenario:

```text
Continue with Incident Pass
```

For pass bound elsewhere:

```text
Your Incident Pass is already assigned to <Scenario>
```

Do not expose checkout yet.

---

# 43. Migration strategy

Additive migrations only.

Potential new tables:

```text
admin_users
admin_invites
promotional_invites
incident_passes
referrals
admin_audit_events
```

Potential attempts addition:

```text
incident_pass_id nullable FK
```

Do not rewrite existing attempt history.

Do not seed production owner membership blindly.

Bootstrap owner through authenticated bootstrap logic or an explicit safe bootstrap command.

---

# 44. Security review checklist

Before enabling:

- invite tokens high entropy
- referral codes high entropy
- raw tokens not logged
- server-side admin auth
- verified-email matching
- no domain-only privilege escalation
- no cross-user pass mutation
- no duplicate reward race
- no direct API premium bypass
- no client-only entitlement enforcement
- feature flags enforced server-side
- revoked admin denied immediately
- last-owner protection
- email provider secrets server-only

---

# 45. Validation commands

At minimum:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Expected scenario seed remains:

```text
Seed complete (100 built-in scenario(s)).
```

Phase 8 must not add or remove built-in scenarios.

---

# 46. Completion report

Create:

```text
docs/implementation_plan/phase8_promotional_access_referrals_completion.md
```

Include:

## Admin bootstrap
- first owner flow
- exact first owner identity
- bootstrap closing behavior
- admin-domain rule
- owner protections

## Schema
- tables added
- constraints
- indexes
- migrations

## Promotional invites
- create
- send
- redeem
- expire
- revoke
- resend
- idempotency

## Incident Passes
- grant
- bind
- consume
- resume behavior
- revoke/expire

## Referrals
- create
- claim
- eligibility
- qualification
- reward
- anti-abuse
- idempotency

## Email
- provider abstraction
- sender
- test-mode behavior
- SPF/DKIM/DMARC readiness status

## Admin UI
- routes
- permissions
- dashboard states

## User UI
- pass display
- premium locked/entitled states
- referral link UX

## Security
- cross-user checks
- direct API checks
- token handling
- role enforcement

## QA
- story matrix
- defects discovered
- fixes
- retests

## Validation
- typecheck
- lint
- tests
- build
- seed

## Deferred work
Explicitly list payments and future organization/AI work.

---

# 47. Phase completion criteria

Phase 8 is complete only when:

1. `mpant@incidentrank.com` can bootstrap as first owner exactly once
2. domain alone does not grant admin
3. future admins require explicit membership
4. last-owner protections exist
5. non-admin cannot use admin routes/APIs
6. admin can enter one or many promotional emails
7. admin can send unique invites
8. invites are sent from `support@incidentrank.com` through provider abstraction
9. correct verified email can redeem
10. wrong email cannot redeem
11. one invite grants exactly one Incident Pass
12. one pass binds to exactly one premium scenario
13. pass is consumed at incident start
14. resume does not consume another pass
15. direct API access cannot bypass entitlement
16. resolved referred user qualifies referral
17. failed/unstable referred user does not qualify
18. one referral creates exactly one reward pass
19. self-referral is rejected
20. duplicate/replayed callbacks do not double-reward
21. referrer cannot see referred user's score/results
22. admin dashboard accurately reflects state
23. feature flags work server-side
24. full validation is green
25. built-in scenario seed remains 100
26. completion report is written

---

# 48. Recommended implementation order

### Step 1 — Admin foundation
- `admin_users`
- bootstrap owner
- admin authorization helper
- owner protections
- admin audit skeleton

### Step 2 — Incident Pass primitive
- table
- lifecycle
- access evaluation integration
- binding
- consumption
- attempt linkage

### Step 3 — Promotional invites
- table
- admin create UI
- unique token flow
- redemption
- one-pass grant

### Step 4 — Email abstraction
- provider adapter
- test adapter
- support@ sender
- send/retry state

### Step 5 — Admin dashboard
- invite status
- pass state
- revoke/resend

### Step 6 — Referral core
- referral codes
- claim
- eligibility
- referred-user pass

### Step 7 — Referral qualification/reward
- terminal-attempt hook
- reward pass
- idempotency/concurrency

### Step 8 — Referral UX
- copy link
- status
- reward earned

### Step 9 — Security/concurrency pass
- cross-user
- replay
- races
- direct APIs
- revoked/expired state

### Step 10 — Browser QA
Run all Phase 8 end-to-end stories.

### Step 11 — Full validation
- typecheck
- lint
- tests
- build
- seed

### Step 12 — Completion report

---

# 49. Final doctrine

This phase should create a controlled growth loop without making IncidentRank generally free.

The intended user experience is:

```text
selected engineer
   ↓
one invitation
   ↓
one Incident Pass
   ↓
one premium incident
   ↓
real attempt
   ↓
successful completion
   ↓
refer another engineer
   ↓
successful referral
   ↓
earn one more Incident Pass
```

The system should remain measurable, abuse-resistant, and easy to disable.

Most importantly:

> Promotional access must be an entitlement system, not a collection of UI exceptions.

That same entitlement foundation can later support paid access without redesigning the entire product.

---

# Stop condition

Stop after Phase 8 is complete and the completion report is written.

Do **not** begin payments, organization billing, AI scenario creation, AI tutoring, or production launch infrastructure without explicit instruction.
