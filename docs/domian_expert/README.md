# IncidentRank — Domain Expert Reference

Start here. This directory exists so a future Claude Code session with zero prior
context can understand IncidentRank well enough to work on it competently and
safely, without re-discovering the whole system from scratch.

**What IncidentRank is**: an engineering-assessment platform. Candidates are
dropped into realistic, simulated production incidents — a deterministic
simulation engine evaluates their actions against authored scenario rules — and
are scored on outcomes, not multiple-choice answers. There are two modes:
**practice** (free-form, candidate-initiated, client-side simulation) and
**company assessment** (an organization invites a candidate to a scored,
server-authoritative assessment the candidate never sees the results of).

## How to use this directory

| File | Read this when you need to understand... |
|---|---|
| `01-architecture.md` | The simulation engine, scenario authoring, scoring, and the golden-path contract. Read first if touching `packages/simulator` or `packages/scenarios`. |
| `02-database.md` | Every table in `packages/db/src/schema.ts`, grouped logically, with `attempts`/`scenarios` in full detail. Read first if touching schema or writing a migration. |
| `03-auth-and-access.md` | Clerk integration, admin portal auth, organization roles, and the practice paid/free access-control model. Read first if touching anything auth-adjacent. |
| `04-runtime-and-billing.md` | Practice vs. assessment runtime split, the terminal-completion convergence point, Stripe billing, admin portal, analytics. |
| `05-features.md` | Weekly Challenge / Challenge-another-engineer, privacy/legal/data-deletion. The most recently built feature areas. |
| `06-conventions.md` | Testing conventions, monorepo/build tooling, and **lessons learned** — real bugs found this way, the patterns that catch them, and what to watch for. |
| `07-docs-map.md` | What already exists under `docs/` and in what order, so you reference existing material instead of re-deriving it. |

## The single most important correction to internalize first

**The completion model is NOT what a surface reading of `docs/architecture.md`
describes.** `docs/architecture.md` stops at Phase 6.1. Phase 7.1
(`docs/implementation_plan/phase7.action.md`) introduced a binding doctrine that
overrides it, quoted verbatim:

> **The system may fail a candidate automatically, but it must never pass a
> candidate automatically.**

Concretely: `packages/simulator/src/tick.ts` **never** writes
`state.status = "resolved"`, for any scenario, regardless of `completionMode`.
The only automatic terminal transition left in the engine is failure via the
35-minute `ATTEMPT_CEILING_MS` ceiling. A scenario's `successCondition` being
sustained only accumulates `consecutiveSuccessSeconds` — reaching "resolved"
requires the candidate to explicitly click **Finish Incident**, which calls
`evaluateCandidateDeclaredFinish()` server-side. This applies to every one of
the ~116 built-in scenarios, not just `candidate_declared`-mode ones. See
`01-architecture.md` for the full mechanics.

If you're about to touch scoring, completion, or the result screen, read that
section before changing anything — this is the most load-bearing, most
recently-changed piece of domain logic in the codebase, and the most likely
thing an outdated mental model gets wrong.

## Standing operational rules (apply regardless of what task you're given)

These aren't written down elsewhere in the repo — they're standing instructions
from the project owner, carried forward here so they survive a session boundary:

- **Never run `db:migrate` or `db:seed` against production.** Only ever run them
  locally. The owner runs prod migrations/seeds themselves, after reviewing what
  you generated.
- **Never trust a background agent's self-report of "all tests passing" /
  "fully verified."** This has been demonstrated wrong more than once this
  project (see `06-conventions.md`'s lessons-learned section). Independently
  re-run typecheck/lint/tests/build yourself before reporting something done.
- **When running the full `apps/web` test suite, always use
  `--pool=forks --poolOptions.forks.singleFork`.** Without it, concurrent
  Vitest workers race each other against the same local Postgres DB on
  tables with partial/global unique indexes, producing spurious failures.
  This flag is not baked into any config — it must be typed by hand every time.
- **A full, clean `apps/web` test run currently has a known baseline of
  pre-existing, unrelated failures** (as of this writing: 3 flaky
  `attempts-list.test.tsx` legal-gate-redirect tests + 16 `admin-auth`/
  `admin-bootstrap`/`admin-users` failures caused by a permanent local
  `owner` row left over from manual QA on this specific machine). This
  baseline is **local-machine-specific, not universal** — confirm the exact
  failure list matches before concluding a change introduced a regression,
  rather than assuming a fixed count.
- This project's `CLAUDE.md` additionally governs all work here: no mock/dummy/
  default data, ever — on failure, surface the failure, don't paper over it
  with a plausible-looking fallback value.
