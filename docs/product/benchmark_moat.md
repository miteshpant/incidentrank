# Benchmark Moat

Phase 10E (`docs/implementation_plan/phase10e.md` §44). Documents why IncidentRank is deliberately building a structured benchmark of production-engineering judgment — not merely a practice product with a leaderboard bolted on — and why that benchmark is intended to become the company's defensible long-term asset.

## The moat, stated plainly

> The benchmark is intended to become IncidentRank's defensible asset.

Any competitor can build incident-simulation scenarios. What is much harder to replicate is a large, growing, calibrated corpus of **how real engineers actually make decisions under pressure, measured against known outcomes** — which action sequences resolve an incident, which ones make it worse, how long resolution typically takes at each difficulty level, how first-attempt performance differs from repeat-attempt performance. That corpus only exists if engineers actually complete real attempts, in volume, over time. It cannot be purchased, scraped, or shortcut — it has to be earned through genuine usage.

## The compounding loop

```
More engineers
→ more first-attempt structured evidence
→ better calibration
→ better Rank
→ more engineer trust
→ more employer trust
→ more assessments
→ more validation
→ stronger benchmark
```

Each stage reinforces the next:

- **More engineers** practicing means more raw qualifying attempts flowing into `benchmark_attempt_facts`/`benchmark_action_facts` (Phase 10E Part B).
- **First-attempt evidence is weighted most heavily** (`isFirstAttempt`, `attemptNumberForScenario`) because a first attempt reflects genuine, uncoached judgment — the signal the benchmark actually needs, not a memorized solution path.
- **Better calibration** — accurate resolved/failed/timed-out percentages, median scores, median durations, dimension medians, per scenario — only becomes statistically meaningful at volume (see the sample-quality thresholds in `sample-quality.ts`: under 10 first attempts is explicitly labeled "insufficient data," never silently presented as confident).
- **Better Engineer Rank** follows directly from better-calibrated scenarios — a rank band means more when it is measured against a large, real population rather than a handful of early testers.
- **Engineer trust** increases once Rank is visibly well-calibrated and the leaderboard reflects a real, sizeable population rather than a thin early set.
- **Employer trust** follows engineer trust — a hiring signal is only valuable to a company if they believe the underlying population and calibration are real.
- **More assessments** follow from employer trust, which brings in revenue (organization assessment credits) and — critically for this loop — do NOT themselves feed back into the benchmark (Phase 10E Part B explicitly excludes assessment attempts from benchmark materialization, §24). Assessments validate the product; only practice attempts feed the moat.
- **More validation** (both engineer-side evidence and employer-side willingness to pay for assessments) reinforces the case for even more engineers to join, closing the loop.

## Why this is defensible, not just a feature

A competitor who copies IncidentRank's scenario library starts at zero on the one thing that actually compounds: real attempt history. They can match the product surface on day one; they cannot match five years of calibrated first-attempt evidence on day one, no matter how much capital they have, because that evidence can only be produced by real engineers making real decisions over real time. This is the same structural advantage any evidence-driven platform has — the data asset itself, not the UI around it, is what's hard to replicate.

## What this means for product and engineering decisions going forward

- Every decision that increases genuine (not gamed) first-attempt volume strengthens the moat — this is a first-order consideration, not an afterthought, when evaluating pricing, discounts, or onboarding changes.
- Benchmark data integrity matters more than benchmark data velocity: a materialization bug that silently corrupts evidence is strategically worse than a slow rollout, which is why Phase 10E's design insists benchmark materialization can never destroy or roll back a legitimate completed attempt (§27), and why every fact row is versioned (`scoringVersion`, `rankAlgorithmVersion`, `benchmarkProjectionVersion`) so a future methodology change never silently reinterprets old evidence.
- Privacy discipline is not in tension with the moat — it is what makes the moat sustainable. A benchmark built on data engineers don't trust to be pseudonymous and non-identifying is a benchmark engineers will stop contributing to. Phase 10E's pseudonymous-subject design (`benchmark_subjects`, no displayName/email/Clerk-id duplication anywhere in the fact tables) exists precisely so growing the benchmark never requires trading away engineer trust.
