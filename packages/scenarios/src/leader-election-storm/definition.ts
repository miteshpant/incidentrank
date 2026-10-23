import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { leaderElectionStormRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const leaderElectionStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "quorumHealth",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Quorum health has entered a critical state — the cluster is repeatedly failing to maintain a stable leader.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Quorum health has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "leaderChangesPerMinute",
      trackPeak: true,
      threshold: {
        value: 10,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Leader changes per minute have crossed 10 — the cluster is in a disruptive re-election storm.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Leader changes per minute have dropped back below 10.",
      },
    },
    {
      key: "node3HeartbeatMissStreak",
      trackPeak: true,
    },
    {
      key: "requestFailureRate",
      trackPeak: true,
    },
    {
      key: "failureDetectionTimeMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: leaderElectionStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified against
  // successCondition (leaderChangesPerMinute===0 AND
  // quorumHealth==="normal" AND electionStabilityMechanism===
  // "margin-fixed") and acceptableCondition (leaderChangesPerMinute===0
  // AND quorumHealth==="no-slack" AND electionStabilityMechanism!==
  // "unresolved"):
  //
  //   margin-fixed-stable / -degrading                         OPTIMAL
  //     — timeout=1200ms with real heartbeat margin (<=100ms).
  //     Clears the ~900ms jitter envelope with genuine margin, full
  //     3-voter fault tolerance intact (quorumHealth="normal").
  //   margin-fixed-settled (post-crash, after failing over)   ACCEPTABLE
  //     — the same mechanism, but node-3 is now actually gone;
  //     quorumHealth reads "no-slack" because the voting set has
  //     genuinely shrunk to 2. Safe right now, redundancy margin spent.
  //   isolated-stable / -degrading / -unaffected-by-crash     ACCEPTABLE
  //     — node-3 removed from voting entirely. Fully stable against
  //     its jitter (and, it turns out, against its eventual crash too)
  //     but quorumHealth="no-slack" for the same reason: only 2 voters
  //     remain.
  //   margin-fixed-failing-over (mid-failover, right after
  //     the genuine crash)                                      UNSAFE
  //     — leaderChangesPerMinute=1, quorumHealth="degraded": a real
  //     election is actively in flight. Brief, but genuinely not safe
  //     to hand back yet.
  //   excessive-timeout-quiet-but-unproven / -node3-degrading   UNSAFE
  //     — THE TRAP. timeout=3000ms reads identically quiet to
  //     margin-fixed during the jitter-only window (leaderChangesPerMinute
  //     =0, quorumHealth="normal") — but electionStabilityMechanism
  //     stays "unresolved" because the fix was oversized, never
  //     proportionate to the observed jitter. Must never be mistaken
  //     for optimal.
  //   excessive-timeout-settled (post-crash, after a slow
  //     failover)                                                UNSAFE
  //     — quorumHealth="no-slack" now, same as the acceptable states,
  //     but electionStabilityMechanism is still "unresolved": this
  //     quiet state was only ever proven safe against a failure that
  //     has ALREADY happened, never against the jitter itself. Does
  //     not qualify for acceptable — the string field is what prevents
  //     this from being mistaken for the genuinely-earned acceptable
  //     tier above.
  //   excessive-timeout-slow-failover (crash, mid pay-the-cost)  UNSAFE
  //     — leaderChangesPerMinute=2, requestFailureRate=46,
  //     clusterThroughputRps=310: the authored, observable cost of
  //     the oversized timeout once node-3 genuinely dies.
  //   timeout-fixed-heartbeat-too-sparse                         UNSAFE
  //     — timeout=1200ms but heartbeatInterval=200ms leaves too few
  //     attempts inside the window; low-rate but real ongoing spurious
  //     elections (leaderChangesPerMinute=3). Raising the timeout alone
  //     was not quite sufficient here.
  //   spurious-elections-* (every timeout<=600ms variant,
  //     baseline / degrading / aggressive-retries / worst-case /
  //     plus-real-crash)                                         UNSAFE
  //     — real, ongoing spurious re-elections (leaderChangesPerMinute
  //     32-48), quorumHealth="critical".
  //
  // Two genuinely distinct mechanisms (a proportionate timeout fix, and
  // isolating the specific flaky node) both reach a real, sustained-safe
  // state — but only the timeout fix preserves full quorum redundancy;
  // isolation (and a forced post-crash settlement under the timeout fix)
  // spend that redundancy to get there. That is exactly phase6b.md
  // section 9's "regional traffic isolated with known reduced
  // redundancy" example, so acceptableCondition is genuinely justified
  // here — this is not "almost passed," both tiers are currently, fully
  // safe. The excessive-timeout trap deliberately never crosses either
  // bar even once node-3 has genuinely crashed and the one-time failover
  // has settled, because its apparent stability was never actually
  // earned against the jitter it was raised to address.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // reduced-redundancy tier. "Has leaderChangesPerMinute happened to
  // read zero this tick" is not, by itself, proof the system is safe to
  // hand back — a candidate who raised the timeout to 3000ms sees the
  // exact same quiet metrics as the candidate who raised it to 1200ms,
  // and the difference between a proportionate fix and an unproven one
  // only becomes observable once a real failure occurs. Judging whether
  // a quiet cluster's stability is durable (not just currently quiet) is
  // exactly what candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
