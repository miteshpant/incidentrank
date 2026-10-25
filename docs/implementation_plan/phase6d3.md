# IncidentRank — Phase 6D.3 Batch Script

## Scope

Implement and verify exactly these five Phase 6D scenarios:

```text
71 Schema Migration Under Live Traffic
72 Cache Invalidation Across Regions
73 Identity Platform Degradation
74 Authorization Policy Rollout Failure
75 Data Pipeline Freshness Collapse
```

Do not begin Phase 6D.4.

Phase 6D.1 and 6D.2 are approved.

Current baseline before this batch:

```text
70 built-in scenarios
3 free
67 paid

difficulty metadata supports:
beginner
intermediate
senior
staff
senior_staff
principal
```

Keep the same execution discipline:

```text
5 parallel scenario authors
→ 5 independent verifiers
→ orchestrator filesystem verification
→ fresh fix-agent where needed
→ re-verification
→ shared catalog/index wiring
→ batch-wide validation
→ Senior Staff / Principal review gate
```

## 1. Mandatory Author-Side Control Usage Audit

This is a binding Phase 6D.3 requirement.

A recurring defect across 6D.1 and 6D.2 was:

```text
control defined
but never referenced by scenario rules
```

Independent verifiers correctly caught these, but authors should now catch them first.

Before an author reports DONE, they must systematically audit every control key in their scenario.

For every control provide:

| Control | Referenced in rules.ts | Exercised by tests | Action classification/feedback | Notes |
|---|---|---|---|---|

Rules:

```text
Every meaningful control must affect the authored state graph.

A control may not exist merely because it sounds operationally realistic.

Every defined control must:
1. appear in real rule logic,
2. be exercised by at least one test,
3. have action classification/feedback when candidate action consequences are meaningful.
```

If a control does not satisfy this:

```text
wire it into a legitimate mechanic
or
remove it
```

Do NOT create artificial behavior merely to keep a control.

The independent verifier must repeat the same audit from scratch.

## 2. Duplicate-Mechanism Audit

Before coding, each author must compare their scenario against all existing 70 built-ins.

Return:

```text
Closest existing scenarios:
Distinct root failure mechanism:
Distinct dominant mitigation:
Distinct Staff/Principal judgment:
Why this is not a reskin:
```

If root mechanism + dominant mitigation are substantially duplicated:

```text
redesign before coding
```

## 3. Architecture

Use the existing flat architecture model first.

Do not introduce groups/containers/nesting unless a real readability failure is demonstrated.

For each scenario report:

```text
node count
edge count
flat architecture readability verdict
```

If the flat model genuinely fails, stop and return:

```text
Problem:
Affected scenario:
Exact candidate misunderstanding:
Why labels/layout are insufficient:
Smallest generic reusable extension:
Backward compatibility:
```

Do not implement shared architecture changes inside a scenario worker.

## 4. Scenario 71 — Schema Migration Under Live Traffic

Slug:

```text
schema-migration-under-live-traffic
```

Difficulty:

```text
principal
```

Architecture:

```text
Clients
  ↓
Load Balancer
  ↓
Old App Fleet
New App Fleet
  ↓
Shared Database
  ↓
Backfill / Migration Workers
```

Optional only if genuinely needed:

```text
Job Queue
Feature Flag Service
```

Incident:

A database schema migration is in progress while old and new application versions are both serving traffic.

The migration is only partially backward/forward compatible.

Possible interacting symptoms:

- new app writes a field old app cannot safely interpret
- old app writes rows missing data expected by new app
- migration/backfill workers create DB lock pressure
- retries increase write pressure
- rollout continues while compatibility is already broken

The system should remain partially available, making rollback/non-rollback decisions non-trivial.

Business invariants:

```text
Rows written during mixed-version operation must remain readable by the currently-serving application fleet.

Acknowledged writes may not be discarded to make rollback easier.

A schema rollout may be paused or slowed.

Backfill completion is less important than customer correctness.

The migration must not leave the database in a state that only one app version can interpret unless traffic has been safely fenced to that version.
```

Controls may include:

- app rollout percentage
- feature flag for new write format
- migration phase
- backfill concurrency
- DB lock timeout
- compatibility write mode
- rollback
- retry policy

Strong path should require reasoning similar to:

```text
stop creating incompatible state
→ establish compatible write behavior
→ control rollout
→ protect DB from backfill/lock pressure
→ reconcile/backfill safely
→ verify compatibility
→ resume or rollback deliberately
```

Tempting unsafe paths:

```text
rollback app fleet immediately while new-format-only rows already exist

continue rollout to "finish faster"

increase backfill workers during DB lock pressure
```

Historical damage is required. Once incompatible rows are created, fixing current configuration must not magically erase them.

Recovery lag is required.

## 5. Scenario 72 — Cache Invalidation Across Regions

Slug:

```text
cache-invalidation-across-regions
```

Difficulty:

```text
senior_staff
```

Architecture:

```text
Global API
  ├─ US Cache
  ├─ EU Cache
  └─ APAC Cache
        ↓
     Origin Store
        ↑
Invalidation Stream / Publisher
```

Incident:

A cache invalidation stream is delayed in one region, duplicated/replayed in another, and healthy in the third.

Potential interaction:

- bypassing cache improves freshness but overloads origin
- invalidating everything causes a revalidation/origin surge
- raising TTL protects origin but increases staleness
- replaying invalidations blindly may repeatedly evict healthy caches

Business invariants:

```text
Critical writes must become globally visible within the authored freshness bound.

A bounded stale-read window may be acceptable for selected data classes.

Origin capacity must be protected.

Regional isolation is preferable to global origin collapse.

Invalidation replay must not create unbounded revalidation pressure.
```

Candidate-visible signals may include:

- cache hit ratio by region
- stale-read rate by region
- origin QPS
- origin latency
- invalidation lag by region
- invalidation replay/duplicate count
- regional customer freshness

Controls may include:

- cache bypass by region
- TTL
- invalidation replay mode
- origin concurrency
- stale-while-revalidate
- regional invalidator isolation
- refresh concurrency
- traffic routing

A globally disabling-cache response should be harmful.

A legitimate acceptable state may intentionally leave one region serving bounded stale data while invalidation catches up.

Recovery lag required.

## 6. Scenario 73 — Identity Platform Degradation

Slug:

```text
identity-platform-degradation
```

Difficulty:

```text
principal
```

Architecture:

```text
Clients
  ↓
API Gateway
  ↓
Authentication Orchestrator
  ├─ Session Store
  ├─ Token Verification
  ├─ MFA Provider
  ├─ Risk Engine
  └─ User Directory
```

Incident:

At least two things happen concurrently:

```text
MFA Provider degrades
Session Store pressure rises
```

Token verification remains healthy.

Business invariants:

```text
Existing valid tokens may be verified without forcing unnecessary MFA.

High-risk authentication may not bypass mandatory MFA.

Fail-open is not permitted for privileged/high-risk actions.

Low-risk users may enter a bounded degraded mode only if policy explicitly allows it.

Session-store relief must not invalidate active sessions unnecessarily.
```

Controls may include:

- MFA policy by risk tier
- session TTL
- token-only continuation
- session cache
- login concurrency
- risk-check policy
- privileged-action mode
- MFA retry/backoff

Tempting unsafe path:

```text
broad MFA bypass
```

This should improve dashboards while violating security.

Safe degraded state encouraged:

```text
existing valid-token sessions continue
low-risk login may use explicitly allowed degraded flow
high-risk/privileged login remains protected or temporarily unavailable
```

If unsafe authentication is ever permitted, record a cumulative security/correctness consequence that does not disappear when policy is restored.

## 7. Scenario 74 — Authorization Policy Rollout Failure

Slug:

```text
authorization-policy-rollout-failure
```

Difficulty:

```text
principal
```

Architecture:

```text
Requests
  ↓
API Gateway
  ↓
Policy Decision Point
  ├─ Policy Store
  ├─ Identity Context
  └─ Resource Metadata

Policy Rollout / Cache Distribution
```

Incident:

A policy rollout introduces selective false-denies while some caches still contain the previous policy version.

Business invariants:

```text
Unauthorized access must never be granted to reduce false-denies.

Critical resources default fail-closed.

A rollback is not complete until policy version convergence is verified.

Mixed policy versions across the fleet must be observable and bounded.

Availability loss is preferable to unauthorized access for protected resources.
```

Controls may include:

- policy rollout percentage
- policy version pin
- rollback
- cache invalidation
- fail-open/fail-closed mode by resource class
- policy cache TTL
- staged cohort
- emergency deny/allow list

Principal sequencing required:

```text
freeze rollout
→ pin known-good policy
→ invalidate/refresh caches
→ verify convergence
→ restore rollout gradually
```

Unsafe examples:

```text
turn fail-open on globally
```

or:

```text
rollback source policy
→ assume caches are already converged
```

If unauthorized access occurs, record it cumulatively.

Alternate strong paths encouraged:
- safe rollback to known-good version
- safe forward-fix with version pin + staged re-rollout

## 8. Scenario 75 — Data Pipeline Freshness Collapse

Slug:

```text
data-pipeline-freshness-collapse
```

Difficulty:

```text
senior_staff
```

Architecture:

```text
Source Systems
   ↓
Ingestion
   ↓
Stream Processor
   ↓
Warehouse
   ↓
Serving Layer / Reports
```

Incident:

Ingestion remains healthy while stream processing falls behind.

Scaling processors increases Warehouse write contention.

Different datasets have different business-critical freshness requirements.

Business invariants:

```text
Tier-1 operational datasets must remain within the authored freshness SLO.

Lower-priority analytical datasets may lag substantially during the incident.

Events may not be dropped merely to make lag metrics look better.

Warehouse correctness and durability must be preserved.

A backlog may be acceptable if it is bounded and demonstrably draining.
```

Controls may include:

- processor concurrency
- dataset priority
- low-priority ingestion throttle
- batch size
- Warehouse writer concurrency
- checkpoint cadence
- backpressure
- serving freshness mode

Scaling processors alone should worsen the incident.

Safe degraded state strongly encouraged:

```text
Tier-1 data within SLO
lower-priority datasets delayed
backlog bounded and draining
warehouse safe
```

Recovery lag required.

## 9. Batch Complexity Requirements

Across the five scenarios:

```text
all 5 genuinely multi-step

at least 4 sequencing-sensitive

all 5 contain pressure transfer

all 5 contain recovery lag

at least 3 contain cumulative/historical correctness or security damage

at least 3 support a legitimate degraded-but-safe state

at least 3 support more than one defensible strong resolution path
```

Do not fabricate behavior to hit quotas. Document honest deviations.

## 10. Completion Modes

Audit every scenario after its state graph is authored.

Do not preassign all five to candidate_declared.

For candidate-declared scenarios define:

```text
UNSAFE
ACCEPTABLE
OPTIMAL
```

if ACCEPTABLE genuinely exists.

No fake acceptable tier.

## 11. Immediate-Finish Audit

For every candidate-declared scenario test:

```text
trigger incident
take zero action
Finish
```

Expected default:

```text
declared_unstable
```

## 12. Historical Damage Doctrine

For applicable scenarios:

```text
fixing current configuration
must not erase already-incurred damage
```

Differentiate:

```text
current unsafe condition
historical incurred damage
recoverable backlog
irreversible consequence
```

## 13. Pressure Transfer

Every scenario must contain at least one real authored transfer.

Examples:

```text
71 more backfill workers
→ DB lock/write pressure

72 bypass caches globally
→ origin overload

73 broad retries/session recreation
→ session store or MFA overload

74 fail-open
→ security correctness loss

75 scale processors
→ Warehouse contention
```

Tests must prove transferred pressure.

## 14. Recovery Lag

Every scenario should include a real lagging recovery process where semantically appropriate.

Examples:

```text
71 compatibility backfill / row repair
72 invalidation catch-up / cache warmup
73 session-store pressure decay
74 policy cache convergence
75 pipeline backlog drain
```

A correct action should not instantly turn the whole system green.

## 15. Scoring

Use only the shared six-dimension declarative scorer:

```text
Recovery                 300
Customer Impact          200
Data Integrity           200
Reliability              150
Cost Efficiency          100
Operational Efficiency    50
                         ----
                         1000
```

For every scenario execute and report:

```text
optimal
acceptable (if real)
baseline
harmful
alternate strong path (if real)
```

Completion report must contain exact totals.

## 16. Score Sanity Audit

Every author must explicitly check:

```text
harmful < baseline where harmful creates net worse system state

availability-good / correctness-bad path is strongly penalized

acceptable does not accidentally dominate optimal without semantic reason

unsafe security/correctness paths do not score near optimal

zero-action baseline does not score suspiciously high
```

If acceptable and optimal tie, explain why.

## 17. Action Feedback

100% coverage for meaningful action classification rules.

Feedback should explain:

```text
what changed
what improved
what pressure moved elsewhere
what invariant was protected or violated
what historical consequence was created
```

## 18. Author Self-Verification

Before reporting DONE, every author must personally run:

```text
scenario tests
definition validation
control-usage audit
dead-control grep
action-classification coverage check
scoring path execution
immediate-Finish test if candidate_declared
determinism test
duplicate-mechanism comparison
```

Author must include evidence.

## 19. Independent Verifier Contract

Each verifier must inspect actual files and run tests.

Return VERIFIED or REJECTED with evidence for:

1. all scenario files exist
2. definition validates
3. metadata correct
4. architecture understandable
5. duplicate-mechanism audit credible
6. every control referenced by real rule logic
7. every control tested
8. no dead controls
9. business invariants candidate-visible
10. multi-step behavior genuine
11. sequencing genuine where claimed
12. pressure transfer real
13. recovery lag real
14. historical damage non-resetting where claimed
15. completion mode justified
16. immediate-Finish safe
17. scoring paths execute
18. harmful path actually harmful
19. feedback coverage complete
20. determinism passes
21. scenario genuinely Senior Staff/Principal

Any dead control = REJECT.

## 20. Fix-Agent Rule

If verifier rejects a scenario:

```text
use a fresh scoped fix-agent
not the original author
```

Then orchestrator must re-grep, re-run scenario tests, and re-run verifier checks before shared wiring.

## 21. Manual QA Priority

Run live browser QA for at least:

A. Schema Migration Under Live Traffic  
B. Identity Platform Degradation  
C. Authorization Policy Rollout Failure  
D. Data Pipeline Freshness Collapse  

Also run Cache Invalidation Across Regions or one additional scenario as the fifth live case.

Verify:

- architecture readable
- business invariants visible
- first mitigation does not solve everything magically
- sequencing works
- pressure transfer visible
- recovery lag visible
- historical damage behaves correctly
- Finish semantics correct
- action feedback appears only post-incident in practice

## 22. Security QA

For #73 and #74 explicitly test unsafe availability-maximizing paths.

Verify:

- availability may improve
- security/correctness invariant is violated
- historical security consequence accumulates if applicable
- Data Integrity/Reliability materially penalized
- scenario cannot resolve as safe
- Finish returns unstable

## 23. Migration QA

For #71 explicitly test:

```text
unsafe rollback before compatibility repair
```

and:

```text
safe compatibility-first path
```

If the same final config can be safe or unsafe depending on history, verify explicitly.

## 24. Catalog Wiring

Workers must not touch:

```text
packages/scenarios/src/library/catalog.ts
packages/scenarios/src/index.ts
shared simulator engine
shared scoring engine
shared architecture types
```

Only orchestrator wires scenarios after verification passes.

Expected after 6D.3:

```text
75 built-in scenarios
3 free
72 paid
```

## 25. Validation

Run:

```text
pnpm --filter @incidentrank/scenarios typecheck
pnpm --filter @incidentrank/scenarios lint
pnpm --filter @incidentrank/scenarios test
```

Then:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @incidentrank/db db:seed
```

Required:

```text
0 failing tests
```

Expected seed:

```text
Seed complete (75 built-in scenario(s)).
```

## 26. Phase 6D.3 Completion Report

Return:

1. exact scenarios 71–75
2. files created/modified
3. duplicate-mechanism audit per scenario
4. difficulty classifications
5. architecture node/edge counts
6. flat-readability verdicts
7. author control-usage audit tables
8. verifier independent dead-control audit results
9. completion modes
10. unsafe/acceptable/optimal states
11. business invariants
12. historical-damage model
13. multi-step path
14. sequencing audit
15. pressure-transfer audit
16. recovery-lag audit
17. tempting unsafe paths
18. legitimate degraded modes
19. alternate strong paths
20. immediate-Finish audit
21. exact scoring table for all 5
22. suspicious-score investigations
23. feedback coverage
24. test count per scenario
25. verifier verdicts
26. fix-agent changes if any
27. orchestrator filesystem verification
28. manual QA results
29. security QA results
30. migration QA result
31. package tests
32. full test count
33. typecheck
34. lint
35. build
36. seed
37. deviations
38. product/UX concerns
39. Senior Staff / Principal quality assessment per scenario
40. recurring authoring-process issues, if any

## 27. Senior Staff / Principal Acceptance Test

For each scenario answer:

```text
What is the misleading first symptom?
What is the real failure domain?
What business invariant constrains the candidate?
What first mitigation is plausible?
What new pressure/risk does that mitigation create?
What second or third action is required?
What historical state may remain after the root cause is fixed?
What is the tempting availability-maximizing but unsafe path?
What is a legitimate degraded-but-safe state?
Could a strong Senior engineer solve this by randomly trying controls?
```

If the last answer is yes, redesign.

## 28. Stop Condition

Phase 6D.3 is complete only when:

```text
75 built-in scenarios exist
3 free
72 paid
5 new scenarios fully authored
all independently verified
dead-control author-side audit complete
manual QA complete
security QA complete
migration QA complete
all tests green
seed reports 75
```

Stop.

Do not begin Phase 6D.4 until the completion report is reviewed.
