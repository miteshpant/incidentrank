import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "healthy",
  "region-a": "healthy",
  "region-b": "healthy",
};

const degradedBothHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "degraded",
  "region-a": "degraded",
  "region-b": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "degraded",
  "data-service": "critical",
  "region-a": "critical",
  "region-b": "critical",
};

// One region forced off the write path entirely (single-region routing).
const regionBRoutedOffHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "degraded",
  "region-a": "healthy",
  "region-b": "degraded",
};
const regionARoutedOffHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "degraded",
  "region-a": "degraded",
  "region-b": "healthy",
};

// Strong consistency enforced on both categories: safe, but real
// availability cost on both.
const bothStrongHealth: Record<string, ComponentHealth> = {
  clients: "degraded",
  "data-service": "degraded",
  "region-a": "healthy",
  "region-b": "healthy",
};

// Differentiated: balance strong (quorum-confirmed), catalog relaxed.
const differentiatedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "data-service": "degraded",
  "region-a": "healthy",
  "region-b": "healthy",
};

/**
 * Authored rule table for Consistency vs Availability Incident, ordered
 * most-specific-first.
 *
 * A cross-region connectivity problem makes it genuinely impossible for
 * the Distributed Data Service to guarantee both strong cross-region
 * consistency AND full write availability at the same time — a real
 * CAP-theorem-shaped tradeoff, not a trick. The business requirement is
 * explicit and asymmetric by operation category:
 *   - Account balance writes (balanceConsistencyMode) must NEVER be
 *     processed against stale/unconfirmed data — a balance write
 *     accepted independently by one region without cross-region
 *     confirmation risks a second, conflicting write landing on the
 *     other region for the same account with neither side aware of the
 *     other. This is balanceCorrectnessViolations — a real correctness
 *     field, gated directly by successCondition, NEVER satisfied by
 *     healthy balanceWriteAvailability, however healthy that reads.
 *   - Catalog writes/reads (catalogConsistencyMode) may tolerate a few
 *     seconds of staleness with no customer harm — relaxing consistency
 *     here during the connectivity problem is a legitimate, business-
 *     sanctioned tradeoff, not a correctness violation, because catalog
 *     entries have no "double-spend" shape: whichever write converges
 *     last is still a coherent, valid value.
 *
 * Three independent mechanisms interact:
 *   - writeRouting: forcing ALL writes (both categories) to a single
 *     named region structurally prevents any second region from ever
 *     accepting a conflicting balance write, independent of the
 *     consistency-mode controls — but it also forces the staleness-
 *     tolerant catalog category onto the same single-region path,
 *     concentrating all customer traffic/latency onto one region even
 *     though catalog traffic never needed that constraint.
 *   - balanceConsistencyMode: "strong" means a balance write is only
 *     accepted once cross-confirmed by both regions — safe, but
 *     unconfirmable balance writes during the connectivity problem are
 *     queued/rejected rather than applied (a real, visible availability
 *     cost). "relaxed" is THE TRAP: it keeps balance writes available in
 *     both regions by having each region apply them from its own local
 *     view with no cross-confirmation — balanceWriteAvailability reads
 *     100 in this state, while balanceCorrectnessViolations climbs.
 *   - quorumRequirement: "both-regions" is the real cross-region check
 *     backing "strong" mode. "local-only" silently removes that check
 *     even while balanceConsistencyMode still reads "strong" — a
 *     configuration trap where the category control LOOKS safe but the
 *     mechanism backing it has been pulled out.
 *
 * catalogConsistencyMode only ever affects catalogStalenessSeconds /
 * catalogWriteAvailability / catalogDivergentKeyCount — it never
 * participates in balanceCorrectnessViolations or
 * balanceSafetyMechanism. Relaxing it is always a legitimate choice
 * during the connectivity problem, never a correctness violation.
 */
export const consistencyVsAvailabilityIncidentRules: Rule[] = [
  // ── Post-heal reconciliation states (connectivityRestored=true).
  // Checked first since connectivityRestored implies
  // connectivityDegraded was also set by the same/earlier timed event.
  //
  // Backlog from queued balance writes (unconfirmedWritePolicy="queue"
  // while strong mode couldn't confirm) now draining as connectivity
  // returns. No correctness violation was ever produced — the writes
  // were held, not applied against stale data — but the queue drains
  // over a real, visible window rather than instantly.
  {
    id: "healed-balance-queue-draining",
    when: {
      triggerEquals: { connectivityRestored: true },
      controlEquals: {
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "queue",
      },
    },
    incidentState: "healed-balance-queue-draining",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 6,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "healthy",
      balanceSafetyStatus: "warning",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: degradedBothHealth,
  },
  // Catalog divergence reconciling via last-write-wins: fast, immediate
  // convergence, each diverging key resolved by timestamp.
  {
    id: "healed-catalog-reconciled-lww",
    when: {
      triggerEquals: { connectivityRestored: true },
      controlEquals: {
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "reject",
        [CATALOG_RECONCILIATION_KEY]: "last-write-wins",
      },
    },
    incidentState: "healed-catalog-reconciled-lww",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 18,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "healthy",
      balanceSafetyStatus: "normal",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: healthyHealth,
  },
  // merge-latest-per-field: slower, but never discards an unrelated
  // field's update.
  {
    id: "healed-catalog-reconciled-merge",
    when: {
      triggerEquals: { connectivityRestored: true },
      controlEquals: {
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "reject",
        [CATALOG_RECONCILIATION_KEY]: "merge-latest-per-field",
      },
    },
    incidentState: "healed-catalog-reconciling-merge",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 18,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 5,
      regionConnectivity: "healthy",
      balanceSafetyStatus: "normal",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: degradedBothHealth,
  },

  // ── Degraded-connectivity states (connectivityDegraded=true,
  // connectivityRestored not yet set). Ordered most-specific first.

  // ── OPTIMAL: single-region routing. Forcing ALL writes (both
  // categories) to one named region structurally prevents any second
  // region from ever accepting a conflicting balance write, independent
  // of the consistency-mode controls — checked before the mode-driven
  // rules below since it overrides routing entirely. The real cost:
  // catalog traffic is also forced onto the single region even though
  // it never needed that constraint, concentrating all load/latency.
  {
    id: "single-region-a-routed",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: { [WRITE_ROUTING_KEY]: "single-region-a" },
    },
    incidentState: "single-region-a-routed",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "normal",
      balanceSafetyMechanism: "single-region-routed",
    },
    componentHealth: regionBRoutedOffHealth,
  },
  {
    id: "single-region-b-routed",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: { [WRITE_ROUTING_KEY]: "single-region-b" },
    },
    incidentState: "single-region-b-routed",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "normal",
      balanceSafetyMechanism: "single-region-routed",
    },
    componentHealth: regionARoutedOffHealth,
  },

  // ── THE TRAP: balanceConsistencyMode relaxed. Each region now applies
  // balance writes from only its own local view, with no cross-region
  // confirmation. balanceWriteAvailability reads 100 — customer-facing
  // write availability for the consistency-critical category looks
  // perfectly healthy — while balanceCorrectnessViolations climbs, the
  // real, directly observable correctness damage. This must never
  // satisfy successCondition or any acceptableCondition, no matter how
  // healthy balanceWriteAvailability reads. Checked ahead of the
  // quorum-misconfiguration rule below since relaxed mode makes the
  // quorum control moot — the category control itself already removed
  // the cross-confirmation requirement.
  {
    id: "balance-relaxed-unsafe",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "relaxed",
      },
    },
    incidentState: "balance-relaxed-unsafe",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 9,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 4,
      catalogDivergentKeyCount: 3,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "critical",
      balanceSafetyMechanism: "relaxed-unsafe",
    },
    componentHealth: criticalHealth,
  },

  // ── UNSAFE-by-misconfiguration, not by explicit choice: balanceConsis
  // tencyMode still reads "strong" (looks safe) but quorumRequirement
  // has been set to "local-only", silently removing the cross-region
  // check "strong" depended on. The result is mechanically identical to
  // the relaxed trap above — regions apply balance writes from their own
  // local view with no cross-confirmation — but the category control
  // itself still reads the safe-looking value, which is exactly the
  // configuration-drift trap this rule exists to catch.
  {
    id: "balance-quorum-misconfigured",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "local-only",
      },
    },
    incidentState: "balance-quorum-misconfigured",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 9,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 4,
      catalogDivergentKeyCount: 3,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "critical",
      balanceSafetyMechanism: "quorum-misconfigured",
    },
    componentHealth: criticalHealth,
  },

  // ── OPTIMAL (Strategy A — prioritize consistency everywhere): both
  // categories held to strong, cross-region-confirmed consistency.
  // Correctly, fully safe — zero correctness violations anywhere — at
  // the real cost of availability/latency on BOTH categories, including
  // the staleness-tolerant catalog category that didn't strictly need
  // that guarantee. unconfirmedWritePolicy differentiates "queue"
  // (held, applied later) vs "reject" (immediate failure, candidate must
  // retry after healing) — both equally safe, a UX/latency tradeoff, not
  // a correctness one.
  {
    id: "both-strong-queue",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [CATALOG_CONSISTENCY_MODE_KEY]: "strong",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "queue",
      },
    },
    incidentState: "both-strong-queue",
    values: {
      balanceWriteAvailability: 55,
      catalogWriteAvailability: 55,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 18,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "warning",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: bothStrongHealth,
  },
  {
    id: "both-strong-reject",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [CATALOG_CONSISTENCY_MODE_KEY]: "strong",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "reject",
      },
    },
    incidentState: "both-strong-reject",
    values: {
      balanceWriteAvailability: 55,
      catalogWriteAvailability: 55,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 18,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "warning",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: bothStrongHealth,
  },

  // ── OPTIMAL (Strategy B — differentiate by business need): balance
  // stays strongly consistent (zero correctness risk on the category
  // that can never tolerate it); catalog relaxes to full availability
  // (a legitimate, business-sanctioned tradeoff on the category that can
  // tolerate it). Correctly identifies that the two categories do NOT
  // need the same treatment — better overall availability than Strategy
  // A, with no correctness cost anywhere, because catalog relaxation
  // never produces a correctness violation in the first place.
  {
    id: "differentiated-balance-strong-catalog-relaxed-queue",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [CATALOG_CONSISTENCY_MODE_KEY]: "relaxed",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "queue",
      },
    },
    incidentState: "differentiated-balance-strong-catalog-relaxed",
    values: {
      balanceWriteAvailability: 55,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 18,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 4,
      catalogDivergentKeyCount: 3,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "warning",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: differentiatedHealth,
  },
  {
    id: "differentiated-balance-strong-catalog-relaxed-reject",
    when: {
      triggerEquals: { connectivityDegraded: true },
      controlEquals: {
        [WRITE_ROUTING_KEY]: "both-regions",
        [BALANCE_CONSISTENCY_MODE_KEY]: "strong",
        [QUORUM_REQUIREMENT_KEY]: "both-regions",
        [CATALOG_CONSISTENCY_MODE_KEY]: "relaxed",
        [UNCONFIRMED_WRITE_POLICY_KEY]: "reject",
      },
    },
    incidentState: "differentiated-balance-strong-catalog-relaxed",
    values: {
      balanceWriteAvailability: 55,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 18,
      catalogStalenessSeconds: 4,
      catalogDivergentKeyCount: 3,
      regionConnectivity: "degraded",
      balanceSafetyStatus: "warning",
      balanceSafetyMechanism: "quorum-confirmed",
    },
    componentHealth: differentiatedHealth,
  },

  // ── Default/fallback: before the incident begins, or any
  // connectivityDegraded=true combination not covered above (none exist
  // given the control domain above — kept as a safety fallback that
  // mirrors the untouched-baseline shape, never silently masking an
  // unhandled unsafe case: relaxed/misconfigured balance states are
  // matched explicitly above regardless of writeRouting/catalog mode).
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      balanceWriteAvailability: 100,
      catalogWriteAvailability: 100,
      balanceCorrectnessViolations: 0,
      balanceWriteQueueDepth: 0,
      balanceWriteRejectedCount: 0,
      catalogStalenessSeconds: 0,
      catalogDivergentKeyCount: 0,
      regionConnectivity: "healthy",
      balanceSafetyStatus: "normal",
      balanceSafetyMechanism: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
