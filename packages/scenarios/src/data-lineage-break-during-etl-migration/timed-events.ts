import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: the ETL v1 -> v2 migration begins. Sources/Warehouse/
// Reports availability is unaffected throughout.
export const MIGRATION_ONSET_MS = 20_000;

// If a real cutover strategy has not been chosen by this point, the
// migration decision has been left open long enough to be a genuine,
// avoidable delay — modeling a migration whose risk compounds the
// longer the strategy question is left unanswered, not a fixed one-time
// blip.
export const SUSTAINED_UNDECIDED_MS = MIGRATION_ONSET_MS + 3 * 60_000;

// Recovery-lag / cutover-progress drain windows (phase6e3.md's binding
// historical-damage/recovery-lag doctrine, same pattern as Data Pipeline
// Freshness Collapse and Model Feature Freshness Degradation): once the
// candidate has genuinely engaged a safe cutover strategy (staged-per-
// source or dual-write-reconcile), sourcesCutOverCount/
// metricsWithMixedLineagePercent do not jump to fully-migrated on the
// next tick — real sources take real elapsed time to verify and cut
// over, one stage at a time. Anchored AFTER SUSTAINED_UNDECIDED_MS so
// they are reachable even when the candidate left the decision open
// first.
export const CUTOVER_WINDOW_1_MS = SUSTAINED_UNDECIDED_MS + 2 * 60_000;
export const CUTOVER_WINDOW_2_MS = SUSTAINED_UNDECIDED_MS + 4 * 60_000;
export const CUTOVER_FULLY_COMPLETE_MS = SUSTAINED_UNDECIDED_MS + 7 * 60_000;

// NOTE: tickOnce (packages/simulator/src/tick.ts) walks timedEvents via a
// monotonically-increasing index pointer, in ARRAY ORDER — it never
// sorts by atMs. Every entry below is therefore already in strictly
// ascending atMs order.
export const timedEvents: TimedEvent[] = [
  {
    id: "migration-onset",
    atMs: MIGRATION_ONSET_MS,
    type: "TRIGGER_SET",
    message:
      "EXTERNAL PROGRESSION: the ETL v1 -> v2 migration has begun. Sources, Warehouse writes, and Report generation all remain fully available — this is a lineage/trust problem, not an availability problem.",
    setTriggers: { migrationInProgress: true },
  },
  {
    id: "sustained-undecided",
    atMs: SUSTAINED_UNDECIDED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "EXTERNAL PROGRESSION: the migration has been underway long enough that a cutover-strategy decision is now overdue — leaving it unresolved further compounds lineage risk.",
    setTriggers: { migrationInProgress: true, sustainedUndecided: true },
  },
  // NOTE: cutover-window triggers below fire unconditionally on
  // wall-clock atMs, exactly like every other timed event in this
  // engine. rules.ts is what makes them MEANINGFUL only once the
  // candidate has actually engaged a safe cutover strategy.
  {
    id: "cutover-window-1-elapsed",
    atMs: CUTOVER_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a first cutover-progress window has elapsed.",
    setTriggers: { cutoverWindow1Elapsed: true },
  },
  {
    id: "cutover-window-2-elapsed",
    atMs: CUTOVER_WINDOW_2_MS,
    type: "TRIGGER_SET",
    message: "ELAPSED RECOVERY: a second cutover-progress window has elapsed.",
    setTriggers: { cutoverWindow1Elapsed: true, cutoverWindow2Elapsed: true },
  },
  {
    id: "cutover-fully-complete-elapsed",
    atMs: CUTOVER_FULLY_COMPLETE_MS,
    type: "TRIGGER_SET",
    message:
      "ELAPSED RECOVERY: enough cutover time has elapsed for a fully-engaged safe strategy to have carried every source all the way to a verified, fully-consistent v2 lineage.",
    setTriggers: {
      cutoverWindow1Elapsed: true,
      cutoverWindow2Elapsed: true,
      cutoverFullyCompleteElapsed: true,
    },
  },
];
