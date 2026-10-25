import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement, describing the system consequence (including any
 * historical damage incurred or avoided) rather than a verdict. Ids
 * are stable and intentionally neutral.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: FAILOVER_SHARD2_KEY,
    valueEquals: true,
    whenTriggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: false },
    outcome: "harmful",
    feedback: {
      title: "Promoted Shard 2's replica before lag drained",
      explanation:
        "Promoting Shard 2's replica while its replication lag was still far outside the safe threshold hands write authority to a copy that had not yet applied every acknowledged write. Acknowledged writes the old primary had already confirmed to clients, but had not yet replicated, are now stranded on the demoted former primary -- a real, counted historical loss (shard2StrandedAcknowledgedWriteCount) that keeps growing for as long as this unsafe promotion remains in effect, and does not disappear just because the lag value or promotion control is later changed back.",
    },
  },
  {
    id: "acr_2",
    controlKey: FAILOVER_SHARD2_KEY,
    valueEquals: true,
    whenTriggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: true },
    outcome: "beneficial",
    feedback: {
      title: "Promoted Shard 2's replica only after the safe catch-up window",
      explanation:
        "Promoting the replica only once enough time had passed for a properly-throttled Shard 2 to actually catch up means the replica held write authority with no unreplicated acknowledged writes outstanding. Zero stranded writes result -- the structurally safe way to use this lever, distinct from promoting on a misleadingly healthy process-health signal alone.",
    },
  },
  {
    id: "acr_3",
    controlKey: HOT_TENANT_THROTTLE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { hotShardActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled the concentrated hot tenant strictly",
      explanation:
        "Capping the identified hot tenant's own request rate directly relieves Shard 2 Primary write pressure, which is the prerequisite for replica lag actually draining rather than merely holding steady. This is the business-sanctioned tradeoff the briefing calls out explicitly -- the throttled tenant's own throughput drops, but every other tenant and the shared platform are protected.",
    },
  },
  {
    id: "acr_4",
    controlKey: API_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { hotShardActive: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled API concurrency broadly",
      explanation:
        "Every shard is reached through the same shared Shard Router, so adding API-fleet concurrency opens more concurrent connections against the SAME hot Shard 2 Primary rather than spreading load anywhere else. Shard 2 Primary queue depth and write latency get measurably worse than doing nothing at all, and customer-facing latency rises further because the added connection contention is now felt across every shard, including the three that were never actually hot.",
    },
  },
  {
    id: "acr_5",
    controlKey: REPLICA_CATCHUP_PRIORITY_KEY,
    valueEquals: "prioritized",
    whenTriggerEquals: { replicaLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Prioritized Shard 2 replica catch-up",
      explanation:
        "Dedicating more of the shared replication capacity to Shard 2's replica specifically accelerates how quickly it actually catches up once primary write pressure has already been reduced. Without primary pressure also being relieved, this lever alone has only a small effect, since the replica cannot apply its backlog faster than the primary's current write rate allows.",
    },
  },
  {
    id: "acr_6",
    controlKey: READ_ROUTING_KEY,
    valueEquals: "replica-allowed",
    whenTriggerEquals: { replicaLagActive: true, lagDrainWindowElapsed: false },
    outcome: "harmful",
    feedback: {
      title: "Allowed replica reads while lag was far outside the staleness bound",
      explanation:
        "Routing reads to Shard 2's replica while its replication lag is still far outside the authored staleness bound serves customers data that is stale well beyond what the business invariant tolerates. This is a distinct violation from the failover trap -- no write authority changed hands here -- but it is still a real breach of 'stale reads may be tolerated only within the authored bound.'",
    },
  },
  {
    id: "acr_7",
    controlKey: WRITE_THROTTLE_SHARD2_KEY,
    valueEquals: "on",
    whenTriggerEquals: { hotShardActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled all Shard 2 write volume",
      explanation:
        "Capping Shard 2 Primary's total write acceptance rate relieves primary pressure the same way hot-tenant throttling does, but it is a blunter lever: every tenant on Shard 2 is throttled, not only the concentrated hot one. A legitimate alternate containment strategy, at the cost of a broader, less targeted impact.",
    },
  },
  {
    id: "acr_8",
    controlKey: RECONCILE_STRANDED_WRITES_KEY,
    valueEquals: "active",
    whenTriggerEquals: { replicaLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Started reconciling stranded acknowledged writes",
      explanation:
        "Turning on reconciliation begins a real, rate-limited replay of the acknowledged-write backlog stranded on the demoted former primary against the new authoritative copy. This drains shard2StrandedAcknowledgedWriteCount gradually over real elapsed time -- it does not, and cannot, repair the backlog instantly, and the count does not move at all unless this control is actually engaged, regardless of how the live configuration elsewhere is fixed.",
    },
  },
  {
    id: "acr_9",
    controlKey: HOT_TENANT_THROTTLE_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { hotShardActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled the hot tenant moderately",
      explanation:
        "A moderate cap trims the hot tenant's traffic bursts without fully starving its sustained throughput. Combined with Shard 2 write throttling, this reaches a genuinely safe drained state, trading a smaller reduction in the hot tenant's own impact for a less aggressive single-tenant penalty than strict throttling.",
    },
  },
];
