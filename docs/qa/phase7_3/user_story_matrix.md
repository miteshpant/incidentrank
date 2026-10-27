# Phase 7.3 User Story Matrix

Status values: `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED_ENVIRONMENT`, `BLOCKED_DEPENDENCY`, `NOT_APPLICABLE`.

Full per-story detail (preconditions, steps, expected/observed, evidence) lives in `execution_log.md`; this file is the at-a-glance tracker, updated as each story executes.

## Group A — Discovery and entry

| Story | Persona | Status | Defects |
|---|---|---|---|
| A01 — Anonymous opens public scenario | P1 | PASS | |
| A02 — Anonymous encounters protected/premium scenario | P1 | PASS | |
| A03 — Sign-in prompt at correct point | P1 | PASS | |
| A04 — Invalid scenario slug | P1 | PASS | |

## Group B — Practice incident lifecycle

| Story | Persona | Status | Defects |
|---|---|---|---|
| B01 — Start a practice incident | P2 | PASS | |
| B02 — Incident Brief consistency | P2 | PASS | |
| B03 — Golden-path OPTIMAL completion | P5 | PASS | DEFECT-001 (found + fixed) |
| B04 — ACCEPTABLE completion | P4 | PASS | |
| B05 — Premature Finish | P3 | PASS | |
| B06 — Harmful control path | P3 | PASS | |
| B07 — Automatic failure | P3 | PASS | |
| B08 — No automatic success | P3 | PASS | |

## Group C — Resume, refresh, navigation, persistence

| Story | Persona | Status | Defects |
|---|---|---|---|
| C01 — Refresh during active incident | P6 | PASS | DEFECT-002 (found + fixed) |
| C02 — Navigate away and return | P6 | PASS | DEFECT-002 (found + fixed) |
| C03 — Close browser / reopen | P6 | NOT_APPLICABLE | covered by C01/C02's server-authoritative resume fix — no session-local-only state exists to distinguish this from a refresh |
| C04 — Refresh at result screen | P6 | PASS | |
| C05 — Double-click / repeated Finish | P6 | PASS | |

## Group D — Result integrity

| Story | Persona | Status | Defects |
|---|---|---|---|
| D01 — Practice result completeness | P5 | PASS | |
| D02 — Result matches persisted attempt | P5 | PASS | |
| D03 — Historical damage presentation | P3/P5 | PASS | |

## Group E — Assessment candidate lifecycle

| Story | Persona | Status | Defects |
|---|---|---|---|
| E01 — Valid assessment landing | P7 | PASS | |
| E02 — Start assessment | P7 | PASS | |
| E03 — Complete assessment | P7 | PASS | |
| E04 — Direct attempt URL after assessment | P7 | PASS | |
| E05 — Direct attempt API after assessment | P7 | PASS | |
| E06 — Finish API response privacy | P7 | PASS | |
| E07 — Refresh submitted assessment | P7 | PASS | |
| E08 — Candidate attempts practice-result route patterns | P7 | PASS | |

## Group F — Assessment authorization failures

| Story | Persona | Status | Defects |
|---|---|---|---|
| F01 — Wrong candidate | P8 | PASS | |
| F02 — Invalid assessment ID | P8 | PASS | |
| F03 — Assessment already completed | P8 | PASS | |
| F04 — Assessment link after invalidation/expiry | P8 | PASS | |

## Group G — Access control and premium/free behavior

| Story | Persona | Status | Defects |
|---|---|---|---|
| G01 — Free scenario access | P1/P2 | PASS | |
| G02 — Premium scenario without entitlement | P1/P2 | PASS | (covered by A02 — same evidence) |
| G03 — Attempt API authorization | P2 | PASS | |
| G04 — Scenario solution/golden-path isolation | P1/P2 | PASS | DEFECT-004 (found, deferred — SEV-2, accepted with rationale) |

## Group H — Browser resilience and edge behavior

| Story | Persona | Status | Defects |
|---|---|---|---|
| H01 — Back button during incident | P2 | PASS | |
| H02 — Forward/back around result | P2 | PASS | |
| H03 — Slow/repeated actions | P2 | PASS | |
| H04 — Network/API error handling | P2 | PASS | |
| H05 — Stale browser tab | P2/P6 | PASS | documented limitation (independent per-tab simulation; server-safe, no data integrity issue) |

## Group I — Mobile and responsive UX

| Story | Persona | Status | Defects |
|---|---|---|---|
| I — Core mobile/tablet/desktop pass | P10 | PASS | tested at 500px (tooling floor, not 390px)/820px/1440px |

## Group J — Accessibility sanity checks

| Story | Persona | Status | Defects |
|---|---|---|---|
| J — Keyboard/focus/dialog/color sanity pass | P2 | PASS | DEFECT-005 (found + fixed) |

## Group K — Content-quality product checks

| Story | Scenario | Status | Defects |
|---|---|---|---|
| K — Content quality per representative scenario | 17 scenarios sampled | PASS | DEFECT-006 (found + fixed, SEV-3 copy typo) |

## Persona P9 — Organization-side evaluator

Per spec section 3/P9: only test if an evaluator result-view flow already exists; otherwise mark `NOT_APPLICABLE` and document as intentionally deferred. Determined during environment survey.

| Story | Persona | Status | Defects |
|---|---|---|---|
| P9 — Organization evaluator result view | P9 | PASS | |
