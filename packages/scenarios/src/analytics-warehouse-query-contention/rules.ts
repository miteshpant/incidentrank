import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "bi-users": "healthy",
  "data-science": "healthy",
  "scheduled-reports": "healthy",
  "query-gateway": "healthy",
  warehouse: "healthy",
};

// Scheduled Reports is the node that actually communicates SLA severity
// in this scenario — mirroring how Model Feature Freshness Degradation
// keeps its serving-layer health a decoy, except the decoy here is
// milder: Warehouse DOES visibly degrade under raw contention (this is a
// real, visible contention problem, unlike the silent freshness
// scenario) — but recovering Warehouse health alone (e.g. via
// warehouseCapacityTier="scaled") without touching admission/cap policy
// must NOT be mistaken for a safe state, since Scheduled Reports can
// still be at risk underneath.
const contendedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "scheduled-reports": "degraded",
  "query-gateway": "degraded",
  warehouse: "degraded",
};

const breachedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "scheduled-reports": "critical",
  "query-gateway": "critical",
  warehouse: "critical",
};

const overcorrectedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "bi-users": "critical",
  "data-science": "critical",
  "scheduled-reports": "healthy",
  "query-gateway": "degraded",
};

const lostWorkHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "data-science": "critical",
  "query-gateway": "degraded",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "scheduled-reports": "degraded",
  "query-gateway": "degraded",
};

/**
 * Authored rule table for Analytics Warehouse Query Contention, ordered
 * most-specific-first (first-match-wins, top-to-bottom). Correctness-
 * violation / overcorrection traps checked first (communication-
 * independent — they are unsafe regardless of how the tradeoff was
 * communicated), then the combined/individual alternate strong paths
 * (most-specific first, each split into a silent/proactive-notice pair
 * so reportDeadlineCommunication is never a dead control — see
 * stakeholderCommunicationStatus in metrics.ts and the operational-
 * efficiency scoring it drives), then the capacity-only-insufficient
 * family, then the fifo/uncapped baseline.
 *
 * ROOT CAUSE: a month-end-close-style surge in ad-hoc BI/Data Science
 * query load (queryContention) contends with the critical Scheduled
 * Reports job for the same finite Query Gateway admission slots and
 * Warehouse compute.
 *
 * CENTRAL JUDGMENT (phase6e3.md scenario 92): this must be solved by
 * WORKLOAD PRIORITIZATION / stakeholder tradeoff, never by warehouse
 * capacity alone. warehouseCapacityTier="scaled" genuinely raises
 * throughput (see warehouseUtilizationPercent/queryLatencyP95Seconds
 * improving below) but, left on admissionPolicy="fifo" with
 * adHocQueryCap="unlimited", does NOT protect reportOnTrackForSla — more
 * capacity still gets consumed by whichever queries arrive first, which
 * under heavy ad-hoc load is still mostly ad-hoc queries. This is the
 * scenario's required "pure scale-up is recognizably insufficient" proof
 * (see "capacity-scaled-insufficient-*" rules below).
 *
 * REQUIRED ALTERNATE STRONG PATHS (phase6e3.md):
 *   A. admissionPolicy="priority-queue" — Scheduled Reports' critical
 *      jobs are admitted ahead of ad-hoc load whenever both contend for
 *      the same slots. Protects the SLA by REORDERING who gets served
 *      first; ad-hoc queries still eventually run, just later.
 *   B. adHocQueryCap="capped" — ad-hoc concurrency itself is bounded at
 *      the Query Gateway (a resource-pool/workload-isolation style
 *      mechanism), so ad-hoc load can never consume effectively all
 *      admission slots in the first place, independent of arrival
 *      order. This is a MATERIALLY DIFFERENT mechanism from A: A changes
 *      ordering among contending jobs; B changes how many ad-hoc jobs
 *      may contend at all. Either alone is sufficient to protect the
 *      SLA; combining them recovers fastest.
 *
 * DEFAULT-VALUE PATH COMPLETENESS: every rule below that gates a safe
 * strategy on ONE control (e.g. admissionPolicy="priority-queue" alone)
 * uses controlEquals naming ONLY that control, so a candidate who
 * engages that one lever while every other control stays at its
 * untouched default (reportDeadlineCommunication="silent",
 * longRunningQueryPolicy="allow", adHocAccessPolicy="open",
 * warehouseCapacityTier="standard") still matches the intended safe
 * rule at every elapsed-time tier, never falls through to baseline. See
 * this scenario's test suite's "Default-value path completeness"
 * describe block for the exhaustive by-hand trace.
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing here scales one service and
 * then overloads a NEW downstream dependency — warehouseCapacityTier
 * scales the Warehouse itself and only ever improves (never worsens) any
 * other component's health. This is one of this batch's >=3 scenarios
 * with no such mechanic (a capacity element exists, per phase6e3.md's
 * explicit allowance for this scenario's domain, but it is not the
 * central judgment and never creates a new bottleneck elsewhere).
 */
export const analyticsWarehouseQueryContentionRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE TRAPS — checked first: win regardless of every other control,
  // including reportDeadlineCommunication (communicating an invariant
  // violation does not make it safe).
  // ══════════════════════════════════════════════════════════════════

  // Overcorrection trap: revoking ad-hoc access entirely "guarantees" the
  // SLA (no contention can occur if one side has zero access) but
  // violates the explicit business invariant that ad-hoc access must
  // never be fully revoked, and breaks real downstream consumers of
  // ad-hoc output with zero warning. Checked before every other rule so
  // it always wins regardless of admission/cap policy, kill policy, or
  // capacity tier.
  {
    id: "adhoc-access-revoked-overcorrection",
    when: {
      triggerEquals: { queryContention: true },
      controlEquals: { [AD_HOC_ACCESS_POLICY_KEY]: "revoked" },
    },
    incidentState: "adhoc-access-revoked-overcorrection",
    values: {
      adHocConcurrentQueries: 0,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 20,
      queryLatencyP95Seconds: 3,
      adHocAccessAvailabilityPercent: 0,
      slaStatus: "on-track",
      workloadTradeoffStatus: "overcorrected",
      slaRiskSeverity: "critical",
      stakeholderCommunicationStatus: "not-applicable",
      backlogStatus: "not-applicable",
    },
    componentHealth: overcorrectedHealth,
  },

  // Hard-kill trap: killing a long-running Data Science job with zero
  // checkpoint grace destroys its entire accumulated work with no
  // warning — a real, uncounted cost this scenario never treats as
  // free. Checked before every safe-path rule so it always wins
  // regardless of admission/cap policy or capacity tier, and
  // independent of adHocAccessPolicy (an INDEPENDENT unsafe lever, not
  // reachable only through the overcorrection trap above).
  {
    id: "hard-kill-lost-work-trap",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true },
      controlEquals: { [LONG_RUNNING_QUERY_POLICY_KEY]: "hard-kill" },
    },
    incidentState: "hard-kill-lost-work-trap",
    values: {
      adHocConcurrentQueries: 5,
      adHocQueuedQueries: 2,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 1,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 6,
      warehouseUtilizationPercent: 48,
      queryLatencyP95Seconds: 6,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "critical",
      stakeholderCommunicationStatus: "not-applicable",
      backlogStatus: "not-applicable",
    },
    componentHealth: lostWorkHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // COMBINED ALTERNATE STRONG PATH — priority-queue admission AND
  // ad-hoc cap together. Listed before either individual path since it
  // is more specific (constrains both controls) and recovers fastest.
  // Each tier is split into proactive-notice/silent so communication is
  // never a dead control on top of either safe path.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "combined-prioritized-capped-fully-recovered-proactive",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [ADMISSION_POLICY_KEY]: "priority-queue",
        [AD_HOC_QUERY_CAP_KEY]: "capped",
        [DEADLINE_COMMUNICATION_KEY]: "proactive-notice",
      },
    },
    incidentState: "combined-prioritized-capped-fully-recovered-proactive",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 50,
      queryLatencyP95Seconds: 5,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "combined-prioritized-capped-fully-recovered",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [ADMISSION_POLICY_KEY]: "priority-queue",
        [AD_HOC_QUERY_CAP_KEY]: "capped",
      },
    },
    incidentState: "combined-prioritized-capped-fully-recovered",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 50,
      queryLatencyP95Seconds: 5,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "combined-prioritized-capped-draining-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: {
        [ADMISSION_POLICY_KEY]: "priority-queue",
        [AD_HOC_QUERY_CAP_KEY]: "capped",
        [DEADLINE_COMMUNICATION_KEY]: "proactive-notice",
      },
    },
    incidentState: "combined-prioritized-capped-draining-proactive",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 3,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 1,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 58,
      queryLatencyP95Seconds: 7,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "combined-prioritized-capped-draining",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: {
        [ADMISSION_POLICY_KEY]: "priority-queue",
        [AD_HOC_QUERY_CAP_KEY]: "capped",
      },
    },
    incidentState: "combined-prioritized-capped-draining",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 3,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 1,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 58,
      queryLatencyP95Seconds: 7,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — priority-queue admission alone (cap left
  // at its default "unlimited"). Scheduled Reports is admitted ahead of
  // ad-hoc load, so the SLA is protected immediately; the pre-existing
  // ad-hoc backlog itself still drains over real elapsed time.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "priority-queue-fully-recovered-proactive",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "priority-queue-fully-recovered-proactive",
    values: {
      adHocConcurrentQueries: 8,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 60,
      queryLatencyP95Seconds: 6,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "priority-queue-fully-recovered",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue" },
    },
    incidentState: "priority-queue-fully-recovered",
    values: {
      adHocConcurrentQueries: 8,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 60,
      queryLatencyP95Seconds: 6,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "priority-queue-draining-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "priority-queue-draining-proactive",
    values: {
      adHocConcurrentQueries: 9,
      adHocQueuedQueries: 6,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 2,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 70,
      queryLatencyP95Seconds: 11,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "priority-queue-draining",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue" },
    },
    incidentState: "priority-queue-draining",
    values: {
      adHocConcurrentQueries: 9,
      adHocQueuedQueries: 6,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 2,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 70,
      queryLatencyP95Seconds: 11,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "priority-queue-just-engaged-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: false },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "priority-queue-just-engaged-proactive",
    values: {
      adHocConcurrentQueries: 9,
      adHocQueuedQueries: 7,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 1,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 75,
      queryLatencyP95Seconds: 13,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "priority-queue-just-engaged",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: false },
      controlEquals: { [ADMISSION_POLICY_KEY]: "priority-queue" },
    },
    incidentState: "priority-queue-just-engaged",
    values: {
      adHocConcurrentQueries: 9,
      adHocQueuedQueries: 7,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 1,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 75,
      queryLatencyP95Seconds: 13,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — ad-hoc cap alone (admission policy left
  // at its default "fifo"). Ad-hoc concurrency is bounded directly, so
  // it can never consume effectively all admission slots in the first
  // place — a materially different mechanism from reordering by
  // priority, independent of arrival order.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "capped-fully-recovered-proactive",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "capped-fully-recovered-proactive",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 48,
      queryLatencyP95Seconds: 6,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "capped-fully-recovered",
    when: {
      triggerEquals: { queryContention: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped" },
    },
    incidentState: "capped-fully-recovered",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 48,
      queryLatencyP95Seconds: 6,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "clear",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "capped-draining-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "capped-draining-proactive",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 8,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 3,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 55,
      queryLatencyP95Seconds: 9,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "capped-draining",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true, drainWindowFullyRecoveredElapsed: false },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped" },
    },
    incidentState: "capped-draining",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 8,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 3,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 55,
      queryLatencyP95Seconds: 9,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "capped-just-engaged-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: false },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped", [DEADLINE_COMMUNICATION_KEY]: "proactive-notice" },
    },
    incidentState: "capped-just-engaged-proactive",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 9,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 2,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 58,
      queryLatencyP95Seconds: 10,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "capped-just-engaged",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: false },
      controlEquals: { [AD_HOC_QUERY_CAP_KEY]: "capped" },
    },
    incidentState: "capped-just-engaged",
    values: {
      adHocConcurrentQueries: 4,
      adHocQueuedQueries: 9,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 2,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 58,
      queryLatencyP95Seconds: 10,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ── graceful-stop alone: bounded-cost long-running-job handling, on
  // top of whichever other path is (or isn't) active. Only meaningfully
  // distinct from "allow" once a long-running job actually exists and
  // is genuinely threatening the SLA under sustained fifo/uncapped
  // contention — a real, bounded lost-work cost (checkpoint tail only),
  // never the hard-kill trap's total loss, and never zero cost either
  // (an honest middle ground). Listed AFTER both alternate strong paths
  // so a combined prioritized/capped+graceful-stop run still matches
  // its own more-specific rule above; this rule only fires for
  // graceful-stop WITHOUT priority-queue or capped also engaged.
  // Communication-independent (reportDeadlineCommunication is not
  // constrained) since this rule's own judgment is orthogonal to
  // stakeholder notice; stakeholderCommunicationStatus is still read
  // generically — see note below the rule.
  {
    id: "graceful-stop-bounded-loss-proactive",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true },
      controlEquals: {
        [LONG_RUNNING_QUERY_POLICY_KEY]: "graceful-stop",
        [ADMISSION_POLICY_KEY]: "fifo",
        [AD_HOC_QUERY_CAP_KEY]: "unlimited",
        [DEADLINE_COMMUNICATION_KEY]: "proactive-notice",
      },
    },
    incidentState: "graceful-stop-bounded-loss-proactive",
    values: {
      adHocConcurrentQueries: 7,
      adHocQueuedQueries: 3,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 10,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 1,
      warehouseUtilizationPercent: 68,
      queryLatencyP95Seconds: 14,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "at-risk",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "warning",
      stakeholderCommunicationStatus: "proactive",
      backlogStatus: "draining",
    },
    componentHealth: contendedHealth,
  },
  {
    id: "graceful-stop-bounded-loss",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true },
      controlEquals: {
        [LONG_RUNNING_QUERY_POLICY_KEY]: "graceful-stop",
        [ADMISSION_POLICY_KEY]: "fifo",
        [AD_HOC_QUERY_CAP_KEY]: "unlimited",
      },
    },
    incidentState: "graceful-stop-bounded-loss",
    values: {
      adHocConcurrentQueries: 7,
      adHocQueuedQueries: 3,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 10,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 1,
      warehouseUtilizationPercent: 68,
      queryLatencyP95Seconds: 14,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "at-risk",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "warning",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "draining",
    },
    componentHealth: contendedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CAPACITY-ONLY — warehouseCapacityTier="scaled" with admissionPolicy
  // still "fifo" and adHocQueryCap still "unlimited". Genuinely raises
  // throughput (lower utilization/latency than the plain baseline below
  // at an equivalent elapsed time) but does NOT protect the SLA — proof
  // that pure scale-up is recognizably insufficient without
  // prioritization.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "capacity-scaled-insufficient-sustained",
    when: {
      triggerEquals: { queryContention: true, sustainedContention: true },
      controlEquals: {
        [WAREHOUSE_CAPACITY_TIER_KEY]: "scaled",
        [ADMISSION_POLICY_KEY]: "fifo",
        [AD_HOC_QUERY_CAP_KEY]: "unlimited",
      },
    },
    incidentState: "capacity-scaled-insufficient-sustained",
    values: {
      adHocConcurrentQueries: 16,
      adHocQueuedQueries: 4,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 22,
      reportOnTrackForSla: 0,
      dataScienceJobUncheckpointedMinutes: 30,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 72,
      queryLatencyP95Seconds: 15,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "breached",
      workloadTradeoffStatus: "sla-exposed",
      slaRiskSeverity: "critical",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "not-applicable",
    },
    componentHealth: breachedHealth,
  },
  {
    id: "capacity-scaled-insufficient-active",
    when: {
      triggerEquals: { queryContention: true },
      controlEquals: {
        [WAREHOUSE_CAPACITY_TIER_KEY]: "scaled",
        [ADMISSION_POLICY_KEY]: "fifo",
        [AD_HOC_QUERY_CAP_KEY]: "unlimited",
      },
    },
    incidentState: "capacity-scaled-insufficient-active",
    values: {
      adHocConcurrentQueries: 15,
      adHocQueuedQueries: 2,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 9,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 20,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 68,
      queryLatencyP95Seconds: 10,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "at-risk",
      workloadTradeoffStatus: "sla-exposed",
      slaRiskSeverity: "warning",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "not-applicable",
    },
    componentHealth: contendedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — fifo admission, ad-hoc uncapped, standard capacity.
  // Ad-hoc load freely consumes admission slots in arrival order; the
  // critical report job queues behind it exactly as if it were equally
  // urgent, and the SLA erodes the longer this goes unaddressed.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-contention",
    when: { triggerEquals: { queryContention: true, sustainedContention: true } },
    incidentState: "baseline-sustained-contention",
    values: {
      adHocConcurrentQueries: 18,
      adHocQueuedQueries: 5,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 28,
      reportOnTrackForSla: 0,
      dataScienceJobUncheckpointedMinutes: 35,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 94,
      queryLatencyP95Seconds: 42,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "breached",
      workloadTradeoffStatus: "sla-exposed",
      slaRiskSeverity: "critical",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "not-applicable",
    },
    componentHealth: breachedHealth,
  },
  {
    id: "baseline-contention",
    when: { triggerEquals: { queryContention: true } },
    incidentState: "baseline-contention",
    values: {
      adHocConcurrentQueries: 16,
      adHocQueuedQueries: 3,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 12,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 25,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 86,
      queryLatencyP95Seconds: 24,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "at-risk",
      workloadTradeoffStatus: "sla-exposed",
      slaRiskSeverity: "warning",
      stakeholderCommunicationStatus: "silent",
      backlogStatus: "not-applicable",
    },
    componentHealth: contendedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      adHocConcurrentQueries: 8,
      adHocQueuedQueries: 0,
      reportDeadlineMinutesRemaining: 40,
      reportQueueWaitMinutes: 0,
      reportOnTrackForSla: 1,
      dataScienceJobUncheckpointedMinutes: 0,
      dataScienceLostWorkHoursCumulative: 0,
      warehouseUtilizationPercent: 55,
      queryLatencyP95Seconds: 12,
      adHocAccessAvailabilityPercent: 100,
      slaStatus: "on-track",
      workloadTradeoffStatus: "balanced",
      slaRiskSeverity: "normal",
      stakeholderCommunicationStatus: "not-applicable",
      backlogStatus: "not-applicable",
    },
    componentHealth: healthyHealth,
  },
];
