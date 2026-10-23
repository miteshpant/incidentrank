import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONNECTION_DRAIN_KEY,
  FAILOVER_INITIATED_KEY,
  OLD_PRIMARY_FENCING_KEY,
  PROMOTION_TIMING_KEY,
  REPLICA_COUNT_KEY,
  WRITE_ROUTING_POLICY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "application-services": "healthy",
  "db-proxy": "healthy",
  primary: "healthy",
  replica: "healthy",
};

const primaryDegradedHealth: Record<string, ComponentHealth> = {
  "application-services": "healthy",
  "db-proxy": "degraded",
  primary: "degraded",
  replica: "healthy",
};

const primaryCriticalApplicationDegradedHealth: Record<string, ComponentHealth> = {
  "application-services": "degraded",
  "db-proxy": "critical",
  primary: "critical",
  replica: "healthy",
};

const primaryCriticalApplicationCriticalHealth: Record<string, ComponentHealth> = {
  "application-services": "critical",
  "db-proxy": "critical",
  primary: "critical",
  replica: "healthy",
};

// Promoted replica now serving, old primary fenced/offline — fully clean.
const promotedCleanHealth: Record<string, ComponentHealth> = {
  "application-services": "healthy",
  "db-proxy": "healthy",
  primary: "critical",
  replica: "healthy",
};

// Promoted replica serving, old primary still reachable and unfenced —
// looks healthy at the application layer but the old primary is a live
// correctness hazard.
const splitPrimaryHealth: Record<string, ComponentHealth> = {
  "application-services": "healthy",
  "db-proxy": "degraded",
  primary: "degraded",
  replica: "healthy",
};

/**
 * Authored rule table for Primary Database Failover, ordered
 * most-specific-first. The primary degrades (replication acknowledgement
 * slowing, write latency rising) and then becomes fully unavailable. The
 * durable safe recovery requires promoting the replica AND closing off
 * the old primary's ability to ever accept another write — either by
 * waiting for replication lag to drain to near-zero before cutting over,
 * or by fencing the old primary immediately so it cannot accept writes
 * even though lag hasn't drained. Promoting immediately WITHOUT fencing
 * (and without having waited for lag to drain) looks fully recovered at
 * the availability layer — write/read success both read 100% — while the
 * old primary remains reachable and able to accept writes, producing an
 * ongoing, unbounded split-primary/stale-write hazard. This is the
 * scenario's binding availability-vs-correctness trap.
 */
export const primaryDatabaseFailoverRules: Rule[] = [
  // ── OPTIMAL recovery: promotion held until replication lag has
  // drained to near-zero, THEN the old primary is fenced and write
  // traffic is cut over. The promoted replica has every write the old
  // primary ever acknowledged (lag was ~0 at cutover) and the old
  // primary can never diverge afterward (fenced). Zero lost writes,
  // zero stale writes, zero split-primary risk. Checked first so it
  // wins over every other control combination once fully applied.
  {
    id: "lag-drained-fenced-recovery",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [PROMOTION_TIMING_KEY]: "waitForLagDrain",
        [OLD_PRIMARY_FENCING_KEY]: true,
        [WRITE_ROUTING_POLICY_KEY]: "newPrimary",
      },
    },
    incidentState: "promoted-lag-drained-fenced",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 0,
      replicaHealthPct: 100,
      writeSuccessRatePct: 100,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 30,
      oldPrimaryReachable: "fenced",
      primaryStatus: "normal",
      writeAuthorityMode: "replica",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "clean",
    },
    componentHealth: promotedCleanHealth,
  },

  // ── ACCEPTABLE alternate-good path: promotion happens immediately
  // (before lag has drained), but the old primary is fenced the moment
  // the replica is promoted and connections are drained first, and
  // write traffic is routed to the new primary. Fencing closes the
  // split-primary hazard immediately, so there is no ONGOING
  // correctness violation — but because the cutover happened before
  // replication lag drained, a small, bounded, one-time set of writes
  // that the old primary had acknowledged but never replicated is lost
  // at the moment of promotion (lostWriteCount > 0, fixed, not rising).
  // This is a genuine, deliberate availability-for-a-bounded-loss
  // tradeoff, not a disguised unsafe state: the loss is fully accounted
  // for and does not grow once reached.
  {
    id: "immediate-promotion-fenced-drained-bounded-loss",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [PROMOTION_TIMING_KEY]: "immediate",
        [OLD_PRIMARY_FENCING_KEY]: true,
        [CONNECTION_DRAIN_KEY]: true,
        [WRITE_ROUTING_POLICY_KEY]: "newPrimary",
      },
    },
    incidentState: "promoted-immediate-fenced-bounded-loss",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 0,
      replicaHealthPct: 100,
      writeSuccessRatePct: 100,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 35,
      oldPrimaryReachable: "fenced",
      primaryStatus: "normal",
      writeAuthorityMode: "replica",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 40,
      integrityStatus: "bounded-loss",
    },
    componentHealth: promotedCleanHealth,
  },

  // ── Variant of the acceptable path without connection draining: still
  // fenced and routed to the new primary, so no ongoing hazard, but
  // in-flight transactions against the old primary at the instant of
  // the cutover were severed rather than allowed to finish, adding to
  // the one-time, bounded loss. Still safe to hand back (bounded,
  // non-growing), just a slightly worse bound than draining first.
  {
    id: "immediate-promotion-fenced-undrained-bounded-loss",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [PROMOTION_TIMING_KEY]: "immediate",
        [OLD_PRIMARY_FENCING_KEY]: true,
        [CONNECTION_DRAIN_KEY]: false,
        [WRITE_ROUTING_POLICY_KEY]: "newPrimary",
      },
    },
    incidentState: "promoted-immediate-fenced-undrained-loss",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 0,
      replicaHealthPct: 100,
      writeSuccessRatePct: 100,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 35,
      oldPrimaryReachable: "fenced",
      primaryStatus: "normal",
      writeAuthorityMode: "replica",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 95,
      integrityStatus: "bounded-loss",
    },
    componentHealth: promotedCleanHealth,
  },

  // ── UNSAFE / the central trap: immediate promotion, write traffic
  // cut over to the new primary, but the old primary is left UNFENCED
  // and remains reachable. Availability metrics fully recover — write
  // and read success both read 100% — but the old primary can still
  // accept writes from any client/connection that has not yet been
  // redirected (or that still resolves it via stale DNS/service
  // discovery), so both nodes are simultaneously able to accept writes.
  // staleWriteCount keeps climbing every tick this state holds: this is
  // an ONGOING, unbounded correctness violation hiding behind healthy
  // availability numbers, never a one-time bounded cost.
  {
    id: "split-primary-unfenced-trap",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [PROMOTION_TIMING_KEY]: "immediate",
        [OLD_PRIMARY_FENCING_KEY]: false,
        [WRITE_ROUTING_POLICY_KEY]: "newPrimary",
      },
    },
    incidentState: "split-primary-active",
    values: {
      primaryHealthPct: 35,
      replicationLagMs: 0,
      replicaHealthPct: 100,
      writeSuccessRatePct: 100,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 40,
      oldPrimaryReachable: "reachable",
      primaryStatus: "warning",
      writeAuthorityMode: "both",
      staleWriteCount: 180,
      splitPrimaryActive: "active",
      lostWriteCount: 0,
      integrityStatus: "split-primary",
    },
    componentHealth: splitPrimaryHealth,
  },

  // ── Still unsafe, but partially mitigated: promoted immediately and
  // fenced, yet write routing was never moved off the old primary. The
  // DB Proxy keeps sending writes at a node that is now fenced/offline,
  // so write success collapses even though the replica itself is fine —
  // a real, visible failure mode distinct from the trap above (this one
  // is loud, not silent).
  {
    id: "fenced-but-routing-not-updated",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [OLD_PRIMARY_FENCING_KEY]: true,
        [WRITE_ROUTING_POLICY_KEY]: "oldPrimary",
      },
    },
    incidentState: "routing-not-cutover",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 0,
      replicaHealthPct: 100,
      writeSuccessRatePct: 5,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 90,
      oldPrimaryReachable: "fenced",
      primaryStatus: "critical",
      writeAuthorityMode: "none",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: primaryCriticalApplicationDegradedHealth,
  },

  // ── Harmful/incomplete: failover initiated, promotion immediate,
  // fencing off, and routing never cut over either. Writes still target
  // the old primary (now failing outright once unavailable; degraded
  // and unreliable even before then), and the promoted replica sits
  // idle. No correctness violation is produced because the replica
  // never actually took write authority, but availability stays broken.
  {
    id: "failover-initiated-no-fencing-no-routing",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: {
        [FAILOVER_INITIATED_KEY]: true,
        [OLD_PRIMARY_FENCING_KEY]: false,
        [WRITE_ROUTING_POLICY_KEY]: "oldPrimary",
      },
    },
    incidentState: "failover-initiated-incomplete",
    values: {
      primaryHealthPct: 35,
      replicationLagMs: 4_200,
      replicaHealthPct: 100,
      writeSuccessRatePct: 40,
      readSuccessRatePct: 70,
      connectionPoolUtilizationPct: 85,
      oldPrimaryReachable: "reachable",
      primaryStatus: "critical",
      writeAuthorityMode: "primary",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: primaryCriticalApplicationDegradedHealth,
  },

  // ── Second wave, no action, single replica: the primary has become
  // fully unavailable and no failover has been initiated. Writes fail
  // outright. With only one replica, the full weight of redirected read
  // traffic concentrates on it, so even read success degrades further
  // than the multi-replica case below — a realistic, if secondary,
  // consequence of replica fleet size.
  {
    id: "primary-unavailable-no-failover-single-replica",
    when: {
      triggerEquals: { primaryUnavailable: true },
      controlEquals: { [FAILOVER_INITIATED_KEY]: false, [REPLICA_COUNT_KEY]: 1 },
    },
    incidentState: "primary-unavailable-unmitigated",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 9_000,
      replicaHealthPct: 100,
      writeSuccessRatePct: 2,
      readSuccessRatePct: 55,
      connectionPoolUtilizationPct: 98,
      oldPrimaryReachable: "unreachable",
      primaryStatus: "critical",
      writeAuthorityMode: "primary",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: primaryCriticalApplicationCriticalHealth,
  },

  // ── Second wave, no action, multiple replicas: writes still fail
  // outright (no write authority exists without a promotion), but read
  // traffic is spread across more read capacity, so read success holds
  // up noticeably better than the single-replica case.
  {
    id: "primary-unavailable-no-failover-multi-replica",
    when: {
      triggerEquals: { primaryUnavailable: true },
      controlEquals: { [FAILOVER_INITIATED_KEY]: false },
      controlAtLeast: { [REPLICA_COUNT_KEY]: 2 },
    },
    incidentState: "primary-unavailable-unmitigated",
    values: {
      primaryHealthPct: 0,
      replicationLagMs: 9_000,
      replicaHealthPct: 100,
      writeSuccessRatePct: 2,
      readSuccessRatePct: 80,
      connectionPoolUtilizationPct: 90,
      oldPrimaryReachable: "unreachable",
      primaryStatus: "critical",
      writeAuthorityMode: "primary",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: primaryCriticalApplicationCriticalHealth,
  },

  // ── First wave, no action: the primary is degrading and the
  // candidate has taken no meaningfully mitigating action yet. This is
  // the observable precursor window — replication lag and write latency
  // are visibly climbing before the primary goes fully unavailable.
  {
    id: "primary-degrading-baseline",
    when: {
      triggerEquals: { primaryDegrading: true },
      controlEquals: { [FAILOVER_INITIATED_KEY]: false },
    },
    incidentState: "primary-degrading",
    values: {
      primaryHealthPct: 55,
      replicationLagMs: 2_600,
      replicaHealthPct: 100,
      writeSuccessRatePct: 78,
      readSuccessRatePct: 92,
      connectionPoolUtilizationPct: 70,
      oldPrimaryReachable: "reachable",
      primaryStatus: "warning",
      writeAuthorityMode: "primary",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: primaryDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      primaryHealthPct: 100,
      replicationLagMs: 50,
      replicaHealthPct: 100,
      writeSuccessRatePct: 100,
      readSuccessRatePct: 100,
      connectionPoolUtilizationPct: 20,
      oldPrimaryReachable: "reachable",
      primaryStatus: "normal",
      writeAuthorityMode: "primary",
      staleWriteCount: 0,
      splitPrimaryActive: "inactive",
      lostWriteCount: 0,
      integrityStatus: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
