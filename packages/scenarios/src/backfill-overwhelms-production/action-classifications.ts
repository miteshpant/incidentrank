import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * where pressure moved and any historical consequence created.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: BACKFILL_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { contentionActive: true },
    outcome: "harmful",
    feedback: {
      title: "Raised backfill concurrency without reshaping its footprint",
      explanation:
        "Raising backfillConcurrency to \"high\" does increase how fast backfill workers process rows, but every additional worker holds row/table locks against the SAME Primary Database live traffic is writing to. Without also shrinking backfillChunkSize AND setting dbPriorityMode to live-traffic-first, live write p99 latency jumps to ~2,400ms and lock wait to ~2,100ms — both measurably WORSE than doing nothing at all. Pressure that looked like pure backfill throughput was transferred directly into production write latency.",
    },
  },
  {
    id: "acr_2",
    controlKey: BACKFILL_CHUNK_SIZE_KEY,
    valueEquals: "small",
    whenTriggerEquals: { contentionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Shrunk backfill chunk size",
      explanation:
        "Smaller chunks hold each backfill transaction's locks for a much shorter wall-clock duration, which is necessary once concurrency is raised. On its own, with dbPriorityMode still balanced, contention is only partially relieved (live write p99 ~650ms vs. ~2,400ms unmanaged) — live-traffic-first priority must also be set for this to be fully effective, since live traffic still has no reserved budget otherwise.",
    },
  },
  {
    id: "acr_3",
    controlKey: DB_PRIORITY_MODE_KEY,
    valueEquals: "live-traffic-first",
    whenTriggerEquals: { contentionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Reserved database priority for live traffic",
      explanation:
        "Reserving a real floor of connection/lock budget for Production Clients' writes is the other half of what makes raising backfill concurrency safe. Alone, with chunk size still large, contention is only partially relieved (live write p99 ~480ms vs. ~2,400ms unmanaged) — both this and backfillChunkSize are independently required together, neither one alone is sufficient.",
    },
  },
  {
    id: "acr_4",
    controlKey: BACKFILL_SCHEDULING_WINDOW_KEY,
    valueEquals: "off-peak-only",
    whenTriggerEquals: { contentionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Restricted the backfill to the off-peak window",
      explanation:
        "Confining active backfill work to the low-traffic window removes it from the Primary Database entirely during the highest-risk live-traffic period, protecting production without pausing the backfill forever. The tradeoff is real: backfill throughput during the restricted hours drops, so the historical backlog drains more slowly than an aggressive, fully-protected concurrent approach would.",
    },
  },
  {
    id: "acr_5",
    controlKey: BACKFILL_PAUSE_RESUME_KEY,
    valueEquals: "paused",
    whenTriggerEquals: { contentionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Paused the backfill",
      explanation:
        "Pausing stops the backfill from issuing any new transactions at all, which is the single most reliable way to remove backfill-side pressure from the Primary Database. Production recovers over a real elapsed window, not instantly. The real cost: backfillQueueDepth is frozen, not shrinking, and the migration deadline keeps approaching while paused — this is a legitimate temporary safety measure, not a substitute for eventually resuming at a safe, protected rate.",
    },
  },
  {
    id: "acr_6",
    controlKey: DB_STATEMENT_TIMEOUT_MODE_KEY,
    valueEquals: "short",
    whenTriggerEquals: { contentionActive: true },
    outcome: "neutral",
    feedback: {
      title: "Shortened the live-write statement timeout",
      explanation:
        "A short timeout bounds how long any single live write can be blocked behind backfill-held locks, converting hidden queued latency into fast, explicit failures instead. This does not reduce contention itself — combined with unmanaged high concurrency, requestSuccessRate actually reads WORSE (failures are now counted) even though p99 latency looks superficially bounded. It only changes how contention is surfaced, never how much of it exists.",
    },
  },
  {
    id: "acr_7",
    controlKey: QUEUE_DISPATCH_RATE_KEY,
    valueEquals: "throttled",
    whenTriggerEquals: { contentionActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled backfill queue dispatch rate",
      explanation:
        "Capping how many chunks the coordinator hands to workers per minute, independent of worker count, keeps the Primary Database's incoming backfill transaction rate from outpacing what it can safely absorb even once concurrency, chunk size, and priority are otherwise fully protected. Without this, a fully-protected configuration still shows measurably worse lock wait (~440ms vs. ~10ms) because raw dispatch rate — not worker count — was the remaining unmanaged pressure source.",
    },
  },
  {
    id: "acr_8",
    controlKey: SKIP_MARK_COMPLETE_KEY,
    valueEquals: true,
    whenTriggerEquals: { contentionActive: true },
    outcome: "harmful",
    feedback: {
      title: "Marked historical rows complete without processing them",
      explanation:
        "Enabling skip-mark-complete does make backfillQueueDepth read better almost immediately — but every row marked complete this way was never actually backfilled, and skippedRowCount is a real, permanent correctness loss that never resets, regardless of how the lever is configured afterward or how healthy production looks later. This directly violates the business invariant that historical rows must not be skipped or silently marked complete, and it can never be classified acceptable or optimal once incurred.",
    },
  },
];
