import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { networkPartitionRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const networkPartitionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "ledgerSafetyStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Both regions now independently accept ledger writes -- a critical correctness-risk state for account-balance data.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Ledger writes have returned to a safe, single-authority state.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "ledgerConsistencyViolationCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Divergent ledger writes are landing in direct conflict between Region A and Region B.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No unresolved ledger write conflicts remain.",
      },
    },
    {
      key: "profileUnreconciledWriteCount",
      trackPeak: true,
    },
    {
      key: "staleLedgerReadsServedPerMin",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: networkPartitionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states during the active partition,
  // classified against successCondition (ledgerWriteAuthority ===
  // "single" AND ledgerConsistencyViolationCount === 0):
  //
  //   single-region-routed-a/-b (+ -strict/-strong-profile variants)   OPTIMAL
  //     -- the structural fix. ledgerSafetyMechanism="single-region-routed".
  //   region-a-isolated-manual / region-b-isolated-manual               OPTIMAL
  //     -- ledgerSafetyMechanism="region-isolated". Genuinely safe right
  //     now (satisfies successCondition identically to the structural
  //     fix), but not backed by a structural guarantee the way
  //     single-region routing is -- carried by Data Integrity scoring,
  //     not by a second completion tier (see below).
  //   both-regions-isolated                                             OPTIMAL
  //     -- ledgerSafetyMechanism="both-isolated". Safe but needlessly
  //     conservative (zero ledger write availability anywhere) -- again
  //     a scoring distinction, not a completion-gating one.
  //   dual-ledger-write-trap (routing=local-region-authoritative, BOTH
  //     regions "serving" -- the default control state)                 UNSAFE
  //     -- THE TRAP. ledgerWriteAuthority="dual",
  //     ledgerConsistencyViolationCount=22 and climbing -- yet
  //     regionAAvailability=100 AND regionBAvailability=100
  //     simultaneously. This state NEVER satisfies successCondition,
  //     because the condition is gated directly on ledgerWriteAuthority/
  //     ledgerConsistencyViolationCount, which never include either
  //     availability field. No value of availability, however healthy,
  //     can substitute for the two fields actually gated on.
  //   healed-ledger-violations-persist (post-heal, routing was left at
  //     local-region-authoritative during the partition)                UNSAFE
  //     -- ledgerWriteAuthority returns to "single" once healed (nobody
  //     is actively double-writing anymore), but
  //     ledgerConsistencyViolationCount stays at 18 -- a real, counted,
  //     still-unresolved divergence from the earlier unsafe window.
  //     Genuinely not safe to hand back: real ledger data has diverged
  //     and nothing has reconciled it.
  //   healed-safe (post-heal, ledger routing was safe throughout)        OPTIMAL
  //     -- ledgerConsistencyViolationCount is 0 because no divergence
  //     was ever created. Satisfies successCondition.
  //
  // Multiple genuinely distinct, independently-OPTIMAL mechanisms exist
  // (single-region routing, correct manual isolation of either region,
  // and overly-conservative both-isolation) -- none of them is "almost
  // passed" relative to another; all are currently, actually safe. There
  // is therefore no case for a LOOSER acceptableCondition sitting below
  // successCondition: the real discrimination this scenario needs
  // (structural/durable fix vs. a manually-achieved but equally-safe-
  // right-now single-writer state vs. the needlessly conservative
  // both-isolated state) is carried entirely by Data Integrity scoring's
  // ledgerSafetyMechanism-aware measure (scoring.ts), never by a second
  // completion tier. Introducing an acceptableCondition here would risk
  // exactly the failure mode this scenario exists to prevent -- creating
  // a second, looser bar that a partially-safe-looking state could sneak
  // through on -- so this scenario is intentionally single-tier, with NO
  // acceptableCondition.
  //
  // Decision: candidate_declared (not automatic). Whether
  // ledgerWriteAuthority/ledgerConsistencyViolationCount happen to read
  // safe at any given tick is necessary but not sufficient proof the
  // candidate understood WHY it is safe -- a candidate who stumbles into
  // manual region-isolation reaches the exact same successCondition
  // fields as a candidate who correctly enforced single-region ledger
  // routing, and distinguishing "this is durably safe" from "this
  // happens to be safe right now" is precisely the judgment
  // candidate_declared exists to test alongside Data Integrity scoring.
  // Automatic failure remains fully automatic regardless of mode (see
  // failureCondition above and evaluateCandidateDeclaredFinish).
  //
  // Immediate-Finish audit (phase6c.md section 9): at t=0 (before the
  // partition even fires), the scenario sits at incidentState="healthy",
  // ledgerWriteAuthority="single", ledgerConsistencyViolationCount=0 --
  // this trivially satisfies successCondition's two authored fields. If
  // a candidate clicked Finish at the very start with zero actions, this
  // WOULD be eligible as "optimal" the instant incidentStartedAtMs is
  // set (i.e. the moment the partition timed event fires at T=30s) --
  // but successCondition.sustainedSeconds=30 means the candidate must
  // wait a real, meaningful 30-second observation window with the
  // condition continuously true before Finish becomes eligible, not an
  // instant click. Before the partition fires there is no
  // incidentStartedAtMs at all, so Finish is moot; the moment the
  // partition fires, ledgerWriteAuthority immediately flips to "dual"
  // under the default routing (THE TRAP), so the sustain window cannot
  // even begin accruing until the candidate has made the single-region-
  // routing (or manual-isolation) decision. A zero-action candidate who
  // clicks Finish anytime after T=30s is sitting in the dual-write trap
  // and gets declared_unstable, not resolved -- see the dedicated test.
  completion: { mode: "candidate_declared" },
};
