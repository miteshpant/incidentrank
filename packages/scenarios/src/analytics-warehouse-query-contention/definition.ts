import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { analyticsWarehouseQueryContentionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const analyticsWarehouseQueryContentionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "slaRiskSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "CANDIDATE-ACTION CONSEQUENCE: the critical scheduled-report job's SLA has been breached, or ad-hoc access has been revoked outright.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: SLA risk has returned to a bounded, safe level.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/CUMULATIVE business-risk exposure (phase6e3.md's
      // binding requirement). trackPeak:true is what makes this
      // genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate reverts hard-kill back to allow/graceful-stop, the
      // peak lost-work hours this attempt actually reached stays
      // recorded.
      key: "dataScienceLostWorkHoursCumulative",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "HISTORICAL CONSEQUENCE: a long-running Data Science job's work has been destroyed by a hard kill at least once during this incident — a permanent loss that will not be restored by any later policy change.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further Data Science work is currently being lost to an abrupt kill.",
      },
    },
    {
      key: "reportQueueWaitMinutes",
      trackPeak: true,
    },
    {
      key: "adHocQueuedQueries",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: analyticsWarehouseQueryContentionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e3.md, same style/rigor as the
  // Phase 6E.2 siblings) ───────────────────────────────────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (reportOnTrackForSla / adHocAccessAvailabilityPercent
  // / workloadTradeoffStatus / slaStatus /
  // dataScienceLostWorkHoursCumulative):
  //
  //   healthy-default                                       N/A (pre-incident)
  //   baseline-contention                                    UNSAFE   true/100/sla-exposed/at-risk/0
  //   baseline-sustained-contention                           UNSAFE   false/100/sla-exposed/breached/0
  //   capacity-scaled-insufficient-active                     UNSAFE   true/100/sla-exposed/at-risk/0
  //   capacity-scaled-insufficient-sustained                  UNSAFE   false/100/sla-exposed/breached/0
  //     (proves pure scale-up is recognizably insufficient)
  //   adhoc-access-revoked-overcorrection                     UNSAFE   true/0/overcorrected/on-track/0
  //     (best-looking SLA number in the ENTIRE scenario — SLA reads
  //     "on-track" and "healthy" severity — yet a real, named business-
  //     invariant violation; see score-sanity audit below)
  //   hard-kill-lost-work-trap                                UNSAFE   true/100/balanced/on-track/6+
  //     (an INDEPENDENT unsafe lever, not reachable only via the
  //     overcorrection trap above — SLA and workloadTradeoffStatus both
  //     read clean, only the lost-work peak and reliability penalty
  //     expose it)
  //   priority-queue-just-engaged(-proactive)                 ACCEPTABLE true/100/balanced/on-track/0
  //   priority-queue-draining(-proactive)                     ACCEPTABLE true/100/balanced/on-track/0
  //   capped-just-engaged(-proactive)                         ACCEPTABLE true/100/balanced/on-track/0
  //   capped-draining(-proactive)                             ACCEPTABLE true/100/balanced/on-track/0
  //   combined-prioritized-capped-draining(-proactive)        ACCEPTABLE true/100/balanced/on-track/0
  //   graceful-stop-bounded-loss(-proactive)                  ACCEPTABLE true/100/balanced/at-risk/0
  //     (slaStatus reads "at-risk" here, not "on-track" — a real,
  //     honest signal that graceful-stop alone, without a
  //     prioritization lever, is a bounded-cost tradeoff rather than a
  //     fully resolved recovery; still satisfies acceptableCondition,
  //     which does not gate on slaStatus directly)
  //   priority-queue-fully-recovered(-proactive)              OPTIMAL  true/100/balanced/on-track/0
  //   capped-fully-recovered(-proactive)                      OPTIMAL  true/100/balanced/on-track/0
  //   combined-prioritized-capped-fully-recovered(-proactive) OPTIMAL  true/100/balanced/on-track/0
  //
  // Every UNSAFE state fails successCondition for a real, named reason:
  // either reportOnTrackForSla is false, or
  // adHocAccessAvailabilityPercent < 100 (the overcorrection trap), or
  // workloadTradeoffStatus != "balanced" (the overcorrection trap OR the
  // sla-exposed family), or slaStatus === "breached". The hard-kill trap
  // fails none of successCondition's own checks (its SLA reads clean) —
  // it is caught entirely by scoring's reliability penalty on the
  // peak-tracked lost-work exposure, never by completion eligibility,
  // consistent with how Model Feature Freshness Degradation's offline-
  // snapshot trap is an INDEPENDENT lever from its primary completion
  // gate.
  //
  // ── Why ACCEPTABLE (not merely "degraded") is correct for the
  // just-engaged/draining family and graceful-stop ────────────────────
  // Every one of these states has reportOnTrackForSla===true,
  // adHocAccessAvailabilityPercent===100, and
  // workloadTradeoffStatus==="balanced" — the SLA is genuinely
  // protected and ad-hoc access remains genuinely open in all of them.
  // This is the scenario's required legitimate degraded-but-safe tier:
  // a real prioritization/cap lever is engaged and already working, but
  // the pre-existing ad-hoc backlog has not yet fully drained (or, for
  // graceful-stop, only the long-running-job-handling axis has been
  // addressed on its own).
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "balanced-but-still-draining" (ACCEPTABLE) and
  // "fully recovered" (OPTIMAL) is a real system-state distinction, but
  // deciding WHETHER the current bounded tradeoff (e.g. graceful-stop
  // alone, or capped-but-still-draining) is worth continuing to wait
  // out — versus engaging a stronger combined strategy, or paying for
  // warehouseCapacityTier="scaled" to accelerate the drain — is a
  // genuine senior/staff-level judgment call, not something the engine
  // should auto-resolve the instant a threshold is crossed. This
  // mirrors every other Phase 6E candidate_declared sibling's
  // completion-mode reasoning.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is baseline-contention
  // (reportOnTrackForSla true but workloadTradeoffStatus "sla-exposed",
  // slaStatus "at-risk"), which satisfies neither successCondition
  // (workloadTradeoffStatus != "balanced") nor acceptableCondition (same
  // check). evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default.
  completion: { mode: "candidate_declared", acceptableCondition },
};
