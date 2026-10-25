import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How many units of reserved (committed, non-refundable) capacity are
 * locked in for Region A ahead of the approaching demand event, in the
 * same abstract capacity units as the demand forecast (metrics.ts). `0`
 * (default — the pre-decision state every attempt starts in) commits
 * nothing. `300` / `600` / `900` commit progressively more capacity,
 * each a real, non-refundable cost paid once (see revenue-and-cost.ts)
 * regardless of whether the event's actual demand ever uses it. Numeric
 * (rather than a string tier) specifically so rules.ts can use
 * controlAtLeast/controlAtMost to recognize BALANCED vs. CONCENTRATED
 * distributions across all three regions without enumerating every one
 * of the 4x4x4 combinations individually. This is the scenario's primary
 * lever: three independent per-region controls (A/B/C below) are what
 * make REGIONAL CONCENTRATION a real, visible risk rather than a single
 * scalar "how much capacity" dial — reserving 900 in one region while
 * leaving the other two at 0 protects aggregate headroom on paper while
 * creating a real, hidden concentration risk if that one region has a
 * problem of its own (see rules.ts's concentration-risk trap).
 */
export const RESERVED_CAPACITY_REGION_A_KEY = "reservedCapacityRegionA";

/** Same semantics as Region A, for Region B. */
export const RESERVED_CAPACITY_REGION_B_KEY = "reservedCapacityRegionB";

/** Same semantics as Region A, for Region C. */
export const RESERVED_CAPACITY_REGION_C_KEY = "reservedCapacityRegionC";

/**
 * Whether unreserved demand above the committed reserved total is
 * allowed to burst onto on-demand (pay-as-you-go, more expensive
 * per-unit, but immediately available) capacity, or is simply refused.
 * "disabled" (default) means any demand above the reserved total is
 * dropped — a real availability/business-loss risk if the forecast
 * under-shoots. "enabled" is the scenario's explicit, bounded safety
 * valve: it does not eliminate the cost of under-reserving (on-demand is
 * genuinely more expensive per unit, see revenue-and-cost.ts), but it is
 * what turns a hard demand cliff into a real, if costlier, degraded mode
 * rather than an outright critical-workload shortfall. This is the
 * control that makes Alternate Strong Path B (moderate reservation +
 * explicit fallback + optional-workload shedding) a genuinely different,
 * cheaper-but-real economic profile from Alternate Strong Path A
 * (reserve high enough that fallback is rarely needed).
 */
export const ON_DEMAND_FALLBACK_POLICY_KEY = "onDemandFallbackPolicy";

/**
 * Whether Optional-Tier workload (non-critical product lines/features)
 * is deliberately shed first when reserved+on-demand capacity is under
 * real pressure during the event, protecting Critical-Tier workload at
 * its expense. "none" (default) treats all workload identically — under
 * genuine pressure this means Critical-Tier workload competes for
 * capacity on equal footing with Optional-Tier workload instead of being
 * protected ahead of it. "shed-under-pressure" is the scenario's
 * business-invariant-driven degrade lever: Optional-Tier workload may be
 * degraded or dropped (this scenario's business invariants explicitly
 * permit it), freeing real headroom for Critical-Tier workload exactly
 * when it matters, without needing to over-reserve to protect it.
 */
export const OPTIONAL_WORKLOAD_SHEDDING_KEY = "optionalWorkloadShedding";

/**
 * Which percentile of the authored demand forecast band the reservation
 * decision is actually planned against. "p50-only" (default) plans only
 * against the median forecast — the root cause of under-reservation risk
 * in this scenario: real demand regularly lands above the median, and a
 * plan sized only to p50 has no margin for that. "p90-planning" plans
 * against the 90th-percentile forecast — genuine, substantial margin for
 * the demand band's real uncertainty. "p99-planning" plans against the
 * near-worst-case forecast — the most conservative, most expensive
 * planning basis. This control does not itself reserve any capacity (the
 * per-region controls above do) — it is the scenario's explicit
 * "forecast uncertainty must be treated explicitly, not ignored" lever:
 * a candidate who reserves a seemingly-adequate AGGREGATE total while
 * this stays at "p50-only" has quietly under-planned for the forecast's
 * own stated uncertainty, which rules.ts treats as a real, distinct gap
 * from simply reserving too little capacity outright.
 */
export const FORECAST_CONFIDENCE_THRESHOLD_KEY = "forecastConfidenceThreshold";

/**
 * Whether the reservation decision has actually been locked in (a real,
 * committed, non-refundable purchase) before the authored deadline, or
 * is still sitting at "wait" when the deadline passes. "wait" (default)
 * takes no action — reservation prices and availability at this
 * provider are only guaranteed before the deadline; every tick spent at
 * "wait" is a tick of deadline risk accumulating, not a neutral,
 * cost-free holding pattern (see timed-events.ts's deadline progression
 * and rules.ts's deadline-missed trap). "lock-in-now" commits whatever
 * reservation levels are currently set on the three region controls
 * above — it does not change WHAT is reserved, only WHETHER and WHEN the
 * decision is actually locked in before the window closes.
 */
export const RESERVATION_TIMING_KEY = "reservationTiming";

/**
 * An additional, deliberately small buffer reserved beyond whatever the
 * three region controls above already commit, sized to absorb forecast
 * error without materially changing the scenario's cost profile. "none"
 * (default) carries no buffer at all. "small" is the scenario's
 * genuinely efficient middle ground. "large" provides the most margin
 * but is priced as real, non-refundable waste beyond what any
 * genuinely-achievable demand band would ever use — the scenario's
 * required "maximal reservation, no regard for waste" trap is reachable
 * through this control (paired with reserving "high" everywhere) as much
 * as through the per-region controls alone.
 */
export const CONTINGENCY_RESERVE_KEY = "contingencyReservePercent";

export const controls: ControlDefinition[] = [
  {
    key: RESERVED_CAPACITY_REGION_A_KEY,
    allowedValues: [0, 300, 600, 900],
    initialValue: 0,
  },
  {
    key: RESERVED_CAPACITY_REGION_B_KEY,
    allowedValues: [0, 300, 600, 900],
    initialValue: 0,
  },
  {
    key: RESERVED_CAPACITY_REGION_C_KEY,
    allowedValues: [0, 300, 600, 900],
    initialValue: 0,
  },
  {
    key: ON_DEMAND_FALLBACK_POLICY_KEY,
    allowedValues: ["disabled", "enabled"],
    initialValue: "disabled",
  },
  {
    key: OPTIONAL_WORKLOAD_SHEDDING_KEY,
    allowedValues: ["none", "shed-under-pressure"],
    initialValue: "none",
  },
  {
    key: FORECAST_CONFIDENCE_THRESHOLD_KEY,
    allowedValues: ["p50-only", "p90-planning", "p99-planning"],
    initialValue: "p50-only",
  },
  {
    key: RESERVATION_TIMING_KEY,
    allowedValues: ["wait", "lock-in-now"],
    initialValue: "wait",
  },
  {
    key: CONTINGENCY_RESERVE_KEY,
    allowedValues: ["none", "small", "large"],
    initialValue: "none",
  },
];
