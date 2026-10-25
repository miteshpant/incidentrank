import type { ScenarioDefinition } from "./types";
import {
  backfillOverwhelmsProductionSimulation,
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
} from "./backfill-overwhelms-production/definition";
import { backfillOverwhelmsProductionCandidateUI } from "./backfill-overwhelms-production/candidate-ui";
import { BACKFILL_OVERWHELMS_PRODUCTION_SCORING } from "./backfill-overwhelms-production/scoring";

/**
 * Backfill Overwhelms Production — a paid, Senior-Staff-level
 * IncidentRank scenario (docs/implementation_plan/phase6d.4.md, scenario
 * 76). A large historical backfill, already running at low concurrency,
 * competes with live customer traffic for the SAME Primary Database's
 * connection pool and row/table locks once traffic enters its daily
 * peak. There is no schema incompatibility and no streaming freshness
 * SLO here — this is a pure capacity-contention problem with a real
 * migration deadline creating genuine pressure to keep the backfill
 * moving rather than simply killing it forever.
 */
export const backfillOverwhelmsProduction: ScenarioDefinition = {
  id: "backfill-overwhelms-production",
  slug: "backfill-overwhelms-production",
  version: 1,
  name: "Backfill Overwhelms Production",
  description:
    "A large historical backfill has been running at low concurrency against the Primary Database for days, working toward a real migration deadline. Live customer traffic has now entered its daily peak, and the two workloads are competing directly for the same database's connection pool and row/table locks. Four business invariants govern every decision here: (1) customer writes must remain correct and available within the authored SLO — production correctness is never negotiable; (2) the backfill may slow or pause temporarily if that is what safety requires; (3) historical rows must not be skipped or silently marked complete — any mechanism that marks a row 'done' without actually backfilling it is a permanent, irreversible correctness violation, tracked as a historical count that never resets once incurred; (4) the migration deadline genuinely matters — simply shutting the backfill off forever and never resuming it is not an optimal outcome — but the deadline never outranks production correctness, and a resumed backfill must stay within a safe production resource budget rather than simply being turned back up to full speed. Decide how to contain database pressure, protect the live workload, reshape the backfill's footprint rather than merely killing it, and resume it at a rate production can safely absorb.",
  difficulty: "senior_staff",
  estimatedMinutes: 25,
  isFree: false,
  simulation: backfillOverwhelmsProductionSimulation,
  library: {
    category: "Databases & Storage",
    tags: [
      "Database Contention",
      "Batch vs. OLTP",
      "Capacity Budgeting",
      "Pressure Transfer",
      "Historical Damage",
      "Recovery Lag",
    ],
    skills: [
      "Distinguishing a healthy live-traffic path from a database capacity-contention problem",
      "Recognizing that naively scaling a competing batch job can transfer pressure into live write latency",
      "Balancing a real external deadline against production correctness without treating either as absolute",
      "Reshaping a backfill's footprint (chunk size, priority, dispatch rate) instead of only pausing or maxing it out",
      "Avoiding skip/mark-complete as a correctness-destroying shortcut under deadline pressure",
    ],
    shortDescription:
      "A historical backfill competes with live traffic for one shared database, and the tempting fixes are either to flood it or to kill it forever — neither is the safe answer.",
  },
};

export {
  backfillOverwhelmsProductionSimulation,
  backfillOverwhelmsProductionCandidateUI,
  BACKFILL_OVERWHELMS_PRODUCTION_SCORING,
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
};
