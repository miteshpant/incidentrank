import type { TimedEvent } from "@incidentrank/simulator";

// A downstream dependency the locked job touches (e.g. a slow write
// path on the shared resource itself) has slowed down, so individual
// job processing durations are climbing — the observable precursor to
// leases expiring mid-processing. Candidates watching processingDurationMs
// have every reason to expect lease-expiry problems next if the lease
// isn't renewed and stays short.
const PROCESSING_SLOWDOWN_MS = 30_000;

// Second wave: with sustained slow processing and no renewal/fencing in
// place, leases keep expiring mid-job and a worker genuinely crashes
// while holding one (a real, independent failure mode — not caused by
// the candidate). This event's CONSEQUENCE (resourceBlockedSeconds)
// depends on leaseDurationSeconds via rules.ts, so a longer lease chosen
// earlier in response to expiry-during-processing now visibly, directly
// costs more recovery time here — never a hidden penalty.
const WORKER_CRASH_MS = PROCESSING_SLOWDOWN_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "processing-slowdown",
    atMs: PROCESSING_SLOWDOWN_MS,
    type: "TRIGGER_SET",
    message:
      "A downstream dependency touched by the locked job has slowed down. Per-job processing duration is climbing, and some jobs are now taking longer than the configured lock lease.",
    setTriggers: { processingSlow: true },
  },
  {
    id: "worker-crash",
    atMs: WORKER_CRASH_MS,
    type: "TRIGGER_SET",
    message:
      "A worker process has crashed mid-job while holding the lock. The shared resource stays blocked for whichever worker held it until that worker's lease naturally expires.",
    setTriggers: { processingSlow: true, workerCrashed: true },
  },
];

export { PROCESSING_SLOWDOWN_MS, WORKER_CRASH_MS };
