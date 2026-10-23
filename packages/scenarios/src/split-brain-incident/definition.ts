import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { splitBrainIncidentRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  FENCING_ACTION_KEY,
  QUORUM_REQUIREMENT_KEY,
  RECONCILIATION_POLICY_KEY,
  REGION_A_ACCESS_KEY,
  REGION_B_ACCESS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const splitBrainIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "coordinatorStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The coordinator now considers both regions simultaneously writable -- a critical correctness-risk state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The coordinator has returned to a safe, single-writer state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "conflictCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Divergent writes are landing in direct conflict between Region A and Region B.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No unresolved write conflicts remain.",
      },
    },
    {
      key: "divergentWriteCount",
      trackPeak: true,
    },
    {
      key: "leaderCount",
      trackPeak: true,
      threshold: {
        value: 2,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Both Region A and Region B now believe they hold write leadership at the same time.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Exactly one region now holds write leadership.",
      },
    },
    {
      key: "unreconciledWriteCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: splitBrainIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states during the active partition,
  // classified against successCondition (writeAuthorityState ===
  // "single" AND conflictCount === 0):
  //
  //   majority-quorum-enforced (quorum=majority, both access=rw)   OPTIMAL
  //     -- the structural fix. writeSafetyMechanism="quorum-enforced".
  //   fenced-region-b (explicit fence of the non-majority side)     OPTIMAL
  //     -- writeSafetyMechanism="fenced-correct".
  //   manual-single-writer-region-a/-b (one side manually set to
  //     read-only/offline, the other read-write)                   OPTIMAL
  //     -- writeSafetyMechanism="manual-isolation". Genuinely safe
  //     right now (satisfies successCondition identically to the two
  //     states above), but not backed by a structural guarantee the
  //     way quorum enforcement is -- carried by Data Integrity scoring,
  //     not by a second completion tier (see below).
  //   fenced-region-a (explicit fence of the MAJORITY side)         UNSAFE-
  //     by-choice but not corrupt. writeAuthorityState="single",
  //     conflictCount=0 -- this DOES satisfy successCondition's two
  //     authored fields (zero divergence, exactly one writer), because
  //     fencing the wrong region is still, mechanically, a single-
  //     writer outcome. It is not corrupt; it is just an avoidable,
  //     wrong-region availability cost, which Data Integrity scoring
  //     discriminates (writeSafetyMechanism="fenced-wrong") rather than
  //     gating completion on.
  //   both-regions-write-disabled (both read-only/offline)          Also
  //     satisfies successCondition (zero writers anywhere, zero
  //     divergence) -- safe but needlessly conservative; again a
  //     scoring distinction (writeSafetyMechanism="both-isolated"),
  //     not a completion-gating one.
  //   dual-leader-both-writable (fencing=none, quorum=any-single-
  //     region, BOTH access=read-write -- the default control state)  UNSAFE
  //     -- THE TRAP. writeAuthorityState="dual", conflictCount=12 and
  //     climbing, leaderCount=2 -- yet regionAWriteAvailability=100 AND
  //     regionBWriteAvailability=100 simultaneously. This state NEVER
  //     satisfies successCondition, because the condition is gated
  //     directly on writeAuthorityState/conflictCount, which never
  //     include either availability field. No value of availability,
  //     however healthy, can substitute for the two fields actually
  //     gated on. This is the literal, binding requirement from
  //     phase6b.md section 37 ("availability must not dominate
  //     correctness") made concrete and testable.
  //   healed-reconciling-defer / healed-awaiting-manual-review        UNSAFE
  //     (post-heal, backlog from a prior dual-writable window, policy
  //     = defer-until-healed or manual-review) -- writeAuthorityState
  //     returns to "single" once healed, but conflictCount stays at 12
  //     (a real, counted, still-unresolved backlog) until reconciliation
  //     actually completes. Genuinely not yet safe to hand back: there
  //     is live, unresolved ambiguity about which of several conflicting
  //     writes is correct.
  //   healed-reconciled-lww (post-heal, policy=last-write-wins)      OPTIMAL
  //     -- conflictCount resolves to 0 immediately (every conflict
  //     auto-resolved by timestamp). Satisfies successCondition.
  //
  // Multiple genuinely distinct, independently-OPTIMAL mechanisms exist
  // (quorum enforcement, correct fencing, manual isolation, and -- after
  // healing -- last-write-wins reconciliation) -- none of them is "almost
  // passed" relative to another; all are currently, actually safe. There
  // is therefore no case for a LOOSER acceptableCondition sitting below
  // successCondition: the real discrimination this scenario needs
  // (structural/durable fix vs. a manually-achieved but equally-safe-
  // right-now single-writer state vs. the wrong-region fence vs. the
  // needlessly conservative both-isolated state) is carried entirely by
  // Data Integrity scoring's writeSafetyMechanism-aware measure
  // (scoring.ts), never by a second completion tier. Introducing an
  // acceptableCondition here would risk exactly the failure mode this
  // scenario exists to prevent -- creating a second, looser bar that a
  // partially-safe-looking state could sneak through on -- so this
  // scenario is intentionally single-tier, with NO acceptableCondition.
  //
  // Decision: candidate_declared (not automatic). Whether
  // writeAuthorityState/conflictCount happen to read safe at any given
  // tick is necessary but not sufficient proof the candidate understood
  // WHY it is safe -- a candidate who stumbles into manual-isolation or
  // the wrong-region fence reaches the exact same successCondition
  // fields as a candidate who correctly enforced majority quorum, and
  // distinguishing "this is durably safe" from "this happens to be safe
  // right now, for a reason the candidate may not have intended" is
  // precisely the judgment candidate_declared exists to test alongside
  // Data Integrity scoring. Automatic failure remains fully automatic
  // regardless of mode (see failureCondition above and evaluateCandidateDeclaredFinish).
  completion: { mode: "candidate_declared" },
};
