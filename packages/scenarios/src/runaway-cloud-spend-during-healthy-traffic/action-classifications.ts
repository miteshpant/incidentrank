import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── autoscalerTargetUtilizationPercent ───────────────────────────
  {
    id: "acr_1",
    controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY,
    valueEquals: 55,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Raising target utilization to a balanced threshold reduced idle fleet size",
      explanation:
        "Moving the Autoscaler's target CPU utilization from a conservative 30% to a balanced 55% means fewer instances are kept running to hold the same headroom — cost per minute falls as a direct, measurable result, while per-instance headroom stays wide enough to absorb normal traffic variance. This did not weaken the redundancy floor at all; it only changed how aggressively the Autoscaler scales out.",
    },
  },
  {
    id: "acr_2",
    controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY,
    valueEquals: 80,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "neutral",
    feedback: {
      title: "Aggressive target utilization cuts cost further but thins per-instance headroom",
      explanation:
        "Pushing target utilization to 80% lowers cost somewhat more than the balanced 55% target, but it leaves materially less per-instance headroom to absorb a normal traffic bump without a scaling delay. On its own, without also correcting the replica floor or idle-capacity policy, it barely reduces running instance count at all — this is a real tradeoff, not a straightforward win, and is not the scenario's intended safe target.",
    },
  },

  // ── minReplicaCount ───────────────────────────────────────────────
  {
    id: "acr_3",
    controlKey: MIN_REPLICA_COUNT_KEY,
    valueEquals: 6,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Lowering the replica floor to the safety floor removed real leftover cost",
      explanation:
        "The replica floor had been left at 40 since an unrelated past traffic-spike incident and was never brought back down. Lowering it to 6 — the authored safety floor that genuinely protects redundancy (surviving an instance loss or absorbing a traffic bump without a cold-start gap) — removes a large amount of pure standing cost with zero loss of real protection.",
    },
  },
  {
    id: "acr_4",
    controlKey: MIN_REPLICA_COUNT_KEY,
    valueEquals: 2,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "harmful",
    feedback: {
      title: "Dropping the replica floor below the safety floor breached redundancy",
      explanation:
        "Setting the minimum replica count to 2 — below the authored safety floor of 6 — pushes running instance count and cost per minute to the lowest numbers in the entire scenario, and nothing customer-facing currently shows it: traffic is healthy and steady right now. That apparent win is not real. It directly breaches the invariant that critical redundancy may not be removed below the stated safety floor, and every second this stays active adds to a permanent, non-resetting count of seconds spent with redundancy breached, which stays on the record even after the floor is restored and materially penalizes Data Integrity and Reliability regardless of how low the cost numbers look.",
    },
  },

  // ── workerInstanceClass ──────────────────────────────────────────
  {
    id: "acr_5",
    controlKey: WORKER_INSTANCE_CLASS_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Right-sizing the instance class removed wasted per-unit spend",
      explanation:
        "The 'large' instance class was left over from an earlier capacity scare and costs materially more per instance for no measurable throughput benefit at today's traffic level. Switching to 'standard' removes that wasted per-unit spend without changing instance count or touching any customer-facing metric.",
    },
  },
  {
    id: "acr_6",
    controlKey: WORKER_INSTANCE_CLASS_KEY,
    valueEquals: "economy",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "harmful",
    feedback: {
      title: "Economy instances alone are undersized for this workload's unbatched compute profile",
      explanation:
        "The economy class is genuinely cheaper per instance, but it is undersized for this workload's per-request compute profile unless request batching has already reduced per-instance work. Used alone, it measurably raises p99 latency — a real, if currently within-SLO, cost paid in exchange for savings that batching-first would have delivered without the latency hit. Enable adaptive or aggressive batching before (or instead of) moving to this class.",
    },
  },

  // ── requestBatchingMode ──────────────────────────────────────────
  {
    id: "acr_7",
    controlKey: REQUEST_BATCHING_MODE_KEY,
    valueEquals: "adaptive",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Adaptive batching raised effective per-instance throughput with no added latency risk",
      explanation:
        "Enabling adaptive request batching lets the API combine multiple requests into fewer units of work without adding meaningful latency. This raises effective per-instance throughput directly, which is what lets the Autoscaler itself decide to run fewer instances — the batching-first path to a right-sized fleet, independent of ever touching the replica floor or target utilization.",
    },
  },
  {
    id: "acr_8",
    controlKey: REQUEST_BATCHING_MODE_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Aggressive batching maximized per-instance throughput at a small, real latency cost",
      explanation:
        "Aggressive batching pushes effective per-instance throughput further than adaptive batching, letting the fleet shrink to its lowest safe size — at the cost of a small, real, but still within-SLO latency increase per batched request. This is a genuine, accepted tradeoff (business invariant: a temporary small latency increase is acceptable if still inside SLO), not a free improvement.",
    },
  },

  // ── warmPoolSize ──────────────────────────────────────────────────
  {
    id: "acr_9",
    controlKey: WARM_POOL_SIZE_KEY,
    valueEquals: 4,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "A lean warm pool kept the cold-start cushion while removing most of its idle cost",
      explanation:
        "A warm pool of 20 was pure idle spend at today's healthy, low-variance traffic. Reducing it to 4 keeps enough pre-initialized capacity to absorb a normal bump without a cold-start gap, while removing most of the unnecessary standing cost.",
    },
  },
  {
    id: "acr_10",
    controlKey: WARM_POOL_SIZE_KEY,
    valueEquals: 0,
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "neutral",
    feedback: {
      title: "Removing the warm pool entirely removes its cost along with its cold-start cushion",
      explanation:
        "Setting the warm pool to zero removes all of its cost, but also removes the cold-start cushion entirely. This is only a safe, neutral tradeoff once the replica floor and idle-capacity policy are already providing enough standing capacity on their own — it is a situational choice, not a universal improvement.",
    },
  },

  // ── idleCapacityPolicy ────────────────────────────────────────────
  {
    id: "acr_11",
    controlKey: IDLE_CAPACITY_POLICY_KEY,
    valueEquals: "scale-to-min",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Scale-to-min let the fleet drain to its safe floor during quiet periods",
      explanation:
        "Allowing the fleet to drain down to minReplicaCount during sustained quiet traffic — never below it — removes real idle spend. This is only genuinely safe because minReplicaCount itself is set at or above the authored safety floor; this policy alone does not create a floor, it only lets the fleet reach whichever floor is configured.",
    },
  },
  {
    id: "acr_12",
    controlKey: IDLE_CAPACITY_POLICY_KEY,
    valueEquals: "scale-to-floor-minus-two",
    whenTriggerEquals: { costAnomalyActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scale-to-floor-minus-two breached redundancy regardless of the configured floor",
      explanation:
        "This policy ignores minReplicaCount entirely and drains two instances below whatever floor is configured — a second, independent way to breach the redundancy floor even when minReplicaCount itself is set safely at 6. It produces the lowest-looking cost numbers in the scenario while directly violating the invariant that critical redundancy may not be removed below the stated safety floor, and contributes to the same permanent, non-resetting breach-time count as a directly-lowered replica floor.",
    },
  },
];
