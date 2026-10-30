import type { ScenarioDefinition } from "./types";
import {
  apiMigrationDualWriteFailureSimulation,
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
} from "./api-migration-dual-write-failure/definition";
import { apiMigrationDualWriteFailureCandidateUI } from "./api-migration-dual-write-failure/candidate-ui";
import { API_MIGRATION_DUAL_WRITE_FAILURE_SCORING } from "./api-migration-dual-write-failure/scoring";

/**
 * API Migration Dual-Write Failure — a paid, Principal-level
 * IncidentRank scenario (phase6d.2.md, scenario 70). A migration from
 * Legacy Service/DB to New Service/DB is in partial rollout with
 * dual-write active: the Migration Layer attempts every write against
 * both systems, and some writes succeed only on Legacy while others
 * succeed only on New. Reads are routed by rollout cohort. Customer-
 * facing availability stays high throughout — this incident is a
 * correctness problem hiding behind a healthy-looking dashboard, not an
 * availability problem.
 *
 * Five business invariants govern every decision here:
 *
 *   1. There must be exactly one authoritative write source during
 *      incident containment — dual-write itself is the root mechanism
 *      creating divergence, so leaving both Legacy and New accepting
 *      writes independently is never a safe steady state.
 *   2. Acknowledged writes must not disappear during rollback — a
 *      write that was already accepted and confirmed to a caller must
 *      remain reachable, even if application traffic is later rolled
 *      back off the system that accepted it.
 *   3. Rollback does not automatically repair data already written
 *      only to the new system — rolling back application traffic
 *      changes where NEW requests go, not what already happened to
 *      OLD ones. Any record that only ever landed on New during the
 *      dual-write window remains unreconciled until an explicit
 *      reconciliation process repairs it.
 *   4. Read routing must not expose unresolved divergent state — a
 *      read must never be served from a source that silently omits an
 *      acknowledged write still sitting unreconciled on the other
 *      side.
 *   5. Migration safety is more important than continuing rollout
 *      velocity — increasing rollout percentage while the system is
 *      still dual-writing and actively diverging is never justified
 *      by migration progress alone.
 */
export const apiMigrationDualWriteFailure: ScenarioDefinition = {
  id: "api-migration-dual-write-failure",
  slug: "api-migration-dual-write-failure",
  version: 1,
  name: "API Migration Dual-Write Failure",
  description:
    "A migration from Legacy Service/DB to New Service/DB is in partial rollout. The Migration Layer is dual-writing every request to both systems, but some writes succeed only on Legacy and some succeed only on New — Legacy and New have begun to diverge for a real, growing set of records, even though customer-facing request success rate stays high throughout. Reads are routed by rollout cohort, meaning some customers read from Legacy and some from New depending on which cohort their account was assigned to. Five business invariants govern containment: (1) there must be exactly one authoritative write source at any time — dual-write itself is the mechanism creating divergence; (2) acknowledged writes must not disappear during rollback; (3) rollback does not automatically repair data already written only to the new system — it only changes where new requests go, never what already happened to old ones; (4) read routing must not expose unresolved divergent state — a read must never silently omit an acknowledged write still sitting unreconciled on the other side; (5) migration safety outranks rollout velocity — increasing rollout while the system is still dual-writing and diverging is never justified by migration progress alone. Decide how to freeze write authority to a single source, how to reconcile the historical divergence that already exists before declaring the system safe, and whether the right final destination is a safe rollback to Legacy or a safe, completed migration onto New — both are legitimate outcomes provided the historical backlog has genuinely been resolved first.",
  difficulty: "principal",
  estimatedMinutes: 30,
  isFree: false,
  structure: "linear",
  simulation: apiMigrationDualWriteFailureSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Migration Safety",
      "Dual-Write",
      "Data Integrity",
      "Reconciliation",
      "Rollback",
      "Historical Damage",
    ],
    skills: [
      "Recognizing a correctness incident hiding behind healthy availability metrics",
      "Freezing write authority before attempting any repair",
      "Distinguishing stopping new damage from undoing damage already caused",
      "Avoiding an unsafe rollback-then-read-switch sequence that silently loses acknowledged writes",
      "Choosing between two legitimate strategic end states — safe rollback or safe migration completion",
    ],
    shortDescription:
      "Dual-write divergence grows silently behind a healthy dashboard — rollback alone never repairs it, and read routing can expose or lose acknowledged writes if sequenced wrong.",
  },
};

export {
  apiMigrationDualWriteFailureSimulation,
  apiMigrationDualWriteFailureCandidateUI,
  API_MIGRATION_DUAL_WRITE_FAILURE_SCORING,
  MIGRATION_DIRECTION_KEY,
  READ_SOURCE_KEY,
  RECONCILIATION_MODE_KEY,
  REPAIR_PRIORITY_KEY,
  ROLLBACK_APPLICATION_TRAFFIC_KEY,
  ROLLOUT_PERCENT_KEY,
  SHADOW_TRAFFIC_KEY,
  WRITE_MODE_KEY,
};
