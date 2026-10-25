import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "healthy",
  "instance-a": "healthy",
  "instance-b": "healthy",
  "instance-c": "healthy",
  "instance-d": "healthy",
};

const skewedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "degraded",
  "instance-a": "critical",
  "instance-b": "degraded",
  "instance-c": "healthy",
  "instance-d": "healthy",
};

const compoundedSkewHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "critical",
  "instance-a": "critical",
  "instance-b": "critical",
  "instance-c": "healthy",
  "instance-d": "healthy",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "load-balancer": "degraded",
  "instance-a": "degraded",
  "instance-b": "healthy",
  "instance-c": "healthy",
  "instance-d": "healthy",
};

/**
 * Authored rule table for Load Balancer Imbalance, ordered most-specific
 * first. A returning-user traffic wave lands under sticky-session
 * hashing, which pins every one of those already-authenticated clients
 * to whichever instance (overwhelmingly A, and to a lesser extent B)
 * first served their session. Instance C and D, which mostly see
 * first-time/unauthenticated traffic, stay near baseline. The
 * balancer's stale health check is slow to react, so it keeps sending
 * brand-new, unpinned traffic to A too, compounding the skew over time
 * if left unmitigated.
 *
 * Two durable fixes exist and address the mechanism itself:
 *   1. balancingStrategy -> leastConnections or roundRobin: the balancer
 *      stops respecting the sticky hash for routing decisions, so every
 *      instance (new and already-pinned clients alike, since a
 *      reconnect/keep-alive cycle re-evaluates routing) converges on an
 *      even share.
 *   2. stickySessionsEnabled -> false: session affinity itself is
 *      switched off, so even previously pinned clients get
 *      re-distributed on their next request, independent of whichever
 *      hashing strategy is configured.
 *
 * One acceptable-but-costly alternate path exists: connectionDraining
 * forces existing connections on A/B to terminate and re-establish
 * (and thus re-pin) elsewhere, clearing the skew without touching
 * strategy or stickiness — at the direct cost of forcibly interrupting
 * whatever those clients were doing.
 *
 * The REQUIRED trap: raising instanceCount or lowering
 * trafficWeights on the hot instances, while sticky sessions and the
 * sticky-hash strategy remain untouched, does NOT relieve the skew.
 * New instances/weight changes only affect where *brand-new, unpinned*
 * sessions land — every client already pinned to A/B keeps being routed
 * there regardless of how much idle capacity exists elsewhere, so A/B's
 * connection count and latency stay elevated (new instances receive only
 * the small trickle of genuinely new sessions, proven by real distinct
 * authored values below, not merely asserted).
 */
export const loadBalancerImbalanceRules: Rule[] = [
  // ── Optimal recovery A: balancing strategy switched away from sticky
  // hashing. The balancer stops routing by session pin, so every
  // instance converges on an even request/connection share regardless
  // of instanceCount, trafficWeights, or stickySessionsEnabled. Checked
  // first (after sticky-sessions-disabled below) so it wins over every
  // other control combination once applied.
  {
    id: "strategy-rebalanced-recovery",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: { [BALANCING_STRATEGY_KEY]: "leastConnections" },
    },
    incidentState: "rebalanced-by-strategy",
    values: {
      instanceARequestRate: 102,
      instanceBRequestRate: 100,
      instanceCRequestRate: 99,
      instanceDRequestRate: 101,
      instanceALatencyMs: 42,
      instanceBLatencyMs: 41,
      instanceCLatencyMs: 40,
      instanceDLatencyMs: 41,
      instanceAConnectionCount: 55,
      instanceBConnectionCount: 54,
      healthyBackendCount: 4,
      globalSuccessRatePct: 100,
      balancerStatus: "normal",
      imbalanceRootCause: "rebalanced",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "strategy-round-robin-recovery",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: { [BALANCING_STRATEGY_KEY]: "roundRobin" },
    },
    incidentState: "rebalanced-by-strategy",
    values: {
      instanceARequestRate: 101,
      instanceBRequestRate: 101,
      instanceCRequestRate: 100,
      instanceDRequestRate: 100,
      instanceALatencyMs: 43,
      instanceBLatencyMs: 42,
      instanceCLatencyMs: 41,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 56,
      instanceBConnectionCount: 55,
      healthyBackendCount: 4,
      globalSuccessRatePct: 100,
      balancerStatus: "normal",
      imbalanceRootCause: "rebalanced",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery B: sticky sessions disabled outright. Even
  // without changing the hashing strategy, turning off session affinity
  // means previously pinned clients are redistributed on their next
  // request — the same structural outcome as switching strategy.
  {
    id: "sticky-sessions-disabled-recovery",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: { [STICKY_SESSIONS_ENABLED_KEY]: false },
    },
    incidentState: "rebalanced-by-no-stickiness",
    values: {
      instanceARequestRate: 103,
      instanceBRequestRate: 99,
      instanceCRequestRate: 100,
      instanceDRequestRate: 98,
      instanceALatencyMs: 44,
      instanceBLatencyMs: 41,
      instanceCLatencyMs: 40,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 58,
      instanceBConnectionCount: 53,
      healthyBackendCount: 4,
      globalSuccessRatePct: 100,
      balancerStatus: "normal",
      imbalanceRootCause: "rebalanced",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable alternate path: connection draining forces existing
  // connections on A/B to terminate and re-establish elsewhere, clearing
  // the skew WITHOUT touching balancing strategy or session stickiness
  // — the pinning mechanism itself remains configured exactly as before,
  // it has just been forcibly bypassed once. Every metric recovers, but
  // the cost is real: whatever those clients were in the middle of doing
  // was interrupted. imbalanceRootCause stays "unresolved" because the
  // root mechanism (sticky hash + stickiness) is untouched and would
  // re-skew the moment new sessions accumulate and drain is turned back
  // off.
  {
    id: "connection-draining-acceptable",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: { [CONNECTION_DRAINING_ENABLED_KEY]: true },
    },
    incidentState: "drained-acceptable",
    values: {
      instanceARequestRate: 105,
      instanceBRequestRate: 102,
      instanceCRequestRate: 98,
      instanceDRequestRate: 97,
      instanceALatencyMs: 48,
      instanceBLatencyMs: 45,
      instanceCLatencyMs: 40,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 60,
      instanceBConnectionCount: 57,
      healthyBackendCount: 4,
      globalSuccessRatePct: 97,
      balancerStatus: "warning",
      imbalanceRootCause: "unresolved",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── REQUIRED TRAP: instance count raised alone, sticky hashing and
  // stickiness both untouched. New instances E/F (folded into the
  // aggregate healthyBackendCount) exist and are perfectly healthy, but
  // they receive only the thin trickle of genuinely new (never-pinned)
  // sessions — proven here by instanceARequestRate/instanceAConnectionCount
  // staying effectively AS HIGH as the unmitigated baseline below, not
  // falling, because every already-pinned client is still hashed
  // straight back onto A regardless of how many idle instances now
  // exist.
  {
    id: "instance-count-raised-does-not-fix-skew",
    when: {
      triggerEquals: { sessionSurge: true },
      controlAtLeast: { [INSTANCE_COUNT_KEY]: 8 },
      controlEquals: {
        [BALANCING_STRATEGY_KEY]: "stickyHash",
        [STICKY_SESSIONS_ENABLED_KEY]: true,
      },
    },
    incidentState: "capacity-added-skew-persists",
    values: {
      instanceARequestRate: 870,
      instanceBRequestRate: 410,
      instanceCRequestRate: 102,
      instanceDRequestRate: 99,
      instanceALatencyMs: 1_350,
      instanceBLatencyMs: 520,
      instanceCLatencyMs: 41,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 980,
      instanceBConnectionCount: 440,
      healthyBackendCount: 8,
      globalSuccessRatePct: 89,
      balancerStatus: "critical",
      imbalanceRootCause: "capacity-added",
    },
    componentHealth: skewedHealth,
  },

  // ── REQUIRED TRAP (secondary form): traffic weights lowered on the
  // hot instances alone, strategy/stickiness untouched. Same mechanism —
  // weighting only changes which instance a brand-new session lands on;
  // it has zero effect on sessions already pinned to A/B, so their
  // connection counts barely move from the unmitigated baseline.
  {
    id: "traffic-weights-alone-does-not-fix-skew",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: {
        [TRAFFIC_WEIGHTS_KEY]: "favorLightInstances",
        [BALANCING_STRATEGY_KEY]: "stickyHash",
        [STICKY_SESSIONS_ENABLED_KEY]: true,
      },
    },
    incidentState: "weights-adjusted-skew-persists",
    values: {
      instanceARequestRate: 860,
      instanceBRequestRate: 400,
      instanceCRequestRate: 118,
      instanceDRequestRate: 115,
      instanceALatencyMs: 1_300,
      instanceBLatencyMs: 500,
      instanceCLatencyMs: 44,
      instanceDLatencyMs: 43,
      instanceAConnectionCount: 960,
      instanceBConnectionCount: 430,
      healthyBackendCount: 4,
      globalSuccessRatePct: 90,
      balancerStatus: "critical",
      imbalanceRootCause: "capacity-added",
    },
    componentHealth: skewedHealth,
  },

  // ── Partial relief: health-check sensitivity alone, strategy/
  // stickiness untouched. A faster, stricter health check correctly
  // starts marking Instance A as degraded once its latency crosses the
  // balancer's threshold, so the balancer stops sending it BRAND-NEW
  // traffic (healthyBackendCount drops to 3, request rate on A levels
  // off rather than climbing further) — but it cannot do anything about
  // clients already pinned there, so A's connection count and latency
  // stay elevated and the skew is only partially contained, not solved.
  {
    id: "sensitive-health-check-partial-relief",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: {
        [HEALTH_CHECK_SENSITIVITY_KEY]: "sensitive",
        [BALANCING_STRATEGY_KEY]: "stickyHash",
        [STICKY_SESSIONS_ENABLED_KEY]: true,
      },
    },
    incidentState: "sensitive-health-check-partial",
    values: {
      instanceARequestRate: 520,
      instanceBRequestRate: 240,
      instanceCRequestRate: 102,
      instanceDRequestRate: 100,
      instanceALatencyMs: 680,
      instanceBLatencyMs: 310,
      instanceCLatencyMs: 41,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 560,
      instanceBConnectionCount: 260,
      healthyBackendCount: 3,
      globalSuccessRatePct: 95,
      balancerStatus: "warning",
      imbalanceRootCause: "unresolved",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Second wave baseline: stale health check compounding. Left
  // entirely unmitigated, the stale health check keeps routing new
  // traffic to Instance A well past the point it's visibly overloaded,
  // deepening the skew further on top of the already-critical baseline.
  {
    id: "stale-health-check-compounding-baseline",
    when: {
      triggerEquals: { sessionSurge: true, staleHealthCheckCompounding: true },
      controlEquals: {
        [BALANCING_STRATEGY_KEY]: "stickyHash",
        [STICKY_SESSIONS_ENABLED_KEY]: true,
      },
    },
    incidentState: "compounded-skew",
    values: {
      instanceARequestRate: 1_240,
      instanceBRequestRate: 640,
      instanceCRequestRate: 105,
      instanceDRequestRate: 101,
      instanceALatencyMs: 2_400,
      instanceBLatencyMs: 1_050,
      instanceCLatencyMs: 42,
      instanceDLatencyMs: 41,
      instanceAConnectionCount: 1_480,
      instanceBConnectionCount: 760,
      healthyBackendCount: 4,
      globalSuccessRatePct: 72,
      balancerStatus: "critical",
      imbalanceRootCause: "unresolved",
    },
    componentHealth: compoundedSkewHealth,
  },

  // ── Baseline critical: session surge has landed and no meaningfully
  // mitigating action has been taken yet.
  {
    id: "session-surge-baseline",
    when: {
      triggerEquals: { sessionSurge: true },
      controlEquals: {
        [BALANCING_STRATEGY_KEY]: "stickyHash",
        [STICKY_SESSIONS_ENABLED_KEY]: true,
      },
    },
    incidentState: "unmitigated-skew",
    values: {
      instanceARequestRate: 880,
      instanceBRequestRate: 420,
      instanceCRequestRate: 101,
      instanceDRequestRate: 99,
      instanceALatencyMs: 1_400,
      instanceBLatencyMs: 540,
      instanceCLatencyMs: 40,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 1_000,
      instanceBConnectionCount: 460,
      healthyBackendCount: 4,
      globalSuccessRatePct: 88,
      balancerStatus: "critical",
      imbalanceRootCause: "unresolved",
    },
    componentHealth: skewedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      instanceARequestRate: 100,
      instanceBRequestRate: 100,
      instanceCRequestRate: 100,
      instanceDRequestRate: 100,
      instanceALatencyMs: 40,
      instanceBLatencyMs: 40,
      instanceCLatencyMs: 40,
      instanceDLatencyMs: 40,
      instanceAConnectionCount: 50,
      instanceBConnectionCount: 50,
      healthyBackendCount: 4,
      globalSuccessRatePct: 100,
      balancerStatus: "normal",
      imbalanceRootCause: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
