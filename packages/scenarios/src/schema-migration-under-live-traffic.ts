import type { ScenarioDefinition } from "./types";
import {
  schemaMigrationUnderLiveTrafficSimulation,
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
} from "./schema-migration-under-live-traffic/definition";
import { schemaMigrationUnderLiveTrafficCandidateUI } from "./schema-migration-under-live-traffic/candidate-ui";
import { SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING } from "./schema-migration-under-live-traffic/scoring";

/**
 * Schema Migration Under Live Traffic — a paid IncidentRank Principal
 * scenario (docs/implementation_plan/phase6d3.md, scenario 71). A
 * database schema migration is in progress while Old App Fleet and New
 * App Fleet both serve real traffic against one Shared Database, and
 * the migration is only partially backward/forward compatible: New App
 * Fleet's code depends on a new field that Old App Fleet cannot safely
 * interpret, so rows written while compatibility write mode is still
 * "legacy-shape" end up carrying only the new field — a real,
 * accumulating backlog of rows one or the other fleet cannot correctly
 * read. Backfill/migration workers can repair this backlog, but running
 * them aggressively competes with live traffic for the Shared
 * Database's lock and write capacity. The candidate must distinguish a
 * calm-looking dashboard from a real, growing correctness problem, and
 * must sequence containment (stop creating incompatible rows), rollout
 * control, database protection, and backfill correctly rather than
 * reaching for the fastest-looking fix.
 *
 * Business invariants (stated explicitly, never left as a hidden
 * success condition): rows written during mixed-version operation must
 * remain readable by the currently-serving application fleet;
 * acknowledged writes may not be discarded to make rollback easier; the
 * schema rollout may be paused or slowed; backfill completion is less
 * important than customer correctness; the migration must not leave the
 * Shared Database in a state only one app version can interpret unless
 * traffic has been safely fenced to that version.
 */
export const schemaMigrationUnderLiveTraffic: ScenarioDefinition = {
  id: "schema-migration-under-live-traffic",
  slug: "schema-migration-under-live-traffic",
  version: 1,
  name: "Schema Migration Under Live Traffic",
  description:
    "A database schema migration is in progress while Old App Fleet and New App Fleet both serve real production traffic against one Shared Database. The migration is only partially backward/forward compatible: New App Fleet depends on a new field that Old App Fleet cannot safely interpret, and rows already written with only the new field are starting to accumulate. Backfill/migration workers can repair this backlog, but running them aggressively competes with live traffic for the database's lock and write capacity. Business invariants: rows written during mixed-version operation must remain readable by the currently-serving application fleet. Acknowledged writes may not be discarded to make rollback easier. A schema rollout may be paused or slowed. Backfill completion is less important than customer correctness. The migration must not leave the database in a state that only one app version can interpret unless traffic has been safely fenced to that version. Diagnose whether the system is actually safe before deciding whether to roll back, continue, or hold.",
  difficulty: "principal",
  estimatedMinutes: 20,
  isFree: false,
  simulation: schemaMigrationUnderLiveTrafficSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Schema Migration", "Expand/Contract", "Rollback", "Backfill", "Data Integrity"],
    skills: [
      "Recognizing row-shape/schema incompatibility hiding behind a healthy availability dashboard",
      "Sequencing containment, rollout control, database protection, and backfill correctly",
      "Distinguishing a frozen-but-unrepaired backlog from a genuinely safe handback state",
      "Evaluating rollback safety as a function of history, not just the current configuration",
    ],
    shortDescription:
      "Old and new app versions are writing incompatible row shapes to one shared database mid-migration, and rollback is not automatically safe.",
  },
};

export {
  schemaMigrationUnderLiveTrafficSimulation,
  schemaMigrationUnderLiveTrafficCandidateUI,
  SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING,
  APP_ROLLOUT_PERCENT_KEY,
  BACKFILL_CONCURRENCY_KEY,
  COMPATIBILITY_WRITE_MODE_KEY,
  DB_LOCK_TIMEOUT_MODE_KEY,
  MIGRATION_PHASE_KEY,
  RETRY_POLICY_KEY,
  ROLLBACK_APP_FLEET_KEY,
};
