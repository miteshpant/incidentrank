# Phase 9 Browser QA — Defects

## Fixed during this QA pass (not shipped as a defect)

### "Manage Billing" link missing for a churned user with billing history

**Found during:** QA-06 (Pro cancellation → terminal entitlement loss)

**Symptom:** `apps/web/src/components/incident-pass-panel.tsx` only rendered the "Manage Billing" button inside the `activeEntitlement` branch. A user whose Pro/Founding entitlement had fully ended — but who still had a real `stripeCustomers` row (invoice history, saved payment method) — lost access to the Stripe Customer Portal entirely, even though the portal is still useful to them (view past invoices, update payment method, resubscribe).

**Fix:** Render `<ManageBillingButton />` in both the active-entitlement and the free-plan branches whenever a `stripeCustomers` row exists. Verified live: after simulating terminal cancellation, "Manage Billing" correctly reappeared under "Free plan."

**Status:** Fixed, typechecked, linted, verified live in browser.

## Observed, not a defect — Stripe API behavior note

### `cancel_at_period_end` boolean stays `false` after a Billing-Portal-initiated scheduled cancellation

**Found during:** QA-06

In Stripe API version `2026-09-30.endive`, canceling via the Billing Portal's "cancel at period end" flow sets `cancel_at` (a specific future timestamp) and `canceled_at`, but leaves the legacy `subscription.cancel_at_period_end` boolean as `false`. `webhook-handlers.ts` only persists `cancel_at_period_end`, so the admin "Stripe Subscriptions" view's "Cancel at Period End" column reads "No" even when a cancellation is genuinely scheduled.

**Impact:** Display-only, in an internal admin ops view. Does not affect:
- Actual entitlement correctness — `status`/`current_period_end` are read directly and correctly keep Pro access alive until the real period end, verified via DB state and the user-facing profile panel.
- The user-facing billing panel — it only ever displays `currentPeriodEnd`, never this flag.
- Security or authorization — nothing gates access on this boolean.

**Recommendation (not fixed in this phase):** If precise "scheduled to cancel" visibility is wanted in the admin view, read `cancel_at` in addition to `cancel_at_period_end` when syncing `stripeSubscriptions` in `webhook-handlers.ts`. Left as a follow-up since it's cosmetic-only and this phase's scope is payments/entitlements correctness, not admin-ops display polish.

## Security/concurrency review finding (fixed separately, see completion report)

See `docs/implementation_plan/phase9_stripe_payments_completion.md` for the one confirmed finding from the Step 8 security/concurrency review (a same-user concurrent Founding-reservation race producing an unhandled exception instead of a clean `already_reserved` result) — fixed in `founding-allocation.ts` with a deterministic regression test, independent of this browser QA pass.
