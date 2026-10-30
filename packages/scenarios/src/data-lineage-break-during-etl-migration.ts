import type { ScenarioDefinition } from "./types";
import {
  dataLineageBreakDuringEtlMigrationSimulation,
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
} from "./data-lineage-break-during-etl-migration/definition";
import { dataLineageBreakDuringEtlMigrationCandidateUI } from "./data-lineage-break-during-etl-migration/candidate-ui";
import { DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING } from "./data-lineage-break-during-etl-migration/scoring";

/**
 * Data Lineage Break During ETL Migration — a paid, Principal-level
 * IncidentRank scenario (Phase 6E.3). A migration from ETL v1 to ETL v2
 * is in progress. Numbers remain "available" — dashboards render,
 * reports generate, nothing is down — but LINEAGE becomes inconsistent
 * across the old and new ETL paths: some downstream metrics are
 * silently computed from a mix of v1-derived and v2-derived data, or the
 * same metric diverges depending on which path produced it, without any
 * visible error. This is a TRUST/CORRECTNESS incident hiding behind a
 * fully "available" system, not an availability incident.
 */
export const dataLineageBreakDuringEtlMigration: ScenarioDefinition = {
  id: "data-lineage-break-during-etl-migration",
  slug: "data-lineage-break-during-etl-migration",
  version: 1,
  name: "Data Lineage Break During ETL Migration",
  description:
    "A migration from ETL v1 to ETL v2 is in progress. Sources remain fully available, Warehouse writes keep succeeding, and Reports keep generating on schedule — but lineage is becoming inconsistent across the two ETL paths, and nothing about availability signals it. Four business invariants govern every decision here: (1) a report or metric must never silently mix v1-derived and v2-derived data within the same computed value; (2) migration cutover must be traceable and auditable per source/metric, not an opaque global flip; (3) stakeholders consuming a metric whose lineage is currently inconsistent must be able to know that through a visible untrusted/flagged state, never be silently served a wrong number with full confidence styling; (4) once a report has been served with inconsistent lineage, that exposure is a real, non-resetting historical consequence even after the lineage is later fixed. Decide how to manage the cutover so lineage stays traceable and consistent — cutting over per-source in controlled, auditable stages, or running both paths in parallel and reconciling before declaring a source cut over — whether specific metrics or reports should be flagged untrusted until their full lineage path completes migration, and whether tearing down the legacy path early is worth losing the only reconciliation and rollback reference for sources not yet verified.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: dataLineageBreakDuringEtlMigrationSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Data Lineage",
      "ETL Migration",
      "Data Trust",
      "Analytics Platform",
      "Historical Damage",
      "Cost Efficiency",
    ],
    skills: [
      "Distinguishing system availability from data-lineage/trust risk",
      "Recognizing that healthy dashboards and reports can mask a silent correctness problem",
      "Choosing between staged per-source cutover and dual-write-and-reconcile migration strategies",
      "Weighing the cost of a slower, auditable migration against the risk of an opaque, all-at-once flip",
    ],
    shortDescription:
      "An ETL v1-to-v2 migration silently mixes lineage across two computation paths while every availability metric stays perfectly healthy — flipping the cutover globally looks fast but risks corrupting every downstream report at once.",
  },
};

export {
  dataLineageBreakDuringEtlMigrationSimulation,
  dataLineageBreakDuringEtlMigrationCandidateUI,
  DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
};
