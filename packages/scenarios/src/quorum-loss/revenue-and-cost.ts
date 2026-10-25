import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MEMBERSHIP_SIZE_KEY, QUORUM_REQUIREMENT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  // The trap state: writeAvailability reads 100 the entire time, so this
  // scenario deliberately does not model heavy revenue loss here from an
  // availability standpoint -- the real cost is the correctness damage,
  // carried by Data Integrity scoring and the gated successCondition, not
  // by an availability-driven revenue number that would make this state
  // look "cheap" the same way it looks "healthy."
  "below-quorum-unsafe-writes": 200,
  "below-quorum-safe-read-only": 900,
  "below-quorum-safe-structural-refusal": 900,
  "quorum-threatened-node-c-warning": 60,
  "quorum-threatened": 40,
  "quorum-restored-three-node": 50,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${MEMBERSHIP_SIZE_KEY}:five`]: 0,
    [`${MEMBERSHIP_SIZE_KEY}:three`]: -80,
    [`${QUORUM_REQUIREMENT_KEY}:strict-majority`]: 0,
    [`${QUORUM_REQUIREMENT_KEY}:relaxed-any-reachable`]: 0,
  },
};

/**
 * Full recovery: the group genuinely holds quorum right now
 * (healthyNodeCount >= quorumRequiredCount, i.e. quorumStatus !==
 * "critical") AND it has never accepted a write without genuine majority
 * agreement (unsafeWriteCount === 0). This is the direct, authored
 * correctness gate: a state where writes were accepted below quorum can
 * NEVER satisfy this, regardless of how healthy writeAvailability reads
 * -- that field is deliberately absent from this condition. Reaching
 * quorumStatus "normal" is possible either by genuinely restoring enough
 * reachable nodes/reconfigured membership (quorum-restored-three-node)
 * or simply because the second wave never happened/nodes came back on
 * their own -- either way, unsafeWriteCount === 0 is what proves no
 * correctness violation occurred along the way.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "quorumStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "unsafeWriteCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: the group is below quorum (quorumStatus ===
 * "critical") but has correctly switched to a safe read-only degrade --
 * either readOnlyMode explicitly engaged or quorumRequirement's
 * structural "strict-majority" refusal -- so unsafeWriteCount stays at
 * 0 despite not currently holding quorum. This is genuinely,
 * operationally safe to hand back: reads continue, writes are correctly
 * refused rather than silently accepted without a majority, and no
 * correctness violation is accumulating. It is a deliberate, bounded
 * tradeoff (write availability for correctness), not a partial or
 * almost-fixed state -- the alternative (continuing to accept writes
 * below quorum) is the one path this scenario exists to make
 * unambiguously unsafe.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "quorumStatus", operator: "equals", comparedTo: "critical" },
    { key: "unsafeWriteCount", operator: "equals", comparedTo: 0 },
    { key: "writeAvailability", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: a sustained run of the unsafe-writes-without-quorum trap --
 * the group has been accepting writes below quorum long enough to
 * accumulate serious, uncontained correctness damage with no sign of
 * being reined in.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "unsafeWriteCount", operator: "greater_than_or_equal", comparedTo: 24 }],
  sustainedSeconds: 60,
};
