# Phase 9 Browser QA — User Story Matrix

All 16 required stories (docs/implementation_plan/phase9.md §51) executed live in a real browser against Stripe TEST MODE, with DB state verified after every claim rather than trusting the UI alone. See `execution_log.md` for detailed steps and evidence.

| Story | Description | Result | Notes |
|---|---|---|---|
| QA-01 | Pricing page | PASS | $9.99/mo, $79/yr, $99 Founding, correct copy, live "N of 100 claimed" count verified |
| QA-02 | Monthly Pro checkout | PASS | Real Stripe Checkout → paid → webhook (replayed, no live forwarder available) → Pro active |
| QA-03 | Monthly Pro premium access | PASS | Premium incident started with no Incident Pass; verified `attempts.incidentPassId = null` in DB |
| QA-04 | Annual Pro checkout | PASS | Real $79/yr checkout, correct `current_period_end` one year out, correct annual price ID in DB |
| QA-05 | Subscription state/account UI | PASS | Profile panel shows "Pro — access through [date]" matching DB `current_period_end` exactly |
| QA-06 | Pro cancellation | PASS | Portal cancel → `cancel_at_period_end` scheduled, access correctly remains until period end; terminal cancellation event → access correctly ends, UI drops to Free plan |
| QA-07 | Founding checkout | PASS | Real $99 checkout → slot reserved → issued → lifetime entitlement created |
| QA-08 | Founding premium access | PASS | Premium incident access confirmed without pass consumption (`incidentPassId = null`), tested under both Pro and Founding |
| QA-09 | Duplicate Founding purchase | PASS | UI shows "Already Founding"/disabled; direct API call also returns `already_founding` for both plans |
| QA-10 | Founding capacity | PASS | Fixture-seeded near-cap state (98/100 claimed) verified live in UI; #100/#101 concurrency behavior covered by automated test suite (no 100 real checkouts created, per explicit instruction) |
| QA-11 | Webhook replay | PASS | Same event replayed multiple times throughout session; `duplicate: true` returned, exactly 1 entitlement row confirmed in DB |
| QA-12 | Invalid webhook signature | PASS | Forged signature POST from live browser context → 400, zero DB rows created |
| QA-13 | Unknown product/price event | PASS | Subscription event with unrecognized price ID → raw mirror synced, zero entitlement granted |
| QA-14 | Existing attempt survives entitlement loss | PASS | Attempt started under Pro, entitlement terminated via webhook, scenario revisited → "Incident in progress" resume screen → Resume → live simulation continues normally |
| QA-15 | Paid entitlement does not affect assessments | PASS | Unassigned assessment correctly blocked ("You have not been invited to this assessment") both as Free and as active-Pro user |
| QA-16 | Incident Pass preservation | PASS | Pass remained `status: bound`, `consumed_at: null` across 4 separate premium-scenario accesses under Pro and Founding this session |

**16/16 PASS.**

See `defects.md` for the one minor UX gap found and fixed during this QA pass (not a defect in shipped behavior — caught and corrected before this document was written).
