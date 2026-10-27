# Phase 7.3 Plan — Full User Story & End-to-End Product QA

Source spec: `docs/implementation_plan/phase7_3_full_user_story_e2e_product_qa.md` (authoritative, binding).

## Scope

Product QA, not engine authoring. Exercise IncidentRank as real users will, via the real browser wherever feasible, to find defects unit/catalog/golden-path tests cannot reveal. Fix only what a discovered defect requires — no new features, no deferred-roadmap work (org billing, AI tutors, custom scenario authoring, email/marketing infra, certificates — see spec section 25).

## Environment

- App: Next.js dev server at `http://localhost:3000` (apps/web), already running.
- Browser automation: `claude-in-chrome` MCP tools (no Playwright/Cypress/other E2E framework in this repo — confirmed via environment survey, documented in `execution_log.md`).
- DB: local Postgres via `createDb()`, seeded via `pnpm --filter @incidentrank/db db:seed`.
- Auth: Clerk. Real sign-in requires a real Clerk account — this session will not fabricate authentication or weaken auth to ease QA, per spec section 1.3. Stories that strictly require an authenticated org/candidate identity this session cannot obtain will be marked `BLOCKED_ENVIRONMENT` with exact reason, and covered instead by the existing/added automated route+DB tests that already exercise the real server-side logic with mocked identity (the established pattern in this repo, e.g. `attempt-privacy.route.test.ts`).

## Workspace

```
docs/qa/phase7_3/
  phase7_3_plan.md          (this file)
  user_story_matrix.md      (every story, tracked fields, status)
  execution_log.md          (chronological execution notes + environment survey findings)
  defects.md                (defect tracker)
  coverage_matrix.md        (representative scenario -> story category matrix)
  completion_report.md      (final report, written last)
```

## Representative scenario matrix (built from actual repository data)

| Scenario slug | Difficulty | Free? | Why selected |
|---|---|---|---|
| `cache-eviction-storm` | senior | paid | formerly automatic-completion (Phase 7.1 regression target); senior level |
| `cache-node-failure` | intermediate | paid | plain-paragraph briefing (parser fallback); automatic-failure scenario; intermediate level |
| `payment-retry-storm` | senior | **free** | free scenario; original hand-written flow; well-established alternate-path coverage |
| `kafka-partition-skew` | **staff** | paid | staff-level; sequencing sensitivity (`orderingMode` state field drives acceptable-vs-optimal tier) |
| `cross-region-replication-cost-explosion` | senior_staff | paid | cost-efficiency scenario; ACCEPTABLE vs OPTIMAL tiers |
| `runaway-cloud-spend-during-healthy-traffic` | senior_staff | paid | cost-efficiency; harmful/tempting path with an unsafe floor |
| `expensive-retry-and-logging-amplification` | **senior_staff** | paid | historical/non-resetting damage (peaks survive recovery) |
| `privilege-escalation-via-stale-authorization-cache` | principal | paid | security/authorization-themed scenario content |
| `ml-inference-cost-vs-quality-incident` | principal | paid | model/decision-quality scenario |
| `model-feature-freshness-degradation` | **principal** | paid | decision-quality + historical damage; known alternate-path scenario (#90) |
| `certificate-expiry-across-large-fleet` | senior_staff | paid | alternate strong paths (#98); recovery-lag-sensitive |
| `emergency-capacity-reservation-decision` | principal | paid | #99; alternate strong paths |
| `enterprise-wide-dependency-deprecation` | **principal** | paid | **#100**; long/structured briefing (six numbered invariants); flagship |

13 scenarios, inside the spec's 15-20 target range once stories are allocated across them (several scenarios cover multiple categories, per spec guidance to "prefer reuse"). Covers: free + paid; intermediate/senior/staff/senior_staff/principal; formerly-automatic; automatic-failure; ACCEPTABLE+OPTIMAL; alternate strong paths (#90, #98, #99, #100); historical/non-resetting damage; recovery lag; sequencing sensitivity; cost-efficiency; security/authorization theme; model/decision-quality; long structured briefing (#100); plain-paragraph briefing (`cache-node-failure`).

Exact story-to-scenario mapping lives in `coverage_matrix.md`.

## Execution order

1. Environment survey (auth/seed/E2E tooling availability) — informs which stories are feasible live vs. `BLOCKED_ENVIRONMENT`.
2. Group A (discovery/access) — anonymous, no auth needed.
3. Group B (practice lifecycle) — anonymous/guest practice, no auth needed for the core flow.
4. Group C (persistence/navigation) — guest practice.
5. Group D (result integrity) — guest practice + DB inspection.
6. Groups E/F/G (assessment, authorization failures, access control) — gated on real auth availability; route/DB-level coverage as fallback.
7. Groups H/I/J (resilience, mobile, accessibility) — browser-executable without auth.
8. Group K (content quality) — reviewed per sampled scenario throughout.
9. Defect fix/retest loop as discovered, per spec section 17.
10. Final validation suite (spec section 22).
11. Completion report.

## Severity policy (spec section 16, binding)

No open SEV-0 or SEV-1 at completion. SEV-2 fixed or explicitly accepted with rationale. SEV-3 may be deferred and listed.
