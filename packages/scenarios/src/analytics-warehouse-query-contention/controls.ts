import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How the Query Gateway admits competing query classes to the shared
 * Warehouse. "fifo" (default) admits BI Users, Data Science, and
 * Scheduled Reports in strict arrival order with no regard for which
 * jobs have a real business deadline — under heavy ad-hoc load,
 * Scheduled Reports' critical jobs queue behind exploratory BI queries
 * and long-running Data Science jobs exactly as if they were equally
 * urgent. "priority-queue" instead admits Scheduled Reports' critical
 * jobs ahead of ad-hoc load whenever both are contending for the same
 * admission slots — the scenario's ROOT unsafe-vs-safe lever: this is
 * what actually protects the SLA, not warehouse capacity alone (see
 * warehouseCapacityTier below).
 */
export const ADMISSION_POLICY_KEY = "admissionPolicy";

/**
 * Whether ad-hoc query concurrency (BI Users + Data Science combined) is
 * bounded at the Query Gateway. "unlimited" (default) admits as many
 * concurrent ad-hoc queries as arrive — under a load spike this lets
 * ad-hoc traffic consume effectively all admission slots, starving
 * Scheduled Reports even if priority-queue is engaged (priority only
 * breaks ties for slots that exist; it does not create more slots).
 * "capped" bounds concurrent ad-hoc admission to a sustainable level,
 * queueing the rest rather than running them all at once — BI/Data
 * Science access is never revoked, only throttled/queued, which is this
 * scenario's required honest distinction from adHocAccessPolicy=
 * "revoked" below.
 */
export const AD_HOC_QUERY_CAP_KEY = "adHocQueryCap";

/**
 * How a long-running Data Science job is handled once it is identified
 * as materially delaying Scheduled Reports' SLA window. "allow" (default)
 * never intervenes — the job runs to completion regardless of what it
 * blocks. "graceful-stop" signals the job, lets it checkpoint/save
 * partial work, and terminates it only once checkpointed — a real,
 * bounded lost-work cost (the tail of work since the last checkpoint),
 * but never total loss. "hard-kill" terminates it immediately with no
 * checkpoint grace at all — this LOOKS like the fastest, most decisive
 * fix (SLA protected immediately, zero extra waiting), but it destroys
 * the job's entire accumulated work with no warning, a real, uncounted
 * cost this scenario treats as never free (see
 * dataScienceLostWorkHoursCumulative in metrics.ts) — the scenario's
 * required tempting-but-unsafe trap alongside adHocAccessPolicy=
 * "revoked".
 */
export const LONG_RUNNING_QUERY_POLICY_KEY = "longRunningQueryPolicy";

/**
 * Whether BI Users and Data Science retain any ad-hoc query access to
 * the Warehouse at all. "open" (default) always allows ad-hoc access,
 * subject to whatever admission/cap policy is in effect. "revoked" cuts
 * off ALL ad-hoc query access outright to "guarantee" Scheduled Reports
 * never contends for a slot — this is the scenario's primary required
 * unsafe tempting trap: it looks like it obviously and completely solves
 * the SLA problem (contention literally cannot happen if one side has no
 * access), but it violates the explicit business invariant that ad-hoc
 * access must not be revoked entirely, and breaks real downstream
 * consumers of ad-hoc query output (dashboards, scheduled BI exports, and
 * exploratory analysis that other teams' own deadlines depend on) with
 * zero warning. Throttling/queueing (adHocQueryCap="capped" +
 * admissionPolicy="priority-queue") is the correct bounded version of the
 * same instinct; revoking is the overcorrection.
 */
export const AD_HOC_ACCESS_POLICY_KEY = "adHocAccessPolicy";

/**
 * Shared Warehouse compute capacity. "standard" (default) is sized for
 * ordinary blended load. "scaled" adds real, continuous infrastructure
 * cost (see revenue-and-cost.ts) and genuinely raises how many
 * concurrent queries the Warehouse can execute — but by itself, with
 * admissionPolicy left at "fifo", it does NOT protect Scheduled Reports'
 * SLA: more capacity still gets consumed by whichever queries arrive
 * first, which under heavy ad-hoc load is still mostly ad-hoc queries.
 * This is the scenario's deliberate "pure scale-up is recognizably
 * insufficient" lever (phase6e3.md's binding requirement) — capacity
 * matters and is a real, legitimate accelerant ON TOP OF prioritization,
 * but it is never a substitute for it.
 */
export const WAREHOUSE_CAPACITY_TIER_KEY = "warehouseCapacityTier";

/**
 * Whether Data Science and BI stakeholders are proactively told when
 * their ad-hoc access is being bounded/queued/throttled and why.
 * "silent" (default) applies whatever admission/cap policy is active
 * with no communication at all — stakeholders simply experience slower
 * or queued queries with no explanation, discovering the tradeoff only
 * by noticing their own jobs are slow. "proactive-notice" surfaces the
 * tradeoff explicitly (which window, why, and for how long) at the
 * moment throttling engages. This never changes warehouse mechanics or
 * SLA outcomes by itself, but is the scenario's required "communicate/
 * bound the tradeoff rather than simply starving one stakeholder group
 * silently" lever (phase6e3.md) — a real, measured operational-maturity
 * distinction, not a correctness lever.
 */
export const DEADLINE_COMMUNICATION_KEY = "reportDeadlineCommunication";

export const controls: ControlDefinition[] = [
  {
    key: ADMISSION_POLICY_KEY,
    allowedValues: ["fifo", "priority-queue"],
    initialValue: "fifo",
  },
  {
    key: AD_HOC_QUERY_CAP_KEY,
    allowedValues: ["unlimited", "capped"],
    initialValue: "unlimited",
  },
  {
    key: LONG_RUNNING_QUERY_POLICY_KEY,
    allowedValues: ["allow", "graceful-stop", "hard-kill"],
    initialValue: "allow",
  },
  {
    key: AD_HOC_ACCESS_POLICY_KEY,
    allowedValues: ["open", "revoked"],
    initialValue: "open",
  },
  {
    key: WAREHOUSE_CAPACITY_TIER_KEY,
    allowedValues: ["standard", "scaled"],
    initialValue: "standard",
  },
  {
    key: DEADLINE_COMMUNICATION_KEY,
    allowedValues: ["silent", "proactive-notice"],
    initialValue: "silent",
  },
];
