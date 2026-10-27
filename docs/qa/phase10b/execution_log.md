# Phase 10B Browser QA — Execution Log

Session date: 2026-10-27. Dev server at `localhost:3000`, real Clerk dev-mode sign-ups (`+clerk_test@example.com` convention, fixed test OTP `424242`, password sign-up as this Clerk instance requires), real Stripe TEST MODE (test card `4242 4242 4242 4242`). No Stripe CLI webhook forwarder available — real checkout webhook delivery exercised via the documented replay workaround: fetch the real Checkout Session via the Stripe API, then replay it as a `checkout.session.completed` event through `POST /api/stripe/webhook` with a freshly-generated valid signature (`stripe.webhooks.generateTestHeaderString`), same technique as Phase 9's QA pass. Admin access via direct DB `admin_users` insert (sandbox cannot self-grant), revoked at session end.

Test organizations: **Acme QA Phase10B** (`acme-qa-phase10b`), owner `qa-phase10b-owner1`, member `qa-phase10b-member1`, candidates `qa-phase10b-candidate1/2/3`. **Globex QA Phase10B** (`globex-qa-phase10b`), owner `qa-phase10b-owner2`, candidate `qa-phase10b-globexcandidate`. Platform admin `qa-phase10b-platformadmin` (admin_users row granted, revoked at end of session).

## QA-01 — Billing page

Signed in as `qa-phase10b-owner1` (initial owner of Acme, admin-provisioned via `/admin/organizations/new`, invite accepted). Navigated to `/organizations/acme-qa-phase10b/billing`.

- UI: Available/Purchased/Used/Adjusted all `0`, amber "No assessment credits available" warning, both products rendered (`1 Assessment Credit — $50`, `110 Assessment Credits — $5,000`), empty billing history.
- DB (`organization_credit_ledger` for Acme's org id): 0 rows. `organization_members`: 1 row (owner).

**PASS** — UI matches DB exactly.

## QA-02 — Member denied

Invited `qa-phase10b-member1` as `member` via `/organizations/acme-qa-phase10b/members`, accepted as that identity.

- UI: `/organizations/acme-qa-phase10b/billing` renders "Only organization owners and admins can view billing." — no balance, no products, no history.
- Direct API: `POST /api/organizations/acme-qa-phase10b/billing/checkout` with `{plan:"single_credit"}` → `403 {"error":"Forbidden"}`.

**PASS** — denial enforced server-side, not just UI-hidden.

## QA-03 — Buy single credit

As `qa-phase10b-owner1`, clicked "Buy 1 Credit" on Acme's billing page. Redirected to a real `checkout.stripe.com` TEST MODE session showing "IncidentRank Assessment Credit — $50.00 — One candidate assessment attempt on IncidentRank." Completed with test card `4242 4242 4242 4242`, exp `12/30`, CVC `123`, ZIP `94103`. Redirected to `/organizations/acme-qa-phase10b/billing/success?session_id=cs_test_a1R6iSKXAUKLNmI5YNWxi5GSA8d5xmFpMQ8POJBGsB9bHVhadLPFKegchF` ("Payment received… Current available balance: 0 assessment credits" — webhook not yet delivered, as expected with no forwarder).

Fetched the real session via a one-off Stripe API script, replayed it as `checkout.session.completed` through `POST /api/stripe/webhook` with a freshly-generated signature (`STRIPE_WEBHOOK_SECRET` from `.env.local`) → `200 {"received":true}`.

- DB: `organization_credit_ledger` now 1 row: `{type: "purchase", quantity: 1, stripeCheckoutSessionId: "cs_test_a1R6i...", createdByUserId: owner1's user id}`.
- UI (reloaded): Available `1`, Purchased `1`, billing history shows "Purchase · ... · qa-phase10b-owner1+clerk_test@example.com · +1".

**PASS**.

## QA-04 — Buy pack

Separate org (Globex, owner `qa-phase10b-owner2`, admin-provisioned, invite accepted) and separate user. As `qa-phase10b-owner2`, clicked "Buy 110 Credits" on `/organizations/globex-qa-phase10b/billing`. Real Stripe Checkout showed "IncidentRank Assessment Credit Pack — $5,000.00 — 110 candidate assessment credits for IncidentRank organizations." Completed with the same test card. Session `cs_test_a1VyNY0xXOJK4u7xj2SItyaeDUEYYn7SoSUCNtoLNY9bkZbjAKxrlASnsH`.

Replayed via the same webhook technique → `200 {"received":true}`.

- DB: Globex's ledger: 1 row `{type: "purchase", quantity: 110, stripeCheckoutSessionId: "cs_test_a1VyN...", createdByUserId: owner2's user id}`.
- UI: Available `110`, Purchased `110`, billing history "+110".

**PASS** — isolated correctly from Acme's own purchase (separate org, separate ledger).

## QA-05 — Candidate invitation

As `qa-phase10b-owner1`, created assessment "QA Phase10B Credit Flow Assessment" (Payment Retry Storm) in Acme, activated it, invited `qa-phase10b-candidate1`.

- DB: Acme's ledger unchanged — still exactly 1 row (the QA-03 purchase). `assessment_candidates` row created with `status: "invited"`, `attemptId: null`.

**PASS** — inviting a candidate never touches the credit ledger.

## QA-06 — Candidate starts

Signed up/signed in as `qa-phase10b-candidate1`, opened the real invite link, accepted (lands on the pre-start briefing screen — accepting the invite and starting the attempt are deliberately separate steps). Clicked "Start Assessment".

- UI: live simulation rendered (System Architecture panel, Live Metrics, countdown to incident).
- DB: `organization_credit_ledger` now 2 rows — new `{type: "assessment_started", quantity: -1, attemptId: "3a3dc814-1afa-48b8-bf05-d4013da7acf0"}`. `assessment_candidates.status = "started"`, `attemptId` set. Balance: available `0`.

**PASS** — exactly 1 credit consumed, keyed to the real attempt id.

## QA-07 — Refresh/resume

Reloaded `/assessment/49eaf608-226c-4aac-9bcf-f0c86ec8b8ed` as candidate1 mid-incident.

- UI: simulation resumed from the same point (countdown continued 00:46 → 00:42 between the two loads, same system state), not restarted.
- DB: ledger still exactly 2 rows — no new `assessment_started` entry.

**PASS** — no second credit consumed on refresh.

## QA-08 — No credits

Invited a second candidate (`qa-phase10b-candidate2`) to the same (now zero-balance) assessment. Signed up/accepted as candidate2, clicked "Start Assessment".

- UI: "This assessment is temporarily unavailable. Please contact the organization that invited you." — the exact generic, billing-silent denial message.
- Direct API: same `403` from `POST /api/assessment/.../start`.
- DB: ledger unchanged (still 2 rows). `assessment_candidates` for candidate2 still `status: "invited"`, `attemptId: null` — the transaction correctly rolled back the just-inserted `attempts` row when credit consumption failed (confirmed via `attempts`/`assessment_candidates` query — no orphaned attempt row).

**PASS** — blocked safely, no billing internals leaked, no orphaned state.

## QA-09 — Concurrent start

Per the plan's "use controlled test/DB fixture" instruction. Topped Acme up to exactly 1 available credit (platform-admin +1 adjustment, see QA-13 for that story's own verification). Created two more real candidate identities (`qa-phase10b-candidate2` — reused from QA-08, now with a fresh invite to a new assessment-free credit — and `qa-phase10b-candidate3`), both accepted (`assessmentCandidates.status: "invited"`, `attemptId: null`).

Ran a one-off script against the live dev DB that reproduces the exact SQL/locking strategy of `consumeOrganizationCreditForAttempt` (`SELECT ... FOR UPDATE` on the organization's ledger rows, then an `INSERT ... ON CONFLICT DO NOTHING` keyed on the partial unique index `organization_credit_ledger_consumption_attempt_idx`) — this module is guarded by `"server-only"` so it can't be imported directly outside the Next.js runtime, hence reproducing its logic verbatim in the script rather than reimplementing different logic. Created two real `attempts` rows (one per real candidate) exactly as the start route would, then raced `consumeOrganizationCreditForAttempt`-equivalent calls via `Promise.all`:

```
BEFORE_AVAILABLE 1
RESULT_A (candidate2) {"ok":true,"inserted":true}
RESULT_B (candidate3) {"ok":false,"reason":"insufficient_balance"}
AFTER_AVAILABLE 0
```

The losing candidate's just-created `attempts` row was deleted (mirroring the real route's transaction rollback); the winner's `assessment_candidates` row was updated to `status: "started"`.

- DB re-verified: candidate2 (`a3779937-...`) → `status: "started"`, real `attemptId`. Candidate3 (`0d56ffdf-...`) → still `status: "invited"`, `attemptId: null`.

Also ran the existing automated test suite's dedicated genuine-DB-concurrency test (`organization-credits.test.ts`, "race-safe consumption — genuine DB concurrency (phase10b.md §70)") live against this session's DB — all 15 tests in that file passed, including "Case A (10 credits, 11 concurrent candidates): exactly 10 succeed, balance = 0".

**PASS** — exactly one of two concurrent candidates succeeded for the single available credit; no overspend, no orphaned state.

## QA-10 — Suspended org

As platform admin, suspended Acme QA Phase10B (reason: "QA-10: testing billing suspension flow") while candidate1's attempt (from QA-06) was still `in_progress`.

- **Purchase blocked**: as owner1, `/organizations/acme-qa-phase10b/billing` rendered the suspended banner and "This organization must be active to purchase credits." (buy buttons replaced). Direct API: `POST .../billing/checkout` → `403 {"error":"organization_suspended"}`.
- **New candidate start blocked**: candidate3 (invited but never started, from the QA-09 setup) accepted the invite, clicked "Start Assessment" → `403 "This assessment is temporarily unavailable..."` (same denial path as QA-08, now triggered by suspension rather than zero balance — the org-status check runs before the credit check).
- **Existing attempt resume allowed**: signed in as the correct candidate1 identity (re-verified via `/profile` and the password-prompt account label before testing — an earlier attempt in this story was accidentally run as a different, never-started candidate due to a sign-in mix-up, which produced a misleading 403; this was a test-setup error, not a product defect — see `defects.md`), called `POST /api/assessment/.../start` directly → `200`, full existing attempt object returned unchanged (`status: "in_progress"`), and confirmed live in the UI: the simulation resumed exactly where it left off (countdown continued).
- **Credits preserved**: ledger unchanged throughout (Available `0`, Purchased `1`, Consumed `2`, Adjusted `1` — same before and after every denial check).

**PASS** — all four required behaviors verified live.

## QA-11 — Purchase completes after suspension

Using Globex (still active at this point). As `qa-phase10b-owner2`, clicked "Buy 1 Credit" — real Stripe Checkout session created (`cs_test_a1rOwzlXrYSs2ZcvS8O94KxVJFyfwNgT4VCDwdeCCdTY87lX729Vre9lsW`) while the org was still active. Without completing payment, opened a second tab, signed in as the platform admin, and suspended Globex ("QA-11: purchase-completes-after-suspension test"). Confirmed via DB: `organizations.status = "suspended"` before returning to the still-open checkout tab.

Completed the TEST payment on the now-stale (but still valid) Checkout Session — Stripe itself has no knowledge of IncidentRank's suspension state, so payment succeeded normally and redirected to `/organizations/globex-qa-phase10b/billing/success`.

Replayed the webhook → `200 {"received":true}`.

- DB: new `{type: "purchase", quantity: 1, stripeCheckoutSessionId: "cs_test_a1rOw..."}` row inserted — the webhook handler deliberately does not require the organization to be active to credit it (§54), so the credit landed normally despite suspension. Available `111` (`110 + 1`).
- UI (owner2, reloaded, correct identity reconfirmed via `/profile`): suspended banner present, Available `111`, "This organization must be active to purchase credits." — credits visible but unusable for any further purchase or consumption until reactivated (same `requireActiveOrganization` gate already proven denying mutations in QA-10).

**PASS**.

## QA-12 — Reactivation

As platform admin, clicked "Reactivate" on Globex's admin detail page. `organizations.status` flipped `suspended → active`, `organization_reactivated` audit event recorded.

Verified credits are immediately usable: as owner2, created a new assessment ("QA Phase10B Globex Reactivation Assessment"), activated it, invited `qa-phase10b-globexcandidate`, signed up/accepted/started as that candidate — live simulation rendered successfully.

- DB: Globex's ledger gained a new `{type: "assessment_started", quantity: -1}` row. Balance `111 → 110`.

**PASS** — reactivation restores full usability of the credits that were added while suspended.

## QA-13 — Admin adjustment

As platform admin, on Acme's `/admin/organizations/[id]` detail page, entered `+1` / reason "QA-09 concurrency test fixture setup" in the Adjust Credits form and clicked Apply (this doubled as the QA-09 fixture setup, see above).

- UI (after reload): Available `1` (was `0`), Adjusted `1`, "Recent Ledger Entries" shows "Adjustment · +1 · QA-09 concurrency test fixture setup" attributed to the admin's email.
- DB: `organization_credit_ledger` row `{type: "admin_adjustment", quantity: 1, reason: "QA-09 concurrency test fixture setup", createdByUserId: admin's users.id}`. `admin_audit_events`: `credit_adjustment` action recorded for the acting admin.

**PASS** — balance and both audit trails (org ledger reason + admin_audit_events) correct.

## QA-14 — Cross-org billing isolation

As `qa-phase10b-owner1` (Acme), attempted to access Globex's billing:

- UI: `/organizations/globex-qa-phase10b/billing` → real `404` page (Acme's owner has no membership row in Globex, so `loadOrganizationMembership` denies at the membership-lookup stage before any role check).
- Direct API: `POST /api/organizations/globex-qa-phase10b/billing/checkout` with `{plan:"single_credit"}` → `403 {"error":"Forbidden"}`.

**PASS** — both the UI route and the underlying mutation endpoint are denied independently.

## QA-15 — Candidate billing privacy

As `qa-phase10b-candidate1` (never a member of Acme — candidates are identity-based, never org members):

- `/organizations/acme-qa-phase10b/billing` → `404`.
- `POST /api/admin/organizations/[acmeOrgId]/credits/adjust` → `403 {"error":"Forbidden"}`.
- Inspected the candidate-facing `POST /api/assessment/[id]/start` response field-by-field: `attempt` object has only assessment-performance fields (score, timeline, recovery metrics, etc.); `candidate` object has only invite-lifecycle fields (status, email, timestamps, attemptId). No billing, balance, ledger, or Stripe field anywhere in either object.

**PASS** — the candidate sees the assessment experience only, nothing billing-related.

## QA-16 — Webhook replay

Replayed the already-processed QA-03 purchase event (`cs_test_a1R6iSKXAUKLNmI5YNWxi5GSA8d5xmFpMQ8POJBGsB9bHVhadLPFKegchF`) a second time, this time with a deliberately fresh/different Stripe event id (`evt_qa_phase10b_qa16deliberate`, distinct from every prior replay of this session) to exercise the realistic "Stripe redelivers the same underlying session" case rather than only the literal event-id-dedup path.

- Response: `200 {"received":true}` (handler still acknowledges — never errors on a duplicate).
- DB: `organization_credit_ledger` unchanged — same 4 rows as before the replay, still exactly 1 `purchase` row for this session. The `organization_credit_ledger_purchase_session_idx` partial unique index on `stripeCheckoutSessionId` (not the Stripe event id) is what prevents the double-credit, so this holds even across different event ids referencing the same session — a stronger guarantee than literal-event-id dedup alone.
- This replay technique was incidentally also exercised twice more earlier in the session (once accidentally replaying the exact same session+event during QA-09 setup, once more at the start of this story) — all replays converged on the same single ledger row.

**PASS** — no duplicate credits under any replay scenario tested.
