import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * THE CENTRAL LESSON OF THIS SCENARIO. Whether a deletion request is
 * marked "complete" the instant the Privacy API accepts it, or only once
 * every REQUIRED downstream store (Product Databases + Analytics Store;
 * Backup Index has its own tracked-but-not-completion-gating semantics,
 * see BACKUP_INDEX_PROCESSING_MODE_KEY) has actually finished deleting
 * the record. "mark-on-accept" (default) is the root cause itself: every
 * tick it stays here, requests are marked complete while one or more
 * required downstream stores still hold the data — a FALSE-COMPLETE
 * state that is indistinguishable from a real completion on any
 * dashboard that only watches the completion-marking rate, not actual
 * downstream state. "mark-on-verified-complete" is the fix: a request is
 * only ever marked complete once every required store has independently
 * confirmed deletion. This single control is what separates "request
 * accepted" from "deletion actually completed" — the scenario's defining
 * distinction (see rules.ts / metrics.ts's falseCompletionCount).
 */
export const COMPLETION_MARKING_POLICY_KEY = "completionMarkingPolicy";

/**
 * How the Workflow Queue orders which deletion requests to execute next.
 * "newest-first" (default) processes the most recently accepted requests
 * first — easiest to implement, but it is the tempting trap that lets
 * the oldest, deadline-nearest requests silently breach their mandated
 * deletion deadline while newer, easier requests keep getting processed
 * ahead of them. "oldest-deadline-first" (Alternate Strong Path A)
 * reorders the queue to always drain the oldest/deadline-nearest
 * requests first — directly prevents deadline breaches, at the cost of
 * processing some newer high-risk requests slightly later.
 * "high-risk-first" (Alternate Strong Path B, used together with
 * HIGH_RISK_PRIORITY_BOOST_KEY) instead prioritizes legal-class/
 * high-risk requests while keeping a bounded SLA for everything else —
 * a genuinely different, also-valid prioritization strategy. See
 * rules.ts for how both alternate paths reach the same genuinely safe
 * terminal state via different queueing disciplines.
 */
export const QUEUE_PRIORITY_POLICY_KEY = "queuePriorityPolicy";

/**
 * How many deletion workers process the Workflow Queue's backlog.
 * "baseline" (default) is the current, insufficient allocation that
 * cannot keep up with the rate requests are accepted at — this is WHY a
 * backlog forms at all, independent of any policy error. "scaled-up"
 * adds real worker capacity, directly increasing throughput against
 * every downstream store at a real, ongoing infrastructure cost (see
 * revenue-and-cost.ts). Scaling workers alone, with
 * completionMarkingPolicy still at "mark-on-accept", drains the backlog
 * FASTER but does not stop requests from being falsely marked complete
 * along the way — proving worker allocation and completion-marking
 * correctness are independent levers.
 */
export const DELETION_WORKER_ALLOCATION_KEY = "deletionWorkerAllocation";

/**
 * Whether the Workflow Queue actually executes deletion against the
 * Analytics Store, or skips it entirely while still processing Product
 * Databases and Backup Index normally. "enforced" (default) processes
 * this store like every other required downstream system. "skipped" is
 * a required unsafe trap: it looks like it clears the backlog faster
 * (one fewer store to wait on) and Product-Databases-only dashboards
 * stay green, but every deletion request this is active for permanently
 * never reaches the Analytics Store at all — a real, silent, independent
 * completeness gap that compounds for as long as this stays skipped (see
 * metrics.ts's analyticsStoreDeletionCompletionPercent /
 * rules.ts's analytics-store-skipped-trap).
 */
export const ANALYTICS_STORE_PROCESSING_KEY = "analyticsStoreProcessing";

/**
 * How the Backup Index's own deletion semantics are handled. Backups
 * genuinely have different allowed deletion timing than live stores (per
 * the brief: "Backups/indexes may have different allowed deletion
 * semantics, but they must be explicitly tracked") — "tracked-pending"
 * (default) keeps the Backup Index's own completion status visibly
 * tracked and reported even though it is allowed to lag the live stores
 * on its own rotation schedule, so nothing about its state is hidden.
 * "excluded-from-completion" instead stops tracking/reporting Backup
 * Index status for in-flight requests altogether — this does NOT, by
 * itself, mark a request falsely complete (it is an independent lever
 * from completionMarkingPolicy), but it does create an untracked,
 * invisible completeness gap that auditability requires never exist:
 * nobody — not the candidate, not an auditor — can see whether the
 * Backup Index obligation was ever actually met (see rules.ts's
 * backup-index-untracked-trap).
 */
export const BACKUP_INDEX_PROCESSING_MODE_KEY = "backupIndexProcessingMode";

/**
 * Whether high-risk/legal-class deletion requests (under active
 * regulatory inquiry, or flagged by legal) are additionally
 * fast-tracked ahead of the general queue, independent of whichever
 * general queuePriorityPolicy is active. "off" (default) applies no
 * extra boost — high-risk requests are processed exactly according to
 * the general policy, same as everything else. "on" gives high-risk
 * requests an additional priority boost on top of the general policy,
 * directly reducing how long the most legally sensitive requests sit
 * exposed in the backlog — the core mechanism of Alternate Strong Path
 * B (high-risk-first + this control together).
 */
export const HIGH_RISK_PRIORITY_BOOST_KEY = "highRiskPriorityBoost";

/**
 * How aggressively the Workflow Queue retries a downstream deletion call
 * that failed transiently (a store briefly unavailable, a timeout).
 * "standard" (default) retries a bounded number of times before
 * re-queueing for a later pass. "aggressive" retries far more
 * persistently before giving up, directly increasing successful
 * same-pass completions against flaky downstream stores at a real,
 * modest extra compute cost (see revenue-and-cost.ts) — a minor,
 * secondary throughput/cost lever, never a correctness lever on its own
 * (it never changes WHETHER a request is eventually completed, only how
 * quickly transient failures are absorbed).
 */
export const RETRY_POLICY_KEY = "retryPolicy";

export const controls: ControlDefinition[] = [
  {
    key: COMPLETION_MARKING_POLICY_KEY,
    allowedValues: ["mark-on-accept", "mark-on-verified-complete"],
    initialValue: "mark-on-accept",
  },
  {
    key: QUEUE_PRIORITY_POLICY_KEY,
    allowedValues: ["newest-first", "oldest-deadline-first", "high-risk-first"],
    initialValue: "newest-first",
  },
  {
    key: DELETION_WORKER_ALLOCATION_KEY,
    allowedValues: ["baseline", "scaled-up"],
    initialValue: "baseline",
  },
  {
    key: ANALYTICS_STORE_PROCESSING_KEY,
    allowedValues: ["enforced", "skipped"],
    initialValue: "enforced",
  },
  {
    key: BACKUP_INDEX_PROCESSING_MODE_KEY,
    allowedValues: ["tracked-pending", "excluded-from-completion"],
    initialValue: "tracked-pending",
  },
  {
    key: HIGH_RISK_PRIORITY_BOOST_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: RETRY_POLICY_KEY,
    allowedValues: ["standard", "aggressive"],
    initialValue: "standard",
  },
];
