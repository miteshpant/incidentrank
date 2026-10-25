import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { multiRegionPaymentPlatformDegradationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CROSS_REGION_REPLICATION_MODE_KEY,
  EU_TRAFFIC_PERCENTAGE_KEY,
  EVENT_PUBLISHER_PRIORITY_KEY,
  FRAUD_FALLBACK_MODE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  RISK_ENRICHMENT_MODE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const multiRegionPaymentPlatformDegradationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "capacityRiskStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "US Ledger/Settlement capacity is now critically overloaded.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "US Ledger/Settlement capacity has recovered out of critical overload.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "ledgerReplicationLagSeconds",
      trackPeak: true,
      threshold: {
        value: 60,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Cross-region ledger replication lag has crossed 60 seconds.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Cross-region ledger replication lag has dropped back below 60 seconds.",
      },
    },
    {
      key: "usLedgerUtilization",
      trackPeak: true,
      threshold: {
        value: 100,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "US Ledger utilization has crossed 100% of safe write capacity.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "US Ledger utilization has dropped back under 100% of safe write capacity.",
      },
    },
    {
      key: "settlementBacklogThousands",
      trackPeak: true,
    },
    {
      key: "divergentLedgerAuthorityCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Divergent ledger writes are landing for the same account from more than one region.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No unresolved divergent ledger writes remain.",
      },
    },
    {
      key: "fraudControlBypassCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Payments are being authorized with mandatory fraud checks bypassed.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Mandatory fraud checks are no longer being bypassed.",
      },
    },
  ],
  timedEvents,
  rules: multiRegionPaymentPlatformDegradationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6dsupport.md section 10) ───────────
  //
  // Reachable terminal/stable rule states during the active incident,
  // classified against successCondition (divergentLedgerAuthorityCount
  // === 0 AND fraudControlBypassCount === 0 AND ledgerAuthorityMechanism
  // === "us-authoritative-routed" AND ledgerReplicationLagSeconds <= 5
  // AND settlementBacklogThousands === 0) and acceptableCondition (same
  // three gates, but usLedgerUtilization <= 95 AND
  // settlementBacklogThousands <= 6 instead of the two numeric bars).
  // The ledgerAuthorityMechanism gate is what keeps the untouched
  // baseline (which also reads low on utilization/backlog simply
  // because no traffic has been shifted onto US yet) from accidentally
  // qualifying for either tier -- real authored values from rules.ts:
  //
  //   baseline-unmitigated                divergence=0  bypass=0  lag=22  util=42   backlog=1   UNSAFE
  //     -- fails both: lag and backlog are both nonzero/above bar. No
  //     correctness violation, but nothing has been protected either.
  //   fraud-controls-bypassed             divergence=0  bypass=40 lag=5   util=45   backlog=1   UNSAFE
  //     -- THE FRAUD TRAP. Payment availability recovers, but
  //     fraudControlBypassCount=40 and climbing is a direct, counted
  //     violation of "mandatory fraud controls may not be bypassed."
  //     Can never satisfy successCondition OR acceptableCondition no
  //     matter how healthy payment success reads.
  //   unsafe-sequence-divergent-authority divergence=14 bypass=0  lag=95  util=86   backlog=9   UNSAFE
  //     -- shift-before-protect: EU traffic partially shifted while
  //     ledger authority is still region-local. A real, counted
  //     correctness violation of "must not create divergent ledger
  //     authority." Never satisfiable.
  //   unsafe-sequence-divergent-authority-full-shift
  //                                        divergence=31 bypass=0  lag=150 util=112  backlog=18  UNSAFE
  //     -- the same trap at full traffic shift. divergence=31 >= 25
  //     sustained 60s also trips automatic failureCondition.
  //   us-ledger-overloaded (THE REQUIRED HARMFUL/TEMPTING PATH)
  //                                        divergence=0  bypass=0  lag=180 util=128  backlog=22  UNSAFE
  //     -- ledger authority correctly fixed (no divergence), but 100%
  //     of EU traffic dumped onto US with zero settlement/throttle
  //     protection. EU/global payment availability metrics read
  //     healthy; usLedgerUtilization=128 (over capacity) and
  //     settlementBacklogThousands=22 are the real, measurable
  //     pressure-transfer damage. Fails acceptableCondition's
  //     util<=95/backlog<=6 bar decisively.
  //   ledger-fixed-partial-shift-unprotected
  //                                        divergence=0  bypass=0  lag=75  util=94   backlog=12  UNSAFE
  //     -- the real second step of the correct sequence: ledger
  //     authority fixed, traffic partially shifted, but settlement
  //     protection not yet applied. backlog=12 > 6 fails
  //     acceptableCondition.
  //   cached-rules-partial-protection      divergence=0  bypass=0  lag=70  util=92   backlog=11  UNSAFE
  //     -- correctness-safe, mandatory fraud check preserved via
  //     cached rules, partial traffic shift, but settlement protection
  //     not yet engaged. backlog=11 > 6 fails acceptableCondition.
  //   protected-shift-draining             divergence=0  bypass=0  lag=38  util=78   backlog=6   ACCEPTABLE
  //     -- correct sequencing (us-authoritative ledger, partial shift,
  //     settlement priority, high-risk throttle) applied, but
  //     catchUpWindowElapsed has not fired yet -- the REAL recovery-lag
  //     window. util<=95 and backlog<=6 are both satisfied: genuinely
  //     safe to hand back right now, but not yet the fully-drained
  //     state.
  //   protected-shift-with-event-deferral-draining
  //                                        divergence=0  bypass=0  lag=30  util=72   backlog=4   ACCEPTABLE
  //   paused-replication-protected-draining
  //                                        divergence=0  bypass=0  lag=15  util=75   backlog=5   ACCEPTABLE
  //   alternate-conservative-shift-draining
  //                                        divergence=0  bypass=0  lag=20  util=62   backlog=3   ACCEPTABLE
  //     -- the alternate strong path (70% kept local, optional
  //     enrichment skipped) draining, lower peak US pressure than the
  //     primary safe path, EU payment success lower in exchange.
  //   protected-shift-recovered           divergence=0  bypass=0  lag=4   util=58   backlog=0   OPTIMAL
  //     -- same control combination as protected-shift-draining, but
  //     catchUpWindowElapsed=true: a real, fixed amount of simulated
  //     time has now elapsed with write pressure held within safe
  //     bounds. lag<=5 and backlog=0 are both satisfied -- the fully
  //     recovered state.
  //   alternate-conservative-shift-recovered
  //                                        divergence=0  bypass=0  lag=2   util=48   backlog=0   OPTIMAL
  //     -- the alternate strong path's fully-drained state.
  //
  // Both a genuine ACCEPTABLE tier (correct sequencing applied, still
  // draining) and a genuine OPTIMAL tier (same sequencing, fully
  // drained after the real elapsed catch-up window) are reachable, so
  // this scenario authors BOTH successCondition and
  // acceptableCondition -- unlike Network Partition/Distributed
  // Coordination Failure, where every non-optimal state was judged
  // either equally safe-right-now (no looser tier needed) or carried an
  // ongoing correctness violation (no safe-but-imperfect tier exists).
  // Here, "correctness is safe AND capacity is draining but bounded" is
  // a real, distinct, legitimately-handoff-safe intermediate state that
  // the fully-drained OPTIMAL tier does not yet reach.
  //
  // Decision: candidate_declared. Whether the system currently reads
  // "safe" depends on which of several correctness-safe-looking states
  // the candidate is in -- draining-but-bounded (acceptable),
  // fully-recovered (optimal), or still-overloaded
  // (us-ledger-overloaded, unsafe) -- and distinguishing "this dashboard
  // looks calm because pressure was genuinely relieved" from "this
  // dashboard looks calm because availability metrics don't capture
  // ledger/settlement capacity at all" is exactly the judgment this
  // scenario exists to test. Automatic failure remains fully automatic
  // regardless of mode (divergentLedgerAuthorityCount >= 25 sustained
  // 60s), per evaluateCandidateDeclaredFinish.
  //
  // Immediate-Finish audit (phase6dsupport.md section 11): at t=0,
  // before EU_DEPENDENCY_DEGRADED_MS fires, state sits at
  // incidentState="healthy" with every correctness field already at
  // its safe value (divergentLedgerAuthorityCount=0,
  // fraudControlBypassCount=0, ledgerReplicationLagSeconds=0,
  // settlementBacklogThousands=0) -- this trivially satisfies
  // successCondition's authored fields. However
  // incidentStartedAtMs stays null until the first timed event sets a
  // trigger (T=30s), and evaluateStateConditions requires
  // incidentStartedAtMs !== null before meetsSuccess can ever become
  // true (tick.ts) -- so Finish is moot before T=30s. The moment
  // EU_DEPENDENCY_DEGRADED_MS fires, the matched rule becomes
  // "eu-degraded-only" (ledgerReplicationLagSeconds=0,
  // settlementBacklogThousands=0 -- still technically satisfying the
  // two capacity fields) but successCondition's sustainedSeconds=30
  // means a zero-action candidate who clicks Finish immediately after
  // T=30s has NOT sustained the condition for 30 continuous seconds yet
  // (the sustain window only starts accruing once the condition first
  // becomes true, which is the same instant the rule flips). A
  // zero-action candidate who waits past T=30s+30s=T=60s, before
  // REPLICATION_LAG_ONSET_MS (T=45s) would have already flipped the
  // active rule to "baseline-unmitigated" at T=45s (lag=22,
  // backlog=1), resetting the sustain window to zero. So a genuinely
  // zero-action Finish at any realistic point after the incident starts
  // lands on declared_unstable, never an accidental instant "resolved"
  // -- see the dedicated test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
