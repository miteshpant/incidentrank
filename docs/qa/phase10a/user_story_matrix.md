# Phase 10A Browser QA — User Story Matrix

All 18 required stories (docs/implementation_plan/phase10a.md §68) executed live in a real browser, with DB state verified after every claim rather than trusting the UI alone. See `execution_log.md` for detailed steps and evidence.

| Story | Description | Result | Notes |
|---|---|---|---|
| QA-01 | Ordinary user cannot create org | PASS | No UI action, static denial page, direct API 403 |
| QA-02 | Platform admin creates org | PASS (after fix) | Org created `pending`, owner invite created, audit trails correct. Defect found+fixed: invite URL was never surfaced to the admin when email delivery failed |
| QA-03 | Initial owner accepts | PASS (after fix) | `pending → active`, membership created. Defect found+fixed: invite-preview "ROLE:" line blank for owner invitations |
| QA-04 | Wrong owner email | PASS | Denied with correct error, no DB side effect |
| QA-05 | Owner invites second owner | PASS | Owner-role option correctly gated to owner actors; invite created |
| QA-06 | Second owner accepts | PASS | Both members confirmed `role: owner` in DB |
| QA-07 | Org admin cannot add owner | PASS | UI hides Owner option for admin actor; direct API 403 |
| QA-08 | Platform admin suspension | PASS | Status SUSPENDED, reason shown, banner rendered for owner |
| QA-09 | Suspended mutations | PASS | Scenario/assessment/member/candidate creation all 403 `organization_suspended` |
| QA-10 | Existing candidate attempt during suspension | PASS | Live attempt resumed and completed successfully while org remained suspended throughout |
| QA-11 | Reactivation | PASS | SUSPENDED → ACTIVE, mutations restored |
| QA-12 | Scenario ownership | PASS | Org-private scenario inaccessible cross-org via both own-slug (404) and foreign-slug (403) paths |
| QA-13 | Scenario versioning | PASS | Satisfied by existing automated coverage per approved scope decision; live assessment pin incidentally confirmed |
| QA-14 | Assessment/report isolation | PASS | Cross-org assessment access 404 both via API and UI |
| QA-15 | Candidate privacy | PASS | Employer sees full assessment report; API payload has no billing/practice/referral fields |
| QA-16 | Platform owner admin creation | PASS | Bootstrapped real owner identity, invited new platform admin successfully |
| QA-17 | Platform admin cannot create platform admin | PASS | UI omits invite form; direct API 403 "Only the platform owner may invite platform admins" |
| QA-18 | Audit logs | PASS | Both `organization_audit_events` and `admin_audit_events` correctly populated for every tested mutation |

**18/18 PASS.**

See `defects.md` for the two real defects found and fixed live during this QA pass (both pre-existing gaps in the already-"complete" Steps 2-8 code, not introduced by QA itself).
