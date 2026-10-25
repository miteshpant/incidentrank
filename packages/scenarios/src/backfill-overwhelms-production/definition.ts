import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { backfillOverwhelmsProductionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BACKFILL_CHUNK_SIZE_KEY,
  BACKFILL_CONCURRENCY_KEY,
  BACKFILL_PAUSE_RESUME_KEY,
  BACKFILL_SCHEDULING_WINDOW_KEY,
  DB_PRIORITY_MODE_KEY,
  DB_STATEMENT_TIMEOUT_MODE_KEY,
  QUEUE_DISPATCH_RATE_KEY,
  SKIP_MARK_COMPLETE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const backfillOverwhelmsProductionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "primaryDatabaseStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Primary Database has entered a critical contention state under combined live-traffic and backfill load.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Primary Database has recovered from contention.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dbLockWaitMs",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Database lock wait has crossed 500ms, a sustained contention level.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Database lock wait has dropped back below 500ms.",
      },
    },
    {
      key: "liveWriteP99Ms",
      trackPeak: true,
    },
    {
      key: "backfillQueueDepth",
      trackPeak: true,
    },
    {
      key: "skippedRowCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Historical rows have begun being skip-marked complete without being processed.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Skip-marking has stopped (the historical count does not decrease).",
      },
    },
  ],
  timedEvents,
  rules: backfillOverwhelmsProductionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.4.md section 11, performed AFTER
  // writing rules.ts) ──────────────────────────────────────────────────
  //
  // Every reachable terminal/stable rule state, classified by its real
  // authored values (dbLockWaitMs / skippedRowCount / backfillQueueDepth
  // / productionDatabaseStatus):
  //
  //   healthy                                    (pre-incident)     0 / 0     / 48,000 / protected
  //   baseline-contention                        UNSAFE             160 / 0   / 47,000 / contending
  //   baseline-sustained-contention               UNSAFE             260 / 0   / 46,000 / contending
  //   skip-mark-complete-trap-active              UNSAFE (correctness) 30 / 4,500  / 40,000 / integrity-violated
  //   skip-mark-complete-trap-sustained           UNSAFE (correctness) 40 / 12,000 / 30,000 / integrity-violated
  //   skip-mark-complete-trap-catastrophic        UNSAFE/FAILS       45 / 22,000 / 18,000 / integrity-violated (crosses failureCondition's 20,000 threshold)
  //   skip-mark-complete-scarred-live-safe        UNSAFE (correctness) 15 / 4,500  / 40,000 / integrity-violated (live metrics pristine, historical damage permanent)
  //   high-concurrency-unmanaged-contention       UNSAFE             2,100 / 0 / 36,000 / contending
  //   high-concurrency-unmanaged-short-timeout    UNSAFE             1,900 / 0 / 36,000 / contending
  //   high-concurrency-partial-protection-*       UNSAFE             410-520 / 0 / 34-35,000 / contending
  //   protected-but-dispatch-unthrottled          UNSAFE             440 / 0   / 20,000 / contending
  //   paused-just-engaged                         UNSAFE (transient) 780 / 0   / 42,000 / protected (recovery lag not yet elapsed)
  //   paused-recovering-window1                   ACCEPTABLE         60 / 0    / 40,000 / protected
  //   paused-fully-stable                         ACCEPTABLE         0 / 0     / 40,000 / protected
  //   off-peak-scheduling-protects-production      ACCEPTABLE         10 / 0    / 44,000 / protected
  //   safely-resumed-just-engaged                  UNSAFE (transient) 40 / 0   / 40,000 / safely-resumed (drain lag not yet elapsed)
  //   safely-resumed-draining-window1               ACCEPTABLE         35 / 0   / 24,000 / safely-resumed
  //   safely-resumed-draining-window2               ACCEPTABLE         25 / 0   / 9,000  / safely-resumed
  //   medium-concurrency-protected                  ACCEPTABLE         15 / 0   / 30,000 / safely-resumed
  //   fully-resumed-complete                        OPTIMAL            10 / 0   / 0      / complete-honest
  //
  // Every UNSAFE state leaves either live-traffic lock wait genuinely
  // elevated (>60ms, measurably contended) OR a nonzero, permanently
  // scarred skippedRowCount — never both metrics looking clean at once
  // while something is actually still wrong. "paused-just-engaged" and
  // "safely-resumed-just-engaged" are deliberately classified UNSAFE
  // despite the candidate having taken the objectively correct action,
  // because they prove recovery lag is real: the system has not yet had
  // time to reflect the safe configuration, so neither
  // successCondition nor acceptableCondition may be satisfied on the
  // same tick a safe lever is flipped. This is intentional and tested
  // (see backfill-overwhelms-production.test.ts's recovery-lag suite).
  //
  // ACCEPTABLE genuinely exists and is distinct from OPTIMAL: production
  // is fully safe (lockWait <= 60ms) AND zero rows have ever been
  // skipped AND the backfill queue is bounded (<= 44,000, i.e. has not
  // grown past its pre-incident starting depth) and either frozen
  // (paused) or demonstrably draining — but the backlog has not reached
  // genuine, honest zero. This is the scenario's named "likely safe
  // degraded state": production healthy, backfill slowed/paused, queue
  // bounded, migration delayed but safe. It is a real, deliberate,
  // bounded tradeoff, not partial credit for an incomplete fix — a
  // candidate who pauses and hands back control has made a legitimate
  // judgment call given the information available, even though a
  // stronger candidate could have resumed the backfill safely and
  // reached OPTIMAL instead.
  //
  // Because a genuine ACCEPTABLE tier exists and is a real intermediate
  // judgment distinct from a forced binary (safe vs. unsafe), and the
  // decision of "is bounded-and-stable good enough to hand back, or
  // should I keep pushing for full honest completion" is itself a
  // judgment call rather than an objectively-computable threshold, this
  // scenario is `candidate_declared` rather than `automatic` — mirroring
  // Data Pipeline Freshness Collapse's reasoning exactly (contrast
  // Distributed Coordination Failure, which has NO acceptable tier and
  // is therefore `automatic`).
  completion: {
    mode: "candidate_declared",
    acceptableCondition,
  },
};
