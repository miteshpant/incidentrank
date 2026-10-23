import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { distributedLockFailureRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const distributedLockFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "lockServiceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Lock Service has entered a critical correctness-risk state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Lock Service has recovered to a safe state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "correctnessViolationCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "A conflicting write has landed on the shared resource due to overlapping lock ownership.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Correctness violations have stopped occurring.",
      },
    },
    {
      key: "overlappingOwnerCount",
      trackPeak: true,
    },
    {
      key: "resourceBlockedSeconds",
      trackPeak: true,
    },
    {
      key: "lockContentionRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: distributedLockFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified against
  // successCondition (correctnessViolationCount === 0 AND
  // lockServiceStatus === "normal") — never against overlappingOwnerCount,
  // since the fenced path can have overlap occur and still be fully safe:
  //
  //   fenced-safe-fast-recovery (fenced, short lease, crashed)   OPTIMAL
  //   fenced-safe (fenced, no crash)                             OPTIMAL
  //   renewed-safe (renewal, no crash)                           OPTIMAL
  //   renewed-crash-fast-recovery (renewal, crashed, short lease) UNSAFE
  //     — resource currently blocked (lockServiceStatus="warning");
  //     genuinely degraded right now, not safe to hand back yet.
  //   renewed-crash-slow-recovery (renewal, crashed, long lease)  UNSAFE
  //     — same, worse (90s block).
  //   long-lease-no-fencing-crash (no mitigation, crashed,
  //     long lease)                                               UNSAFE
  //     — resource blocked 120s, lockServiceStatus="critical".
  //   long-lease-no-fencing (no mitigation, long lease, no crash) UNSAFE
  //     — THE TRAP. Lengthening the lease past typical job duration
  //     makes expiry-during-processing much rarer, but job-duration
  //     tail variance still occasionally exceeds even the longer
  //     lease: correctnessViolationCount=2 (not zero) and
  //     lockServiceStatus="warning". This state must never be mistaken
  //     for safe — it fails successCondition on both authored fields.
  //   overlapping-owners* (short lease, no mitigation)            UNSAFE
  //     — real, ongoing correctness violations (correctnessViolationCount
  //     6-17), lockServiceStatus="critical".
  //
  // Three genuinely distinct mechanisms (fencing, renewal, and
  // "nothing") all reach a state satisfying successCondition's two
  // authored fields at least once (fenced and renewed both do; the
  // long-lease-without-fencing trap deliberately does NOT, because its
  // correctnessViolationCount never actually reaches zero even in its
  // best observed state). Fencing and renewal are not "almost passed"
  // relative to each other — both are genuinely, currently safe — so
  // there is no case for a loose acceptableCondition tier sitting below
  // successCondition here; the real discrimination this scenario needs
  // (durable fix vs. safe-only-while-alive) is carried by Data
  // Integrity scoring's lockSafetyMechanism-aware measure (scoring.ts),
  // not by a second completion tier. A loose acceptableCondition would
  // also risk exactly the failure mode this batch is designed to catch
  // — tolerating a state whose safety is contingent rather than real —
  // so this scenario is intentionally single-tier.
  //
  // Decision: candidate_declared (not automatic). "Has
  // correctnessViolationCount happened to read zero this tick" is not,
  // by itself, proof the system is safe to hand back — a candidate who
  // Finishes from the long-lease-without-fencing trap during one of its
  // rare zero-violation windows must not be rewarded with a resolved
  // outcome, and a human judgment about whether the chosen mechanism is
  // durable (not just currently quiet) is exactly what
  // candidate_declared exists to test. No acceptableCondition, per the
  // audit above.
  completion: { mode: "candidate_declared" },
};
