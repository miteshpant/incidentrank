import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Per-product migration action — four independent controls (one per
 * product), each with the SAME two allowed values, so the pattern below
 * applies identically to every product: "not-migrated" (default — the
 * product still calls the Deprecated External API, directly or through
 * the Shared SDK) or "migrate" (the candidate has moved this product's
 * calls to the Replacement API path). "migrate" alone does NOT mark a
 * product done — see MIGRATION_VERIFICATION_MODE_KEY below: whether the
 * compatibility/correctness checks actually ran before this product is
 * COUNTED as migrated is a separate, independently-tracked lever, which
 * is exactly how the "mark migrated without verification" trap (business
 * invariant: "a product must not be marked migrated until compatibility
 * and correctness checks pass") becomes a real, reachable state rather
 * than a cosmetic one.
 *
 * Product A starts already "migrate" at incident start (see metrics.ts's
 * initialValues/rules.ts baseline) but UNVERIFIED — the flagship's
 * required "looks complete but correctness was never checked" trap seed.
 * Product B starts "not-migrated" but with partial groundwork already
 * done (modeled in state, not a control). Product C cannot reach a
 * verified-migrated state at all until COMPATIBILITY_LAYER_MODE_KEY is
 * "active" — it is blocked by a real compatibility issue with the
 * Replacement API, not merely slower. Product D starts fully untouched.
 */
export const PRODUCT_A_MIGRATION_KEY = "productAMigration";
export const PRODUCT_B_MIGRATION_KEY = "productBMigration";
export const PRODUCT_C_MIGRATION_KEY = "productCMigration";
export const PRODUCT_D_MIGRATION_KEY = "productDMigration";

/**
 * Whether each product's "migrate" action is treated as backed by a real
 * compatibility/correctness verification pass before it counts toward
 * the fleet's migrated-and-verified total, or applied directly with no
 * check at all. "skip-verification" (default) is the required flagship
 * trap lever: a product can be flipped to "migrate" and LOOK complete in
 * every migrated-product count, while its actual correctness was never
 * checked — this is a fleet-wide sequencing choice (not per-product) by
 * design, mirroring how a real migration coordinator sets one
 * verification policy for the whole program rather than letting each
 * product team silently opt out individually. "verify-before-complete"
 * requires the compatibility/correctness checks to actually run — and
 * takes real elapsed time to converge (see timed-events.ts's
 * verification windows) — before a "migrate" product is counted as
 * genuinely migrated-and-verified anywhere success/acceptable conditions
 * or scoring look.
 */
export const MIGRATION_VERIFICATION_MODE_KEY = "migrationVerificationMode";

/**
 * The order in which products are prioritized for migration effort.
 * "unordered" (default) applies no deliberate sequencing at all — every
 * product proceeds (or doesn't) independently of business criticality or
 * technical dependency risk, violating the business invariant that
 * migration order should reflect both. "critical-first" and
 * "prerequisite-first" are the scenario's two legitimate sequencing
 * strategies (critical-product-first vs. dependency-prerequisite-first —
 * the flagship's optional third alternate-path axis): critical-first
 * prioritizes the highest-business-criticality product(s) regardless of
 * technical blockers; prerequisite-first clears the Compatibility Layer
 * blocker (which unblocks Product C) before pushing on the remaining
 * cohorts. Read by rules.ts's governance-health gate — leaving this
 * "unordered" while otherwise reaching full migration is real but
 * ungoverned progress, tracked honestly rather than silently treated as
 * equivalent to a deliberately sequenced rollout.
 */
export const MIGRATION_COHORT_ORDER_KEY = "migrationCohortOrder";

/**
 * Whether the Compatibility Layer (the real, controllable node that sits
 * between the Shared SDK and both the Deprecated External API and the
 * Replacement API) is active. "inactive" (default) is WHY Product C is
 * blocked — its specific compatibility issue with the Replacement API
 * can only be resolved by routing through this layer. "active" unblocks
 * Product C's migration entirely (see rules.ts) — but the business
 * invariant "a shared compatibility layer must not become a permanent
 * single point of failure" means leaving it "active" forever, long after
 * every product has fully and directly migrated, is itself tracked as a
 * real, independent piece of unresolved technical debt (see
 * compatibilityLayerDebtAccumulatedCount in metrics.ts) — it is a
 * necessary BRIDGE for Product C's transition, never a destination.
 */
export const COMPATIBILITY_LAYER_MODE_KEY = "compatibilityLayerMode";

/**
 * Whether dual-support (the Shared SDK accepting calls against BOTH the
 * Deprecated External API and the Replacement API simultaneously, for
 * products mid-migration) is active. "disabled" (default) means a
 * product is either fully on the old path or fully on the new one at any
 * given moment — safer in the sense of having no ambiguous state, but it
 * means a product cannot be migrated gradually. "enabled" is what
 * legitimately allows Alternate Strong Path B (product-by-product direct
 * migration with TARGETED, temporary dual-support) — but the business
 * invariant "dual-support may be temporary but cannot become indefinite
 * hidden debt" means leaving this "enabled" long after every product has
 * actually finished migrating is tracked as real, accumulating, visible
 * cost and debt (see dualSupportDurationMs/dualSupportDebtAccumulated in
 * metrics.ts), never silently absorbed.
 */
export const DUAL_SUPPORT_MODE_KEY = "dualSupportMode";

/**
 * What percentage of Shared SDK traffic that is eligible to use the
 * Replacement API is actually routed there, independent of any single
 * product's own migration flag. 0 (default) means no eligible traffic
 * has been shifted yet, even if products claim "migrate." 25/50/75/100
 * are staged shift levels — this is the scenario's throughput-side
 * recovery-lag lever: shifting this to 100 instantly does not instantly
 * converge replacementApiErrorRate/deprecatedApiTrafficPercent — the
 * Replacement API needs real elapsed time under load to settle (see
 * timed-events.ts's traffic-drain windows), modeling a real gradual
 * rollout rather than an instant global flip.
 */
export const REPLACEMENT_TRAFFIC_PERCENT_KEY = "replacementTrafficPercent";

/**
 * Whether the Deprecated External API is still reachable at all for new
 * traffic, independent of what any product's migration flag says.
 * "allowed" (default) keeps the deprecated path open — necessary while
 * any product still legitimately depends on it. "blocked" hard-cuts
 * deprecated-API traffic. This is the scenario's required panic-trap
 * lever when set before every critical product has actually finished
 * migrating: it does not make unmigrated products magically work against
 * the Replacement API — it breaks them (see rules.ts's forced-cutover
 * trap family), modeling the literal business invariant "no critical
 * product may remain dependent on the deprecated API past the hard
 * deadline" being violated in the WORST possible direction (cutting
 * access before migration, not after).
 */
export const DEPRECATED_API_TRAFFIC_BLOCK_KEY = "deprecatedApiTrafficBlock";

/**
 * Whether a tested, ready rollback path (reverting the Shared SDK back
 * to the Deprecated External API for any product, on demand) has been
 * explicitly prepared and verified. "not-prepared" (default) means that
 * if a migrated product's correctness turns out to be wrong after the
 * fact, there is no verified fallback — a real, independent risk
 * dimension distinct from whether migration/verification itself
 * happened. "prepared" is a real, visible safety investment this
 * scenario's dataIntegrity/operationalEfficiency scoring rewards
 * directly — it does not speed up or slow down migration itself, but it
 * is read by rollbackReadinessStatus wherever a forced-cutover decision
 * is evaluated.
 */
export const ROLLBACK_READINESS_KEY = "rollbackReadiness";

/**
 * The governance posture taken as the hard deadline approaches.
 * "normal" (default) means no forced action is taken — migration effort
 * proceeds (or doesn't) at whatever pace the other controls above drive.
 * "forced-cutover" is the scenario's required deadline-pressure panic
 * trap: forcing the Deprecated External API off immediately as the
 * deadline nears, REGARDLESS of whether every critical product has
 * actually finished migrating. This is never safe when any product
 * remains incompatible with the Replacement API — it trades a known,
 * visible deadline-risk problem for an immediate, guaranteed outage on
 * whichever product(s) were not ready (see rules.ts's forced-cutover
 * trap family, independent of DEPRECATED_API_TRAFFIC_BLOCK_KEY — either
 * lever alone reaches the same unsafe consequence).
 */
export const DEADLINE_ESCALATION_MODE_KEY = "deadlineEscalationMode";

export const controls: ControlDefinition[] = [
  { key: PRODUCT_A_MIGRATION_KEY, allowedValues: ["not-migrated", "migrate"], initialValue: "migrate" },
  { key: PRODUCT_B_MIGRATION_KEY, allowedValues: ["not-migrated", "migrate"], initialValue: "not-migrated" },
  { key: PRODUCT_C_MIGRATION_KEY, allowedValues: ["not-migrated", "migrate"], initialValue: "not-migrated" },
  { key: PRODUCT_D_MIGRATION_KEY, allowedValues: ["not-migrated", "migrate"], initialValue: "not-migrated" },
  {
    key: MIGRATION_VERIFICATION_MODE_KEY,
    allowedValues: ["skip-verification", "verify-before-complete"],
    initialValue: "skip-verification",
  },
  {
    key: MIGRATION_COHORT_ORDER_KEY,
    allowedValues: ["unordered", "critical-first", "prerequisite-first"],
    initialValue: "unordered",
  },
  { key: COMPATIBILITY_LAYER_MODE_KEY, allowedValues: ["inactive", "active"], initialValue: "inactive" },
  { key: DUAL_SUPPORT_MODE_KEY, allowedValues: ["disabled", "enabled"], initialValue: "disabled" },
  {
    key: REPLACEMENT_TRAFFIC_PERCENT_KEY,
    allowedValues: [0, 25, 50, 75, 100],
    initialValue: 0,
  },
  { key: DEPRECATED_API_TRAFFIC_BLOCK_KEY, allowedValues: ["allowed", "blocked"], initialValue: "allowed" },
  { key: ROLLBACK_READINESS_KEY, allowedValues: ["not-prepared", "prepared"], initialValue: "not-prepared" },
  { key: DEADLINE_ESCALATION_MODE_KEY, allowedValues: ["normal", "forced-cutover"], initialValue: "normal" },
];
