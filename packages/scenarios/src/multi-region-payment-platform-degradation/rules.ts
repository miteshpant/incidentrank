import type { ComponentHealth, Rule } from "@incidentrank/simulator";
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

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "global-traffic-manager": "healthy",
  "us-payment-api": "healthy",
  "us-risk-service": "healthy",
  "us-ledger": "healthy",
  "us-event-publisher": "healthy",
  "eu-payment-api": "healthy",
  "eu-risk-service": "healthy",
  "eu-ledger-replica": "healthy",
  "eu-event-publisher": "healthy",
  "fraud-provider": "healthy",
  "settlement-pipeline": "healthy",
};

const euDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-risk-service": "degraded",
  "fraud-provider": "degraded",
  "eu-payment-api": "degraded",
};

const euCriticalUsOverloadedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-risk-service": "critical",
  "fraud-provider": "degraded",
  "eu-payment-api": "degraded",
  "us-ledger": "critical",
  "settlement-pipeline": "critical",
  "us-event-publisher": "degraded",
};

const protectedShiftHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-risk-service": "degraded",
  "fraud-provider": "degraded",
  "eu-payment-api": "degraded",
  "us-ledger": "degraded",
  "settlement-pipeline": "degraded",
};

const drainingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-ledger": "degraded",
  "settlement-pipeline": "degraded",
  "eu-ledger-replica": "degraded",
};

const recoveredHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
};

const bypassCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-risk-service": "critical",
  "fraud-provider": "critical",
  "eu-payment-api": "degraded",
};

const divergentAuthorityCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "eu-ledger-replica": "critical",
  "us-ledger": "critical",
  "eu-payment-api": "degraded",
};

/**
 * Authored rule table for Multi-Region Payment Platform Degradation,
 * ordered most-specific first.
 *
 * Three independent root causes interact (phase6dsupport.md section 5):
 *
 *   1. EU's regional path to the Fraud Provider degrades
 *      (euDependencyDegraded) -- EU risk checks start failing/timing
 *      out; US's own calls to the same provider are unaffected.
 *   2. Cross-region ledger replication begins lagging
 *      (replicationLagActive) -- independent of (1), authored to start
 *      shortly after.
 *   3. Shifting EU traffic to US (EU_TRAFFIC_PERCENTAGE_KEY < 100)
 *      relieves (1) but adds EU's volume on top of US's native load,
 *      which is what turns (2) dangerous: more ledger write volume
 *      flowing through US directly drives usLedgerUtilization and
 *      settlementBacklogThousands up. This is the REQUIRED
 *      pressure-transfer mechanism (phase6dsupport.md section 13):
 *      relieving EU availability by shifting traffic measurably
 *      worsens US ledger/settlement pressure, with real distinct
 *      authored numbers below.
 *
 * The harmful/tempting path: euTrafficPercentage=0 (shift 100% of EU
 * traffic to US) immediately, with no other protective control changed.
 * This maximizes euPaymentSuccessRate/crossRegionTrafficPercentage
 * (global availability looks great) while usLedgerUtilization and
 * settlementBacklogThousands blow past safe levels -- a second, newly
 * self-inflicted failure domain. See "full-dump-us-overload" below.
 *
 * The safe path requires SEQUENCING (phase6dsupport.md section 12):
 * (a) protect mandatory correctness FIRST --
 * LEDGER_WRITE_AUTHORITY_KEY="us-authoritative" before shifting any
 * meaningful EU traffic (prevents divergent ledger authority once
 * requests move between regions) and FRAUD_FALLBACK_MODE_KEY left at
 * "live-provider" or moved to "cached-rules" (never "bypass"); (b) THEN
 * shift traffic selectively/partially rather than all at once; (c) THEN
 * protect US ledger/settlement capacity (SETTLEMENT_WORKER_PRIORITY_KEY
 * ="critical-path-first", HIGH_RISK_THROTTLE_KEY="on") once added
 * pressure is visible; (d) THEN wait for the real recovery-lag window
 * (CATCHUP_WINDOW_ELAPSED_MS) before declaring the system safe. Doing
 * the ledger-authority / fraud-fallback step AFTER shifting traffic is
 * unsafe for a real window: see "unsafe-sequence-divergent-authority"
 * below, matched only once traffic has already been shifted with
 * region-local ledger routing still in effect.
 */
export const multiRegionPaymentPlatformDegradationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE: correctness violated outright. Checked first -- these win
  // regardless of any other control combination, because a mandatory
  // invariant violation is never acceptable no matter how good
  // availability/latency numbers look elsewhere.
  // ══════════════════════════════════════════════════════════════════

  // Fraud controls bypassed while the fraud provider is the active risk
  // path. The forbidden lever: looks like it would restore EU payment
  // throughput fastest (risk checks stop failing because they are
  // simply skipped), but it is a direct, counted violation of "mandatory
  // fraud controls may not be bypassed" -- regardless of
  // euPaymentSuccessRate.
  {
    id: "fraud-bypass-engaged",
    when: {
      triggerEquals: { euDependencyDegraded: true },
      controlEquals: { [FRAUD_FALLBACK_MODE_KEY]: "bypass" },
    },
    incidentState: "fraud-controls-bypassed",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 98,
      usPaymentLatencyMs: 230,
      euPaymentLatencyMs: 260,
      ledgerReplicationLagSeconds: 5,
      usLedgerUtilization: 45,
      settlementBacklogThousands: 1,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 100,
      crossRegionTrafficPercentage: 0,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 40,
      riskControlPosture: "fraud-controls-bypassed",
      ledgerAuthorityMechanism: "region-local-safe",
      capacityRiskStatus: "normal",
      correctnessStatus: "violated",
    },
    componentHealth: bypassCriticalHealth,
  },

  // Divergent ledger authority: EU traffic has been shifted (any amount
  // below 100) while ledger write routing is still region-local AND
  // replication lag is active -- a payment authorized through US infra
  // for an EU-origin account can race the EU ledger's own local write
  // for the same account. This is the UNSAFE-SEQUENCE trap:
  // shift-before-protect. Checked before the pressure-transfer/baseline
  // rules below since it is a correctness violation, not merely a
  // capacity problem.
  {
    id: "unsafe-sequence-divergent-authority",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "region-local",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
      },
    },
    incidentState: "divergent-ledger-authority",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 97,
      usPaymentLatencyMs: 260,
      euPaymentLatencyMs: 250,
      ledgerReplicationLagSeconds: 95,
      usLedgerUtilization: 86,
      settlementBacklogThousands: 9,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 72,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 14,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "region-local-unsafe",
      capacityRiskStatus: "critical",
      correctnessStatus: "violated",
    },
    componentHealth: divergentAuthorityCriticalHealth,
  },
  {
    id: "unsafe-sequence-divergent-authority-full-shift",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "region-local",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 0,
      },
    },
    incidentState: "divergent-ledger-authority-severe",
    values: {
      usPaymentSuccessRate: 98,
      euPaymentSuccessRate: 98,
      usPaymentLatencyMs: 310,
      euPaymentLatencyMs: 230,
      ledgerReplicationLagSeconds: 150,
      usLedgerUtilization: 112,
      settlementBacklogThousands: 18,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 97,
      euRiskCheckSuccessRate: 40,
      crossRegionTrafficPercentage: 100,
      divergentLedgerAuthorityCount: 31,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "region-local-unsafe",
      capacityRiskStatus: "critical",
      correctnessStatus: "violated",
    },
    componentHealth: divergentAuthorityCriticalHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // The required harmful/tempting path: full dump of EU traffic onto
  // US with ledger authority ALREADY correctly set to
  // us-authoritative (so no correctness violation triggers above), but
  // no settlement/ledger protection engaged. EU/global availability
  // metrics look great; US ledger/settlement is measurably overloaded
  // -- the pressure-transfer mechanism, in a state that is correctness-
  // safe but capacity-unsafe.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "full-dump-us-overload",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 0,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "normal",
        [HIGH_RISK_THROTTLE_KEY]: "off",
      },
    },
    incidentState: "us-ledger-overloaded",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 99,
      usPaymentLatencyMs: 410,
      euPaymentLatencyMs: 230,
      ledgerReplicationLagSeconds: 180,
      usLedgerUtilization: 128,
      settlementBacklogThousands: 22,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 94,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 100,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "critical",
      correctnessStatus: "safe",
    },
    componentHealth: euCriticalUsOverloadedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY-LAG sequence (phase6dsupport.md section 14): once ledger
  // authority is us-authoritative, traffic shift is partial/selective
  // (40 or 70, not 0), AND settlement/throttle protection is engaged,
  // write pressure is back within a recoverable range -- but
  // ledgerReplicationLagSeconds/settlementBacklogThousands do NOT drop
  // to zero immediately. Before catchUpWindowElapsed fires, the
  // candidate observes a real, nonzero "draining" state; only once
  // catchUpWindowElapsed is also true do the fully-recovered numbers
  // appear. Same control combination, two different trigger states,
  // two different authored value sets -- the only way this engine
  // expresses "mitigation applied != instantly healthy" over real
  // elapsed simulated time.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "protected-shift-draining",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: false,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
        [HIGH_RISK_THROTTLE_KEY]: "on",
      },
    },
    incidentState: "protected-shift-draining",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 99,
      usPaymentLatencyMs: 290,
      euPaymentLatencyMs: 235,
      ledgerReplicationLagSeconds: 38,
      usLedgerUtilization: 78,
      settlementBacklogThousands: 6,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 98,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: protectedShiftHealth,
  },
  {
    id: "protected-shift-recovered",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: true,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
        [HIGH_RISK_THROTTLE_KEY]: "on",
      },
    },
    incidentState: "protected-shift-recovered",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 99,
      usPaymentLatencyMs: 245,
      euPaymentLatencyMs: 235,
      ledgerReplicationLagSeconds: 4,
      usLedgerUtilization: 58,
      settlementBacklogThousands: 0,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "normal",
      correctnessStatus: "safe",
    },
    componentHealth: healthyHealth,
  },

  // ── Alternate strong path: more conservative traffic retention (70%
  // kept in EU, only 30% shifted) with the same correctness/capacity
  // protections engaged, and optional risk enrichment skipped to shed
  // EU risk-service load directly rather than relying on traffic
  // shifting alone. This keeps more EU volume served locally (lower
  // crossRegionTrafficPercentage, so a smaller US capacity add) and
  // reaches the drained state with LOWER peak US ledger pressure than
  // the primary safe path, at the cost of EU payment success staying
  // slightly lower for longer (EU's own degraded dependency still
  // affects a larger fraction of its traffic).
  {
    id: "alternate-conservative-shift-draining",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: false,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 70,
        [RISK_ENRICHMENT_MODE_KEY]: "optional-skip",
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
      },
    },
    incidentState: "alternate-conservative-shift-draining",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 94,
      usPaymentLatencyMs: 255,
      euPaymentLatencyMs: 245,
      ledgerReplicationLagSeconds: 20,
      usLedgerUtilization: 62,
      settlementBacklogThousands: 3,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 90,
      crossRegionTrafficPercentage: 30,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: drainingHealth,
  },
  {
    id: "alternate-conservative-shift-recovered",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: true,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 70,
        [RISK_ENRICHMENT_MODE_KEY]: "optional-skip",
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
      },
    },
    incidentState: "alternate-conservative-shift-recovered",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 96,
      usPaymentLatencyMs: 235,
      euPaymentLatencyMs: 240,
      ledgerReplicationLagSeconds: 2,
      usLedgerUtilization: 48,
      settlementBacklogThousands: 0,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 92,
      crossRegionTrafficPercentage: 30,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "normal",
      correctnessStatus: "safe",
    },
    componentHealth: recoveredHealth,
  },

  // ── Ledger authority fixed FIRST, partial shift applied, but
  // settlement/throttle protection not yet engaged (the live-provider
  // fraud fallback default left untouched). This is the real,
  // intermediate second step of the correct sequencing path: a
  // candidate who has protected correctness and begun shifting traffic
  // but has not yet protected US ledger/settlement capacity. Genuinely
  // correctness-safe (ledgerAuthorityMechanism already reflects the
  // structural fix) but settlement pressure remains elevated --
  // distinct from full-dump-us-overload because traffic was only
  // partially shifted, not dumped at 0%.
  {
    id: "ledger-fixed-partial-shift-unprotected",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "ledger-fixed-partial-shift-unprotected",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 97,
      usPaymentLatencyMs: 270,
      euPaymentLatencyMs: 230,
      ledgerReplicationLagSeconds: 75,
      usLedgerUtilization: 94,
      settlementBacklogThousands: 12,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 98,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: protectedShiftHealth,
  },

  // ── Cached-rules fraud fallback (mandatory check preserved, EU risk
  // checks keep running against degraded-but-real last-known-good
  // rules instead of bypassing) combined with correct ledger authority
  // and partial shift, but settlement protection not yet engaged.
  // Genuinely safer than baseline but settlement pressure is still
  // elevated -- an intermediate state reachable on the way to the
  // protected-shift path, included so a partial-credit judgment call
  // is observable rather than only all-or-nothing endpoints.
  {
    id: "cached-rules-partial-protection",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [FRAUD_FALLBACK_MODE_KEY]: "cached-rules",
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "normal",
      },
    },
    incidentState: "cached-rules-partial-protection",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 97,
      usPaymentLatencyMs: 275,
      euPaymentLatencyMs: 220,
      ledgerReplicationLagSeconds: 70,
      usLedgerUtilization: 92,
      settlementBacklogThousands: 11,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 98,
      euRiskCheckSuccessRate: 95,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: protectedShiftHealth,
  },

  // ── Event publisher deferral combined with the protected shift --
  // shows eventPublisherPriority has a real, additional effect on
  // settlement/backlog relief distinct from settlementWorkerPriority
  // (not a dead control): deferring non-critical events frees
  // publisher capacity the settlement-critical events can use, giving
  // a small additional backlog improvement over protected-shift-
  // draining above at the same elapsed point.
  {
    id: "protected-shift-with-event-deferral-draining",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: false,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
        [HIGH_RISK_THROTTLE_KEY]: "on",
        [EVENT_PUBLISHER_PRIORITY_KEY]: "defer-non-critical",
      },
    },
    incidentState: "protected-shift-event-deferred-draining",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 99,
      usPaymentLatencyMs: 280,
      euPaymentLatencyMs: 235,
      ledgerReplicationLagSeconds: 30,
      usLedgerUtilization: 72,
      settlementBacklogThousands: 4,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 98,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: protectedShiftHealth,
  },

  // ── Paused replication mode layered on protected shift: trades EU
  // read availability off the replica for a bounded, protected
  // catch-up window -- real, distinct numbers from the async-best-
  // effort protected-shift path (lower lag at the same elapsed point,
  // at a real EU-read-availability cost not modeled numerically here
  // beyond componentHealth, showing the control is not a dead lever).
  {
    id: "paused-replication-protected-draining",
    when: {
      triggerEquals: {
        euDependencyDegraded: true,
        replicationLagActive: true,
        catchUpWindowElapsed: false,
      },
      controlEquals: {
        [LEDGER_WRITE_AUTHORITY_KEY]: "us-authoritative",
        [EU_TRAFFIC_PERCENTAGE_KEY]: 40,
        [SETTLEMENT_WORKER_PRIORITY_KEY]: "critical-path-first",
        [CROSS_REGION_REPLICATION_MODE_KEY]: "paused-until-caught-up",
      },
    },
    incidentState: "paused-replication-protected-draining",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 96,
      usPaymentLatencyMs: 285,
      euPaymentLatencyMs: 235,
      ledgerReplicationLagSeconds: 15,
      usLedgerUtilization: 75,
      settlementBacklogThousands: 5,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 98,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 60,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "us-authoritative-routed",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: protectedShiftHealth,
  },

  // ── No-action baseline: EU dependency degraded, replication lag
  // active, candidate has touched nothing. EU payment success is
  // genuinely hurt by its own risk-check failures (not by a traffic-
  // shift decision), ledger authority is still safe (no shift has
  // happened yet so no divergence risk has materialized), but nothing
  // is being actively protected either.
  {
    id: "baseline-unmitigated",
    when: {
      triggerEquals: { euDependencyDegraded: true, replicationLagActive: true },
    },
    incidentState: "baseline-unmitigated",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 74,
      usPaymentLatencyMs: 230,
      euPaymentLatencyMs: 410,
      ledgerReplicationLagSeconds: 22,
      usLedgerUtilization: 42,
      settlementBacklogThousands: 1,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 58,
      crossRegionTrafficPercentage: 0,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "region-local-safe",
      capacityRiskStatus: "warning",
      correctnessStatus: "safe",
    },
    componentHealth: euDegradedHealth,
  },

  // ── EU dependency degraded, replication lag not yet active (the
  // first few seconds of the incident, before REPLICATION_LAG_ONSET_MS
  // but after EU_DEPENDENCY_DEGRADED_MS fires) -- a plain, single-cause
  // state for the brief overlap window.
  {
    id: "eu-degraded-only",
    when: { triggerEquals: { euDependencyDegraded: true } },
    incidentState: "eu-degraded-only",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 76,
      usPaymentLatencyMs: 225,
      euPaymentLatencyMs: 390,
      ledgerReplicationLagSeconds: 0,
      usLedgerUtilization: 40,
      settlementBacklogThousands: 0,
      fraudProviderHealth: "degraded",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 60,
      crossRegionTrafficPercentage: 0,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "region-local-safe",
      capacityRiskStatus: "normal",
      correctnessStatus: "safe",
    },
    componentHealth: euDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      usPaymentSuccessRate: 99,
      euPaymentSuccessRate: 99,
      usPaymentLatencyMs: 220,
      euPaymentLatencyMs: 240,
      ledgerReplicationLagSeconds: 0,
      usLedgerUtilization: 40,
      settlementBacklogThousands: 0,
      fraudProviderHealth: "healthy",
      usRiskCheckSuccessRate: 99,
      euRiskCheckSuccessRate: 99,
      crossRegionTrafficPercentage: 0,
      divergentLedgerAuthorityCount: 0,
      fraudControlBypassCount: 0,
      riskControlPosture: "fraud-controls-intact",
      ledgerAuthorityMechanism: "region-local-safe",
      capacityRiskStatus: "normal",
      correctnessStatus: "safe",
    },
    componentHealth: healthyHealth,
  },
];
