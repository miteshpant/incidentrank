import type { ScenarioDefinition } from "./types";
import {
  databaseLockContentionSimulation,
  BATCH_JOB_CONCURRENCY_KEY,
  BATCH_JOB_CHUNK_SIZE_KEY,
  LOCK_TIMEOUT_MS_KEY,
} from "./database-lock-contention/definition";
import { databaseLockContentionCandidateUI } from "./database-lock-contention/candidate-ui";
import { DATABASE_LOCK_CONTENTION_SCORING } from "./database-lock-contention/scoring";

/**
 * Database Lock Contention — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * scheduled batch job starts updating rows on a hot table, taking
 * long-held locks that block normal transactional writes behind it.
 * Blocked transactions pile up, query latency climbs, and some
 * transactions begin timing out. The candidate must recognize that the
 * durable fix is reducing per-transaction lock hold time — smaller batch
 * chunks and lower concurrency — not simply disabling timeout protection
 * or pushing the batch job to "finish faster" with larger transactions.
 */
export const databaseLockContention: ScenarioDefinition = {
  id: "database-lock-contention",
  slug: "database-lock-contention",
  version: 1,
  name: "Database Lock Contention",
  description:
    "A scheduled batch job has started updating rows on a hot table, and its long-held locks are blocking normal transactional writes behind it. Blocked transactions are piling up, query latency is climbing, and some transactions are starting to time out. Diagnose the contention and restore healthy write throughput before the backlog cascades into a full outage.",
  difficulty: "senior",
  estimatedMinutes: 14,
  isFree: false,
  simulation: databaseLockContentionSimulation,
  library: {
    category: "Databases & Storage",
    tags: ["Postgres", "Locking", "Concurrency", "Batch Processing", "Capacity Planning"],
    skills: [
      "Diagnosing lock contention and blocked transactions",
      "Batch job chunking and concurrency tuning",
      "Lock timeout tradeoffs under contention",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A batch job's long-held row locks on a hot table block normal writes behind it, piling up blocked transactions.",
  },
};

export {
  databaseLockContentionSimulation,
  databaseLockContentionCandidateUI,
  DATABASE_LOCK_CONTENTION_SCORING,
  BATCH_JOB_CONCURRENCY_KEY,
  BATCH_JOB_CHUNK_SIZE_KEY,
  LOCK_TIMEOUT_MS_KEY,
};
