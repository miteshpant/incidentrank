import type { ScenarioDefinition } from "./types";
import {
  outOfOrderEventsSimulation,
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
} from "./out-of-order-events/definition";
import { outOfOrderEventsCandidateUI } from "./out-of-order-events/candidate-ui";
import { OUT_OF_ORDER_EVENTS_SCORING } from "./out-of-order-events/scoring";

/**
 * Out-of-Order Events — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 29). A partition-routing
 * change spread account-update events round-robin across partitions to
 * absorb rising producer throughput. The side effect: events for the
 * same account can now land on different partitions and be processed out
 * of causal order by independently-scheduled consumers, so the
 * materialized account-state view can silently regress to a stale value.
 * Per-account event ordering into the materialized state must be
 * preserved — support tooling and risk checks read directly from it, and
 * a stale or regressed account value is treated as a data-correctness
 * incident, not merely a freshness one. The candidate must recognize
 * that throughput and consumer lag looking healthy is not proof the
 * materialized state is trustworthy, and decide between fully restoring
 * per-account ordering (at a throughput cost) or keeping the
 * higher-throughput routing with reconciliation safeguards that are
 * actually proven to keep pace with ongoing violations.
 */
export const outOfOrderEvents: ScenarioDefinition = {
  id: "out-of-order-events",
  slug: "out-of-order-events",
  version: 1,
  name: "Out-of-Order Events",
  description:
    "A partition-routing change has spread account-update events across partitions to absorb rising throughput, but events for the same account can now be processed out of causal order by different consumers. The materialized account-state view that support tooling and risk checks read from must reflect each account's true latest value — a stale or regressed value is a data-correctness incident, not merely a freshness one. Diagnose why ordering violations are occurring and bring the materialized state back to a durable, trustworthy state.",
  difficulty: "staff",
  estimatedMinutes: 20,
  isFree: false,
  simulation: outOfOrderEventsSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Event Ordering", "Partitioning", "Data Integrity", "Reconciliation"],
    skills: [
      "Diagnosing cross-partition causal-ordering violations",
      "Distinguishing throughput/lag health from materialized-state correctness",
      "Evaluating a full-ordering-restore tradeoff against a bounded-reconciliation tradeoff",
      "Recognizing when reconciliation safeguards are not actually keeping pace",
    ],
    shortDescription:
      "A routing change broke per-account event ordering, and throughput looking healthy doesn't mean the materialized state is trustworthy.",
  },
};

export {
  outOfOrderEventsSimulation,
  outOfOrderEventsCandidateUI,
  OUT_OF_ORDER_EVENTS_SCORING,
  CONSUMER_PARALLELISM_KEY,
  DELAYED_PROCESSING_TOLERANCE_KEY,
  PARTITION_KEY_STRATEGY_KEY,
  REORDER_BUFFER_ENABLED_KEY,
  SEQUENCE_VALIDATION_ENABLED_KEY,
};
