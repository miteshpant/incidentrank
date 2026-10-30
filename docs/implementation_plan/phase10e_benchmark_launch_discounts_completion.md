# Phase 10E — Benchmark Data Foundation & Launch Discounts — Completion Report

Per `docs/implementation_plan/phase10e.md`. Two independent parts implemented together across five gated batches, each with its own typecheck/lint/test/build/seed validation sweep.

---

## Part A — Launch discounts

### Launch discount model

Base list prices are unchanged in application logic (`stripe/config.ts`, `org-credit-config.ts`) — discounts are a pure overlay at checkout-session-creation time, never a change to the canonical Price IDs or entitlement semantics.

| Plan | List price | Launch offer | Mechanism |
|---|---|---|---|
| Pro Monthly | $9.99/mo | 75% off first 3 billing periods | Stripe coupon, `duration=repeating`, `duration_in_months=3` |
| Pro Annual | $79/yr | 50% off first year | Stripe coupon, `duration=once` |
| Founding Engineer | $99 one-time | 50% off | Stripe coupon, `duration=once` |
| Organization (first purchase only) | $50/credit or $5,000/110-credit pack | 50% off first successful purchase | Stripe coupon, `duration=once`, gated by `organization_launch_discount_claims` |

The server resolves `plan → coupon ID` from configured env vars (`discount-config.ts`'s `getLaunchCouponId`/`getOrgFirstPurchaseLaunchCouponId`), mirroring the existing `getPlanPriceId` allowlist pattern exactly. The coupon is passed via `discounts: [{ coupon: couponId }]` on `stripe.checkout.sessions.create()`. The client never sends a coupon, discount percentage, or discount duration in any request — confirmed by a dedicated test asserting an injected `coupon`/`discountPercent` field in the request body is silently ignored.

### Stripe configuration expectations

Four TEST-mode coupons were created by the user directly in the Stripe dashboard and verified via a one-off read-only API check before any code was wired against them:

```
ir_pro_monthly_launch_75      75% off, duration=repeating, duration_in_months=3
ir_pro_annual_launch_50       50% off, duration=once
ir_founding_launch_50         50% off, duration=once
ir_org_first_purchase_50      50% off, duration=once
```

All confirmed `livemode: false` and matching the spec's exact discount shape. Production rollout requires creating the live-mode equivalents (see the rollout checklist below) — this phase never creates or modifies any Stripe object, TEST or live.

Environment variables (see `.env.example` for the documented block):

```
LAUNCH_DISCOUNTS_ENABLED=false
STRIPE_PRO_MONTHLY_LAUNCH_COUPON_ID=
STRIPE_PRO_ANNUAL_LAUNCH_COUPON_ID=
STRIPE_FOUNDING_LAUNCH_COUPON_ID=
STRIPE_ORG_FIRST_PURCHASE_COUPON_ID=
```

A missing or unset coupon ID for an enabled flag fails safe to "no discount sent" rather than blocking checkout — confirmed by a dedicated test.

### Promotion eligibility

Personal plans (Pro/Founding) reuse the existing `already_founding`/`already_pro` eligibility checks in `createCheckoutSession` — no new "has this user ever redeemed a coupon" tracking was needed, since the existing entitlement checks already make re-purchase structurally impossible.

### First-org-purchase race handling

New `organization_launch_discount_claims` table: `id, organizationId (UNIQUE), status (reserved|redeemed|released|expired), stripeCheckoutSessionId, reservedAt, redeemedAt, expiresAt, createdAt`. A `UNIQUE` index on `organizationId` (not partial — at most one claim row ever exists per organization, confirmed by the user's explicit design choice) enforces one lifetime discount per organization at the database level.

Flow (`org-discount-claims.ts`):
1. Checkout request → authoritative check against `organization_credit_ledger` for any prior `transactionType='purchase'` row (never Stripe coupon-redemption history) → `already_purchased` if found.
2. `INSERT ... ON CONFLICT (organization_id) DO NOTHING` a `reserved` claim → losing a concurrent race returns `already_claimed`, and the checkout simply proceeds without a discount (never an error).
3. An expired (`expiresAt < now()`), never-redeemed `reserved` claim is reclaimed in place by the next checkout attempt — satisfies "an abandoned Checkout Session must not permanently burn the organization's one discount" without a cron job. Reservation TTL is 24 hours.
4. On successful webhook-confirmed purchase, the claim is marked `redeemed`.
5. If Checkout Session creation itself throws after a reservation succeeded, the claim is released (deleted) in a catch block — mirroring Founding's `releaseFoundingSlot`-on-error pattern — so a transient Stripe/network failure never burns the discount.

Confirmed by tests: org-scoped (Org A's purchase never disqualifies Org B), concurrent-claim race-safety (exactly one claim row survives two simultaneous checkouts), abandoned-checkout non-burn (a Stripe-creation failure releases the claim; a retry still gets the discount).

### Actual payment amount persistence

Three nullable columns (`amountTotalUsdCents`, `currency`, `discountAmountUsdCents`) added to `paidEntitlements`, `organizationCreditLedger` (purchase rows only), and `stripeSubscriptions` (as `lastInvoiceAmountPaidUsdCents`/`lastInvoiceCurrency`/`lastInvoiceDiscountAmountUsdCents`). Populated from:

- Founding/org-credit one-time purchases: the Checkout Session's own `amount_total`/`currency`/`total_details.amount_discount`, read at `handleCheckoutSessionCompleted` time (already-read object, no extra API call).
- Subscriptions: each successful (`status==='paid'`) `invoice.payment_succeeded` event's `amount_paid`/`currency`/`total_discount_amounts`, reconciled onto `stripeSubscriptions` via `handleSubscriptionEvent`'s new optional `invoiceAmount` parameter — a plain `subscription.updated` event (no invoice context) never clobbers the last-known amount with null.

No raw Stripe object is persisted anywhere — only these individually-read scalar fields, matching the existing Phase 10D minimization doctrine.

### Revenue dashboard correction

`getRevenueSummary` no longer multiplies `count × static list price` (the exact anti-pattern the spec required fixing). `foundingGrossUsdCents`/`orgCreditGrossUsdCents` now sum the real persisted `amountTotalUsdCents` for in-range rows; a row with no captured amount (pre-Phase-10E data) is excluded from the total, never estimated, and surfaced via a new `legacyRecordsWithoutCapturedAmount` count so the admin is never misled by an artificially low number. New fields: `discountsGrantedUsdCents`, `promotionsRedeemed: {monthly, annual, founding, orgFirstPurchase}` (§17's promotion-metrics requirement — redemption is detected by a real captured `discountAmountUsdCents > 0`, never inferred from coupon-ID matching). MRR remains a list-price-based run-rate estimate (Stripe exposes no single authoritative "current MRR" figure) — documented explicitly as an estimate in the UI copy, distinct from the now-real Founding/org-credit gross figures. The admin dashboard UI (`/admin/dashboard`) was updated with the legacy-exclusion note and a new "Launch promotion" metrics block.

**Known follow-up, deliberately out of scope**: `listUserCustomers`/`listOrganizationCustomers`'s per-customer `totalPurchasedUsdCents` display column still uses the static-price estimate — this is a different code path from the mandated `getRevenueSummary` fix, and touching it risked under-scoped changes to "what did this one customer pay across a subscription's lifetime" (genuinely more complex than the aggregate fix). Flagged here rather than silently left unmentioned.

### Pricing/UI messaging

`/pricing` and `/organizations/[slug]/billing` now show explicit "Launch offer: X% off... Then $Y." copy, gated on `isLaunchDiscountsEnabled()` and the viewer's actual eligibility (never shown to an already-Pro/Founding user or an org that already purchased). No crossed-out pricing, no hidden renewal terms — every discount statement names the resulting base price in the same sentence, per §42.

---

## Part B — Benchmark data foundation

### Pseudonymous identity

`benchmark_subjects`: `id (random uuid), userId (FK, UNIQUE), createdAt`. Created lazily on first qualifying attempt materialization, never eagerly at signup. No `displayName`/email/Clerk-id column exists anywhere in the benchmark schema — confirmed by a dedicated test asserting the fact row shape has no such property. `account-deletion.ts`'s `deleteOwnAccount` never mutates `users.id` (only `displayName`/`authProviderId`/`leaderboardVisible`), so the `benchmarkSubjects.userId` FK — and every downstream fact row — survives account anonymization automatically, with zero special-casing required; confirmed by a dedicated deletion-safety test.

### Attempt and action facts

`benchmark_attempt_facts` (28 columns) captures scenario/version/difficulty/category (snapshotted from the catalog at materialization time, never re-derived live), scoring/rank/projection versions, attempt-number-for-scenario/first-attempt flag, timing, terminal outcome, the full six-dimension score breakdown, and rank-before/rank-after context. `benchmark_action_facts` is a pure read-projection over the already-captured `attemptActionGroups`/`attemptActionChanges` — **no new capture mechanism was built**, confirming §19's "inspect existing data before adding schema" directive was fully satisfiable: one action fact per action group, `actionType` derived from the dominant/first `controlKey`, an allowlisted before/after control-value diff (never the free-text `reasoning` field, never the full `finalStateJson` blob).

### Sequence and timing preservation

`benchmark_action_facts.sequenceNumber` preserves the exact action order from `attemptActionGroups.sequence`; `elapsedSeconds` preserves timing. Confirmed by tests that an "inspect → mitigate → validate" sequence and a "restart → scale → investigate" sequence are stored and retrievable in their original order, deterministically across repeated rematerialization.

### Practice-only scope

`materializeBenchmarkAttemptFact` hard-filters `attemptType === "practice"` AND `scenario.ownershipType === "incidentrank"` **inside the function itself**, not only at the trigger call sites — a future caller cannot accidentally benchmark an assessment or an organization-private scenario. Confirmed by dedicated tests inserting a real assessment attempt and a real organization-private scenario and asserting neither materializes.

### Versioning

New `benchmark-versions.ts`: `SCORING_VERSION = "v1"` (the first time a scoring-version concept exists in this codebase at all — previously absent entirely), `BENCHMARK_PROJECTION_VERSION = "v1"` (new), `RANK_ALGORITHM_VERSION` re-exported as-is from the existing `ENGINEER_RANK_ALGORITHM_VERSION` in `engineer-rank.ts` (no duplicate constant). Every fact row pins all three at materialization time — a future methodology change bumps the relevant constant and never silently reinterprets old evidence.

### Rebuild and idempotency

`benchmark_attempt_facts` has a `UNIQUE (attemptId, benchmarkProjectionVersion)` index; `materializeBenchmarkAttemptFact`/`rebuildBenchmarkAttempt` always upsert against this exact target (`onConflictDoUpdate`) — repeated calls for the same attempt at the same projection version are a safe no-op, never a duplicate row; a projection-version bump creates a parallel new-version row set rather than discarding prior evidence. `rebuildBenchmarkForUser`/`rebuildBenchmarkForScenario` provide bulk admin/internal rebuild. All confirmed by dedicated idempotency and rebuild-equivalence tests.

### Failure isolation

**This was the single most important architectural correction made in this phase.** The original plan's naive approach — materializing inside the same transaction as the attempt's terminal-persistence write, mirroring how `persistRankSnapshotIfChanged` already works — was explicitly rejected after re-reading `terminal-attempt.ts`'s own documentation, which states a failure inside that shared transaction **rolls back the entire terminal-persistence write**. That is the exact outcome §27 ("benchmark materialization must not destroy a legitimate completed attempt") forbids.

Instead, `materializeBenchmarkAttemptFactSafely` is called **after** the caller's own completion transaction has already committed, from all three real completion call sites (`finish-attempt.ts`, `apps/web/src/app/api/attempts/[attemptId]/complete/route.ts`; `assessment-runtime.ts`'s two completion branches were confirmed assessment-only and therefore correctly left unwired — they would always short-circuit on the practice-only gate). It wraps its own `db.transaction` internally and never throws back to its caller — any failure is caught and logged to a new `benchmark_projection_failures` table for later `rebuildBenchmarkAttempt` retry, confirmed by a dedicated test that an in-progress (not-yet-completed) attempt is left completely untouched by a failed materialization attempt.

### Calibration dashboard

`/admin/benchmark` (overview metrics: subjects, qualifying/first/repeat attempts, today/7d/30d counts, distinct scenarios, projection failures), `/admin/benchmark/scenarios` (per-scenario table: first/total attempts, resolved %, median score/duration, sample-quality label), `/admin/benchmark/scenarios/[scenarioId]` (full detail: sample size, outcome breakdown, score distribution, six dimension medians, rank-band distribution, common first actions, common 4-action sequences, high-performing first actions with a minimum-3-sample guard against single-sample noise). All three gated by the identical `isAdminPortalEnabled()`/`loadAdminMembership()` pattern as every other admin page, added to the shared admin nav. No per-engineer row or drill-down exists anywhere — only aggregate counts/percentages/medians, confirmed by direct review of all three view components.

Sample-size honesty (`sample-quality.ts`): `<10` first attempts = "Insufficient data," `10–29` = "Early signal," `30+` = "Usable beta signal" — one centralized function used identically by the calibration queries and every dashboard label, never computed ad-hoc.

Decision patterns (`calibration.ts`'s `calibrateDecisionPatterns`): purely frequency-based — common first actions, common 4-action sequences, first-action resolved-percentage — no ML, no clustering, no inference, exactly matching §30's "No ML. No AI scoring."

### Privacy impact

- `docs/privacy/data_inventory.md` — new "Benchmark data" and "Launch discount data" sections, field-by-field, including the explicit V1 scope boundary and the "no demographic data collected" confirmation.
- `docs/privacy/data_retention.md` — new rows for benchmark tables (survives account anonymization unchanged, by construction) and discount-claim table.
- `docs/privacy/privacy_security_review.md` — a fresh grep-based addendum sweep (not a restatement) specifically covering the new Phase 10E code: zero console logging, no PII in fact tables (verified by test, not just claimed), scope enforcement verified by test, zero demographic-data fields, coupon IDs never reach the client, no raw Stripe objects persisted, admin dashboard never exposes per-engineer identity. **No BLOCKER-level findings.**
- **Privacy Policy version bump**: `CURRENT_PRIVACY_VERSION` (and the matching in-document `PRIVACY_VERSION` constant — these are two genuinely separate constants that must be kept manually in sync, a real gotcha caught during live QA when the rendered page initially still showed the old version string) bumped `2026-10-v1 → 2026-10-v2`. A new §6 "Benchmark research (pseudonymous)" section was added; all subsequent sections renumbered sequentially; the existing §7 (formerly §6) Leaderboard cross-reference was updated to match. This is a genuinely new, previously-undisclosed use of data (pseudonymous aggregate research) and was judged a material change requiring a new version, never an in-place edit of already-accepted text. Because the legal-acceptance gate only ever applies to users created at/after `legalAcceptanceGateCutoverAt()` (a fixed, already-past instant per the Phase 10D decision), this version bump has **zero effect on any existing user** — they remain permanently exempt from the gate regardless of version, confirmed by tracing `requireCurrentLegalAcceptance`'s own cutover-check-first logic.

---

## Automated tests

All new/extended test files run against real local Postgres, no DB mocking, matching this codebase's established convention; Stripe's client is mocked only at the module boundary for checkout/webhook tests.

| File | New/extended | Case count |
|---|---|---|
| `stripe/checkout/route.test.ts` | Extended | +6 discount tests (18 total) |
| `organizations/[slug]/billing/checkout/route.test.ts` | Extended | +8 discount tests (23 total) |
| `org-discount-claims.test.ts` | New | 10 pure-function tests |
| `stripe/webhook/organization-credits.webhook.test.ts` | Extended | +6 amount/redemption tests (15 total) |
| `stripe/pro-lifecycle.test.ts` | Extended | +4 invoice-amount tests (15 total) |
| `stripe/founding-checkout.test.ts` | New | 3 amount-persistence tests |
| `platform-metrics.test.ts` | Extended | +4 revenue-correction tests (32 total) |
| `benchmark/materialize.test.ts` | New | 25 tests (all 22 of §38's required cases + 3 extras) |
| `benchmark/calibration.test.ts` | New | 10 tests |

Final full suite: **707/707 passing**, 84 files, zero skipped.

## Browser QA

All QA performed against the real local dev server, real signed-in Clerk identities, and direct DB-state verification per claim — not just green automated tests.

| Story | Result |
|---|---|
| QA-D01 (Monthly launch offer displayed accurately) | ✅ "75% off your first 3 months. Then $9.99/month." rendered correctly on `/pricing` |
| QA-D03 (Annual offer states first-year-only) | ✅ "50% off your first year. Then $79/year." |
| QA-D05 (Founding offer: 50% + first-100 language) | ✅ "50% off the one-time price... First 100 only." + live slot count |
| QA-D07/D09/D10 (org first-purchase discount) | ✅ Covered via automated route-level tests (org-scoped, second-purchase-denied, quantity-unaffected) — all passing against real Postgres |
| QA-D11 (revenue dashboard shows actual collected, not list-price) | ✅ Covered via automated `platform-metrics.test.ts` tests with real persisted amounts |
| QA-B01 (real completed practice attempt → benchmark fact appears) | ✅ Materialized a genuine pre-existing completed attempt (`enterprise-wide-dependency-deprecation`, score 975) via the production materialization function — not a test fixture — and confirmed the resulting fact row |
| QA-B05 (admin benchmark dashboard updates) | ✅ `/admin/benchmark` showed live counts (1 subject, 1 qualifying attempt) immediately after materialization |
| QA-B06 (scenario calibration detail reflects attempt) | ✅ `/admin/benchmark/scenarios/[id]` showed correct difficulty/category (pulled live from the catalog), 100% resolved, median score 975, median duration 7 min, real dimension medians, real action sequence, correctly-suppressed "not enough samples" guard |
| QA-B07 (no engineer identity exposed) | ✅ Confirmed — dashboard shows only aggregate numbers, scenario slugs, and action-type strings; no display name, email, or user-identifying field anywhere on any of the three pages |
| QA-B03 (Engineer Rank continues working) | ✅ Unaffected — Phase 10E added zero changes to `engineer-rank.ts`'s own computation; only read from it (`rankBefore`/`rankAfter` context) |
| QA-B04 (assessment excluded) | ✅ Covered via automated test (real assessment attempt inserted, confirmed non-materialization) |

**Two real defects found and fixed during this phase's live QA/validation** (beyond what automated tests alone would have caught):
1. The failure-isolation architectural correction described above (found during design/code review, not live QA, but it is the phase's single most load-bearing fix).
2. The `PRIVACY_VERSION` vs `CURRENT_PRIVACY_VERSION` dual-constant gap — found live when the rendered `/privacy` page still showed the old version string after bumping only one of the two constants.

## Production rollout checklist (nothing executed automatically)

1. Create the 4 live-mode Stripe coupon objects matching the TEST-mode shape exactly (`75%/repeating/3` for monthly, `50%/once` for annual/Founding/org) — in the Stripe dashboard, by the user, same as the TEST-mode coupons were.
2. Set the 4 live `STRIPE_*_LAUNCH_COUPON_ID` env vars in the production environment.
3. Set `LAUNCH_DISCOUNTS_ENABLED=true` in production **only when ready to go live with the promotion** — defaults to `false`/off.
4. Run the production database migration (3 new migrations: `0017_living_marvex.sql` org-discount-claims, `0018_gigantic_forgotten_one.sql` amount columns, `0019_same_ben_urich.sql` benchmark tables) — all purely additive, zero destructive operations, safe to run against a live database with existing data.
5. Confirm `pnpm --filter @incidentrank/db db:seed` still reports "100 built-in scenario(s)" in the production seed/migration pipeline.
6. The new `CURRENT_PRIVACY_VERSION`/`PRIVACY_VERSION` bump to `2026-10-v2` ships automatically with the code deploy — no separate action needed, and (per the analysis above) has zero effect on existing users.
7. Monitor `benchmark_projection_failures` after initial rollout — any non-zero count post-launch should be investigated and retried via `rebuildBenchmarkAttempt`.
8. **Legal review remains outstanding** (carried over from Phase 10D, unchanged by this phase): the Terms of Service and Privacy Policy — including the new §6 Benchmark Research section — are AI-assisted drafts requiring attorney review before production beta, per the existing `TERMS_INTERNAL_REVIEW_NOTE`/`PRIVACY_INTERNAL_REVIEW_NOTE` constants.

## Verdict

**READY_FOR_BENCHMARK_AND_LAUNCH_DISCOUNT_ROLLOUT**

Pending only the production rollout checklist items above (live Stripe coupon creation, env var configuration, migration execution, and the carried-over legal review) — no further implementation, testing, or design work is blocking rollout once those operational steps are performed by the user.
