import type { ControlDefinition } from "@incidentrank/simulator";

/** How the load balancer picks which instance handles a new connection.
 * "stickyHash" (the pre-incident default) hashes each client's session
 * cookie onto a fixed instance, so once a client is pinned it stays
 * pinned regardless of how loaded that instance gets. "leastConnections"
 * and "roundRobin" both ignore any existing pin and spread load across
 * whichever instances are actually healthy — the real, structural fix
 * for a skew caused by sticky pinning. */
export const BALANCING_STRATEGY_KEY = "balancingStrategy";

/** Whether the load balancer honors session-affinity cookies at all.
 * Sticky sessions are the mechanism pinning returning users onto
 * whichever instance first served them. Turning this off lets even
 * previously-pinned clients be re-distributed on their next request —
 * a second, independent way to break the pin (distinct from switching
 * balancing strategy, since a hash-based strategy with stickiness off
 * still redistributes by request, not by session). */
export const STICKY_SESSIONS_ENABLED_KEY = "stickySessionsEnabled";

/** How quickly the load balancer's health check reacts to an
 * instance's actual load/responsiveness. "stale" (the pre-incident
 * default) checks rarely and tolerates a wide response-time window, so
 * the balancer keeps believing an overloaded instance is still a good
 * target well after it has stopped being one. "sensitive" polls
 * frequently and reacts fast to rising latency, letting the balancer
 * correctly deprioritize an instance that is visibly struggling. */
export const HEALTH_CHECK_SENSITIVITY_KEY = "healthCheckSensitivity";

/** Total healthy instance count behind the load balancer. Per this
 * scenario's binding design requirement, raising this while sticky
 * sessions and the hashing strategy are untouched does NOT relieve the
 * skew — new instances still only receive the small, already-even share
 * of *new* (unpinned) sessions, while every already-pinned client keeps
 * being routed to the same original instance. */
export const INSTANCE_COUNT_KEY = "instanceCount";

/** Manual per-instance traffic weighting. Lowering the weight on the
 * overloaded instances reduces the share of brand-new (unpinned)
 * connections they receive, but — like instance count — it has no
 * effect on clients who are already sticky-pinned to those instances;
 * it only changes where the next *new* session lands. */
export const TRAFFIC_WEIGHTS_KEY = "trafficWeights";

/** Whether the load balancer is actively draining connections off the
 * overloaded instances (A/B) — rejecting new connections there while
 * letting in-flight requests finish, forcing even already-pinned
 * clients to re-establish a session (and get re-pinned) elsewhere. A
 * real, immediate way to break existing pins without touching the
 * balancing strategy itself, at the cost of forcibly disconnecting
 * whatever those clients were in the middle of doing. */
export const CONNECTION_DRAINING_ENABLED_KEY = "connectionDrainingEnabled";

export const controls: ControlDefinition[] = [
  {
    key: BALANCING_STRATEGY_KEY,
    allowedValues: ["stickyHash", "leastConnections", "roundRobin"],
    initialValue: "stickyHash",
  },
  {
    key: STICKY_SESSIONS_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: true,
  },
  {
    key: HEALTH_CHECK_SENSITIVITY_KEY,
    allowedValues: ["stale", "sensitive"],
    initialValue: "stale",
  },
  {
    key: INSTANCE_COUNT_KEY,
    allowedValues: [4, 6, 8, 12],
    initialValue: 4,
  },
  {
    key: TRAFFIC_WEIGHTS_KEY,
    allowedValues: ["even", "favorLightInstances"],
    initialValue: "even",
  },
  {
    key: CONNECTION_DRAINING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
