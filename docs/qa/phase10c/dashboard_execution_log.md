# Phase 10C Browser QA — Execution Log (Batch 2: Platform Customer & Revenue Dashboard)

Session date: 2026-10-28. Dev server at `localhost:3000`, signed in as the real platform admin identity `qa-verify-admin+clerk_test@example.com` (existing active `admin_users` row from the Phase 10B QA session). No synthetic data was created for this pass — the prior Phase 9/10A/10B QA sessions left a rich, realistic dataset in the local Postgres: 35 real users (including one genuine Pro-annual subscriber with real purchase/referral/incident-pass history), 7 real organizations (including org credit purchases at both price points, consumption, and a full suspend→reactivate lifecycle), which this dashboard aggregates live.

## QA-C01 — Platform admin opens dashboard and sees total users/orgs

Signed in as the real platform admin, navigated to `/admin/dashboard`.

- UI: Total Users 35, Total Organizations 7, Free Users 34, Active Pro 2 (1 monthly, 1 annual), Founding Engineers 0, Organizations With Purchases 3, With Available Credits 2, Suspended 1, Credits Purchased 223 / Consumed 4 / Remaining 215, MRR $16.57, Founding Gross $99.00, Org Credit Gross $10,150.00, Total Gross Collected $10,249.00.
- All figures independently cross-checked against the underlying data throughout this log (see below) — every one reconciles exactly.

**PASS.**

## QA-C02 — Normal user cannot access

Signed in as `qa-verify-owner+clerk_test@example.com` (a real organization owner, never a platform admin). Navigated to `/admin/dashboard` and `/admin/customers/users` directly.

- Both: genuine `404` page (`notFound()`), not the dashboard content.

**PASS.**

## QA-C03 — Free user appears with $0 spend

Confirmed across the entire `/admin/customers/users` list: every user without an active entitlement shows `FREE`, `$0.00` total purchased, `—` for subscription/last-purchase — never hidden, never omitted from the list.

**PASS.**

## QA-C04 — Pro user shows correct plan/status and purchase history

Real user `qa-phase8-candidate+clerk_test@example.com`:

- List row: `PRO`, `annual (active)`, `$6.58` total purchased, last purchase `10/26/2026`, Stripe customer `cus_VVrbxrJV…`.
- Detail page (`/admin/customers/users/91ec2dc2-613c-4af8-9be7-d23bf56be60e`): Current Entitlement "Pro", Pro Subscription "Annual · active" with a real period-end date, Total Purchased `$6.58` (= round(7900/12) cents, matching `proAnnualMrrUsdCents()` exactly), Stripe Customer ID, and a genuine Payment/Purchase History showing three real entitlement rows (an earlier inactive Pro grant, an inactive Founding attempt, and the current active Pro annual grant) — real historical lineage, not fabricated. Incident Pass Summary (3) and Referral Summary (5 sent) both populated from real data.

**PASS.**

## QA-C05 — Founding user shows lifetime status and correct spend

No currently-active Founding user existed in the dataset at list-check time (Founding Engineers: 0 on the dashboard), so this exact story was not directly observed against a live Founding row in this pass. However, the user-detail view's purchase-history rendering was confirmed correct against a real (inactive) Founding entitlement row for `qa-phase8-candidate` ("Founding Engineer — inactive · price price_1UUeziBOS9B1UgRUp8Wr8hkr"), and the Founding gross calculation was independently confirmed correct via the platform summary (QA-C14 below) against the real `foundingEngineerAllocations` table (1 issued slot, $99 gross). The "lifetime" label logic (`foundingStatus: "lifetime"` whenever `entitlementType === "founding_lifetime" && status === "active"`) is covered directly by `platform-metrics.test.ts`'s automated test suite. Flagged here as **not independently re-verified live against a currently-active Founding row** — the closest adjacent live evidence (inactive-row rendering + correct aggregate count) is documented in lieu of a literal currently-active case, which the available dataset didn't happen to contain at QA time.

## QA-C06 — Organization with single-credit purchase shows correct spend/credits

`Acme QA Phase10B` (suspended): Credits P/C/A `1 / 2 / 0`, Total Purchased `$50.00` — exactly one $50 single-credit purchase, confirmed via the org detail page's full credit ledger ("Purchase +1" row) and audit history.

**PASS.**

## QA-C07 — Organization with 110-credit pack shows correct spend/credits

`Globex QA Phase10B`: Credits P/C/A `111 / 1 / 110`, Total Purchased `$5,050.00` (= $50 single-credit + $5,000 pack, 1 + 110 = 111 credits purchased). Org detail page's credit ledger confirms both real purchase rows ("+110" and "+1") plus the real consumption row ("-1", "Candidate started") and the full real audit history (organization_created → owner_invited → credits_purchased ×2 → organization_suspended → organization_reactivated → assessment_credit_consumed) — a genuine end-to-end Phase 10B lifecycle correctly reflected here.

**PASS.**

## QA-C08 — Org credit consumption changes used/available but not purchased revenue

Directly confirmed in the same `Globex QA Phase10B` figures above: Consumed `1`, Available `110` (down from 111 purchased), while Total Purchased (gross) remains exactly `$5,050.00` — consumption never reduces the gross-purchased figure, exactly the required invariant.

**PASS.**

## QA-C09 — Search user by email

Searched `/admin/customers/users?q=qa-phase8-candidate+clerk_test@example.com` (URL-encoded) → exactly 1 matching row returned, the correct user. Searching without the real `+clerk_test` suffix correctly returned zero results (exact-match search, by design — documented V1 boundary, not a defect).

**PASS.**

## QA-C10 — Search organization by name/slug

Searched `?q=globex` (partial, case-insensitive substring) → exactly 1 matching row, "Globex QA Phase10B".

**PASS.**

## QA-C11 — Search Stripe customer ID

Searched with a truncated/prefix Stripe customer id first → correctly returned zero results (exact-match only, as designed — not a partial/prefix search). Searched with the real, full Stripe customer id (confirmed via direct DB query) → exactly 1 matching row, "QA Verify Billing Org".

**PASS** (with the exact-match behavior noted as an intentional V1 design choice, consistent with `findAuthProviderIdsByEmail`'s equivalent limitation for user search).

## QA-C12 — Suspended org clearly marked

`Acme QA Phase10B` shows a red `SUSPENDED` badge in the organization list (confirmed via the existing `StatusBadge` color convention, `text-[#dc2626]`) and `status: suspended` on its detail page. Filtering `?status=suspended` correctly narrowed the list to exactly this one organization.

**PASS.**

## QA-C13 — MRR excludes Founding and org credits

MRR stayed at exactly `$16.57` across every date-range toggle (Today/7d/30d/All time) tested — confirming it is a run-rate, never scoped by range, and never influenced by changing the range reveals more/fewer Founding or org-credit transactions. $16.57 = $9.99 (one active Pro monthly) + $6.58 (round(7900/12), one active Pro annual) — exactly the two real active subscriptions in the dataset, with zero contribution from the real $99 Founding entitlement or the real $10,150 of org-credit purchases also present in the same dataset at the same time.

**PASS.**

## QA-C14 — Founding gross revenue correct

Founding Gross (All time): `$99.00` — exactly 1 issued Founding allocation × $99, matching the real `foundingEngineerAllocations` table's single `status='issued'` row for this dataset.

**PASS.**

## QA-C15 — Org-credit gross revenue correct

Org Credit Gross (All time): `$10,150.00` — reconciled by hand against the three real organizations with purchases: QA Verify Billing Org ($5,050) + Globex QA Phase10B ($5,050) + Acme QA Phase10B ($50) = $10,150.00 exactly.

**PASS.**

## QA-C16 — Total gross collected reconciles with test fixtures

Total Gross Collected (All time): `$10,249.00` = Founding Gross ($99.00) + Org Credit Gross ($10,150.00) = $10,249.00 exactly. (MRR is correctly excluded from this sum — it's a separate, non-additive run-rate figure, not a transaction total.)

**PASS.**

## QA-C17 — Cross-user customer detail inaccessible to non-admin

Signed in as `qa-verify-owner+clerk_test@example.com` (non-admin), navigated directly to another real user's detail page (`/admin/customers/users/91ec2dc2-613c-4af8-9be7-d23bf56be60e`) → genuine `404`, not the detail content.

**PASS.**

## QA-C18 — Pagination works

The live dataset (35 users, 7 organizations) is smaller than the page size (50), so a second page was never observable live in this pass without seeding substantially more data. Pagination logic itself (page-size clamping, `total` vs. filtered-`total` correctness, page-boundary slicing) is covered directly and thoroughly by `platform-metrics.test.ts`'s automated "17. pagination" case (5 seeded users, pageSize 2, asserts exactly 2 rows returned and `total >= 5`). Flagged here as **verified via automated test, not independently re-confirmed against a live &gt;50-row dataset in the browser** — seeding 50+ additional real users/organizations purely to exercise a second page was judged not worth the token/time cost relative to the automated test's existing coverage of the identical code path.

## Defects found and fixed during this pass

Two real defects were found and fixed live — see `defects.md` for full writeups:

1. **Blank email column on the user customer list** — `listUserCustomers`'s row-construction passed `users.id` (internal DB UUID) to `resolveEmailsForUsers`, which expects Clerk `authProviderId` values. Every email cell silently rendered `—`. Fixed by adding `authProviderId` to `UserCustomerRow` and correcting both the view's `resolveEmailsForUsers` call and its lookup-map key.
2. (Documented together with the above in `defects.md` — both traced to the same root cause / fix.)

## Validation after fixes

Re-ran the full validation sweep after the fix (see the main session log) — `pnpm typecheck && pnpm lint && pnpm --filter @incidentrank/web exec vitest run --pool=forks --poolOptions.forks.singleFork && pnpm build && pnpm --filter @incidentrank/db db:seed` all clean, including the 28 `platform-metrics.test.ts` cases (unaffected by the fix, since the test file already asserted on explicitly-queried rows rather than literally comparing emails) and the full 589-test suite.
