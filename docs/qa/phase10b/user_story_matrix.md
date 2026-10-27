# Phase 10B Browser QA — User Story Matrix

All 16 required stories (docs/implementation_plan/phase10b.md §71) executed live in a real browser against real Stripe TEST MODE, with DB state verified after every claim rather than trusting the UI alone. See `execution_log.md` for detailed steps and evidence.

| Story | Description | Result | Notes |
|---|---|---|---|
| QA-01 | Billing page | PASS | Owner view: zero balance, both products, empty billing history — matches DB exactly |
| QA-02 | Member denied | PASS | UI denial page + direct API 403 Forbidden |
| QA-03 | Buy single credit | PASS | Real $50 Stripe TEST MODE checkout, webhook replay, +1 credit verified in UI + DB |
| QA-04 | Buy pack | PASS | Separate org (Globex) + user (owner2), real $5,000 checkout, webhook replay, +110 credits |
| QA-05 | Candidate invitation | PASS | Balance unchanged after invite (ledger still 1 row) |
| QA-06 | Candidate starts | PASS | Balance decremented exactly 1, ledger row keyed to real attempt ID |
| QA-07 | Refresh/resume | PASS | Page reload resumed same attempt/countdown; ledger still exactly 2 rows, no second consumption |
| QA-08 | No credits | PASS | Second candidate blocked with generic 403 at zero balance; no attempt/ledger row created |
| QA-09 | Concurrent start | PASS | Live genuine-DB-concurrency race (real `SELECT...FOR UPDATE` + partial unique index) between two real candidate identities for 1 credit — exactly one succeeded, no overspend; also confirmed via existing automated race test (10 credits/11 candidates) |
| QA-10 | Suspended org | PASS | Purchase blocked (403 server-side), new candidate start blocked (403), existing in-progress attempt resumed live with no interruption, credits preserved throughout |
| QA-11 | Purchase completes after suspension | PASS | Checkout created while active, org suspended mid-flow, payment completed, webhook replayed — credit landed (0→111) but unusable (purchase/consumption still blocked) until reactivation |
| QA-12 | Reactivation | PASS | Reactivated Globex; credits immediately usable — live candidate start consumed 1 of 111 credits successfully |
| QA-13 | Admin adjustment | PASS | Platform admin +1 adjustment applied live via admin UI; balance and `admin_audit_events`/ledger both correct |
| QA-14 | Cross-org billing isolation | PASS | Acme owner denied Globex billing both via UI (404) and direct API (403 Forbidden) |
| QA-15 | Candidate billing privacy | PASS | Candidate denied org billing page (404), denied admin credit-adjust (403); candidate-facing assessment-start payload has zero billing/balance fields |
| QA-16 | Webhook replay | PASS | Same real checkout session replayed with a fresh event ID — ledger stayed at the same row count, no duplicate credit (partial unique index on `stripeCheckoutSessionId` dedupes regardless of event ID) |

**16/16 PASS.**

No real defects were found during this QA pass — all 16 stories passed on first genuine execution. One investigation during QA-10 initially looked like a resume-after-suspension regression but was traced to a test-setup mistake (wrong candidate identity signed in, not a code defect); see `defects.md` for the full writeup and live re-verification with the correct identity.

See `defects.md` for that non-defect writeup and the cleanup/admin-revoke confirmation.
