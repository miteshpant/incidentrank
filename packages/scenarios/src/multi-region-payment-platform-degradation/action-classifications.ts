import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CROSS_REGION_REPLICATION_MODE_KEY,
  EU_TRAFFIC_PERCENTAGE_KEY,
  EVENT_PUBLISHER_PRIORITY_KEY,
  FRAUD_FALLBACK_MODE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  RISK_ENRICHMENT_MODE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement, describing the system consequence rather than a verdict.
 * Ids are stable and intentionally neutral.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: FRAUD_FALLBACK_MODE_KEY,
    valueEquals: "bypass",
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Bypassed mandatory fraud checks",
      explanation:
        "Setting the fraud fallback to bypass stops every risk-service call from reaching the Fraud Provider at all for the affected traffic. EU payment throughput looks like it recovers, but every one of those payments is now being authorized with zero fraud screening -- a direct violation of the mandatory fraud-control invariant, counted here as fraudControlBypassCount climbing, regardless of how healthy payment success rates read.",
    },
  },
  {
    id: "acr_2",
    controlKey: FRAUD_FALLBACK_MODE_KEY,
    valueEquals: "cached-rules",
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched fraud checks to cached last-known-good rules",
      explanation:
        "Cached-rules fallback keeps a real, mandatory fraud check running on every payment using the last-known-good rule set instead of calling the degraded live provider. This is a bounded, legitimate degradation of fraud-model freshness, not a bypass -- fraudControlBypassCount stays at zero while EU risk-check latency drops.",
    },
  },
  {
    id: "acr_3",
    controlKey: EU_TRAFFIC_PERCENTAGE_KEY,
    valueEquals: 0,
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Shifted 100% of EU traffic to US immediately",
      explanation:
        "Dropping EU traffic percentage to zero routes all of EU's volume onto US capacity on top of US's own native load. EU and global payment-availability metrics improve immediately, but usLedgerUtilization and settlementBacklogThousands climb past safe levels as a direct, measurable consequence -- the incident's availability problem has been traded for a second, newly self-inflicted ledger/settlement capacity problem in US, which this control alone does nothing to protect against.",
    },
  },
  {
    id: "acr_4",
    controlKey: EU_TRAFFIC_PERCENTAGE_KEY,
    valueEquals: 40,
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Shifted a bounded share of EU traffic to US",
      explanation:
        "Moving 60% of EU traffic to US (rather than all of it) relieves a meaningful share of EU's dependency-driven failures while leaving enough headroom that US ledger/settlement capacity does not have to absorb EU's full volume on top of its own. The remaining EU-local traffic still carries the EU dependency's own latency/success cost, which is why this is a partial, not a complete, relief on its own.",
    },
  },
  {
    id: "acr_5",
    controlKey: LEDGER_WRITE_AUTHORITY_KEY,
    valueEquals: "us-authoritative",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Routed ledger writes through a single authoritative region",
      explanation:
        "Setting ledger write authority to us-authoritative means every ledger write resolves through the US ledger regardless of which region's Payment API accepted the request, with the EU ledger kept strictly as a replica. This structurally prevents a payment authorized via shifted traffic from racing a still-replicating EU-local write for the same account -- divergentLedgerAuthorityCount stays at zero no matter how much EU traffic is subsequently shifted.",
    },
  },
  {
    id: "acr_6",
    controlKey: LEDGER_WRITE_AUTHORITY_KEY,
    valueEquals: "region-local",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "neutral",
    feedback: {
      title: "Left ledger write authority at region-local",
      explanation:
        "Region-local ledger authority is not unsafe by itself while no traffic has been shifted and replication is caught up -- each region is only ever writing for requests that genuinely landed there. It becomes dangerous specifically once EU traffic is shifted onto US capacity while replication lag is active, at which point a payment authorized through US for an EU-origin account can diverge from the EU ledger's own local write for the same account.",
    },
  },
  {
    id: "acr_7",
    controlKey: SETTLEMENT_WORKER_PRIORITY_KEY,
    valueEquals: "critical-path-first",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Reprioritized settlement workers to the critical path",
      explanation:
        "Critical-path-first settlement scheduling drains the payment-authorization-critical settlement queue ahead of lower-priority reconciliation/reporting work. This directly lowers settlementBacklogThousands and usLedgerUtilization once the catch-up window has had time to run, at the real cost of reconciliation/reporting jobs falling further behind -- a deliberate, bounded tradeoff, not a free fix.",
    },
  },
  {
    id: "acr_8",
    controlKey: HIGH_RISK_THROTTLE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Throttled high-risk transactions specifically",
      explanation:
        "Throttling only newly-flagged high-risk transactions reduces load on the already-pressured risk/settlement path without touching the throughput of ordinary low-risk payments. Combined with the traffic shift and ledger-authority fix, this measurably lowers peak usLedgerUtilization during the draining window.",
    },
  },
  {
    id: "acr_9",
    controlKey: RISK_ENRICHMENT_MODE_KEY,
    valueEquals: "optional-skip",
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Disabled optional risk enrichment",
      explanation:
        "Optional risk enrichment (device fingerprinting, behavioral scoring) is not required to authorize a payment safely -- it only improves risk-model precision. Turning it off directly reduces EU Risk Service load and latency without touching the mandatory fraud check at all, which is why this is a legitimate degradation rather than a correctness risk.",
    },
  },
  {
    id: "acr_10",
    controlKey: EVENT_PUBLISHER_PRIORITY_KEY,
    valueEquals: "defer-non-critical",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Deferred non-critical event publishing",
      explanation:
        "Deferring analytics/notification events frees event-publisher capacity for settlement-relevant events specifically, giving a further measurable reduction in settlement backlog on top of settlement-worker reprioritization alone -- a real, additional lever, not a cosmetic one.",
    },
  },
  {
    id: "acr_11",
    controlKey: CROSS_REGION_REPLICATION_MODE_KEY,
    valueEquals: "paused-until-caught-up",
    whenTriggerEquals: { replicationLagActive: true },
    outcome: "neutral",
    feedback: {
      title: "Paused replication-dependent reads until caught up",
      explanation:
        "Pausing replication-dependent EU-replica reads until lag clears trades a real, bounded EU read-availability cost for a protected catch-up window, independent of traffic-shifting or settlement-worker decisions. It lowers replication lag faster during the draining window but does not by itself address US ledger/settlement capacity pressure.",
    },
  },
  {
    id: "acr_12",
    controlKey: EU_TRAFFIC_PERCENTAGE_KEY,
    valueEquals: 70,
    whenTriggerEquals: { euDependencyDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Shifted only a small share of EU traffic to US",
      explanation:
        "Keeping 70% of EU traffic local and shifting only 30% to US keeps added US ledger/settlement load the lowest of any traffic-shift option, at the cost of leaving a larger share of EU traffic exposed to EU's own degraded dependency for longer. This is the conservative end of the legitimate traffic-shift tradeoff, not a dominant strategy over the 40% shift.",
    },
  },
];
