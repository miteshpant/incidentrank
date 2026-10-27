# Phase 9 — Stripe Payments, Paid Entitlements & Beta Readiness — Completion Report

Implements docs/implementation_plan/phase9.md end to end, entirely in Stripe TEST MODE. All work stays behind three feature flags defaulting `false` in any deployed environment; no live Stripe objects were created or touched; no production deployment occurred.

## Stripe architecture

- **SDK**: `stripe@23.0.1`, pinned to API version `2026-09-30.endive` (the SDK's own default — no explicit `apiVersion` override).
- **Central client**: `apps/web/src/lib/server/stripe/client.ts` — a single `getStripeClient()`, memoized on `globalThis` (mirrors `packages/db/src/client.ts`'s Drizzle-caching pattern so Next.js dev-mode hot reload doesn't construct a fresh client per reload). No other file in the codebase calls `new Stripe(...)`.
- **Test-mode confirmation**: `STRIPE_SECRET_KEY` is required to be an `sk_test_...` key; the whole phase never calls a live-mode endpoint. Verified directly against the Stripe account via `stripe.prices.retrieve`/`stripe.customers.create` during implementation and QA — all objects created (`cus_...`, `cs_test_...`, `sub_...`) carry TEST MODE identifiers.
- **Feature flags** (`apps/web/src/lib/server/feature-flags.ts`): `isPaymentsEnabled()`, `isStripeCheckoutEnabled()`, `isStripeWebhooksEnabled()` — same one-line `process.env.X === "true"` style as the four existing Phase 8 flags. All three default to unset/`false` in `.env.example`. Every payment-mutating route checks the relevant flag itself, server-side — UI visibility is never the only gate.

## Schema (5 new tables, `packages/db/src/schema.ts`)

- **`stripeCustomers`** — one row per IncidentRank user with a Stripe Customer; unique on both `userId` and `stripeCustomerId`.
- **`paidEntitlements`** — the policy-derived table the rest of the app reads from exclusively (never raw Stripe status). `entitlementType` (`pro` | `founding_lifetime`), `status`, `source`, Stripe linkage columns, `startsAt`/`currentPeriodEnd`/`endedAt`. Partial unique index `paid_entitlements_one_founding_per_user_idx` enforces at most one Founding entitlement per user, ever.
- **`stripeSubscriptions`** — the raw Stripe-status mirror, distinct from the policy table, kept for operational visibility even when a subscription's price is unrecognized.
- **`stripeWebhookEvents`** — the idempotency ledger. Unique on `stripeEventId`; `processingStatus` (`received`/`processing`/`processed`/`failed`).
- **`foundingEngineerAllocations`** — the race-safe capacity primitive: exactly 100 pre-seeded numbered slots (`slotNumber` 1–100, unique), not a counter. Partial unique index `founding_engineer_allocations_one_active_per_user_idx` on `userId` WHERE `status IN ('reserved','issued')` prevents a user from ever holding two active reservations simultaneously — this index is what makes the §51/concurrency-safety guarantee enforceable at the database layer, not just in application code.

## Checkout

- **Monthly / Annual Pro** (`createCheckoutSession`, `mode: "subscription"`): price ID resolved server-side only via `getPlanPriceId(plan)` — the client sends a `plan` enum string (`"pro_monthly" | "pro_annual" | "founding_lifetime"`), never a raw price ID.
- **Founding** (`mode: "payment"`): wrapped in `db.transaction` — reserves a capacity slot first via `reserveFoundingSlot`, then creates/reuses the Stripe Customer, then creates the Checkout Session; releases the reservation and rethrows if session creation fails, so a transient Stripe/network error never permanently burns Founding capacity.
- **Eligibility** (per the explicit user clarification during planning): a Founding holder is blocked from ANY further checkout of any plan (`already_founding`); an active Pro subscriber is blocked from a second Pro checkout (`already_pro`) but may still purchase Founding.
- **Managed Payments note**: this Stripe TEST MODE account has Managed Payments enabled by default, which requires every Product to carry a tax code — the existing TEST MODE catalog (which this phase must never modify) doesn't have one set. Found via live QA (every real checkout attempt 500'd until this was fixed). Resolved by passing `managed_payments: { enabled: false }` on `checkout.sessions.create` — a session-creation parameter, not a catalog mutation, so the "never create/modify Stripe objects" rule stays intact.

## Webhooks

- **Endpoint**: `POST /api/stripe/webhook`.
- **Signature verification**: raw body read via `request.text()` (Next.js App Router doesn't body-parse by default) before any parsing; `stripe.webhooks.constructEvent` performs real HMAC verification against `STRIPE_WEBHOOK_SECRET`. A failed verification 400s with zero DB mutation.
- **Event types handled**: `checkout.session.completed` (Founding issuance only — subscription-mode sessions are a no-op here, per §18's "do not treat checkout.session.completed as permanent proof of an active subscription"), `customer.subscription.created/updated/deleted`, `invoice.paid/payment_failed` (re-fetches the live subscription and delegates to the same subscription-sync path, so there is exactly one place Pro access is ever derived).
- **Idempotency**: `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING` is the reservation gate — zero rows back means already-processed, acknowledged with `{"received":true,"duplicate":true}` and no reprocessing.
- **Retries**: a handler exception rolls back its transaction and marks the ledger row `failed` with a non-2xx response, so Stripe's own retry mechanism re-delivers; a DB failure never gets marked `processed`.

## Pro lifecycle

- **Activation**: `customer.subscription.created`/`.updated` → `syncProEntitlementFromSubscription` → `paidEntitlements` row with `status: "active"` for a recognized price only.
- **Renewal**: `invoice.paid` re-fetches and re-syncs the subscription, refreshing `currentPeriodEnd`.
- **Cancellation**: a Billing-Portal "cancel at period end" action keeps `status: "active"` until the real period end — verified live that access correctly survives the scheduled-cancellation window. A terminal `customer.subscription.deleted`-equivalent event flips `status: "inactive"`, `endedAt` set, ending access immediately.
- **Access-end policy**: `evaluatePaidPracticeEntitlement` reads only `status: "active"` rows — an inactive/historical entitlement grants nothing, verified live (UI correctly reverted to "Free plan.").

## Founding

- **Reservation model**: `reserveFoundingSlot` claims the lowest-numbered free slot via `UPDATE ... WHERE slot_number = (SELECT ... WHERE status IN ('released','expired') ORDER BY slot_number LIMIT 1 FOR UPDATE SKIP LOCKED)` — the standard Postgres-safe concurrent-claim pattern.
- **First-100 enforcement**: hard-bounded by exactly 100 pre-seeded rows; no counter to drift out of sync.
- **#100/#101 concurrency evidence**: `founding.test.ts`'s "the 10th of 10 concurrent reservations against 10 slots succeeds and the 11th sees sold_out" (real `Promise.all` concurrency against the database) and `checkout.test.ts`'s route-level "exactly one of two concurrent Founding checkouts for the last slot succeeds; the loser sees sold-out, not a thrown error" — both passing. Live browser QA (QA-10) verified the near-cap UI/capacity display using a fixture-seeded 98/100 state rather than 100 real purchases, per the explicit instruction not to create real mass checkouts merely to test this.
- **Lifetime entitlement issuance**: `handleCheckoutSessionCompleted` validates the price against the configured Founding price, converts the matching reservation to `issued`, and inserts the `paidEntitlements` row — all in one transaction. Verified live with a real $99 TEST MODE purchase: slot correctly moved `reserved → issued`, entitlement created with `currentPeriodEnd: null` (never expires).

## Access integration

`evaluatePracticeAccess` (`apps/web/src/lib/practice-access.ts`) precedence order: free → Founding → Pro → dev-unlock → Incident Pass (bound_here/available/bound_elsewhere) → locked. Both call sites (`incidents/[slug]/page.tsx`, `api/attempts/route.ts`) compute `paidEntitlementState` *before* any Incident Pass lookup and short-circuit entirely when it grants access — a pass is never looked up, bound, or consumed once Pro/Founding already grants access. Verified live: 4 separate premium-scenario accesses under Pro and Founding this session, the user's pre-existing bound Incident Pass remained `status: "bound"`, `consumedAt: null` throughout. Assessment isolation verified architecturally (zero references to any paid-entitlement function anywhere in the assessment code paths) and live (an active-Pro user is still correctly blocked from an assessment they have no candidate assignment for).

## Browser QA

All 16 required stories (QA-01 through QA-16) executed live against Stripe TEST MODE — 3 real Checkout purchases, 1 real Billing Portal cancellation, forged/valid webhook signatures, replay idempotency, unknown-price rejection, and the full access-priority/pass-preservation/assessment-isolation matrix. **16/16 PASS.** Full detail in `docs/qa/phase9/`.

**Defects found and fixed during QA**: one UX gap — `IncidentPassPanel` hid the "Manage Billing" link once a user's entitlement lapsed, even with a real Stripe customer record still worth managing. Fixed, retested live. See `docs/qa/phase9/defects.md` for this and one non-blocking Stripe-API-version display-only observation (Billing-Portal-initiated scheduled cancellations set `cancel_at` rather than the legacy `cancel_at_period_end` boolean in this API version — cosmetic only, in an admin-only view; does not affect entitlement correctness).

## Security

A dedicated adversarial security/concurrency review (9-point checklist: webhook signature bypass, price/plan allowlist bypass, direct-API entitlement bypass, cross-user mutation, Founding capacity race safety, Incident Pass precedence, secret exposure, admin view exposure, `onConflictDoNothing` predicate correctness) found **one confirmed finding**, traced end-to-end before being reported:

- **Uncaught DB constraint violation on concurrent same-user Founding checkout** (medium severity, not a security bypass): a double-click/two-tab race where both requests pass the pre-transaction eligibility check, both claim different free slots, and the second to commit violates `founding_engineer_allocations_one_active_per_user_idx`, surfacing as an unhandled 500 instead of the already-modeled `founding_already_reserved` outcome. The DB-level uniqueness guarantee itself was never at risk — this was purely an unhandled-exception/UX gap. **Fixed**: `reserveFoundingSlot` now catches Postgres error code `23505` specifically and returns the clean typed result. Verified with a deterministic regression test that forces true transaction overlap via two independent reserved connections with explicit `BEGIN`/`COMMIT` ordering (chosen after confirming `Promise.all` over `testDb.transaction()` calls does not reliably reproduce genuine overlap due to connection-pool/microtask serialization).

Everything else in the checklist was ruled out after tracing the actual code path, not just pattern-matching: webhook signature bypass (raw-body-before-parse, real HMAC, no fallback path), price/plan allowlist bypass (server-only translation, client never supplies a price ID), direct-API entitlement bypass (`POST /api/attempts` independently re-derives both paid-entitlement and pass state server-side), cross-user mutation (every query scoped by authenticated `user.id`, no client-supplied allocation/pass ID used unscoped), secret/PII exposure (no secret value ever interpolated into a response/log/DB column), admin view gating (all 4 new views require `isAdminPortalEnabled()` + active `admin_users` membership), and `onConflictDoNothing` predicate correctness (the Founding-entitlement insert's `where` clause was deliberately written to textually match the schema's own partial index predicate, citing the Phase 8 precedent for this exact bug class).

## Validation

```
pnpm typecheck                                                                    # clean, all 5 workspace packages
pnpm lint                                                                         # clean, all 5 workspace packages
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
  # 59 test files, 437 tests passing
pnpm build                                                                        # clean; all new routes (checkout/webhook/customer-portal/pricing/billing/admin views) registered correctly
pnpm --filter @incidentrank/db db:seed                                           # "Seed complete (100 built-in scenario(s))." — unchanged; Founding slots idempotent
```

New automated tests this phase: 5 files, 54 tests — `checkout.test.ts` (12), `webhook.test.ts` (7, at `app/api/stripe/webhook/route.test.ts`), `pro-lifecycle.test.ts` (11), `founding.test.ts` (13, including both the standard and the genuinely-forced-overlap concurrency race tests), `access-priority.test.ts` (12, the Phase 9 precedence matrix in `apps/web/src/lib/access-priority.test.ts`).

**Note on `pnpm test` at the repository root**: this runs Vitest without `--pool=forks --poolOptions.forks.singleFork`, which triggers a pre-existing (Phase 6–8-documented) parallel-worker contention issue on tables with global unique indexes — now also affecting the new Founding-allocation tests for the identical root cause (concurrent test workers each independently mutate the shared local-dev Founding slot pool). This is not a Phase 9 regression; it reproduces a known, already-documented environment constraint. All validation in this phase was run with the required flag, which passes cleanly.

## Deferred production work (explicitly out of scope per the stop condition)

- Switching `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/price IDs to live-mode values.
- Registering a live Stripe webhook endpoint against a real public URL.
- Flipping `PAYMENTS_ENABLED`/`STRIPE_CHECKOUT_ENABLED`/`STRIPE_WEBHOOKS_ENABLED` to `true` in any deployed environment.
- Creating or modifying any live Stripe Product/Price.
- Any production deployment, beta invite, or pricing/company-billing change.

See `docs/implementation_plan/beta_readiness_report.md` for the overall beta-readiness assessment and recommendation.
