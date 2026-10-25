import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { quorumLossRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  MEMBERSHIP_SIZE_KEY,
  NODE_D_MEMBERSHIP_KEY,
  NODE_E_MEMBERSHIP_KEY,
  QUORUM_REQUIREMENT_KEY,
  READ_ONLY_MODE_KEY,
  RECOVERY_PRIORITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const quorumLossSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "quorumStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The consensus group has genuinely dropped below quorum.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The consensus group has regained a genuine majority.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "unsafeWriteCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Writes are being accepted without genuine majority agreement.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No writes are being accepted without genuine majority agreement.",
      },
    },
    {
      key: "healthyNodeCount",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: quorumLossRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified against
  // successCondition (quorumStatus !== "critical" AND unsafeWriteCount
  // === 0):
  //
  //   healthy (pre-incident)                                 n/a --
  //     incidentStartedAtMs is null until the first timed event fires,
  //     so neither successCondition nor acceptableCondition can ever be
  //     satisfied here regardless of these fields' values (tick.ts gates
  //     both on incidentStartedAtMs !== null).
  //   quorum-threatened (D/E unreachable, 3 of 5 reachable,
  //     quorumStatus="warning")                                OPTIMAL --
  //     genuinely still safe: 3 of 5 is a real majority, zero margin but
  //     zero violation. unsafeWriteCount=0. Satisfies successCondition
  //     ("warning" !== "critical").
  //   quorum-threatened-node-c-warning (Node C's heartbeat visibly
  //     degrading, quorum still held)                          OPTIMAL --
  //     same reasoning; still exactly 3 of 5 reachable, nothing has
  //     actually been lost yet.
  //   quorum-restored-three-node (membership reconfigured to 3 nodes,
  //     D and E isolated out of voting)                         OPTIMAL --
  //     the structural fix: quorumStatus="normal" with real margin
  //     (3 of 3 reachable, quorum=2), unsafeWriteCount=0.
  //   below-quorum-safe-read-only (below quorum, readOnlyMode=true)
  //                                                              ACCEPTABLE --
  //     quorumStatus="critical" (genuinely below quorum) but
  //     unsafeWriteCount=0 and writeAvailability=0: a deliberate,
  //     bounded tradeoff (write availability for correctness), not a
  //     structural fix. Never satisfies successCondition (quorumStatus
  //     is still "critical"), but is genuinely, operationally safe to
  //     hand back.
  //   below-quorum-safe-structural-refusal (below quorum,
  //     quorumRequirement="strict-majority", readOnlyMode=false)
  //                                                              ACCEPTABLE --
  //     identical safety profile to the read-only state above, reached
  //     via the structural quorum check refusing writes on its own
  //     rather than an explicit manual switch.
  //   below-quorum-unsafe-writes (below quorum,
  //     quorumRequirement="relaxed-any-reachable", readOnlyMode=false)
  //                                                              UNSAFE --
  //     THE TRAP. writeAvailability=100 (looks fully healthy) but
  //     unsafeWriteCount=24 and climbing. Never satisfies
  //     successCondition OR acceptableCondition -- both are gated
  //     directly on unsafeWriteCount===0, which this state never
  //     reaches, independent of how healthy writeAvailability reads.
  //
  // Two independently-safe tiers exist: the full structural fix
  // (membership reconfiguration genuinely restoring quorum, or simply
  // never having lost it) versus a deliberate, bounded availability-for-
  // correctness tradeoff (explicit read-only, or the structural-refusal
  // mechanism) while still below quorum. This is the exact
  // genuinely-safe-but-imperfect handback the acceptable tier exists for
  // (phase6c.md section 10) -- not almost-fixed, not partial credit: the
  // candidate who sacrifices write availability to protect correctness
  // while below quorum has made a real, defensible, safe decision, just
  // not the fully durable one. Data Integrity scoring (scoring.ts)
  // further discriminates the structural fix from the two safe-degrade
  // mechanisms via quorumSafetyMechanism, rather than a third completion
  // tier.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // below-quorum-but-correctly-read-only tier. Whether unsafeWriteCount
  // happens to read 0 at a given instant is necessary but not sufficient
  // proof the candidate understood why -- a candidate who leaves quorum
  // requirement at the dangerous relaxed setting while merely still
  // above quorum is one node loss away from the unsafe trap, and
  // distinguishing "genuinely safe by design" from "safe only because
  // nothing has gone wrong yet" is exactly the judgment
  // candidate_declared exists to test. Automatic failure remains fully
  // automatic regardless of mode (see failureCondition above and
  // evaluateCandidateDeclaredFinish).
  completion: { mode: "candidate_declared", acceptableCondition },
};
