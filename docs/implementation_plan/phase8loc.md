Implement **IncidentRank Phase 8 — Admin Bootstrap, Promotional Access & Referral Growth Loop**.

Use the existing Phase 8 implementation plan as the primary source of truth, but apply the corrections and hard requirements below before writing code.

This phase is **pre-payments**.

Do not implement Stripe, checkout, subscriptions, organization billing, AI tutors, organization-created scenarios, AI scenario generation, production launch automation, or unrelated roadmap work.

The goal is to create a secure entitlement and referral system that can later support paid access without requiring a redesign.

# Core product rules

These rules are binding.

## 1. One promotional invite = one intended user

A private promotional invite is created for one email address.

It may be redeemed by exactly one IncidentRank user whose verified email matches that invited email.

After redemption:

- the invite is bound to that user
- repeated redemption by the same user is idempotent
- another user cannot redeem it
- exactly one Incident Pass is created

## 2. One Incident Pass = one premium incident

A pass does not unlock the entire premium catalog.

Lifecycle:

```text
available
  ↓ user explicitly selects a premium incident
bound
  ↓ user starts that incident
consumed
```

Once bound, a pass cannot be moved to a different scenario.

The UI must warn the user before binding:

> Use your Incident Pass for this incident? Once selected, this pass can't be moved to another incident.

Free scenarios must never consume or bind a pass.

## 3. Referral rewards are earned only after successful completion

A referral reward is not granted for:

- clicking the link
- signing up
- signing in
- claiming the referral
- selecting a scenario
- starting an incident
- abandoning
- failing
- declaring unstable

The referred engineer must resolve the incident with:

```text
outcome = resolved
completionTier = acceptable | optimal
```

Only then does the referrer earn exactly one new Incident Pass.

## 4. Referral qualification must follow pass lineage

Do not qualify a referral merely because the referred user completes any incident.

The qualifying chain must be:

```text
Referral
  ↓
referredIncidentPassId
  ↓
attempt.incidentPassId
  ↓
resolved ACCEPTABLE / OPTIMAL
  ↓
reward
```

Only the attempt funded by the referral-created Incident Pass may qualify that referral.

This is mandatory.

## 5. Admin privilege is explicit

An `@incidentrank.com` email does not automatically grant admin rights.

Admin access requires:

```text
verified @incidentrank.com email
+
active persisted admin membership
```

The first owner is:

```text
mpant@incidentrank.com
```

# Implementation order

Follow this order unless repository constraints make a minor reordering necessary.

---

# Step 1 — Database schema

Add the Phase 8 tables using the repository's existing DB conventions.

Expected tables:

```text
admin_users
admin_invites
promotional_invites
incident_passes
referrals
admin_audit_events
```

Also add:

```text
attempts.incident_pass_id
```

as a nullable FK to `incident_passes`.

Do not add `organization_id` to attempts in this phase.

## Admin users

Suggested:

```text
admin_users
- id
- user_id
- role              owner | admin
- created_by_user_id
- created_at
- revoked_at
```

Authorization queries must always use:

```text
revoked_at IS NULL
```

If historical revoked rows are retained, never use an unconstrained lookup that may accidentally authorize against a revoked record.

## Admin invites

Suggested:

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

## Promotional invites

Suggested:

```text
promotional_invites
- id
- email
- normalized_email
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

## Incident passes

Suggested:

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

## Referrals

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

## Admin audit events

Suggested:

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

# Step 1A — Required database-level uniqueness

Do not rely on application idempotency alone.

Add database protections for one-to-one issuance.

At minimum, enforce the equivalent of:

```text
one promo invite → one Incident Pass
one referral reward → one Incident Pass
one qualifying attempt → one referral qualification
one reward pass → one referral
```

Prefer a uniqueness rule equivalent to:

```text
(source_type, source_id)
```

for source types where one source may generate only one pass.

Also protect:

```text
qualifying_attempt_id
reward_incident_pass_id
```

with uniqueness where appropriate.

Use partial indexes if required by the existing schema conventions.

# Step 1B — Migration ordering

Do not force all cross-references into one migration merely for convenience.

There are circular domain relationships:

```text
promotional_invites → incident_passes
referrals → incident_passes
incident_passes.source_id → logical source record
```

If the ORM safely generates these relationships in one migration, that is fine.

If not, use:

```text
migration A: core tables
migration B: cross-reference columns / FKs
```

Correctness is more important than "one migration."

Generate migrations through the repository's existing tooling.

Do not handwrite migrations unless the repo requires it.

---

# Step 2 — First admin bootstrap

The initial owner must be:

```text
mpant@incidentrank.com
```

Use:

```env
INITIAL_ADMIN_EMAIL=mpant@incidentrank.com
```

or equivalent configuration.

Bootstrap rules:

1. user is authenticated
2. email is verified
3. verified email exactly matches configured initial admin email
4. no owner has ever been bootstrapped
5. create owner membership
6. permanently close bootstrap

Do not normalize `mpant+anything@incidentrank.com` to `mpant@incidentrank.com`.

The production bootstrap comparison must remain exact.

## Test-mode identity rule

If Clerk test mode cannot authenticate the exact production bootstrap email:

- override `INITIAL_ADMIN_EMAIL` in the test/dev environment
- use the exact verified test identity there
- do not weaken production email matching logic

Do not add special plus-address logic to production code.

# Step 2A — Bootstrap race protection

Two simultaneous first-admin requests must not create two owners.

This must be protected at the DB/transaction level.

Do not implement only:

```text
SELECT no owner
INSERT owner
```

without concurrency protection.

Use a transaction, lock, unique bootstrap invariant, or another DB-safe mechanism consistent with the current database stack.

Add a concurrency test.

# Step 2B — Owner protections

Required:

- last active owner cannot revoke themselves
- last active owner cannot demote themselves
- external-domain users cannot be invited as admins
- revoked admins immediately lose access
- admin routes require active membership
- domain alone never authorizes

---

# Step 3 — Central admin authorization

Create one shared server-side admin authorization helper.

Conceptually:

```text
authenticated user
  ↓
verified @incidentrank.com email
  ↓
active admin_users row
  ↓
role authorized
```

Every `/admin/*` page and mutation must use it.

Do not rely on hidden buttons/client routing for security.

---

# Step 4 — Incident Pass primitive

Build the Incident Pass domain logic before promotional invites.

Implement shared functions such as:

```text
grantIncidentPass(...)
bindIncidentPass(...)
consumeIncidentPass(...)
findAvailablePass(...)
findPassBoundToScenario(...)
```

Names may follow repository conventions.

## Granting

Grant exactly once per source.

## Binding

Binding must be atomic.

Concurrent requests must not bind one pass to two scenarios.

## Consumption

Consume when the associated incident actually starts.

Recommended trigger:

```text
incident_started_at becomes non-null
```

Pass consumption and attempt creation/start must be transactionally safe.

The created attempt should link:

```text
attempt.incident_pass_id = pass.id
```

## Resume

A consumed pass must continue to authorize the attempt it funded.

Refreshing or resuming must not:

- consume another pass
- create another attempt
- require a new pass

Phase 7.3 resume/idempotency behavior must not regress.

---

# Step 5 — Extend premium access centrally

Extend the existing central practice-access evaluation.

Do not scatter pass checks across individual pages.

Conceptually support states like:

```text
free
existing_attempt
incident_pass_available
incident_pass_bound_here
incident_pass_bound_elsewhere
locked
dev_unlocked
future_paid_entitlement
```

Use existing code style rather than forcing these exact names.

Server-side routes must enforce the same access rule as the UI.

A direct API call must never bypass the pass requirement.

---

# Step 6 — Promotional invite creation

Admin UI must support:

- one email
- multiple pasted emails
- campaign label
- optional expiration
- default eligibility: any active premium incident

Bulk processing:

- normalize
- lowercase canonical comparison
- validate
- deduplicate
- preview invalid/duplicate entries

Example preview:

```text
12 valid
2 duplicate
1 invalid
```

Do not create DB rows before the admin confirms the final recipient set if the existing UI architecture supports a preview step cleanly.

---

# Step 7 — Promotional invite token handling

Reuse the existing invite-token utilities where appropriate.

Tokens must be:

- high entropy
- unguessable
- hashed at rest where practical
- never logged raw

Suggested route:

```text
/invite/<token>
```

Flow:

```text
validate token
→ validate active/not expired/not revoked
→ authenticate
→ verify signed-in email matches invite email
→ atomically redeem
→ create exactly one Incident Pass
→ return existing state on repeated same-user redemption
```

Wrong user:

- 403 or appropriate denial
- no pass created
- no invite metadata leak

---

# Step 8 — Referral eligibility policy

Create one central function such as:

```text
evaluateReferralEligibility(...)
```

Do not duplicate eligibility rules across route handlers.

Recommended V1 acquisition policy:

A referred user is eligible only if they:

- are not the referrer
- have not already claimed another acquisition referral
- have not already consumed a promotional/referral pass
- have not already completed a normal practice incident
- meet any other repository-valid new-user requirement

A user may belong to only one acquisition referral.

Do not use invasive fingerprinting.

---

# Step 9 — Referral code / claim

Referral link:

```text
/r/<referralCode>
```

Do not expose referrer user ID or email in the URL.

On claim:

```text
resolve referrer from code
→ authenticate referred user
→ evaluateReferralEligibility()
→ bind referred_user_id exactly once
→ create exactly one referred Incident Pass
→ store referred_incident_pass_id
```

Do not trust a client-supplied referrer ID.

Self-referral must be rejected.

Duplicate claims must be idempotent.

---

# Step 10 — Referral capability timing

A user should only receive/share a referral code after they themselves successfully resolve an eligible promotional/referral-funded incident.

Eligibility for becoming a referrer should use the same authoritative attempt/pass lineage.

Do not expose referral functionality merely because the user has an account.

---

# Step 11 — Referral qualification

Integrate into the server-authoritative terminal attempt persistence path.

Do not qualify referrals from frontend code.

When an attempt becomes terminal:

1. outcome must be `resolved`
2. completion tier must be `acceptable` or `optimal`
3. attempt must have `incident_pass_id`
4. that pass ID must equal the referral's `referred_incident_pass_id`
5. referral must still be in the expected claimed state
6. qualifying attempt must not already be used
7. create exactly one reward Incident Pass for the referrer
8. mark referral rewarded

The reward chain must be auditable:

```text
Referral
  ↓
Referred Pass
  ↓
Attempt
  ↓
Qualified
  ↓
Reward Pass
```

A different free/prior attempt by the referred user must not qualify the referral.

# Step 11A — Reward concurrency

Two terminal callbacks must not produce two reward passes.

Use:

- transactional update
- status guard
- uniqueness constraints
- existing terminal-attempt concurrency protections

Add a real concurrency regression test.

---

# Step 12 — Email provider abstraction

Use Resend behind a server-side abstraction.

Suggested interface:

```text
TransactionalEmailService
```

with operations such as:

```text
sendPromotionalInvite(...)
sendReferralReward(...)
```

Keep Resend-specific code isolated.

Visible sender:

```text
IncidentRank <support@incidentrank.com>
```

## Important secret rule

Do not automatically copy `RESEND_API_KEY` from one `.env` file to another.

Do not print or log it.

Do not commit it.

Add only blank placeholders to `.env.example`.

If the local Next.js process needs the key in `apps/web/.env.local`, configure it externally/manual-local as appropriate.

Implementation code should simply read:

```text
process.env.RESEND_API_KEY
```

or repository-equivalent configuration.

# Step 12A — Email state semantics

Do not call an email `delivered` merely because Resend accepted the API request.

Without webhook delivery tracking:

```text
sent = provider accepted request
```

If later webhooks are added, separate states such as:

```text
sent
delivered
bounced
```

may be introduced.

For Phase 8, document that `sent` means provider acceptance.

---

# Step 13 — Email feature flags

Add server-enforced flags such as:

```env
ADMIN_PORTAL_ENABLED=false
PROMOTIONAL_INVITES_ENABLED=false
REFERRALS_ENABLED=false
TRANSACTIONAL_EMAILS_ENABLED=false
```

Production defaults should remain off until explicitly enabled.

Feature flags must protect server mutations, not only UI visibility.

Do not use `DEV_UNLOCK_PAID_SCENARIOS` as promo entitlement.

---

# Step 14 — Admin dashboard

Build:

```text
/admin
/admin/promotional-invites
/admin/incident-passes
/admin/referrals
/admin/admin-users
```

Use existing IncidentRank visual language.

Do not create a new design system.

Admin should see operational state including:

```text
Invite email
Campaign
Invite status
Sent at
Redeemed
Redeemed user
Pass status
Selected scenario
Attempt
Attempt started
Attempt completed
Referral status
Reward issued
Expiration
```

Useful aggregates:

```text
Invites created
Invites sent
Invites redeemed
Passes granted
Passes consumed
Incidents resolved
Referrals claimed
Referral attempts resolved
Rewards issued
```

No analytics warehouse.

---

# Step 15 — Pass lineage / support view

Admin must be able to inspect entitlement lineage.

For promotional access:

```text
Promo Invite
→ Incident Pass
→ Scenario
→ Attempt
→ Pass consumed
```

For referral:

```text
Referral
→ Referred Incident Pass
→ Qualifying Attempt
→ Referral qualified
→ Reward Incident Pass
```

This can be implemented within existing admin detail/table views.

Do not create a separate accounting subsystem solely for this.

---

# Step 16 — Admin audit trail

Log sensitive admin mutations.

At minimum:

```text
admin invited
admin role changed
admin revoked
promo invite created
promo invite sent
promo invite revoked
pass manually granted
pass revoked
referral revoked
```

Do not log:

- raw invite tokens
- raw referral codes
- secrets

---

# Step 17 — User-facing Incident Pass UX

Available:

```text
1 Incident Pass available
Use this pass to try one premium incident.
```

Bound:

```text
Incident Pass assigned to:
<Scenario>

[Continue]
```

Consumed:

```text
Used on:
<Scenario>
```

Do not call this "Pro access."

Do not imply catalog-wide access.

---

# Step 18 — Locked premium scenario UX

No entitlement:

```text
Pro — coming soon
```

Available pass:

```text
Use Incident Pass
```

Before binding, show confirmation that the pass becomes permanently associated with the chosen incident.

Bound here:

```text
Continue with Incident Pass
```

Bound elsewhere:

```text
Your Incident Pass is already assigned to <Scenario>.
```

No checkout button in this phase.

---

# Step 19 — Referral UX

After referrer eligibility:

```text
Invite another engineer

If they successfully complete their first IncidentRank incident,
you'll earn another Incident Pass.

[Copy referral link]
```

Do not expose referred user's:

- score
- tier
- reasoning
- detailed outcome
- result breakdown

Referrer may see only coarse progress such as:

```text
Joined
Started
Completed
Reward earned
```

---

# Step 20 — Retry policy

V1 policy:

> One Incident Pass funds one attempt start.

If the user:

- fails
- abandons
- times out

the pass remains consumed.

Do not automatically replace it.

Admin may manually issue a new pass for a verified technical/support issue.

Document this policy clearly.

---

# Step 21 — Promotional email

Use wording that accurately describes the entitlement.

Suggested subject:

```text
You're invited to try an IncidentRank incident
```

Body should communicate:

```text
You have one Incident Pass.
Choose one premium incident to try at no cost.
```

Do not call it:

- free subscription
- free Pro account
- full trial

---

# Step 22 — Security requirements

Before Phase 8 can close, verify:

- admin domain does not equal admin privilege
- all admin authorization is server-side
- revoked admin cannot access
- last owner protections hold
- invite tokens cannot be enumerated
- raw tokens not logged
- referral codes not predictable
- cross-user passes cannot be accessed/mutated
- wrong invited email cannot redeem
- one pass cannot bind twice
- one pass cannot fund two attempts
- direct attempt API cannot bypass entitlement
- referral cannot double-reward
- self-referral rejected
- referred user cannot attach to multiple acquisition referrals
- referral reward follows exact pass/attempt lineage
- feature flags protect server mutations
- Resend secret is server-only

---

# Step 23 — Required tests

## Admin

Test at least:

1. correct first bootstrap identity creates owner
2. wrong identity denied
3. bootstrap cannot run twice
4. concurrent first-owner requests cannot create two owners
5. external-domain admin rejected
6. revoked admin denied
7. inactive historical membership never authorizes
8. last owner cannot revoke themselves
9. last owner cannot demote themselves
10. admin invite acceptance idempotent

## Promotional invites

Test:

1. admin creates invite
2. non-admin denied
3. email normalization
4. duplicate paste handling
5. invalid email handling
6. token uniqueness
7. correct email redeem
8. wrong email denial
9. expired denial
10. revoked denial
11. same-user redemption idempotent
12. second user denied
13. exactly one pass created
14. resend does not duplicate entitlement

## Passes

Test:

1. one pass created per source
2. available → bound
3. bind confirmation path
4. cannot bind to two scenarios
5. concurrent bind safe
6. free scenario does not use pass
7. start consumes pass
8. attempt gets `incident_pass_id`
9. consumed pass cannot fund another attempt
10. concurrent attempt creation cannot double-consume
11. refresh/resume does not consume again
12. revoked/expired pass cannot start a new attempt

## Referral eligibility

Test:

1. self-referral rejected
2. existing ineligible user rejected
3. user cannot attach to two acquisition referrals
4. eligibility policy centralized and deterministic
5. revoked/expired referral denied

## Referral qualification

Test:

1. claimed referral alone gives no reward
2. scenario selection gives no reward
3. attempt start gives no reward
4. failed attempt gives no reward
5. declared_unstable gives no reward
6. acceptable referral-funded attempt qualifies
7. optimal referral-funded attempt qualifies
8. unrelated resolved attempt does NOT qualify
9. qualifying attempt must match `referred_incident_pass_id`
10. one referral creates one reward pass
11. duplicate terminal callbacks do not double-reward
12. concurrent qualification does not double-reward

## Privacy

Test:

1. referrer cannot retrieve referred score
2. referrer cannot retrieve completion tier
3. referrer cannot retrieve reasoning
4. non-admin cannot enumerate promotional invite data

## Email

Test:

1. sender is `IncidentRank <support@incidentrank.com>`
2. correct recipient
3. invite link included
4. secrets not logged
5. provider acceptance maps to `sent`
6. provider failure maps to `send_failed`
7. resend reuses invite
8. disabled email flag prevents real send
9. tests/dev do not send unexpectedly

---

# Step 24 — Browser QA

Use real browser execution for all feasible flows.

Required end-to-end stories:

## QA-01
Bootstrap first owner.

## QA-02
Admin creates and sends one promo invite.

## QA-03
Correct engineer redeems invite.

## QA-04
Wrong user cannot redeem same invite.

## QA-05
Engineer chooses premium incident and confirms pass binding.

## QA-06
Incident start consumes pass.

## QA-07
Refresh/resume uses original attempt and original consumed pass.

## QA-08
Engineer resolves incident and referral link appears.

## QA-09
Second engineer claims referral and receives exactly one pass.

## QA-10
No reward appears after claim/select/start.

## QA-11
Failed/unstable referred attempt produces no referrer reward.

## QA-12
Resolved acceptable/optimal referral-funded attempt produces exactly one referrer pass.

## QA-13
Duplicate qualification callback does not create another reward.

## QA-14
Admin dashboard correctly shows full lineage/state.

## QA-15
Verify direct premium API cannot bypass pass system.

## QA-16
Verify referrer cannot see referred user's result details.

If exact `mpant@incidentrank.com` cannot be used with Clerk test mode, use a dev-only `INITIAL_ADMIN_EMAIL` override and document it.

Do not alter production matching rules.

---

# Step 25 — Email production readiness

Before real promotional emails are enabled, document status of:

```text
SPF
DKIM
DMARC
Resend domain verification
support@incidentrank.com sender verification
```

If these are not configured yet:

- implementation may still be complete
- production email flag remains disabled
- completion report must clearly state email infrastructure readiness

Do not pretend provider API integration alone means production email is ready.

---

# Step 26 — Full validation

Run:

```bash
pnpm --filter @incidentrank/db db:generate
pnpm --filter @incidentrank/db db:migrate

pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm --filter @incidentrank/db db:seed
```

Use package-specific commands as needed.

Expected seed remains:

```text
Seed complete (100 built-in scenario(s)).
```

Phase 8 must not add/remove built-in scenarios.

---

# Step 27 — Completion report

Write:

```text
docs/implementation_plan/phase8_promotional_access_referrals_completion.md
```

Include:

- schema changes
- migrations
- admin bootstrap
- exact bootstrap email handling
- bootstrap concurrency protection
- active/revoked admin rules
- owner protections
- promo invite flow
- token handling
- pass lifecycle
- pass/attempt lineage
- referral eligibility
- referral claim
- referral pass lineage
- referral qualification
- reward idempotency
- Resend integration
- email feature-flag state
- SPF/DKIM/DMARC readiness
- admin dashboard
- user pass UX
- referral UX
- audit trail
- security findings
- concurrency test results
- browser QA results
- defects found/fixed
- typecheck
- lint
- tests
- build
- seed
- intentionally deferred work

---

# Stop condition

Phase 8 is complete only when:

1. first owner bootstrap is concurrency-safe
2. `mpant@incidentrank.com` is the configured production first owner
3. domain alone cannot grant admin
4. revoked memberships never authorize
5. last-owner protections work
6. promotional invites can be created by admin only
7. one private invite binds to one verified user
8. one invite creates exactly one pass
9. one pass binds to exactly one premium scenario
10. binding is explicitly confirmed by user
11. one pass funds exactly one attempt
12. resume does not consume again
13. direct APIs cannot bypass entitlement
14. referral claim is one-user/one-referrer
15. self-referral is blocked
16. eligibility policy is centralized
17. qualifying referral attempt is proven by pass lineage
18. unrelated attempts cannot qualify referrals
19. failed/unstable attempts do not reward
20. acceptable/optimal referral-funded attempts reward exactly once
21. concurrent/replayed callbacks cannot double-reward
22. referrer cannot see referred-user result details
23. Resend is behind an abstraction
24. secrets are not duplicated/logged/committed
25. `sent` means provider acceptance unless delivery webhooks exist
26. admin can inspect invite → pass → attempt → referral → reward lineage
27. feature flags work server-side
28. browser QA passes
29. full validation is green
30. database still seeds 100 built-in scenarios
31. completion report is written

Do **not** begin payments, Stripe, organization billing, AI tutoring, custom organization scenarios, AI scenario generation, or launch infrastructure after finishing this phase.

Stop and report Phase 8 completion.