import type { ControlDefinition } from "@incidentrank/simulator";

/** Percentage of traffic routed to the new version. Reducing this contains
 * the regression's blast radius proportionally without fully reverting —
 * a genuine, distinct strategy from rollback: it keeps the new version's
 * other (non-regressed) improvements live for a shrinking slice of users
 * rather than pulling it entirely. */
export const ROLLOUT_PERCENT_KEY = "rolloutPercent";

/** Full revert: all traffic goes back to the old version and the new
 * version receives none. The slowest-to-reverse of the containment
 * strategies in this scenario (a full redeploy-rollback cycle), but the
 * most unconditionally safe. */
export const ROLLBACK_TO_OLD_VERSION_KEY = "rollbackToOldVersion";

/** Routes the new version's shared-dependency calls through an isolated
 * connection pool/credit pool instead of the one it shares with the old
 * version by default. Does nothing about the regression's error/latency
 * rate on the new version itself, but stops the new version's elevated
 * dependency load from starving the OLD version's otherwise-healthy
 * dependency calls. */
export const TRAFFIC_ROUTING_MODE_KEY = "trafficRoutingMode";

/** Disables the single specific feature inside the new version that is
 * actually responsible for the regression, while leaving the rest of the
 * new version (including its genuine improvements) live for its current
 * rollout percentage. A real, comparably-safe containment strategy to
 * rollback when the regression is isolated to one feature — faster than a
 * full rollback/redeploy cycle and does not discard the new version's
 * other changes. */
export const REGRESSED_FEATURE_ENABLED_KEY = "regressedFeatureEnabled";

/** New version instance count — adding capacity can absorb some of the
 * regression's elevated per-request resource cost without touching the
 * regression itself (masking, not fixing). */
export const NEW_VERSION_INSTANCE_COUNT_KEY = "newVersionInstanceCount";

/** Protects the shared dependency (used by both old and new version) from
 * the new version's elevated call volume/retry behavior under the
 * regression. */
export const DEPENDENCY_PROTECTION_MODE_KEY = "dependencyProtectionMode";

export const controls: ControlDefinition[] = [
  {
    key: ROLLOUT_PERCENT_KEY,
    allowedValues: [0, 10, 25, 50, 100],
    initialValue: 50,
  },
  {
    key: ROLLBACK_TO_OLD_VERSION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: TRAFFIC_ROUTING_MODE_KEY,
    allowedValues: ["shared-pool", "isolated-pool"],
    initialValue: "shared-pool",
  },
  {
    key: REGRESSED_FEATURE_ENABLED_KEY,
    allowedValues: [true, false],
    initialValue: true,
  },
  {
    key: NEW_VERSION_INSTANCE_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: DEPENDENCY_PROTECTION_MODE_KEY,
    allowedValues: ["none", "circuit-breaker", "rate-limit"],
    initialValue: "none",
  },
];
