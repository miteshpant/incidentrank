import type { ControlDefinition } from "@incidentrank/simulator";

/** Minimum nodes required for a region to remain writable. "majority"
 * means a region may only accept writes while it can see a real majority
 * of cluster nodes — during a network partition, at most ONE side can
 * ever satisfy that (never both), so enforcing majority quorum is the
 * single control that, on its own, structurally prevents dual-leader
 * writes. "any-single-region" is the dangerous legacy-feeling setting:
 * each region decides it is authoritative using only its own local view,
 * with no cross-region majority check — this is what lets both sides
 * believe they hold leadership during a partition. */
export const QUORUM_REQUIREMENT_KEY = "quorumRequirement";

/** An explicit, immediate kill-switch independent of quorum: force one
 * named region to step down and reject all writes right now, regardless
 * of what it believes about its own leadership. This is the fastest way
 * to stop a region that is still accepting writes because its own
 * quorum check has not yet (or will never, under "any-single-region")
 * caught the problem. Fencing the WRONG region (the one that still has
 * real majority / real customers) needlessly sacrifices availability on
 * the healthy side while leaving the actual problem untouched. */
export const FENCING_ACTION_KEY = "fencingAction";

/** Region A's current write-access mode. "read-write" accepts writes
 * normally. "read-only" explicitly rejects writes while still serving
 * reads — the region remains visibly available for read traffic, at a
 * real, visible availability cost on the write path. "offline" takes
 * the region fully out of customer traffic. */
export const REGION_A_ACCESS_KEY = "regionAAccessMode";

/** Region B's current write-access mode. Same three values and meaning
 * as REGION_A_ACCESS_KEY, applied to Region B. */
export const REGION_B_ACCESS_KEY = "regionBAccessMode";

/** How divergent writes accumulated during the split get resolved once
 * network connectivity between regions is restored. "defer-until-healed"
 * holds any writes accepted by a non-authoritative side for manual/
 * automatic reconciliation rather than applying them blindly.
 * "last-write-wins" immediately applies whichever write has the later
 * timestamp wherever the two sides conflict, favoring fast convergence
 * over preserving every write. "manual-review" blocks any conflicting
 * key from converging automatically at all until a human inspects it —
 * the slowest option, but the one that risks silently discarding no
 * write without a human decision. */
export const RECONCILIATION_POLICY_KEY = "reconciliationPolicy";

export const controls: ControlDefinition[] = [
  {
    key: QUORUM_REQUIREMENT_KEY,
    allowedValues: ["majority", "any-single-region"],
    initialValue: "any-single-region",
  },
  {
    key: FENCING_ACTION_KEY,
    allowedValues: ["none", "fence-region-a", "fence-region-b"],
    initialValue: "none",
  },
  {
    key: REGION_A_ACCESS_KEY,
    allowedValues: ["read-write", "read-only", "offline"],
    initialValue: "read-write",
  },
  {
    key: REGION_B_ACCESS_KEY,
    allowedValues: ["read-write", "read-only", "offline"],
    initialValue: "read-write",
  },
  {
    key: RECONCILIATION_POLICY_KEY,
    allowedValues: ["defer-until-healed", "last-write-wins", "manual-review"],
    initialValue: "defer-until-healed",
  },
];
