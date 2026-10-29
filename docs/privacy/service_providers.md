# Service Provider Inventory

Phase 10D (`docs/implementation_plan/phasse10d.md` §17). Lists only external processors actually integrated in this codebase today — confirmed by grep of `.env.example` and `package.json` dependencies, not by assumption. No analytics, advertising, session-replay, or monitoring vendor is configured anywhere in this repository.

## Clerk

- **Purpose**: authentication and identity (sign-up, sign-in, session management, email verification). IncidentRank never stores passwords, MFA secrets, or session tokens — see `docs/privacy/data_inventory.md`.
- **Data shared**: email address, display name, and whatever profile fields Clerk's hosted components collect at sign-up. IncidentRank reads these via `clerkClient()`/`auth()` (`apps/web/src/lib/server/current-user.ts`) but does not control what Clerk itself stores.
- **Configuration**: `CLERK_SECRET_KEY`, Clerk publishable key (client-side, not secret). Integrated via `@clerk/nextjs`.
- **Retention knowledge**: governed by Clerk's own retention/privacy policy; not independently configurable by IncidentRank beyond deleting the Clerk user record (out of scope for this phase's self-service deletion, which only touches IncidentRank's local `users` row).
- **Production status**: in active use for all authentication, dev and production alike.

## Stripe

- **Purpose**: payment processing for individual Pro/Founding subscriptions and organization assessment-credit purchases.
- **Data shared**: whatever Stripe's own Checkout/Customer Portal flows collect directly from the payer (card details, billing address) — this data reaches Stripe directly via Stripe-hosted UI, never passing through IncidentRank's own servers. IncidentRank persists only Stripe-issued identifiers (customer id, subscription id, checkout session id, payment intent id, price/product id) and normalized status/date fields — confirmed against `webhook-handlers.ts` and `schema.ts` to contain zero raw card data, CVC, or monetary amount columns (see `data_inventory.md`).
- **Configuration**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Retention knowledge**: governed by Stripe's own retention policy for payment records; IncidentRank's own retained identifiers follow `docs/privacy/data_retention.md`.
- **Production status**: TEST MODE only as of this phase; production Stripe keys/webhook configuration are a Phase 11 beta-launch item.

## Resend

- **Purpose**: transactional email delivery (organization owner invites, promotional invites, referral reward notifications, organization suspension/reactivation notices).
- **Data shared**: recipient email address and the transactional email body/subject for each send. No marketing email is sent — see `docs/privacy/data_inventory.md` §16/§57 marketing-consent note.
- **Configuration**: `RESEND_API_KEY`. When unset, `TestEmailService` (a no-op logger, never a real send) is selected automatically — see `apps/web/src/lib/server/email/test-email-service.ts`.
- **Retention knowledge**: governed by Resend's own retention policy for sent-email logs/content.
- **Production status**: not yet configured with a production API key; this is a Phase 11 beta-launch item.

## Database hosting (Postgres)

- **Purpose**: primary application data store (all tables in `packages/db/src/schema.ts`).
- **Data shared**: all first-party application data described in `data_inventory.md` — this is the system of record, not a third-party processor in the usual sense, but is listed here because production hosting will be a named infrastructure vendor.
- **Configuration**: `DATABASE_URL`.
- **Retention knowledge**: governed by IncidentRank's own retention policy (`docs/privacy/data_retention.md`), subject to the hosting provider's backup/retention mechanics once a production vendor is selected.
- **Production status**: local Postgres in development; **no production hosting vendor has been selected or named yet — this is an explicit Phase 11 beta-launch item** (do not invent a vendor name; see the completion report's beta-blocking configuration list).

## Vendors explicitly NOT in use

Confirmed absent from this codebase (no env var, no dependency, no integration code):

- Analytics (no Google Analytics, PostHog, Mixpanel, Amplitude, Segment)
- Advertising/behavioral tracking pixels
- Session replay tools
- Error/monitoring vendors (no Sentry, Datadog, or equivalent) — a Phase 11 beta-launch consideration, not a current integration
- AI/LLM providers processing user or candidate data (no model-training or inference pipeline touches private practice/assessment data anywhere in this codebase)

If any of these are added in a future phase, this document must be updated before that phase ships.
