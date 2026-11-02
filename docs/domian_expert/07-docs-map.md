# Map of Existing Documentation

Don't re-derive what's already written down. This file tells you what exists
under `docs/` and roughly what order it was built in, so you can go read the
primary source instead of guessing.

## `docs/architecture.md` (1539 lines)

Covers Phase 0 through Phase 6.1 only. Authoritative for the 7 founding
architectural principles (Deterministic Simulation, Simulator Independence,
Event History, Outcome-Based Scoring, User vs. Candidate, Scenarios Are
Authored Not Simulated Infrastructure, Candidate Reasoning Is Recorded Not
Evaluated) and for detailed design rationale through Phase 6.1. **Does not
cover anything from Phase 6B onward** — that only exists in
`docs/implementation_plan/`. No master index file exists there; chronology
below is inferred from filenames and content.

## `docs/implementation_plan/` — ~55 phase/spec files + `outputs/` (~29 completion reports)

No README/index exists in this directory. Approximate chronological order
(each phase's own `.md` is the spec; its match in `outputs/` or a same-named
`*_completion.md` is the retrospective of what actually shipped):

1. `phase0.md` — product foundation, placeholder types.
2. `phase1.md` — first real scenario (Payment Retry Storm), rules engine.
3. `phase2.md` — incident playground UI, in-memory only.
4. `phase2.1.md` — candidate reasoning + pre-incident countdown.
5. `phase3.md` — accounts (Clerk), Postgres/Drizzle, 0–1000 scoring, attempt
   persistence, leaderboard.
6. `phase4.md`, `phase4a.md` — B2B assessment workflow, organizations,
   assessment candidates.
7. (Phase 4.1 — attempt resume, deterministic replay, checkpointing — only
   its completion report exists in `outputs/`, no standalone plan file.)
8. `phase5.md`, `phase5a.md` — scenario authoring (org-authored JSON),
   generic candidate UI.
9. `phase5.2.md` — organization membership/invitations/roles.
10. `phase6.md` — scenario library scale-out (2→20 scenarios), generic
    scoring engine, scoped slug uniqueness, practice access model,
    dev-unlock.
11. `phase6.1.md` — candidate-declared completion mode, two-tier
    optimal/acceptable, post-incident feedback, Finish Incident API.
    **(This is the last phase `docs/architecture.md` covers.)**
12. `phase6b.md`, `phase6b.1.md` — scenarios 21–40, 4 gated batches.
13. `phase6c.md` — scenarios 41–60, 4 gated batches.
14. `phase6d.md`, `phase6d.2.md`, `phase6d.4.md`, `phase6d3.md`,
    `phase6dsupport.md`, `phase-6d4-scoring-closeout.md` — scenarios 61–80
    (Principal/Senior-Staff tier) + scoring closeout addenda.
15. `phase6e2.md`, `phase6e3.md`, `phase-6e-strategy-spec.md`,
    `phase-6e1-scoring-closeout.md`, `phase-6e3-scoring-closeout.md`,
    `phase-6e4.md` — scenarios 81–100 (final launch batch) + strategy spec
    + scoring closeouts.
16. `incidentrank-100-scenario-release-closeout.md` — the 100-scenario
    catalog completion milestone.
17. `phase7.action.md` + `phase-7-1-7-2-product-integrity-solvability.md` —
    **the completion-model correction** (remove automatic success
    universally, candidate-safe assessment response model) + golden-path
    fixture registry / 100/100 solvability proof. **Read `01-architecture.md`
    in this directory before assuming anything about completion/scoring
    predates this.**
18. `phase7_3_full_user_story_e2e_product_qa.md` — full end-to-end
    user-story QA pass.
19. `phase8_admin_promotional_access_referrals.md` + `phase8loc.md`
    (corrections — "take precedence wherever the two disagree") — admin
    bootstrap, promotional invites, Incident Passes, referral growth loop.
20. `phase9.md` — Stripe payments: personal Pro/Founding entitlements,
    Founding capacity allocation, webhooks.
21. `phase10a.md` — organization governance (admin-provisioned orgs,
    suspend/reactivate, owner-recovery invites).
22. `phase10b.md` — organization assessment credit ledger/billing.
23. `phase10c.md` — Engineer Rank + admin customer/revenue dashboard +
    global leaderboard.
24. `phasse10d.md` *(typo in the real filename — don't "fix" it, that's the
    actual name)* — privacy/terms/data-minimization/consent layer (legal
    acceptances, account deletion, privacy requests).
25. `phase10e.md` — benchmark data foundation + launch discounts.
26. `phase10f.md` — `structure`/`domain` scenario metadata, the first
    deliberately-parallel-structured reference incident.
27. `phase10g.md` + `phase10g.metrics.md` — first-party funnel analytics
    (the `ANALYTICS_EVENT_NAMES` vocabulary), 15 new weekly-batch scenarios,
    the built-in-scenario validation contract (`validateBuiltInScenario`),
    difficulty taxonomy.
28. `phase-challege-version.md` *(typo in the real filename, same note)* —
    Weekly Challenge + 1:1 Challenge social growth-loop feature.
29. `phase_visitor_impove.md` *(typo in the real filename, same note)* —
    homepage conversion improvements + company inquiry/contact form.
30. `beta_readiness_report.md` — cross-cutting beta-launch readiness
    assessment, likely the most recent/overarching status document.

Every phase's completion report in `outputs/` is where to look for "what
actually shipped, what was found during verification, what's a known
limitation" — the plan file itself is the intent, the completion report is
the reality.

## `docs/privacy/`

4 files: `data_inventory.md`, `data_retention.md`,
`privacy_security_review.md`, `service_providers.md`. See `05-features.md`
for a summary of the first two.

## `docs/product/`

`benchmark_moat.md`, `beta_monetization_strategy.md` — product strategy
docs, not phase-numbered.

## `docs/qa/`

Per-phase QA plans/execution logs/defect lists/user-story matrices, mirroring
the phase numbering above, for phases `7_3`, `8`, `9`, `10a`, `10b`, `10c`,
`10d`.

## `docs/scenarios/`

`payment-retry-storm.md` — the original Phase 1 scenario design doc.

## This directory: `docs/domian_expert/`

(Yes, "domian" — that's the actual directory name the project owner created;
don't rename it.) You're reading it now. If you add a major new feature
area, consider adding a new numbered file here or extending the relevant
existing one, rather than letting this reference doc drift out of date.
