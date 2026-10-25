import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "shard-router": "healthy",
  "shard1-primary": "healthy",
  "shard1-replica": "healthy",
  "shard2-primary": "healthy",
  "shard2-replica": "healthy",
  "shard3-primary": "healthy",
  "shard3-replica": "healthy",
  "shard4-primary": "healthy",
  "shard4-replica": "healthy",
};

const shard2DegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shard2-primary": "degraded",
  "shard2-replica": "degraded",
  api: "degraded",
};

const shard2CriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shard2-primary": "critical",
  "shard2-replica": "degraded",
  api: "degraded",
};

const unsafeFailoverHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  // The misleading symptom, made structural: the replica node itself
  // reads healthy (it IS up and serving) while shard-router/api read
  // degraded because of the correctness risk now sitting behind an
  // apparently-healthy facade.
  "shard2-primary": "degraded",
  "shard2-replica": "healthy",
  "shard-router": "degraded",
};

const allShardsStressedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shard2-primary": "critical",
  "shard2-replica": "degraded",
  api: "critical",
  "shard1-primary": "degraded",
  "shard3-primary": "degraded",
  "shard4-primary": "degraded",
};

const containedDrainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "shard2-primary": "degraded",
  "shard2-replica": "degraded",
};

/**
 * Authored rule table for Hot Shard + Replica Lag + Failover Risk,
 * ordered most-specific first.
 *
 * ROOT MECHANISM: a concentrated hot tenant drives write pressure onto
 * Shard 2 Primary (hotShardActive). This write pressure is what
 * directly causes Shard 2's replica to fall behind (replicaLagActive)
 * -- a CORRELATED consequence of the same root cause, not an
 * independent failure. The replica's PROCESS health
 * (shard2ReplicaProcessHealthPct) stays at 100 throughout: this is the
 * scenario's defining misleading symptom -- a healthy process-health
 * check tells the candidate nothing about whether the replica's data
 * is caught up enough to safely take write authority.
 *
 * SAFE THRESHOLD: a replica is only safe to promote once
 * shard2ReplicaLagSeconds is at or below SAFE_LAG_THRESHOLD_SECONDS
 * (30s). Promoting above that threshold is the UNSAFE-SEQUENCE trap
 * named explicitly in phase6d.2.md: "fail over first -> discover stale
 * authority afterward." Every tick an unsafe promotion remains in
 * effect, shard2StrandedAcknowledgedWriteCount -- the HISTORICAL
 * damage counter -- increases by a real, authored amount. This counter
 * NEVER resets merely because failoverShard2 is later flipped back to
 * false or lag subsequently drains; the only way it moves downward is
 * RECONCILE_STRANDED_WRITES_KEY="active", which drains it gradually
 * over real elapsed simulated time (see the reconciling rules below).
 *
 * PRESSURE TRANSFER (required, real numbers): scaling API concurrency
 * to "high" does not relieve Shard 2 at all -- every shard is reached
 * through the single Shard Router, so added API-fleet concurrency adds
 * more concurrent connections against the SAME hot Shard 2 Primary.
 * shard2PrimaryQueueDepth and shard2PrimaryWriteLatencyMs get
 * MEASURABLY WORSE (not merely "no better") relative to the
 * do-nothing baseline, and apiCustomerLatencyMs -- now driven by
 * connection contention across every shard, not just Shard 2 -- also
 * rises, with otherwise-unaffected Shards 1/3/4 showing elevated
 * request rate from the added connection overhead even though their
 * own tenants never changed behavior.
 *
 * RECOVERY LAG (required): shard2ReplicaLagSeconds only ever decreases
 * across the authored lagDrainWindowElapsed trigger boundary, and only
 * when Shard 2 Primary write pressure has actually been reduced
 * (hot-tenant throttle engaged). A candidate who contains the hot
 * tenant but checks back before the window elapses observes a real,
 * nonzero, still-draining lag value -- never an instant snap to
 * caught-up.
 *
 * STRONG PATH: contain hot-tenant pressure (strict throttle) -> reduce
 * primary pressure -> prioritize replica catch-up -> wait for the real
 * drain window -> evaluate failover only once lag is within the safe
 * threshold (or skip failover entirely, since containment alone fully
 * resolves the incident without ever needing to promote anything) ->
 * gradually restore hot-tenant traffic (throttle back to moderate/off).
 */
export const hotShardReplicaLagFailoverRiskRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE: the central trap. Checked first -- wins regardless of any
  // other control combination, because an ongoing correctness
  // violation is never acceptable no matter how healthy process health
  // or customer latency read elsewhere.
  // ══════════════════════════════════════════════════════════════════
  //
  // ── UNSAFE but being actively reconciled (checked FIRST among the
  // unsafe-failover rules, since this is the more specific control
  // combination -- it additionally requires RECONCILE_STRANDED_WRITES
  // and HOT_TENANT_THROTTLE, whereas the plain unsafe-failover rules
  // below match on FAILOVER_SHARD2_KEY alone): failover already
  // happened unsafely (shard2FailoverSafety stays "unsafe-promotion"
  // -- fixing the live reconciliation control does NOT retroactively
  // make the promotion itself safe), reconciliation has been turned
  // on, and new damage has stopped accumulating because the promoted
  // replica is no longer accepting writes without the old primary's
  // missing data being replayed first. The stranded count DRAINS
  // gradually here -- real, bounded, demonstrably decreasing -- but
  // starts from whatever peak it had already reached, never snapping
  // to zero.
  {
    id: "unsafe-failover-reconciling-drained",
    when: {
      triggerEquals: { replicaLagActive: true, reconciliationWindowElapsed: true },
      controlEquals: {
        [FAILOVER_SHARD2_KEY]: true,
        [RECONCILE_STRANDED_WRITES_KEY]: "active",
        [HOT_TENANT_THROTTLE_KEY]: "strict",
      },
    },
    incidentState: "unsafe-failover-reconciling-drained",
    values: {
      shard2PrimaryRequestRate: 460,
      shard2PrimaryWriteLatencyMs: 26,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 2,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 46,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 10,
      shard2FailoverSafety: "unsafe-promotion",
      // Draining, real and bounded, but NOT reset to zero merely
      // because the live configuration (throttle, reconciliation
      // toggle) was fixed -- the historical loss took real time to
      // reconcile and this rule's lower, nonzero value proves it is
      // genuinely trending down from the sustained-unsafe peak (140),
      // never snapping instantly.
      shard2StrandedAcknowledgedWriteCount: 12,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: shard2DegradedHealth,
  },
  // Checked AFTER the drained rule above (which requires the
  // additional reconciliationWindowElapsed trigger) since this rule's
  // condition is a strict subset and would otherwise shadow it.
  {
    id: "unsafe-failover-reconciling-early",
    when: {
      triggerEquals: { replicaLagActive: true },
      controlEquals: {
        [FAILOVER_SHARD2_KEY]: true,
        [RECONCILE_STRANDED_WRITES_KEY]: "active",
        [HOT_TENANT_THROTTLE_KEY]: "strict",
      },
    },
    incidentState: "unsafe-failover-reconciling-early",
    values: {
      // Hot-tenant pressure has been contained (strict throttle) even
      // though the promotion itself was unsafe, so replica lag is
      // falling on its own track -- but the STRANDED-WRITE count is a
      // separate, historical ledger-position problem that containing
      // live pressure does not touch at all.
      shard2PrimaryRequestRate: 500,
      shard2PrimaryWriteLatencyMs: 55,
      shard2PrimaryQueueDepth: 15,
      shard2ReplicaLagSeconds: 20,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 68,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 11,
      shard2FailoverSafety: "unsafe-promotion",
      shard2StrandedAcknowledgedWriteCount: 60,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: shard2DegradedHealth,
  },

  // ── The central trap, plain (no reconciliation engaged). Checked
  // after the more-specific reconciling rules above but still before
  // every other non-unsafe rule, because an ongoing correctness
  // violation is never acceptable no matter how healthy process
  // health or customer latency read elsewhere.
  {
    id: "unsafe-sequence-failover-before-safe-lag-sustained",
    when: {
      triggerEquals: {
        replicaLagActive: true,
        lagDrainWindowElapsed: false,
        unsafeFailoverSustained: true,
      },
      controlEquals: { [FAILOVER_SHARD2_KEY]: true },
    },
    incidentState: "unsafe-failover-active-sustained",
    values: {
      shard2PrimaryRequestRate: 0,
      shard2PrimaryWriteLatencyMs: 0,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 95,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 50,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 70,
      shard2FailoverSafety: "unsafe-promotion",
      // HISTORICAL damage, grown further than the onset snapshot
      // below (85) for the exact same unsafe control combination --
      // real, climbing accumulation while the unsafe promotion
      // remains in effect, not a one-time flat penalty.
      shard2StrandedAcknowledgedWriteCount: 140,
      shard2CorrectnessRiskStatus: "critical",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: unsafeFailoverHealth,
  },
  // The same trap, caught earlier -- right after the unsafe promotion
  // but before the sustained window has elapsed. Lower stranded-write
  // count than the sustained rule above for the identical control
  // combination, proving the counter genuinely grows with elapsed
  // time rather than being a flat penalty applied once.
  {
    id: "unsafe-sequence-failover-before-safe-lag-onset",
    when: {
      triggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: false },
      controlEquals: { [FAILOVER_SHARD2_KEY]: true },
    },
    incidentState: "unsafe-failover-active",
    values: {
      shard2PrimaryRequestRate: 0,
      shard2PrimaryWriteLatencyMs: 0,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 70,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 50,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 70,
      shard2FailoverSafety: "unsafe-promotion",
      shard2StrandedAcknowledgedWriteCount: 85,
      shard2CorrectnessRiskStatus: "critical",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: unsafeFailoverHealth,
  },
  // ── The unsafe promotion's live replica-level symptoms eventually
  // subside on their own (lagDrainWindowElapsed fires), but
  // RECONCILIATION WAS NEVER TURNED ON. The historical stranded-write
  // count stays EXACTLY at its last-reached value forever -- it does
  // not grow further (no new unsafe promotion is occurring), but it
  // also does NOT drain, because draining only ever happens via the
  // separately-modeled reconciliation process. This is the
  // scenario's sharpest proof that "fixing the cause" (here, simply
  // letting live pressure subside) is never the same as "undoing
  // damage already caused."
  {
    id: "unsafe-failover-unreconciled-frozen",
    when: {
      triggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: true },
      controlEquals: {
        [FAILOVER_SHARD2_KEY]: true,
        [RECONCILE_STRANDED_WRITES_KEY]: "off",
        [HOT_TENANT_THROTTLE_KEY]: "off",
      },
    },
    incidentState: "unsafe-failover-unreconciled-frozen",
    values: {
      shard2PrimaryRequestRate: 0,
      shard2PrimaryWriteLatencyMs: 0,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 0,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 46,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 70,
      shard2FailoverSafety: "unsafe-promotion",
      // Frozen at the sustained-unsafe peak -- not climbing further,
      // but not draining either, since reconciliation was never
      // engaged.
      shard2StrandedAcknowledgedWriteCount: 140,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: shard2DegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE failover: promotion only happens once the drain window has
  // elapsed (the engine's proxy for "lag is within the safe
  // threshold" -- see timed-events.ts; lagDrainWindowElapsed only
  // fires once enough time has passed for a properly-contained Shard 2
  // to have drained, and rules.ts's baseline/unsafe paths never reach
  // a low lag value without containment regardless of this trigger).
  // Zero stranded writes: the promotion never raced an unsafe lag
  // value.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-failover-after-threshold",
    when: {
      triggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: true },
      controlEquals: {
        [FAILOVER_SHARD2_KEY]: true,
        [HOT_TENANT_THROTTLE_KEY]: "strict",
      },
    },
    incidentState: "safe-failover-after-threshold",
    values: {
      shard2PrimaryRequestRate: 0,
      shard2PrimaryWriteLatencyMs: 0,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 0,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 44,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 12,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PRESSURE TRANSFER (required): broad API concurrency scaling with no
  // hot-tenant relief. Every added connection targets the SAME hot
  // Shard 2 Primary through the one shared Shard Router -- queue depth
  // and latency get measurably WORSE than the do-nothing baseline, and
  // other shards show elevated request rate purely from connection
  // overhead despite their own tenants being unchanged.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "broad-api-scaling-worsens-hot-shard",
    when: {
      triggerEquals: { hotShardActive: true },
      controlEquals: {
        [API_CONCURRENCY_KEY]: "high",
        [HOT_TENANT_THROTTLE_KEY]: "off",
      },
    },
    incidentState: "broad-scaling-worsened",
    values: {
      shard2PrimaryRequestRate: 3_600,
      shard2PrimaryWriteLatencyMs: 2_900,
      shard2PrimaryQueueDepth: 1_150,
      shard2ReplicaLagSeconds: 140,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 2_400,
      otherShardsPrimaryRequestRate: 540,
      shard2HotTenantTrafficSharePct: 85,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: allShardsStressedHealth,
  },

  // ── Read-routing correctness check: allowing replica reads while
  // lag is still far outside the authored staleness bound is itself a
  // real, if lesser, business-invariant violation ("stale reads may be
  // tolerated only within the authored bound") -- distinct from the
  // failover trap, since no write authority has changed hands here.
  {
    id: "stale-read-routing-violation",
    when: {
      triggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: false },
      controlEquals: {
        [READ_ROUTING_KEY]: "replica-allowed",
        [HOT_TENANT_THROTTLE_KEY]: "off",
      },
    },
    incidentState: "stale-read-routing-violation",
    values: {
      shard2PrimaryRequestRate: 2_600,
      shard2PrimaryWriteLatencyMs: 1_750,
      shard2PrimaryQueueDepth: 640,
      shard2ReplicaLagSeconds: 95,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 520,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 72,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: shard2CriticalHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY-LAG sequence (required): contained (hot-tenant throttled
  // strict, replica catch-up prioritized), lag genuinely draining but
  // NOT yet across the drain-window boundary -- real, nonzero,
  // observably-improving-but-not-caught-up values. Only once
  // lagDrainWindowElapsed also fires does the fully-recovered state
  // appear. Same control combination, two different trigger states,
  // two different authored value sets.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "contained-draining",
    when: {
      triggerEquals: {
        hotShardActive: true,
        replicaLagActive: true,
        lagDrainWindowElapsed: false,
      },
      controlEquals: {
        [HOT_TENANT_THROTTLE_KEY]: "strict",
        [REPLICA_CATCHUP_PRIORITY_KEY]: "prioritized",
      },
    },
    incidentState: "contained-draining",
    values: {
      shard2PrimaryRequestRate: 520,
      shard2PrimaryWriteLatencyMs: 60,
      shard2PrimaryQueueDepth: 20,
      shard2ReplicaLagSeconds: 22,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 70,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 11,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: containedDrainingHealth,
  },
  {
    id: "contained-recovered",
    when: {
      triggerEquals: {
        hotShardActive: true,
        replicaLagActive: true,
        lagDrainWindowElapsed: true,
      },
      controlEquals: {
        [HOT_TENANT_THROTTLE_KEY]: "strict",
        [REPLICA_CATCHUP_PRIORITY_KEY]: "prioritized",
      },
    },
    incidentState: "contained-recovered",
    values: {
      shard2PrimaryRequestRate: 460,
      shard2PrimaryWriteLatencyMs: 26,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 2,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 46,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 10,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: healthyHealth,
  },

  // ── Alternate strong path: moderate hot-tenant throttle (not
  // strict) combined with write-throttle on Shard 2 and replica
  // catch-up prioritized. A genuinely different, also-legitimate
  // containment strategy: spreads the relief across two blunter levers
  // (platform-wide Shard 2 write throttle + moderate hot-tenant cap)
  // instead of one sharp one (strict hot-tenant throttle alone),
  // trading a slightly higher sustained hot-tenant traffic share for
  // not fully starving the hot tenant's own throughput. Reaches a
  // genuinely safe drained state with a real, different authored
  // tradeoff -- not the same numbers as contained-recovered.
  {
    id: "alternate-moderate-throttle-draining",
    when: {
      triggerEquals: {
        hotShardActive: true,
        replicaLagActive: true,
        lagDrainWindowElapsed: false,
      },
      controlEquals: {
        [HOT_TENANT_THROTTLE_KEY]: "moderate",
        [WRITE_THROTTLE_SHARD2_KEY]: "on",
        [REPLICA_CATCHUP_PRIORITY_KEY]: "prioritized",
      },
    },
    incidentState: "alternate-moderate-throttle-draining",
    values: {
      shard2PrimaryRequestRate: 700,
      shard2PrimaryWriteLatencyMs: 90,
      shard2PrimaryQueueDepth: 45,
      shard2ReplicaLagSeconds: 28,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 85,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 34,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: containedDrainingHealth,
  },
  {
    id: "alternate-moderate-throttle-recovered",
    when: {
      triggerEquals: {
        hotShardActive: true,
        replicaLagActive: true,
        lagDrainWindowElapsed: true,
      },
      controlEquals: {
        [HOT_TENANT_THROTTLE_KEY]: "moderate",
        [WRITE_THROTTLE_SHARD2_KEY]: "on",
        [REPLICA_CATCHUP_PRIORITY_KEY]: "prioritized",
      },
    },
    incidentState: "alternate-moderate-throttle-recovered",
    values: {
      shard2PrimaryRequestRate: 610,
      shard2PrimaryWriteLatencyMs: 40,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 5,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 55,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 32,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: healthyHealth,
  },

  // ── Partial relief: hot-tenant throttled strict, but replica
  // catch-up left at "normal" priority. Primary pressure genuinely
  // drops (shard2PrimaryRequestRate/latency recover), but lag drains
  // much more slowly without dedicated replication priority --
  // demonstrating replicaCatchUpPriority is a real, non-dead lever
  // distinct from merely relieving primary pressure.
  {
    id: "throttled-without-catchup-priority-slow-drain",
    when: {
      triggerEquals: {
        hotShardActive: true,
        replicaLagActive: true,
        lagDrainWindowElapsed: true,
      },
      controlEquals: {
        [HOT_TENANT_THROTTLE_KEY]: "strict",
        [REPLICA_CATCHUP_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "throttled-without-catchup-priority",
    values: {
      shard2PrimaryRequestRate: 460,
      shard2PrimaryWriteLatencyMs: 26,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 18,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 46,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 10,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "warning",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: containedDrainingHealth,
  },

  // ── Second wave baseline: sustained unmitigated hot-shard pressure
  // finally pushes Shard 2 Primary toward saturation.
  {
    id: "baseline-second-wave",
    when: {
      triggerEquals: { hotShardActive: true, replicaLagActive: true, lagDrainWindowElapsed: true },
    },
    incidentState: "baseline-unmitigated-sustained",
    values: {
      shard2PrimaryRequestRate: 3_100,
      shard2PrimaryWriteLatencyMs: 2_200,
      shard2PrimaryQueueDepth: 860,
      shard2ReplicaLagSeconds: 150,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 1_800,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 78,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: shard2CriticalHealth,
  },

  // ── Baseline: both symptoms active, no meaningful mitigation yet.
  {
    id: "baseline-unmitigated",
    when: { triggerEquals: { hotShardActive: true, replicaLagActive: true } },
    incidentState: "baseline-unmitigated",
    values: {
      shard2PrimaryRequestRate: 2_400,
      shard2PrimaryWriteLatencyMs: 1_600,
      shard2PrimaryQueueDepth: 540,
      shard2ReplicaLagSeconds: 80,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 1_250,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 74,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 0,
    },
    componentHealth: shard2CriticalHealth,
  },

  // ── Hot shard active, replica lag not yet active (the brief
  // single-cause onset window before REPLICA_LAG_ONSET_MS fires).
  {
    id: "hot-shard-only",
    when: { triggerEquals: { hotShardActive: true } },
    incidentState: "hot-shard-only",
    values: {
      shard2PrimaryRequestRate: 1_900,
      shard2PrimaryWriteLatencyMs: 900,
      shard2PrimaryQueueDepth: 260,
      shard2ReplicaLagSeconds: 0,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 600,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 68,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: shard2DegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      shard2PrimaryRequestRate: 420,
      shard2PrimaryWriteLatencyMs: 24,
      shard2PrimaryQueueDepth: 0,
      shard2ReplicaLagSeconds: 0,
      shard2ReplicaProcessHealthPct: 100,
      apiCustomerLatencyMs: 45,
      otherShardsPrimaryRequestRate: 400,
      shard2HotTenantTrafficSharePct: 10,
      shard2FailoverSafety: "safe",
      shard2StrandedAcknowledgedWriteCount: 0,
      shard2CorrectnessRiskStatus: "normal",
      shard2ReplicaWithinSafeThreshold: 1,
    },
    componentHealth: healthyHealth,
  },
];
