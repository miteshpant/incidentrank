# Phase 10C Browser QA Plan — Platform Customer & Revenue Dashboard (Batch 2)

Scope: the 18 required dashboard stories (QA-C01–QA-C18) per `docs/implementation_plan/phase10c.md` §63.

## Required stories

| Story | Description |
|---|---|
| QA-C01 | Platform admin opens dashboard and sees total users/orgs |
| QA-C02 | Normal user cannot access |
| QA-C03 | Free user appears with $0 spend |
| QA-C04 | Pro user shows correct plan/status and purchase history |
| QA-C05 | Founding user shows lifetime status and correct spend |
| QA-C06 | Organization with single-credit purchase shows correct spend/credits |
| QA-C07 | Organization with 110-credit pack shows correct spend/credits |
| QA-C08 | Org credit consumption changes used/available but not purchased revenue |
| QA-C09 | Search user by email |
| QA-C10 | Search organization by name/slug |
| QA-C11 | Search Stripe customer ID |
| QA-C12 | Suspended org clearly marked |
| QA-C13 | MRR excludes Founding and org credits |
| QA-C14 | Founding gross revenue correct |
| QA-C15 | Org-credit gross revenue correct |
| QA-C16 | Total gross collected reconciles with test fixtures |
| QA-C17 | Cross-user customer detail inaccessible to non-admin |
| QA-C18 | Pagination works |

See `dashboard_execution_log.md` for full step-by-step evidence (live against the running dev server and real, pre-existing data from the Phase 9/10A/10B QA sessions — no synthetic fixtures needed, since those sessions already left a rich, realistic dataset: 35 users, 7 organizations, real Pro/Founding entitlements, real org credit purchases/consumption/suspension history) and `defects.md` for the two real defects found and fixed during this pass.
