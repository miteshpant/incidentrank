import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { consistencyVsAvailabilityIncidentRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const consistencyVsAvailabilityIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "balanceSafetyStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage:
          "Balance writes are being accepted independently by both regions with no cross-region confirmation -- a critical correctness-risk state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Balance writes are once again protected by a real safety mechanism.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "balanceCorrectnessViolations",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Balance writes are landing in direct, unconfirmed conflict between Region A and Region B.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No unconfirmed balance write conflicts remain.",
      },
    },
    { key: "balanceWriteQueueDepth", trackPeak: true },
    { key: "catalogDivergentKeyCount", trackPeak: true },
  ],
  timedEvents,
  rules: consistencyVsAvailabilityIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ───────────────────
  //
  // Reachable terminal/stable rule states while connectivityDegraded is
  // active (or after connectivityRestored), classified against
  // successCondition (balanceCorrectnessViolations === 0 AND
  // balanceWriteAvailability > 0):
  //
  //   single-region-a-routed / single-region-b-routed              OPTIMAL
  //     -- all writes forced to one region. balanceSafetyMechanism=
  //     "single-region-routed". Structurally safe (no second region can
  //     ever accept a conflicting write), at the cost of concentrating
  //     catalog traffic too.
  //   both-strong-queue / both-strong-reject                        OPTIMAL
  //     -- Strategy A: both categories held to strong, cross-region-
  //     confirmed consistency. balanceSafetyMechanism="quorum-confirmed".
  //     Fully safe, real availability cost on BOTH categories (including
  //     catalog, which never needed it).
  //   differentiated-balance-strong-catalog-relaxed (queue or reject)  OPTIMAL
  //     -- Strategy B: balance stays strong (zero correctness risk),
  //     catalog relaxes to full availability (zero correctness cost,
  //     since catalog has no double-spend shape). balanceSafetyMechanism=
  //     "quorum-confirmed". Satisfies successCondition identically to
  //     Strategy A, scores higher on Customer Impact due to materially
  //     better overall availability -- the two strategies are
  //     DIFFERENTIATED by scoring, never by completion eligibility.
  //   healed-balance-queue-draining / healed-catalog-reconciled-lww /
  //   healed-catalog-reconciling-merge (post-heal)                    OPTIMAL
  //     -- connectivity restored; zero correctness violations were ever
  //     produced under strong balance mode, so there is nothing unsafe
  //     to drain -- only latency/convergence-speed differences remain.
  //   balance-relaxed-unsafe (balanceConsistencyMode="relaxed" --
  //     the default, pre-incident posture, left untouched)             UNSAFE
  //     -- THE TRAP. balanceWriteAvailability reads 100 -- customer-
  //     facing write availability for the consistency-critical category
  //     looks perfectly healthy -- while balanceCorrectnessViolations
  //     climbs to 9 and keeps climbing. This state NEVER satisfies
  //     successCondition, because the condition is gated directly on
  //     balanceCorrectnessViolations, which never includes
  //     balanceWriteAvailability as a substitute. No value of
  //     availability, however healthy, can satisfy this condition in
  //     place of a real zero-violations count. Sustained long enough,
  //     this is also what triggers the automatic failureCondition.
  //   balance-quorum-misconfigured (balanceConsistencyMode="strong" but
  //     quorumRequirement="local-only")                                UNSAFE
  //     -- mechanically identical correctness damage to the relaxed
  //     trap (balanceCorrectnessViolations=9) despite the category
  //     control itself still reading the safe-looking "strong" value --
  //     the configuration-drift trap this rule exists to catch. Also
  //     never satisfies successCondition.
  //
  // Every genuinely OPTIMAL state here is ACTUALLY zero-violation safe
  // right now -- there is no state in this scenario's reachable graph
  // that is "almost safe," "partially mitigated," or "safe only because
  // of a bounded, deliberate tradeoff on the correctness-critical
  // category." The real tradeoff space (Strategy A vs. Strategy B vs.
  // single-region routing vs. queue-vs-reject UX) exists entirely WITHIN
  // the optimal set, differentiated by Customer Impact / Data Integrity
  // scoring, never by a second, looser completion tier. Per section 10's
  // standard (an acceptableCondition must represent a genuinely, bounded
  // safe tradeoff, never partial credit or a scoring middle tier), this
  // scenario is intentionally single-tier, with NO acceptableCondition
  // -- introducing one here would risk exactly the failure mode the
  // batch's correctness-gate requirement exists to prevent: a second,
  // looser bar a correctness-violating state could sneak through on.
  //
  // Decision: candidate_declared (not automatic). Whether
  // balanceCorrectnessViolations/balanceWriteAvailability happen to read
  // safe at any given tick is necessary but not sufficient proof the
  // candidate understood WHY it is safe -- a candidate who reaches
  // single-region-routed (a real, if more concentrated, fix) looks
  // identical by successCondition's two fields to one who correctly
  // differentiated by business need, and distinguishing "this is the
  // durable, differentiated choice" from "this happens to be safe right
  // now, for a reason the candidate may not have intended" is precisely
  // the judgment candidate_declared exists to test, alongside Data
  // Integrity scoring's balanceSafetyMechanism-aware measure. Automatic
  // failure remains fully automatic regardless of mode (see
  // failureCondition above and evaluateCandidateDeclaredFinish).
  //
  // Immediate-finish audit (phase6c.md section 9): both consistency-mode
  // controls default to "relaxed" (the pre-incident, no-cross-region-
  // check posture -- see controls.ts). The instant connectivityDegraded
  // fires, a zero-action candidate is already sitting in
  // balance-relaxed-unsafe, which fails successCondition outright. A
  // zero-action immediate Finish therefore evaluates to
  // declared_unstable, never resolved -- there is no legitimate "wait
  // and observe" path to an immediate optimal Finish in this scenario
  // (see consistency-vs-availability-incident.test.ts's dedicated
  // immediate-Finish test). successCondition's own sustainedSeconds (30)
  // additionally requires any genuinely safe configuration to hold for a
  // real observation window before Finish becomes eligible at all.
  completion: { mode: "candidate_declared" },
};
