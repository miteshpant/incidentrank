# Phase 10C Browser QA Plan — Engineer Rank + Global Leaderboard (Batch 1)

Scope: the 14 required Rank/leaderboard stories (QA-R01–QA-R12 per `docs/implementation_plan/phase10c.md` §62, plus QA-R13/QA-R14 for the user-requested global leaderboard — new scope beyond the base spec, see the plan file's "Global Engineer Rank Leaderboard" section).

Platform Customer & Revenue Dashboard QA (QA-C01–QA-C18) is Batch 2 scope and tracked separately once that batch is implemented.

## Required stories

| Story | Description |
|---|---|
| QA-R01 | New user with no attempts → no established Rank |
| QA-R02 | One excellent attempt → provisional result only |
| QA-R03 | Multiple qualifying attempts → established rank |
| QA-R04 | Higher-difficulty evidence changes normalized rank appropriately |
| QA-R05 | Repeated same scenario cannot dominate |
| QA-R06 | Skill/domain breadth appears |
| QA-R07 | Assessment attempt excluded |
| QA-R08 | Personal payment status does not affect Rank |
| QA-R09 | Rank updates after new qualifying practice completion |
| QA-R10 | Historical progression preserved |
| QA-R11 | Organization owner cannot see candidate's personal Engineer Rank by default |
| QA-R12 | Rank rebuild produces deterministic equivalent result |
| QA-R13 | Opted-in user with established rank appears correctly on `/leaderboard` |
| QA-R14 | Opted-out user never appears on the public leaderboard regardless of rank strength |

See `execution_log.md` for full step-by-step evidence and `defects.md` for the one real defect found and fixed during this pass.
