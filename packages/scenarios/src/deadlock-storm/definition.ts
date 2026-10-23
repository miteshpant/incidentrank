import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { deadlockStormRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  TRANSACTION_LOCK_ORDERING_KEY,
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  TRANSACTION_SCOPE_KEY,
  SERVICE_CONCURRENCY_KEY,
  WRITE_SERIALIZATION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const deadlockStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "dbStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "PostgreSQL has entered a critical deadlock state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "PostgreSQL has recovered from the deadlock storm.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "deadlocksPerSec",
      trackPeak: true,
      threshold: {
        value: 20,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Deadlocks per second have crossed 20.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Deadlocks per second have dropped back below 20.",
      },
    },
    {
      key: "lockWaitTimeMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: deadlockStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Completion-mode audit (see rules.ts's state table):
  //   UNSAFE: every state where the lock-order conflict is live and
  //     deadlocksPerSec > 0 — masked-retry-amplification (+moderate),
  //     partial-mitigated, partial-bounded, deadlocking-no-retry,
  //     deadlocking-critical, deadlocking-surge-critical. Checkout
  //     failures and/or deadlock pressure remain real and active.
  //   ACCEPTABLE: recovered-serialized — write serialization removes
  //     deadlocks by construction (deadlocksPerSec === 0, dbStatus never
  //     critical) but at materially worse latency/throughput. A genuine,
  //     bounded, operationally-safe handback: safe to walk away from, but
  //     not the best achievable state. Distinguished from optimal purely
  //     by the authored writeSerializationActive field.
  //   OPTIMAL: recovered-canonical — the lock-order conflict is removed
  //     at its root; deadlocks are structurally impossible and checkout
  //     failure rate sits at its honest floor.
  // Because a genuine, non-"almost passed" safe-but-imperfect tier exists
  // (write serialization), this is candidate_declared with an
  // acceptableCondition, mirroring Kafka Partition Skew's precedent.
  completion: { mode: "candidate_declared", acceptableCondition },
};
