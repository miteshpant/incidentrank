import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Shard 2 Primary request rate, P99 write latency, and queue depth --
  // the directly-observable hot-shard symptom. Climbs as the
  // concentrated hot tenant's traffic lands on Shard 2.
  shard2PrimaryRequestRate: 420,
  shard2PrimaryWriteLatencyMs: 24,
  shard2PrimaryQueueDepth: 0,
  // Shard 2 Replica's replication lag, in seconds. Zero is healthy.
  // Climbs as Shard 2 Primary's write volume outpaces what the replica
  // can apply; only recovers gradually over real elapsed simulated
  // time once primary write pressure drops back within the replica's
  // catch-up capacity -- never resolved instantly by any control
  // change (see rules.ts's recovery-lag decay sequence).
  shard2ReplicaLagSeconds: 0,
  // Shard 2 Replica's PROCESS health, 0-100 -- deliberately modeled as
  // a SEPARATE field from replication lag. This is the scenario's
  // misleading symptom: the replica process can read 100 (fully up,
  // responding to health checks) while shard2ReplicaLagSeconds is
  // severely behind. Process health alone must never be read as "safe
  // to promote."
  shard2ReplicaProcessHealthPct: 100,
  // API-level customer latency, in ms, aggregated across all traffic
  // (not just Shard 2) -- rises because Shard 2 Primary's queueing
  // backs up through the Shard Router into API-level tail latency.
  apiCustomerLatencyMs: 45,
  // Shards 1/3/4 primary request rate -- stay flat the entire incident
  // unless the candidate scales API concurrency broadly, which adds
  // connection overhead everywhere including these otherwise-unrelated
  // shards without relieving Shard 2 at all.
  otherShardsPrimaryRequestRate: 400,
  // Fraction (0-100) of Shard 2's current traffic that belongs to the
  // concentrated hot tenant. High while unmitigated; drops once
  // hot-tenant throttling is engaged.
  shard2HotTenantTrafficSharePct: 70,

  // ── Correctness-relevant state ─────────────────────────────────────

  // Whether a payment/write authorized against Shard 2 was accepted by
  // a replica that had not caught up to a safe threshold at the moment
  // it took write authority. This is the single generic string-state
  // field scoring's dataIntegrity measure reads. "safe" = no failover
  // has happened, or failover only ever happened once lag was within
  // the authored safety threshold. "unsafe-promotion" = failover was
  // executed while shard2ReplicaLagSeconds exceeded the authored
  // threshold -- the forbidden state, regardless of how healthy
  // process health or customer latency read at that moment.
  shard2FailoverSafety: "safe",
  // HISTORICAL/CUMULATIVE damage counter (phase6d.2.md section 9):
  // acknowledged writes the old Shard 2 Primary confirmed to clients
  // that never reached the replica before it was promoted during an
  // unsafe failover. This ONLY increases while an unsafe promotion is
  // actively in effect (see rules.ts); it NEVER resets to zero merely
  // because the live configuration was subsequently fixed (e.g.
  // failoverShard2 flipped back to false, or lag later drains). The
  // only way this count moves downward is the separately-modeled
  // reconciliation process (RECONCILE_STRANDED_WRITES_KEY), which
  // drains it gradually over real elapsed simulated time -- never
  // instantly, never automatically.
  shard2StrandedAcknowledgedWriteCount: 0,
  // Severity field (exactly "normal"|"warning"|"critical") tracking
  // Shard 2's overall write-authority/correctness risk specifically --
  // distinct from shard2ReplicaProcessHealthPct (the misleading
  // process-health signal) and from apiCustomerLatencyMs (which can
  // read healthy even while this is critical, e.g. immediately after
  // an unsafe failover when availability numbers look great).
  shard2CorrectnessRiskStatus: "normal",
  // Whether Shard 2's replica is currently within the authored
  // promotion-safety threshold (lag at or below the safe bound). Not
  // itself read by any success/failure condition directly -- surfaced
  // so the candidate can observe the real, time-bounded recovery-lag
  // window rather than guessing.
  shard2ReplicaWithinSafeThreshold: 0,
};
