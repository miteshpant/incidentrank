import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How much of the EU region's own traffic is kept local to EU rather
 * than routed to US. 100 = no traffic shifted (EU keeps serving
 * everything itself, even though its fraud dependency is degraded). 0 =
 * every EU request routes to US instead. The scenario's central trap:
 * dropping this straight to 0 maximizes payment availability (EU's
 * degraded fraud dependency no longer blocks any traffic) but routes the
 * entire EU volume onto US capacity on top of US's own native load,
 * which is what drives US ledger/settlement pressure past safe levels.
 * A partial shift (70/40) relieves EU pressure gradually while leaving
 * headroom for US ledger/settlement to absorb the added volume safely.
 */
export const EU_TRAFFIC_PERCENTAGE_KEY = "euTrafficPercentage";

/**
 * Which ledger is authoritative for a given payment's write. "region-
 * local" (the default) means each region's ledger independently commits
 * writes for requests it physically serves. "us-authoritative" routes
 * every ledger WRITE through the US ledger regardless of which region's
 * API accepted the request, with the EU ledger kept as a replica only --
 * the structural fix that prevents divergent ledger authority once EU
 * traffic is partially or fully shifted onto US capacity: a payment
 * authorized by the EU Payment API but settled against a still-
 * replicating EU ledger, while US also accepts volume for the same
 * account, is exactly the divergent-authority risk the business
 * invariant forbids. This control costs nothing by itself -- it only
 * matters once replication lag or traffic shifting is actually in play.
 */
export const LEDGER_WRITE_AUTHORITY_KEY = "ledgerWriteAuthority";

/**
 * Mandatory fraud control lever. "live-provider" (default) calls the
 * real Fraud Provider for every payment. "cached-rules" falls back to
 * last-known-good fraud rules evaluated locally when the live provider
 * is degraded -- a real, bounded degradation of fraud-check freshness,
 * but still a mandatory check is performed. "bypass" skips the fraud
 * check entirely -- this is the scenario's forbidden lever: it looks
 * like it would restore payment throughput fastest, but it directly
 * violates the business invariant that mandatory fraud controls may
 * never be bypassed, regardless of how much it improves latency/
 * availability.
 */
export const FRAUD_FALLBACK_MODE_KEY = "fraudFallbackMode";

/**
 * Optional risk ENRICHMENT (not the mandatory fraud check itself) --
 * secondary signals like device fingerprinting / behavioral scoring that
 * improve risk-model precision but are not required to authorize a
 * payment safely. "full" runs enrichment on every request; "optional-
 * skip" turns it off, trading a small amount of risk-model precision for
 * materially lower risk-service latency/load. This is the legitimate,
 * business-sanctioned degradation -- the opposite of bypassing fraud
 * controls.
 */
export const RISK_ENRICHMENT_MODE_KEY = "riskEnrichmentMode";

/**
 * Settlement worker scheduling. "normal" processes settlement work
 * first-in-first-out. "critical-path-first" reprioritizes the
 * settlement pipeline's limited worker capacity to drain the payment-
 * authorization-critical settlement queue ahead of lower-priority
 * reconciliation/reporting work -- real, bounded relief for settlement
 * backlog once US ledger/settlement is under pressure, at the cost of
 * reporting/reconciliation jobs falling further behind.
 */
export const SETTLEMENT_WORKER_PRIORITY_KEY = "settlementWorkerPriority";

/**
 * Event publisher scheduling, independently settable per nothing --
 * this is a GLOBAL publisher-priority policy applied to both regions'
 * event publishers. "normal" publishes every ledger event (settlement,
 * analytics, notification) at the same priority. "defer-non-critical"
 * publishes settlement-relevant events first and defers lower-priority
 * analytics/notification events, reducing event-publisher backlog
 * pressure that would otherwise compete with settlement-critical events
 * for publishing capacity.
 */
export const EVENT_PUBLISHER_PRIORITY_KEY = "eventPublisherPriority";

/**
 * Throttles newly-flagged high-risk transactions specifically (not all
 * traffic) once the system is under settlement/ledger pressure. "off"
 * (default) processes every transaction, high-risk or not, at full
 * rate. "on" queues/delays high-risk transactions specifically --
 * trading a small amount of high-risk-transaction latency for reduced
 * load on the already-pressured risk/settlement path, without touching
 * low-risk transaction throughput at all.
 */
export const HIGH_RISK_THROTTLE_KEY = "highRiskTransactionThrottle";

/**
 * Cross-region ledger replication mode. "async-best-effort" (default)
 * replicates US-authoritative ledger writes to the EU replica as fast as
 * current link/consumer capacity allows, with no backpressure on the
 * write path -- under heavy added write volume (e.g. after shifting EU
 * traffic to US) this is exactly what lets replication lag climb
 * unbounded. "paused-until-caught-up" temporarily pauses accepting EU-
 * replica-dependent reads/writes once lag crosses an unsafe threshold,
 * giving replication a protected window to catch up rather than falling
 * permanently behind -- real, bounded availability cost in EU read paths
 * in exchange for a bounded, observable lag-recovery window.
 */
export const CROSS_REGION_REPLICATION_MODE_KEY = "crossRegionReplicationMode";

export const controls: ControlDefinition[] = [
  {
    key: EU_TRAFFIC_PERCENTAGE_KEY,
    allowedValues: [100, 70, 40, 0],
    initialValue: 100,
  },
  {
    key: LEDGER_WRITE_AUTHORITY_KEY,
    allowedValues: ["region-local", "us-authoritative"],
    initialValue: "region-local",
  },
  {
    key: FRAUD_FALLBACK_MODE_KEY,
    allowedValues: ["live-provider", "cached-rules", "bypass"],
    initialValue: "live-provider",
  },
  {
    key: RISK_ENRICHMENT_MODE_KEY,
    allowedValues: ["full", "optional-skip"],
    initialValue: "full",
  },
  {
    key: SETTLEMENT_WORKER_PRIORITY_KEY,
    allowedValues: ["normal", "critical-path-first"],
    initialValue: "normal",
  },
  {
    key: EVENT_PUBLISHER_PRIORITY_KEY,
    allowedValues: ["normal", "defer-non-critical"],
    initialValue: "normal",
  },
  {
    key: HIGH_RISK_THROTTLE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: CROSS_REGION_REPLICATION_MODE_KEY,
    allowedValues: ["async-best-effort", "paused-until-caught-up"],
    initialValue: "async-best-effort",
  },
];
