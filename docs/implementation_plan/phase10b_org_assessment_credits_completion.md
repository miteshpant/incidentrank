# Phase 10B Completion Report — Organization Assessment Credits & Billing

Phase 10B is complete: implemented, tested, live-browser-QA'd against real Stripe TEST MODE, fully validated, and documented. Binding spec: `docs/implementation_plan/phase10b.md`.

## Stripe catalog

Inspected Stripe TEST MODE first (per §63) — no pre-existing match for an organization-credit catalog existed (only the Phase 9 personal Pro/Founding products were present). Created exactly two new Products, each with one Price, via a one-off script against the existing `STRIPE_SECRET_KEY`:

| Product | Price | Metadata |
|---|---|---|
| IncidentRank Assessment Credit (`prod_VWDlGSos2s4KWq`) | `price_1UVBJmBOS9B1UgRUBXSbizFm` — $50 USD one-time | `application=incidentrank`, `product_family=organization_assessment`, `billing_type=credits`, `credits=1` |
| IncidentRank Assessment Credit Pack (`prod_VWDlr0Rce453w3`) | `price_1UVBJmBOS9B1UgRUzM3aPnDs` — $5,000 USD one-time | same family, `credits=110` |

No subscriptions, coupons, promotion codes, Payment Links, or invoices were created — Product + Price objects only, all TEST MODE, never touching live Stripe. IDs are stored in `apps/web/.env.local` (git-ignored) under `STRIPE_ORG_SINGLE_CREDIT_PRODUCT_ID`/`STRIPE_ORG_SINGLE_CREDIT_PRICE_ID`/`STRIPE_ORG_CREDIT_PACK_PRODUCT_ID`/`STRIPE_ORG_CREDIT_PACK_PRICE_ID`; blank placeholders committed in `.env.example`.

## Schema

Two new tables (`packages/db/src/schema.ts`, migration `0013_swift_bloodstorm.sql`):

- **`organization_stripe_customers`** — `organizationId` ↔ `stripeCustomerId` mapping, structurally separate from the existing per-user `stripeCustomers` table. Unique on `organizationId` and on `stripeCustomerId`. Includes `billingEmail`, defaulted from the first purchasing user's Clerk email but never re-derived from a later owner change.
- **`organization_credit_ledger`** — the immutable, signed-quantity ledger. Columns: `organizationId`, `transactionType` (new enum `organization_credit_transaction_type`: `purchase | assessment_started | admin_adjustment | refund | reversal | expiration`), `quantity`, `assessmentId`, `attemptId`, `stripeCheckoutSessionId`, `stripePaymentIntentId`, `sourceId`, `reason`, `createdByUserId`, `createdAt`.

Idempotency constraints (partial unique indexes, mirroring `paid_entitlements_one_founding_per_user_idx`'s established pattern):
- `organization_credit_ledger_purchase_session_idx` — `UNIQUE(stripeCheckoutSessionId) WHERE transactionType = 'purchase'`
- `organization_credit_ledger_consumption_attempt_idx` — `UNIQUE(attemptId) WHERE transactionType = 'assessment_started'`

No `organization_credit_accounts` cached-balance table was added — the §26 optional balance-lock model was evaluated and deliberately not used; see "Credit consumption" below for why a direct `SELECT ... FOR UPDATE` against the ledger itself was the cleaner fit.

`expiration` is defined in the enum per the spec's suggested vocabulary but is never written — credits do not expire in V1 (§10).

## Checkout

`POST /api/organizations/[slug]/billing/checkout` (`apps/web/src/app/api/organizations/[slug]/billing/checkout/route.ts`):

- Eligibility order exactly as §16: flag check (`ORG_BILLING_ENABLED` + `ORG_CREDIT_PURCHASE_ENABLED`) → auth → `loadOrganizationMembership` → `canMutate` (owner/admin) → `requireActiveOrganization` (rejects both `suspended` and `pending`) → plan validation → checkout creation.
- `plan` is a client-sent opaque string (`single_credit | credit_pack_110`); `org-credit-config.ts`'s `getOrgCreditPlanPriceId` is the only place that resolves to a real configured Stripe Price ID — mirrors `config.ts`'s `getPlanPriceId` exactly, for a structurally separate catalog.
- `organization-checkout.ts`'s `createOrganizationCreditCheckoutSession` creates/reuses the organization's own Stripe Customer (`organization-stripe-customers.ts`, idempotent insert-or-reread-on-race, same pattern as the personal `stripe-customers.ts`), then creates a `mode: "payment"` Checkout Session with `managed_payments: { enabled: false }` (required by this TEST MODE account's default tax-code requirement, same as the existing Pro/Founding checkout).
- Checkout metadata: `application`, `purchase_type=organization_assessment_credits`, `organization_id`, `organization_slug`, `plan`, `purchasing_user_id`.
- A Stripe Checkout Session creation failure returns a clean `502` and leaves no ledger entry — the only persisted side effect is the organization's Stripe Customer mapping, which is safe to reuse on retry (§58).

## Webhook

Extended the single existing `POST /api/stripe/webhook` endpoint (never a second endpoint) — `handleCheckoutSessionCompleted` in `webhook-handlers.ts` now branches on `session.metadata.purchase_type === "organization_assessment_credits"` before falling through to the untouched Founding-specific logic, dispatching to a new `handleOrganizationCreditCheckoutSessionCompleted` helper that:

1. Validates the real line-item Price ID via `orgCreditPlanForPriceId` — an unrecognized price grants nothing, even if `metadata.credit_quantity` claimed otherwise (§22).
2. Resolves the organization by `metadata.organization_id`.
3. Cross-validates the session's Stripe Customer against that exact organization's `organization_stripe_customers` mapping — a mismatch (wrong org/customer pairing) grants nothing (§49/§67).
4. Derives credit quantity from the configured Price ID alone (`creditQuantityForPlan`), never from metadata.
5. Inserts exactly one purchase ledger row via `recordOrganizationCreditPurchase`, idempotent on `stripeCheckoutSessionId` (webhook replay, or even a different event ID carrying the same session, is a safe no-op).
6. Logs a `credits_purchased` organization audit event only on first insert.

Deliberately does **not** require the organization to still be active (§54) — a valid payment already happened; suspension affects only future consumption. The existing idempotency ledger (`stripe_webhook_events`, `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING`) and signature verification were untouched.

## Ledger

`apps/web/src/lib/server/organization-credits.ts` is the one central module:

- **`getOrganizationCreditBalance(organizationId)`** — `SUM(quantity)` broken into `purchased`/`consumed`/`adjusted` buckets (via `FILTER`) plus `available` (the full sum). No UI/route computes balance independently.
- **`recordOrganizationCreditPurchase`** — webhook-side insert, idempotent on session ID.
- **`consumeOrganizationCreditForAttempt`** — candidate-start-side insert, idempotent on attempt ID, race-safe (below).
- **`adjustOrganizationCredit`** — admin-side insert, requires a reason, blocks any adjustment that would drive `available` below 0.

Lineage is fully inspectable: a purchase row carries `stripeCheckoutSessionId`/`stripePaymentIntentId`; a consumption row carries `assessmentId`/`attemptId`; an adjustment row carries `reason`/`createdByUserId`. Both the organization billing page and the admin organization-detail page render this history directly from the ledger.

## Credit consumption

Wired into the existing `POST /api/assessment/[assessmentId]/start` route (`apps/web/src/app/api/assessment/[assessmentId]/start/route.ts`), which previously performed two standalone (non-transactional) writes. It now:

1. Keeps the pre-existing resume early-return (`candidate.attemptId` already set) **unconditionally first** — before any org-status or credit check, per §27.
2. Tightens the pre-transaction organization check from "block only `suspended`" to "require `active`" — correctly also blocking `pending` orgs from starting (§30), a gap the original Phase 10A route didn't need to close since credits didn't exist yet.
3. Wraps attempt creation, a fresh in-transaction re-check for a race-created existing attempt (duplicate-start protection), credit consumption, and the candidate-row update in **one `db.transaction`** (§24) — never separate check-then-commit-then-consume steps.
4. On insufficient balance, throws a sentinel error to force a full rollback (discarding the just-inserted attempt row too, not just skipping the ledger write) and returns the same generic, non-billing-revealing 403 message candidates see for any other "can't start" reason (§34).
5. Logs `assessment_credit_consumed` only when the ledger insert actually happened (not on an idempotent-replay no-op).

Gated end-to-end by `ORG_CREDIT_CONSUMPTION_ENABLED` — when off, the route behaves exactly as it did pre-Phase-10B (verified by an explicit automated test), so existing deployments/attempts are unaffected until the flag is deliberately turned on.

### Race-safe consumption (§25-§26)

Chose a direct `SELECT id FROM organization_credit_ledger WHERE organization_id = $1 FOR UPDATE` lock over the organization's own ledger rows, immediately followed by a balance check and the consumption insert, all inside the caller's transaction — the same two-layer strategy `founding-allocation.ts` already established for the 100-slot Founding cap: a row lock serializes concurrent consumption for the *same* organization (two candidates racing for the last credit), and the partial unique index on `attemptId` is the backstop for the *same attempt* being started twice concurrently (duplicate-start/double-click/two-tabs), catching Postgres error 23505 and converting it to a clean `{ ok: true, inserted: false }` rather than a crash.

The optional §26 `organization_credit_accounts` cached-balance-with-lock table was evaluated and **not** added: locking the ledger's own rows directly for the duration of the transaction achieves the same serialization without introducing a second piece of state that would need to stay reconciled with the ledger. For a fresh organization with zero ledger rows, `FOR UPDATE` against an empty result set simply locks nothing — correct, since the balance read still correctly resolves to 0 either way.

Verified with genuine (not merely probabilistic) Postgres-level concurrency in `organization-credits.test.ts`: real `Promise.all` races (1-credit/2-candidates, 10-credit/11-candidates, same-attempt-twice), plus a two-independent-reserved-connection test driving explicit `BEGIN`/`FOR UPDATE`/`COMMIT` ordering to force transaction B's lock to genuinely wait behind transaction A's commit — mirroring `founding.test.ts`'s established technique for proving a race is real at the database level, not just at the application level.

## Suspension

- **Purchase blocking**: `requireActiveOrganization` in the checkout route rejects both `suspended` and `pending` organizations before any Stripe API call (§29/§30/§53).
- **Consumption blocking**: the start route's pre-transaction organization-status check rejects any *new* attempt against a non-`active` organization; an already-started attempt's early resume path is unaffected (§29).
- **Post-checkout payment handling**: the webhook path never checks organization status — a payment that completes after the organization was suspended mid-checkout still grants the purchased credits (§52/§54), confirmed live in QA-11 (0→111 credits landed while suspended, immediately usable again on reactivation per QA-12).

## Permissions

- **Organization-level**: owner and admin may view billing and purchase credits; member may not (`canMutate`, reused unchanged from Phase 10A) — confirmed in automated tests and QA-02.
- **Platform admin**: may inspect any organization's credit balance/ledger/Stripe customer (extended `organization-detail-view.tsx`) and may issue a signed adjustment (`POST /api/admin/organizations/[organizationId]/credits/adjust`), gated on `loadAdminMembership` (any active platform admin, not owner-only — this is a support/governance action, consistent with suspend/reactivate's existing permission level) — confirmed an org owner cannot reach this platform-admin-only route (403) in both automated tests and QA-13.

## Isolation/privacy

- **Cross-organization**: every billing-adjacent route re-derives the organization from the authenticated membership (`loadOrganizationMembership`) — there is no code path that accepts a client-supplied organization identity for billing data. Confirmed automated + live (QA-14): Org A's owner gets a 404 on Org B's billing page and a 403 on Org B's checkout route.
- **Candidate privacy**: the candidate-facing start-route response never includes balance/ledger/Stripe fields; the denial message is the same generic "temporarily unavailable" text regardless of *why* a start was blocked (suspended org, zero credits, inactive assessment). Confirmed automated + live (QA-15): a candidate gets 404 on the org billing page and 403 on the admin adjustment route, and the start-route JSON payload was inspected directly to confirm zero billing-shaped fields.

## Adjustments

Platform-admin-only, requires a non-empty `reason`, inserts a new `admin_adjustment` ledger row (never edits/deletes history), and is rejected server-side if it would drive `available` below 0. Writes a `credit_adjustment` entry to the existing platform `admin_audit_events` table (keyed on `users.id`, matching every other admin-audit call site) — distinct from the organization's own `organization_audit_events`, which this action does not also write to, since it's a platform-support action rather than an org-initiated one.

No automated Stripe-refund-to-credit reconciliation was implemented (§62) — refunds remain a manual/support process via the same adjustment tool, exactly as the spec recommends.

## Browser QA

All 16 required stories (`docs/implementation_plan/phase10b.md` §71) executed live against the running dev server and real Stripe TEST MODE checkouts (test card `4242 4242 4242 4242`), with DB state verified after every claim — see `docs/qa/phase10b/execution_log.md` and `user_story_matrix.md` for full detail.

**Result: 16/16 PASS.** No real defects were found — the implementation was correct on first live execution, including the highest-risk stories (genuine concurrent-candidate credit racing with two real identities, purchase-completes-after-suspension, and webhook-replay idempotency keyed on Stripe session ID rather than event ID). One investigation during QA-10 initially looked like a possible regression but was root-caused to a QA-session identity mix-up, not a code defect — documented transparently in `docs/qa/phase10b/defects.md` with the re-verification that confirmed the code was correct all along.

No Stripe CLI webhook forwarder was available in this environment (consistent with the Phase 9 QA environment) — real checkout-driven webhook delivery was verified by fetching the actual completed Checkout Session via the Stripe API and replaying it as a freshly-signed `checkout.session.completed` event against the local webhook endpoint, in addition to the automated suite's direct in-process webhook coverage.

A platform-admin grant created for QA (role `admin`) was revoked at the end of the session; no standing admin access remains. Test organizations/users created during QA use a consistent `qa-phase10b-`/`-qa-phase10b` naming convention and are left in the local DB, matching established project convention.

## Validation

Full sweep per §76, all green:

```
pnpm typecheck    — 5/5 workspace packages clean
pnpm lint         — 5/5 workspace packages clean
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
                  — 67 files, 522/522 tests passing
pnpm build        — succeeds; all new routes present in the build manifest
                    (/api/organizations/[slug]/billing/checkout,
                     /organizations/[slug]/billing[/success],
                     /api/admin/organizations/[organizationId]/credits/adjust)
pnpm --filter @incidentrank/db db:seed
                  — "Seed complete (100 built-in scenario(s))." — invariant held
```

New test coverage added this phase (all passing, included in the 522 total):
- `apps/web/src/lib/server/organization-credits.test.ts` — ledger balance/idempotency/adjustment-safety + genuine DB concurrency (15 tests)
- `apps/web/src/app/api/organizations/[slug]/billing/checkout/route.test.ts` — auth/role/flag/suspension/plan-mapping/customer-isolation (15 tests)
- `apps/web/src/app/api/stripe/webhook/organization-credits.webhook.test.ts` — purchase issuance/idempotency/unknown-price/unpaid/wrong-customer/suspended-grant/audit (9 tests)
- `apps/web/src/app/api/assessment/[assessmentId]/start/organization-credits.test.ts` — consumption timing/idempotency/no-credit-block/flag-off-parity (7 tests)
- `apps/web/src/app/api/admin/organizations/[organizationId]/credits/adjust/route.test.ts` — permission/reason/negative-balance-guard/audit (7 tests)
- Extended `apps/web/src/app/api/assessment/[assessmentId]/start/route.test.ts`'s existing fixtures to grant credits up front, so that suite's suspension/resume assertions hold regardless of `ORG_CREDIT_CONSUMPTION_ENABLED`'s ambient value.

One real bug was caught and fixed by this new test suite before it ever reached QA: the admin credit-adjustment route originally logged `admin_audit_events.adminUserId` as the `adminUsers` row id instead of the `users` row id that column's foreign key actually references (the same mistake every other admin-audit call site in the codebase avoids) — fixed in `apps/web/src/app/api/admin/organizations/[organizationId]/credits/adjust/route.ts` before any manual QA.

## Deferred (per §78, unchanged)

- Automated Stripe-refund-to-credit reconciliation
- Organization subscriptions / monthly or annual organization billing
- Organization usage subscriptions, enterprise contract invoicing, IncidentRank-generated invoices
- Company SSO
- Phase 10C — Engineer Rank (explicitly not auto-started per the stop condition)
