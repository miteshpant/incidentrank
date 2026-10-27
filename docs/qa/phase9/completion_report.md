# Phase 9 Browser QA — Completion Report

**Result: 16/16 stories PASS.**

All required stories from docs/implementation_plan/phase9.md §51 were executed live against Stripe TEST MODE: 3 real Checkout purchases (Pro Monthly, Pro Annual, Founding), 1 real Billing Portal cancellation, webhook signature verification (both valid and forged), idempotent replay, unrecognized-price rejection, and the full access-priority/pass-preservation/assessment-isolation matrix — all verified against actual DB state after every claim, not just UI appearance.

Full details in `user_story_matrix.md` (results table) and `execution_log.md` (step-by-step evidence per story).

## What this QA pass additionally caught

1. **A real UX gap**, found and fixed live: `IncidentPassPanel` hid the "Manage Billing" link entirely once a user's entitlement lapsed, even when they still had a genuine Stripe customer record worth managing (invoice history, payment method). Fixed, typechecked, linted, reverified live. See `defects.md`.
2. **A Stripe API-version behavior detail**: Billing-Portal-initiated scheduled cancellations in API version `2026-09-30.endive` set `cancel_at` rather than the legacy `cancel_at_period_end` boolean. Documented as a cosmetic gap in the admin-only "Stripe Subscriptions" view; does not affect entitlement correctness or user-facing UI. See `defects.md`.

## Environment notes for future QA sessions

- No Stripe CLI webhook forwarder is set up in this environment. Real webhook delivery was exercised by fetching each real Stripe event after a live checkout/portal action and replaying it through `POST /api/stripe/webhook` with a freshly-generated valid signature (`stripe.webhooks.generateTestHeaderString`) — this is NOT a shortcut around signature verification; it exercises the identical code path a live forwarder would hit, the only difference being manual triggering. Installing the Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) would let future QA rely on automatic delivery instead.
- The admin portal requires an active `admin_users` row; this environment has no standing admin. Admin-view QA (Step 6) required the user to run a temporary grant/revoke via a direct DB command (the sandbox blocks direct privilege-escalating SQL execution by the agent itself) — this is intentional sandboxing, not a gap to fix.
- Mid-session, an earlier (now-fixed) version of `founding.test.ts`'s concurrency test briefly consumed real local-dev Founding pool slots due to a test-isolation bug (the claim logic correctly scans the whole table, not just test-seeded rows — the test didn't shield the real pool). This was caught, the test suite was corrected to shield/restore the real pool around every test (verified via a deterministic two-connection race reproduction), and the local pool was restored to a clean state via user-run DB commands before this QA pass began. No production or shared environment was affected; this was purely local dev-environment test state.

## Verification commands run alongside this QA pass

```
pnpm --filter @incidentrank/web exec tsc --noEmit    # clean
pnpm --filter @incidentrank/web exec eslint ...       # clean
pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork
  # 59 files, 437 tests passing
```

Proceeding to Step 10: full monorepo validation and the two required Phase 9 completion/beta-readiness reports.
