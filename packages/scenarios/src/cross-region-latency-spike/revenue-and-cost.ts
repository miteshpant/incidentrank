import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { GENERAL_CONSISTENCY_MODE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "always-global-amplified": 700,
  "sustained-degraded-no-relaxation": 560,
  "fully-synchronous-degraded": 380,
  "failover-adds-rtt": 480,
  // Looks fully healthy on every customer-facing latency metric, so no
  // revenue-loss rate is modeled here — the cost of this state is
  // correctness risk, not revenue, and it is excluded from
  // successCondition/acceptableCondition entirely regardless of how
  // this number reads.
  "payment-consistency-relaxed": 0,
  "general-traffic-relaxed": 25,
  healthy: 0,
};

/**
 * Running asynchronous cross-region replication for the general data
 * path (change-data-capture plus conflict-resolution machinery) carries
 * a genuine, ongoing infrastructure cost beyond the synchronous
 * baseline — the real, honest cost side of the fast tradeoff's bounded
 * replication-lag benefit. This is what lets costEfficiency
 * legitimately discriminate the OPTIMAL (fast, eventual) tier from the
 * ACCEPTABLE (patient, synchronous) tier, since both are otherwise
 * safe and recover customer-facing metrics on the same timescale in
 * this engine's sustain-window model.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${GENERAL_CONSISTENCY_MODE_KEY}:eventual`]: 90,
  },
};

/**
 * Full recovery: regional customer latency has recovered close to
 * normal AND payment authorization is still strongly consistent.
 * Gating on paymentAuthConsistency === "strong" is the binding
 * correctness requirement (phase6b.md section 37/40 and this
 * scenario's own stated business constraint) — a state where both
 * regions can authorize payments independently must never satisfy this
 * condition, no matter how healthy latency/availability look. This is
 * the fast-tradeoff path: general traffic relaxed to region-local/
 * eventual consistency, payment left untouched.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "usCustomerLatencyMs", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "euCustomerLatencyMs", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "backboneStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "paymentAuthConsistency", operator: "equals", comparedTo: "strong" },
  ],
  sustainedSeconds: 15,
};

/**
 * Acceptable handback: the fully-synchronous, patient path. Payment
 * stays strongly consistent (same binding gate as successCondition —
 * there is no looser bar for correctness), and the backbone issue
 * itself is not yet resolved, so regional customer latency stays
 * elevated — bounded below by the current inter-region RTT — but
 * nothing is unsafe. A genuinely different, slower, equally-safe
 * engineering choice from the fast path above, not a partial/almost-
 * passed state. Deliberately does NOT match the sustained-degradation
 * state (backboneStatus becomes "critical" and latency climbs further
 * once the backbone issue has visibly failed to clear on its own) — see
 * definition.ts's completion-mode audit for why patience alone cannot
 * stay acceptable indefinitely.
 *
 * Phase 6B.1 fix: sustainedSeconds raised from 15 to 45. The scenario's
 * own timing scale is minutes (RTT_SPIKE_MS=30s, the second-wave
 * confirmation at +3min), so 45s is a realistic "did you actually
 * observe the system settle" window — long enough to require genuine
 * observation, far short of the ~3.5-minute hidden second-wave event
 * (never gate on that directly; see docs/implementation_plan/
 * phase6b.1.md section 6). Before this fix, a candidate could click
 * Finish seconds after the incident began and resolve acceptable with
 * a near-perfect score without ever having watched the system behave —
 * this raises the bar to "wait and confirm stability," not "wait out
 * the hidden timer."
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "usCustomerLatencyMs", operator: "less_than_or_equal", comparedTo: 600 },
    { key: "euCustomerLatencyMs", operator: "less_than_or_equal", comparedTo: 600 },
    { key: "backboneStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "paymentAuthConsistency", operator: "equals", comparedTo: "strong" },
  ],
  sustainedSeconds: 45,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "usCustomerLatencyMs", operator: "greater_than_or_equal", comparedTo: 700 }],
  sustainedSeconds: 90,
};
