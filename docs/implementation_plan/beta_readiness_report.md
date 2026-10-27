# IncidentRank — Beta Readiness Report

Assessed after Phase 9 (Stripe Payments, Paid Entitlements). Classification scale: `READY`, `READY_WITH_CONFIGURATION`, `BLOCKER`, `DEFERRED_POST_BETA`.

## Product integrity

**READY.** No unresolved SEV-0/SEV-1 defects across Phases 6–9. Every defect found during any phase's live QA was fixed and re-verified live before that phase closed (Phase 8: resume-after-pass-consumption lockout, referral-reward sourceId collision; Phase 9: Founding-reservation concurrency exception, Manage Billing visibility gap).

## 100-scenario readiness

**READY.** `pnpm --filter @incidentrank/db db:seed` confirms "Seed complete (100 built-in scenario(s))" — unchanged through this phase.

## Practice lifecycle

**READY.** Server-authoritative Finish, status/outcome split, resume/idempotency all shipped in Phase 6.1/7 and re-exercised without regression in this phase's QA (QA-14 specifically re-confirmed resume works even after a mid-attempt entitlement loss).

## Paid/free access

**READY.** `evaluatePracticeAccess`'s full precedence (free → Founding → Pro → dev-unlock → Incident Pass → locked) is centralized, tested (12 dedicated ordering-matrix tests), and live-verified for every branch this phase.

## Incident Passes

**READY.** Phase 8 shipped and QA'd; this phase re-verified passes remain fully isolated from the new paid-entitlement system — never bound/consumed while Pro/Founding grants access, confirmed via DB state across 4 separate premium accesses this session.

## Referrals

**READY.** Phase 8 shipped and QA'd (16/16, including the sourceId-collision fix). Not touched this phase; no interaction surface with paid entitlements exists (referral passes and paid entitlements are architecturally separate grant sources).

## Admin

**READY.** 4 new admin views (paid entitlements, Stripe subscriptions, Founding allocations, webhook events) shipped and live-QA'd this phase, following the exact gating pattern (`isAdminPortalEnabled()` + active `admin_users` membership) already proven in Phase 8's admin surfaces. No admin currently exists in this dev environment by default — this is expected (bootstrap is intentionally first-verified-owner-only) and does not block beta; production bootstrap via `INITIAL_ADMIN_EMAIL` is unchanged from Phase 8.

## Assessment privacy

**READY.** Verified architecturally (zero references to any paid-entitlement function anywhere in assessment code paths) and live (an active-Pro user is still correctly blocked from an unassigned assessment). Unaffected by this phase by design.

## Stripe test payments

**READY.** 3 real TEST MODE purchases completed end-to-end this phase (Pro Monthly, Pro Annual, Founding), webhook signature verification confirmed both valid and forged, idempotent replay confirmed with real repeated delivery, unrecognized-price rejection confirmed.

## Pro subscription lifecycle

**READY.** Activation, renewal (invoice.paid re-sync), scheduled cancellation (access survives until period end), and terminal cancellation (access ends, UI reflects it) all live-verified with real Stripe objects.

## Founding lifetime entitlement

**READY.** Real $99 TEST MODE purchase, slot correctly reserved→issued, lifetime entitlement (`currentPeriodEnd: null`) correctly never expires, correctly takes priority over Pro when a user holds both.

## Founding 100-person cap

**READY.** DB-level partial unique index (`one_active_per_user_idx`) plus `FOR UPDATE SKIP LOCKED` claim logic give a hard, race-safe 100-slot ceiling — proven under genuine concurrent load by both the automated test suite (10/10-then-sold-out, and a deterministic same-user double-reservation race test built on two truly-overlapping Postgres transactions, not `Promise.all` timing) and the route-level checkout test. Near-cap UI behavior (98/100 claimed) live-verified via fixture state, not 100 real purchases, per explicit instruction.

## Webhook safety

**READY.** Signature verification is mandatory and real (no bypass path found in a dedicated adversarial review); idempotency ledger backed by a real unique index; handler failures mark events `failed` (not `processed`) so Stripe's retry mechanism remains correct; unrecognized price IDs never grant anything despite an otherwise-valid, signed event.

## Email readiness

**READY_WITH_CONFIGURATION.** `TRANSACTIONAL_EMAILS_ENABLED=false`, `RESEND_API_KEY` unset in this environment — the no-op test adapter is active, confirmed by existing tests. This is intentional, documented Phase 8 behavior, not a Phase 9 gap. Production needs: a real `RESEND_API_KEY`, domain SPF/DKIM/DMARC verification, and the flag flipped — all pre-existing, already-known configuration tasks, unchanged by this phase.

## Authentication

**READY.** Clerk-backed, unchanged this phase. No new auth surface introduced — every new route reuses `getOrCreateCurrentUser()`.

## Authorization

**READY.** Every Phase 9 mutation (checkout creation, customer-portal, webhook dispatch, admin views) re-derives entitlement/membership state server-side on every request; nothing trusts a client-supplied flag. Confirmed directly via the security review and live QA (direct `fetch()` calls from the browser console against `/api/stripe/checkout` while already-Founding correctly 400'd, bypassing nothing).

## Resume/idempotency

**READY.** Attempt resume survives entitlement loss (QA-14, live-verified with a genuinely continuing simulation, not a static screen). Webhook idempotency is a real DB-backed ledger, not a best-effort in-memory guard.

## Mobile

**DEFERRED_POST_BETA.** No dedicated mobile-responsive QA pass was performed for the new Phase 9 surfaces (`/pricing`, `/billing/success`, `/billing/canceled`, the 4 admin views, the billing panel on `/profile`). These reuse the same Tailwind utility classes and layout primitives as the rest of the app (which itself has not had a dedicated mobile QA pass in any prior phase), so risk is believed low but unverified. Not a Phase 9-specific gap — consistent with the project's standing posture across all phases to date.

## Accessibility sanity

**DEFERRED_POST_BETA.** No dedicated accessibility audit (screen reader, keyboard-only nav, color contrast) has been performed in any phase including this one. The new pages use plain semantic HTML (`<button>`, `<table>`, `<h1>`/`<h2>`) consistent with the rest of the app but no `aria-*` attributes were added specifically. Same standing gap as mobile — not newly introduced, not yet addressed.

## Production configuration gaps

**READY_WITH_CONFIGURATION.** Concretely, before any production payment activation: live Stripe secret/webhook keys, live Stripe Product/Price IDs (this phase explicitly never created or touched any live Stripe object, per the stop condition), a live webhook endpoint registered against a real public URL, `NEXT_PUBLIC_APP_URL` set to the real production domain (currently unset, falls back to `http://localhost:3000` in `checkout.ts`'s success/cancel URLs — would silently break production redirect URLs if deployed with this unset), and all three Phase 9 feature flags flipped to `true` deliberately. None of these are code defects; all are expected pre-activation steps.

## Monitoring/logging gaps

**DEFERRED_POST_BETA.** No dedicated error-tracking/alerting service (e.g., Sentry) or structured application logging was set up in this or any prior phase. Webhook failures are visible via the `stripeWebhookEvents.error` column in the new admin view, which is a real but manual/pull-based signal, not a push alert. This is a real operational gap for running real payments in production, independent of code correctness.

## Backup/recovery gaps

**DEFERRED_POST_BETA.** No explicit database backup/point-in-time-recovery configuration was established in any phase of this project to date; this is infrastructure/hosting-provider configuration outside the scope of any application-code phase.

## Domain/email readiness

**READY_WITH_CONFIGURATION.** No production domain is configured yet (see Production configuration gaps above). Covered together with email readiness above.

## Deployment readiness

**BLOCKER (pre-activation, not pre-controlled-beta) — see note.** No production deployment has occurred for this project at any phase, including this one, per every phase's explicit stop condition. This is not a defect — it has never been in scope — but it is a genuine precondition for "live users paying real money," distinct from "controlled beta with TEST MODE payments only," which this report's recommendation addresses directly below.

---

## Recommendation

```
READY_FOR_CONTROLLED_BETA
```

**Basis for this recommendation**: every product-integrity, payments-correctness, and security dimension assessed above is `READY` — not merely "tests pass," but specifically because every payment code path was exercised with real Stripe TEST MODE objects (3 real purchases, 1 real cancellation, forged and valid webhook signatures, genuine concurrent-transaction races) and the one real defect a dedicated adversarial security review surfaced was fixed and re-verified with a deterministic reproduction, not a probabilistic one. None of the Phase 9 beta-blocking criteria from phase9.md §58 are present: the webhook is signature-verified with no bypass found, duplicate webhook delivery cannot double-issue an entitlement (proven via real repeated replay, not just code inspection), the Founding cap cannot exceed 100 (DB-enforced, proven under genuine concurrency), a paid user reliably resumes an in-progress incident even after entitlement loss (live-verified with a continuing simulation), assessment privacy is unaffected, no direct-API bypass of paid access exists (live-verified from the browser console), no cross-user entitlement mutation path exists, no live secret is exposed to the client or repository, authentication is unchanged and sound, migrations apply cleanly, and the build succeeds.

**"Controlled beta" here specifically means**: a small number of invited users, in TEST MODE Stripe payments (no real money changes hands) or with payments still disabled, on whatever hosting the team chooses to stand up next — not a mobile-polished, accessibility-audited, monitored-and-alerting, fully backed-up production system serving real paying customers at scale. The `DEFERRED_POST_BETA` items (mobile QA, accessibility audit, monitoring/alerting, backup/recovery) are real gaps worth closing before a wider or monetized launch, but are not blockers for a small controlled beta cohort exercising the product and payment flows in TEST MODE. The `READY_WITH_CONFIGURATION` items (live Stripe credentials/catalog/webhook, production domain, Resend DNS verification, flipping feature flags) are expected, mechanical pre-activation steps explicitly outside this phase's scope per its stop condition — none of them represent unresolved code work.
