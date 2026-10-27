# Phase 10B Browser QA Plan — Organization Assessment Credits & Billing

Real browser QA against Stripe TEST MODE, per docs/implementation_plan/phase10b.md §71. Mirrors the Phase 9/10A QA workspace precedent: live `claude-in-chrome` sessions, DB state verified after every claim (never trusting the UI alone), real Stripe TEST MODE checkout with test card `4242 4242 4242 4242`.

## Environment

- Local dev server (`pnpm dev`), `apps/web/.env.local` with `ORG_BILLING_ENABLED=true`, `ORG_CREDIT_PURCHASE_ENABLED=true`, `ORG_CREDIT_CONSUMPTION_ENABLED=true`, `ADMIN_PORTAL_ENABLED=true`, `STRIPE_WEBHOOKS_ENABLED=true`, real Stripe TEST MODE keys, and a freshly-created organization-credit catalog (`STRIPE_ORG_SINGLE_CREDIT_PRICE_ID`, `STRIPE_ORG_CREDIT_PACK_PRICE_ID`) created in this session — see the completion report's Stripe Catalog section.
- No Stripe CLI webhook forwarder is available in this environment (same constraint as Phase 9 QA) — webhooks from a real checkout session do not reach localhost automatically. Verified webhook processing is instead exercised by replaying the real Stripe `checkout.session.completed` event (fetched via the Stripe API after a real checkout) through `POST /api/stripe/webhook` with a freshly-generated valid signature, confirming a +N ledger entry appears and the balance updates. This is in addition to the automated test suite's direct, in-process webhook-handler coverage.
- Platform-admin stories reuse the same admin-grant/revoke procedure established in Phase 8/9/10A QA: a deliberate, user-run `admin_users` INSERT, reverted after the session.
- Candidate/org test identities created this session via Clerk dev-mode sign-ups (`+clerk_test@example.com` convention, fixed test OTP where applicable).

## Story-to-evidence mapping

See `user_story_matrix.md` for the per-story pass/fail table and `execution_log.md` for detailed steps, API responses, and DB verification for each story.
