# Phase 9 Browser QA Plan — Stripe Payments, Paid Entitlements

Real browser QA against Stripe TEST MODE, per docs/implementation_plan/phase9.md §51. Mirrors the Phase 7.3/Phase 8 QA workspace precedent: live `claude-in-chrome` sessions, DB state verified after every claim (never trusting the UI alone), real Stripe TEST MODE checkout with test card `4242 4242 4242 4242`.

## Environment

- Local dev server (`pnpm dev`), `apps/web/.env.local` with `PAYMENTS_ENABLED=true`, `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_WEBHOOKS_ENABLED=true`, real Stripe TEST MODE keys.
- No Stripe CLI webhook forwarder is available in this environment — webhooks from real checkout sessions do not reach localhost automatically. Verified webhook processing is instead exercised two ways: (a) replaying the real Stripe event (fetched via the Stripe API after a real checkout) through `POST /api/stripe/webhook` with a freshly-generated valid signature, and (b) the automated test suite's direct, in-process webhook-handler coverage (`webhook-handlers.ts`, `webhook/route.test.ts`) which already exercises signature verification, idempotency, and entitlement derivation without needing live delivery.
- Founding capacity testing uses fixture-seeded state, never 100 real checkouts, per §51's explicit instruction.
- Admin-portal views require an active `admin_users` row; since this environment has no standing admin and self-granting admin access is blocked by the sandbox, admin-view stories reuse the admin-grant/revoke procedure already established during Phase 9 Step 6 QA (deliberate, visible, user-run, reverted after).

## Story-to-evidence mapping

Several stories were already substantively exercised earlier in this Phase 9 session (during Step 5 Billing UI QA and Step 8 security review verification) using a real Stripe TEST MODE Pro Monthly purchase against the signed-in `qa-phase8-candidate+clerk_test@example.com` user. Those results are cited here rather than re-run from scratch where the underlying state is still valid and re-verifiable from the DB; genuinely new verification is done live per story below.

See `user_story_matrix.md` for the per-story pass/fail table and `execution_log.md` for the detailed steps and evidence for each story actually executed in this QA pass.
