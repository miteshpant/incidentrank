import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── multiAzMode ────────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: MULTI_AZ_MODE_KEY,
    valueEquals: "single-az-only",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "harmful",
    feedback: {
      title: "Removing the single-zone failover target drops below the mandatory resilience floor",
      explanation:
        "Setting multi-AZ mode to single-az-only saves the most money of any multi-AZ setting and changes nothing visible right now — request success rate and latency stay exactly where they were. That is precisely the trap: there is no longer a healthy zone for traffic to fail over to if the active zone ever fails. The next scheduled single-AZ failure drill will find this directly, producing a real, measurable availability and latency hit, and the resulting unabsorbed-drill exposure is recorded permanently and never erased by restoring multi-AZ mode afterward. This is the scenario's core forbidden lever — never acceptable regardless of how healthy the dashboard looks in the meantime.",
    },
  },
  {
    id: "acc_2",
    controlKey: MULTI_AZ_MODE_KEY,
    valueEquals: "single-az-with-standby",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping a warm standby zone preserves the mandatory failover target at lower cost",
      explanation:
        "Moving multi-AZ mode from active-active down to single-az-with-standby is this scenario's stated operating baseline: a real, meaningful monthly saving over running two fully active zones, while still keeping a second zone warm and ready to receive traffic if the active zone fails. The mandatory single-zone failure-tolerance floor stays satisfied because a failing zone still has somewhere safe to go — this is a required ingredient of both legitimate cost-reduction strategies for this incident.",
    },
  },
  {
    id: "acc_3",
    controlKey: MULTI_AZ_MODE_KEY,
    valueEquals: "active-active",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Active-active is maximally safe but leaves real savings unclaimed",
      explanation:
        "Leaving every zone fully active is not unsafe — the high-risk window's resilience posture is still fully intact — but it is pure cost waste once that window has genuinely ended: the business invariant allows lowering risk posture to the stated operating baseline, and leaving this at its most expensive setting indefinitely leaves that saving on the table for no remaining safety benefit.",
    },
  },

  // ── failoverReserve ───────────────────────────────────────────────
  {
    id: "acc_4",
    controlKey: FAILOVER_RESERVE_KEY,
    valueEquals: "none",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "harmful",
    feedback: {
      title: "Releasing all failover reserve leaves no spare capacity to actually absorb a failover",
      explanation:
        "Even if a failover target zone exists, releasing all reserved capacity there means that zone has nothing spare to serve traffic with once it actually arrives — a failover with nowhere to land is just as unsafe as having no failover target at all. This drops below the mandatory resilience floor just as directly as removing multi-AZ mode does, is invisible on every live metric until the next scheduled drill, and its exposure is recorded permanently once a drill finds it.",
    },
  },
  {
    id: "acc_5",
    controlKey: FAILOVER_RESERVE_KEY,
    valueEquals: "baseline-reserved",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Baseline-reserved keeps genuine failover capacity at a lower, right-sized cost",
      explanation:
        "Lowering reserved failover capacity from the full peak-event profile to the stated normal-traffic failover profile is a real saving that still leaves enough spare capacity for a genuine failover to be absorbed cleanly — the other required ingredient, alongside multi-AZ mode, of both legitimate cost-reduction strategies.",
    },
  },
  {
    id: "acc_6",
    controlKey: FAILOVER_RESERVE_KEY,
    valueEquals: "peak-reserved",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Peak-reserved failover capacity is safe but no longer necessary at this size",
      explanation:
        "Holding the full peak-event failover reserve is not unsafe, but it is sized for traffic the platform is no longer carrying now that the high-risk window has ended — a real, avoidable monthly cost with no remaining safety justification at this size.",
    },
  },

  // ── backupFrequency ───────────────────────────────────────────────
  {
    id: "acc_7",
    controlKey: BACKUP_FREQUENCY_KEY,
    valueEquals: "minimal",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "harmful",
    feedback: {
      title: "Minimal backup frequency violates the durability guarantee silently",
      explanation:
        "Dropping backup frequency to minimal saves real money and changes nothing on any availability or latency dashboard — this violation has no visible signature at all. But it genuinely widens the recovery-point window past what the durability guarantee this platform's invariants require, which is a distinct mandatory-floor violation from the AZ/failover posture, equally real and equally unacceptable even though no drill is needed to expose it.",
    },
  },
  {
    id: "acc_8",
    controlKey: BACKUP_FREQUENCY_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Standard backup frequency is the correct, right-sized durability baseline",
      explanation:
        "Lowering backup frequency from high-frequency to standard is a real, modest saving that still keeps the recovery-point window comfortably within the durability guarantee this platform's invariants require — the correct baseline once the high-risk window's elevated caution is no longer needed.",
    },
  },
  {
    id: "acc_9",
    controlKey: BACKUP_FREQUENCY_KEY,
    valueEquals: "high-frequency",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "High-frequency backups remain safe but no longer match the current risk level",
      explanation:
        "Keeping backups at the high-risk-window frequency is not unsafe, but it is real, ongoing storage and compute cost that the stated operating baseline does not require once the high-risk period has concluded.",
    },
  },

  // ── replicaCount ──────────────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: REPLICA_COUNT_KEY,
    valueEquals: "baseline-operating",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Baseline-operating replica count removes compute waste with zero resilience cost",
      explanation:
        "Lowering replica count from the peak-event multiple to the stated operating baseline is a real, meaningful saving that carries no mandatory-floor consequence at all — replica count plays no role in this platform's single-zone failure tolerance or durability guarantee, only in absorbing traffic volume, which has already returned to normal.",
    },
  },
  {
    id: "acc_11",
    controlKey: REPLICA_COUNT_KEY,
    valueEquals: "minimum",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Minimum replica count saves the most but removes ordinary traffic headroom",
      explanation:
        "Going below the stated operating baseline to the minimum replica count saves slightly more, but it is not itself a mandatory-floor violation — it removes the standby headroom that absorbs ordinary day-to-day traffic variance, a real but bounded tradeoff distinct from (and far less severe than) an actual resilience-floor violation.",
    },
  },

  // ── warmCapacity ──────────────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: WARM_CAPACITY_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced warm capacity trims idle-standby cost at a bounded, accepted tradeoff",
      explanation:
        "Lowering pre-warmed idle capacity to the operating baseline is a real saving. The accepted tradeoff is a brief cold-start latency bump if a sudden demand spike ever occurs — a real but bounded and acceptable cost now that the high-risk window (and the elevated spike risk it represented) has ended.",
    },
  },
  {
    id: "acc_13",
    controlKey: WARM_CAPACITY_KEY,
    valueEquals: "none",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Removing all warm capacity saves the most but removes the cold-start buffer entirely",
      explanation:
        "Dropping warm capacity to none saves slightly more than the reduced setting, but removes the cold-start buffer entirely rather than merely right-sizing it — not a mandatory-floor violation, but a less measured choice than reducing to the stated baseline.",
    },
  },

  // ── standbyFleet ──────────────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: STANDBY_FLEET_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "A smaller standby fleet still leaves a real instant-failover pool at lower cost",
      explanation:
        "Trimming the pre-registered, health-checked standby fleet to a smaller but nonzero pool is a real saving that still leaves genuine instant-failover capacity available — the mandatory floor only requires that failover HAS somewhere safe and resourced to go, not a specific standby-fleet size.",
    },
  },
  {
    id: "acc_15",
    controlKey: STANDBY_FLEET_KEY,
    valueEquals: "none",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Removing the standby fleet entirely saves the most but compounds thin failover margins",
      explanation:
        "Removing the standby fleet entirely is not itself a mandatory-floor violation, but stacked with a thin failover reserve it compounds the risk that a genuine failover event could not be served as smoothly as it otherwise would be — a real, if secondary, cost of going this far.",
    },
  },

  // ── databaseReplicaClass ──────────────────────────────────────────
  {
    id: "acc_16",
    controlKey: DATABASE_REPLICA_CLASS_KEY,
    valueEquals: "baseline-sized",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Baseline-sized database class matches real, already-normal write volume",
      explanation:
        "Lowering the Database Primary's instance class from peak-sized to the stated baseline is a real saving with zero correctness or durability consequence, since write volume itself has already returned to normal — this incident is about posture, not an active traffic event.",
    },
  },
  {
    id: "acc_17",
    controlKey: DATABASE_REPLICA_CLASS_KEY,
    valueEquals: "undersized",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Undersizing the database below baseline risks real performance cost, not a floor violation",
      explanation:
        "Going below the baseline write-volume need is not a mandatory-floor violation in this scenario (the floor concerns AZ/failover posture and backup frequency, not raw database sizing), but it is a real, distinct performance-risk cost of its own: query latency and replication-apply throughput both degrade once genuine baseline write volume resumes.",
    },
  },

  // ── prewarmedCacheCapacity ────────────────────────────────────────
  {
    id: "acc_18",
    controlKey: PREWARMED_CACHE_CAPACITY_KEY,
    valueEquals: "baseline-sized",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "beneficial",
    feedback: {
      title: "Baseline-sized cache capacity matches real read concurrency with no correctness risk",
      explanation:
        "Lowering pre-warmed read-path cache capacity to the stated baseline is a real saving. Cache capacity affects latency and hit rate only, never durability or failover safety, so this carries zero mandatory-floor consequence.",
    },
  },
  {
    id: "acc_19",
    controlKey: PREWARMED_CACHE_CAPACITY_KEY,
    valueEquals: "minimal",
    whenTriggerEquals: { highRiskWindowEnded: true },
    outcome: "neutral",
    feedback: {
      title: "Minimal cache capacity saves the most but raises read-replica load",
      explanation:
        "Going below the stated baseline to minimal cache capacity is not a mandatory-floor violation, but it does measurably raise Read Replica load as more cache misses fall through to the database — a real, distinct performance cost even though it is not a resilience or durability violation.",
    },
  },
];
