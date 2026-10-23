import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  primaryHealthPct: 100,
  replicationLagMs: 50,
  replicaHealthPct: 100,
  writeSuccessRatePct: 100,
  readSuccessRatePct: 100,
  connectionPoolUtilizationPct: 20,
  oldPrimaryReachable: "reachable",
  primaryStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode) naming WHICH node is currently authoritative for
  // writes, read only by success/acceptable conditions and scoring.
  writeAuthorityMode: "primary",
  // The correctness-violation field this scenario exists to test: a real,
  // observable count of writes accepted by a node that should no longer
  // be authoritative (either the old primary after a cutover, or two
  // nodes simultaneously). Stays nonzero/rising for as long as the old
  // primary remains reachable AND unfenced AND write routing has moved
  // off it without the old primary's own write path having been closed —
  // never reset to 0 by a merely healthy-looking availability metric.
  staleWriteCount: 0,
  // "active" for as long as BOTH the old primary and the newly promoted
  // replica could simultaneously accept writes — the explicit split-
  // primary hazard. String-valued ("active"/"inactive") because
  // StateValue (packages/simulator/src/types.ts) only admits number |
  // string in a rule's authored `values`. Read by the correctness-
  // violation test and success/acceptable conditions, never simulated
  // by any formula.
  splitPrimaryActive: "inactive",
  // A one-time, bounded count of writes the old primary had acknowledged
  // but never replicated before an under-lagged replica was promoted —
  // distinct from staleWriteCount: this never grows once reached (it is
  // fixed at the moment of promotion), representing an accepted,
  // accounted-for tradeoff rather than an ongoing hazard.
  lostWriteCount: 0,
  // Generic string-state summary of the two correctness-violation
  // numeric fields above, set by rules.ts alongside them — never
  // computed by a formula. "clean" = zero stale AND zero lost writes
  // (the genuine optimal fix). "bounded-loss" = zero stale writes but a
  // fixed, accounted-for lostWriteCount (the fencing-without-lag-drain
  // acceptable tradeoff). "split-primary" = an ONGOING, unbounded
  // staleWriteCount hazard (the central trap). "unresolved" = failover
  // has not yet reached a write-authority cutover at all. Read only by
  // success/acceptable conditions and scoring's dataIntegrity dimension,
  // never by any scenario-specific scorer code.
  integrityStatus: "unresolved",
};
