import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { distributedCoordinationFailureRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  HEARTBEAT_INTERVAL_SECONDS_KEY,
  LEASE_DURATION_SECONDS_KEY,
  OWNERSHIP_FENCING_ENABLED_KEY,
  OWNERSHIP_RECONCILIATION_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
  FAILOVER_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const distributedCoordinationFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "coordinationServiceStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Coordination Service has entered a critical ownership-integrity state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Coordination Service has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "ownershipConflictCount",
      trackPeak: true,
      threshold: {
        value: 20,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Ownership conflicts have crossed 20 concurrently affected work items.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Ownership conflicts have dropped back below 20.",
      },
    },
    {
      key: "missedWorkItemCount",
      trackPeak: true,
      threshold: {
        value: 20,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Missed work items have crossed 20 unclaimed items.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Missed work items have dropped back below 20.",
      },
    },
    {
      key: "schedulerBacklogCount",
      trackPeak: true,
    },
    {
      key: "duplicateWorkCompletedCount",
      trackPeak: true,
    },
    {
      key: "stalledWorkerCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: distributedCoordinationFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (conflicts / missed / duplicateCompleted / status /
  // ownershipIntegrityMode):
  //
  //   conservative-baseline-orphaning      UNSAFE  6 / 35 / 4  / critical / unresolved
  //   staleness-widened-orphaning          UNSAFE  8 / 70 / 4  / critical / unresolved
  //   faster-heartbeat-no-effect           UNSAFE  6 / 33 / 4  / critical / unresolved
  //   short-lease-partial-relief           UNSAFE  10 / 18 / 7 / critical / unresolved
  //   aggressive-mass-duplication(+amp)    UNSAFE  48-95 / 3-4 / 44-88 / critical / unresolved
  //   fenced-conservative-orphaning        UNSAFE  1 / 22 / 0  / critical / fenced-unreconciled
  //   fenced-aggressive-churning           UNSAFE  14 / 1 / 0  / warning  / fenced-unreconciled
  //   reconciled-unfenced-residual-dup.    UNSAFE  3 / 2 / 5(↑)/ warning  / reconciled-unfenced
  //   reconciled-fenced-safe               OPTIMAL 0 / 0 / 0   / normal   / reconciled
  //
  // Every state except the fully reconciled+fenced one leaves at least
  // one correctness-relevant count genuinely nonzero and actively
  // forming (not merely "close to zero" — reconciled-unfenced-residual-
  // duplication in particular looks calm on every surface metric but
  // duplicateWorkCompletedCount is real, nonzero, and still climbing).
  // Per phase6c.md's binding rule for this scenario class — "a state
  // with a real correctness violation happening must never satisfy
  // successCondition/acceptableCondition, however healthy availability
  // looks" — none of these intermediate states qualifies as a genuine
  // safe-but-imperfect handback tier. There is no state where the
  // candidate has made a deliberate, bounded tradeoff that is
  // nonetheless safe; every non-optimal state is simply an incomplete
  // fix with an ongoing correctness or availability gap. Per section
  // 10's explicit "not almost fixed, not partial credit" standard, this
  // scenario authors NO acceptableCondition.
  //
  // With no acceptable tier, successCondition is the only bar, and it
  // is an objective, observable condition (every correctness count at
  // zero, reconciled) rather than a judgment call about whether a
  // mixed state is "safe enough to hand back" — so this scenario is
  // genuinely `automatic`, not `candidate_declared`. The judgment this
  // scenario tests is in CHOOSING the right pair of controls
  // (reconciliation to fix the table, fencing to protect correctness
  // during the window before each resync), not in deciding whether an
  // ambiguous handback state is good enough.
  completion: { mode: "automatic" },
};
