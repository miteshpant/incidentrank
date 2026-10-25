import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining what changed, what improved, where
 * pressure moved, what invariant was protected/violated, what
 * historical consequence was created, and what remains unresolved (per
 * phase6d.4.md section 18).
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: TRAFFIC_CLASS_PRIORITY_KEY,
    valueEquals: "shed-optional",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Shed optional traffic at the edge, policy-based",
      explanation:
        "Declining search/personalization requests at Edge/CDN — before they ever reach API Fleet, Cache, or Database — is this scenario's core policy-based triage lever (business invariant #5). This frees real cache and DB capacity for checkout/catalog traffic, at the explicit, visible cost of searchAvailabilityStatus moving away from 'normal'. It does not, by itself, protect the database directly — admissionControl and dbConnectionBudget still need to be engaged.",
    },
  },
  {
    id: "acr_1b",
    controlKey: TRAFFIC_CLASS_PRIORITY_KEY,
    valueEquals: "shed-aggressive",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Shed optional AND non-critical surface reads, policy-based",
      explanation:
        "A deeper, still policy-based cut: in addition to declining search/personalization requests, this removes speculative/low-value reads embedded in the critical path's own pages. More protective than shed-optional alone under the most severe pressure, at a proportionally larger cost to the optional-experience surface.",
    },
  },
  {
    id: "acr_2",
    controlKey: LOAD_SHEDDING_KEY,
    valueEquals: "random-shed",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "harmful",
    feedback: {
      title: "Enabled blunt, non-policy-based admission shedding",
      explanation:
        "Random-shed rejects inbound requests regardless of traffic class, dropping checkout/transaction requests in direct proportion to their share of total volume. This directly violates business invariant #5 ('traffic shedding must be policy-based') and invariant #1 ('critical traffic must remain available as long as safely possible') — cumulativeCriticalTrafficDroppedCount becomes nonzero and keeps climbing the longer this stays active. Turning it back off stops NEW drops but never restores the checkout requests already lost: this is a permanent, irreversible historical consequence for this attempt.",
    },
  },
  {
    id: "acr_3",
    controlKey: LOAD_SHEDDING_KEY,
    valueEquals: "off",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "neutral",
    feedback: {
      title: "Disabled blunt admission shedding",
      explanation:
        "Turning random-shed back off stops any further indiscriminate drops of checkout traffic. It does not erase cumulativeCriticalTrafficDroppedCount already accrued — that permanent count carries forward unchanged for the rest of this attempt, exactly like a root cause being fixed without erasing the damage it already caused.",
    },
  },
  {
    id: "acr_4",
    controlKey: ADMISSION_CONTROL_KEY,
    valueEquals: "protect-critical",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Applied bounded admission control to the critical path",
      explanation:
        "Bounding concurrency/queueing specifically in front of the Payment/Transaction Service protects checkout from being overwhelmed by a burst that exceeds what the database can safely absorb from the critical path alone — the most direct expression of 'critical traffic remains available as long as SAFELY possible.' Combined with shedding optional traffic and a bounded DB connection budget, this is one of the required >= 3 interventions for a strong path.",
    },
  },
  {
    id: "acr_5",
    controlKey: API_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "harmful",
    feedback: {
      title: "Raised API Fleet concurrency without protecting the database",
      explanation:
        "Raising apiConcurrency alone looks like scaling up, but it simply admits more concurrent requests into Cache and Database at the same time. Without dbConnectionBudget bounded and without shedding optional traffic first, this measurably pushes dbConnectionUtilizationPercent higher than the unaddressed baseline at the same elapsed time — pressure has moved from 'not enough API capacity' to 'too much concurrent database demand,' not disappeared.",
    },
  },
  {
    id: "acr_6",
    controlKey: CACHE_STRATEGY_KEY,
    valueEquals: "extended-ttl",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Extended cache TTLs for the peak-event key-access pattern",
      explanation:
        "Widening TTLs for read-mostly catalog/product data reduces the volume of requests that ever reach the database, independent of how much traffic is admitted. This does not recover cacheHitRatePercent instantly — it warms back up across a real elapsed-time window (see cacheWarmupWindow1Elapsed/cacheWarmupFullyDone), never on the same tick this is set.",
    },
  },
  {
    id: "acr_7",
    controlKey: DB_CONNECTION_BUDGET_KEY,
    valueEquals: "bounded",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Bounded the database connection budget",
      explanation:
        "Capping total concurrent database connections is the most direct expression of 'the database must not be pushed into collapse.' On its own, excess demand now queues/rejects at the database's own admission edge rather than being absorbed invisibly — a real, honest cost that still shows up in degraded checkout latency unless demand is also genuinely reduced via shedding/caching. dbConnectionUtilizationPercent only drains back toward normal across a real elapsed recovery window once demand has genuinely dropped (see dbRecoveryWindow1Elapsed/dbRecoveryFullyDone).",
    },
  },
  {
    id: "acr_8",
    controlKey: OPTIONAL_FEATURE_DISABLE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Disabled the Search/Personalization Service",
      explanation:
        "Turning off search/personalization entirely is the clearest sacrifice this scenario is built around — it frees real cache and database capacity for checkout and catalog reads at the explicit, visible, honest cost of searchAvailabilityStatus going to 'disabled' (never silent). This is strategy A's signature move; strategy B achieves comparable protection without this specific sacrifice by routing traffic regionally instead.",
    },
  },
  {
    id: "acr_9",
    controlKey: ASYNC_DEFERRAL_KEY,
    valueEquals: "defer-to-queue",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Deferred non-urgent work off the synchronous request path",
      explanation:
        "Moving order confirmation/receipt/inventory/loyalty work onto the Async Queue instead of doing it inline reduces how long each checkout request holds a database connection — real relief for the critical path's own database demand, at the honest cost of a growing queue backlog that must still demonstrably drain, never simply be left to grow unbounded.",
    },
  },
  {
    id: "acr_10",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { sustainedPeak: true, dbRecoveryFullyDone: false },
    outcome: "harmful",
    feedback: {
      title: "Raised worker concurrency while the database was still under pressure",
      explanation:
        "Draining the async backlog aggressively moves pressure OFF the queue and directly ONTO the same database the critical path depends on, since every async worker write lands on that database too. Backlog depth improves while dbConnectionUtilizationPercent rises — a real, measurable, and dangerous trade while the database has not yet genuinely recovered. The right time for high worker concurrency is after dbRecoveryFullyDone, not before.",
    },
  },
  {
    id: "acr_11",
    controlKey: REGIONAL_ROUTING_KEY,
    valueEquals: "split-regional",
    whenTriggerEquals: { peakEventActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Routed a share of traffic to a secondary region's stack",
      explanation:
        "Splitting read-mostly catalog/search traffic to a second region's Edge/API/Cache tier relieves PRIMARY Edge/API/Cache pressure specifically. Since both regions share the same database, this never reduces database pressure by itself — it must be paired with a genuine database-side lever (bounded connection budget, reduced demand) to be a complete strategy, which is exactly why it anchors strategy B rather than acting alone.",
    },
  },
];
