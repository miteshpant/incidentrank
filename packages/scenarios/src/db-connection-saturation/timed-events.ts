import type { TimedEvent } from "@incidentrank/simulator";

const SATURATION_START_MS = 30_000;
// Phase 6.1: a candidate-visible precursor to the batch-job escalation —
// background batch demand is already accumulating well before the batch
// job fully "starts" and the engine marks batchJobRunning. See
// BATCH_PRESSURE_RISING_MS's rule (batch-pressure-rising-pool-only in
// rules.ts): a candidate who scaled the pool alone sees queuedConnections
// climbing from here onward, a real reason to keep observing rather than
// declaring done — not a silent plateau that later reverts with no
// warning. This fixes a fairness gap the Phase 6.1 state audit found:
// scaled-pool-only previously looked stable indefinitely with zero
// observable signal before batch-job-overlap silently reverted it.
const BATCH_PRESSURE_RISING_MS = 3 * 60_000;
const ESCALATION_MS = 5 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "saturation-begins",
    atMs: SATURATION_START_MS,
    type: "TRIGGER_SET",
    message: "A marketing-driven traffic spike is exhausting the connection pool.",
    setTriggers: { saturating: true },
  },
  {
    id: "batch-pressure-rising",
    atMs: BATCH_PRESSURE_RISING_MS,
    type: "TRIGGER_SET",
    message: "Background batch demand is building against the connection pool.",
    setTriggers: { saturating: true, batchPressureRising: true },
  },
  {
    id: "batch-job-overlap",
    atMs: ESCALATION_MS,
    type: "TRIGGER_SET",
    message: "A scheduled analytics batch job has started competing for the same pool.",
    setTriggers: { saturating: true, batchJobRunning: true },
  },
];
