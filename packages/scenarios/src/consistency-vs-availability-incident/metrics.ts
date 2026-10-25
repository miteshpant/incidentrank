import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Customer-facing write availability for balance operations, 0-100.
  // Can read 100 at the exact same time balanceCorrectnessViolations is
  // climbing -- that combination is the trap this scenario exists to
  // catch.
  balanceWriteAvailability: 100,
  // Customer-facing write availability for catalog operations, 0-100.
  catalogWriteAvailability: 100,
  // Direct, authored evidence that a balance write was accepted by one
  // region without cross-region confirmation while the connectivity
  // problem was active -- i.e. a write that could have silently
  // conflicted with an independent write accepted by the other region
  // against the same account, with neither side aware of the other.
  // Zero is the only safe value. This is the real correctness field
  // successCondition gates on directly, and it is NEVER satisfied by
  // healthy balanceWriteAvailability -- the two fields are deliberately
  // independent.
  balanceCorrectnessViolations: 0,
  // Balance writes currently queued, awaiting cross-region confirmation
  // once connectivity returns (only nonzero under
  // unconfirmedWritePolicy="queue" while strong mode can't get
  // confirmed). Candidate-visible cost of choosing to queue rather than
  // reject.
  balanceWriteQueueDepth: 0,
  // Balance writes rejected outright at request time because they could
  // not get cross-region confirmation (only nonzero under
  // unconfirmedWritePolicy="reject"). A real, visible availability cost,
  // but never a correctness violation -- a rejected write never applied
  // anywhere.
  balanceWriteRejectedCount: 0,
  // How stale a catalog read can currently be, in seconds. 0 while
  // catalog consistency is "strong" (always cross-confirmed); rises
  // under "relaxed" mode during the connectivity problem, since each
  // region is now serving/accepting catalog writes from only its own
  // local view. This is the business-acceptable cost of relaxing
  // consistency on the staleness-tolerant category -- never a
  // correctness violation, because catalog entries have no "double-
  // spend" shape: whichever write converges last is still a valid,
  // coherent value.
  catalogStalenessSeconds: 0,
  // Count of catalog keys that diverged between regions during the
  // connectivity problem and are awaiting reconciliation once healed.
  // Purely a convergence-speed/field-overwrite concern, never a
  // customer-facing correctness incident the way balanceCorrectness
  // Violations is.
  catalogDivergentKeyCount: 0,
  // Whether cross-region connectivity is currently available. "healthy"
  // before/after the connectivity problem; "degraded" while regions
  // cannot reliably cross-confirm writes with each other.
  regionConnectivity: "healthy",
  // Severity field (exactly normal|warning|critical) tracking how
  // dangerous the current balance-write handling is -- distinct from
  // balanceWriteAvailability, whose value is a percentage, not the
  // normal/warning/critical enum. "critical" only while a real balance
  // correctness violation is actively being produced; "warning" while
  // balance availability is degraded but safely (no violations);
  // "normal" otherwise. Drives totalTimeInCriticalMs/
  // totalTimeInDegradedMs (and therefore Reliability's criticalTimeRatio)
  // generically via the engine's own severityRank bookkeeping.
  balanceSafetyStatus: "normal",
  // Generic string-state field (Split-Brain Incident's
  // writeSafetyMechanism / Distributed Lock Failure's
  // lockSafetyMechanism precedent) recording HOW balance-write
  // correctness is currently being protected during the connectivity
  // problem, not merely whether it currently holds. Read only by
  // scoring's dataIntegrity measure, never by resolution logic.
  //   "quorum-confirmed"   -- strong mode backed by a real cross-region
  //                            quorum requirement: structurally safe,
  //                            the correct differentiated choice.
  //   "single-region-routed" -- all balance writes forced to one named
  //                            region (writeRouting), so no second
  //                            region can ever accept a conflicting
  //                            balance write. Also structurally safe.
  //   "relaxed-unsafe"     -- balanceConsistencyMode is "relaxed": the
  //                            one genuinely unsafe move. Balance writes
  //                            are being accepted from each region's own
  //                            local view with no cross-region check.
  //   "quorum-misconfigured" -- balanceConsistencyMode is "strong" but
  //                            quorumRequirement has been set to
  //                            "local-only", silently removing the
  //                            cross-region check the "strong" label
  //                            implied.
  //   "unresolved"          -- the untouched baseline: strong mode,
  //                            default quorum, before any candidate
  //                            action, or the connectivity problem has
  //                            not started yet.
  balanceSafetyMechanism: "unresolved",
};
