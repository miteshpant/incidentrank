import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { eventPlatformPartialOutageRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  TOPIC_A_PRIORITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const eventPlatformPartialOutageSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "consumerBStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Consumer Group B has entered a critical lag state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Consumer Group B has recovered out of critical lag.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "topicAEventsDroppedTotal",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Topic A has begun dropping durability-critical events.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Topic A is no longer dropping new events.",
      },
    },
    {
      key: "consumerBLagMessages",
      trackPeak: true,
      threshold: {
        value: 5_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Consumer Group B's lag has crossed 5,000 messages.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Consumer Group B's lag has dropped back below 5,000 messages.",
      },
    },
    {
      key: "downstreamHealthPct",
      trackPeak: false,
    },
    {
      key: "dlqBacklogCount",
      trackPeak: true,
    },
    {
      key: "topicBBacklogMessages",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: eventPlatformPartialOutageRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.2.md section 10, same rigor as
  // distributed-coordination-failure/definition.ts and
  // ledger-reconciliation-divergence/definition.ts) ───────────────────
  //
  // Reachable terminal/stable rule states, classified by their REAL
  // authored values (brokerPartitionHealth / topicADurabilityPct /
  // topicAEventsDroppedTotal / consumerBLagMessages / downstreamHealthPct
  // / platformStatus):
  //
  //   healthy-default                          N/A      100/100/0/200/100/normal (pre-incident)
  //   broker-degraded-only                      UNSAFE   65/100/0/200/98/degraded
  //   broker-and-consumer-b-active               UNSAFE   60/100/0/6500/95/degraded
  //   all-three-unmitigated                     UNSAFE   55/100/0/9200/35/critical
  //     -- baseline, nothing done. All three problems active, nothing
  //     touched.
  //   producer-backpressure-masked (MASKING, NOT FIXING)
  //                                              UNSAFE   68/100/0/9200/35/critical
  //     -- producer backpressure enabled: brokerPartitionHealth (68 vs.
  //     55) and topicBBacklogMessages (7,400 vs. 11,000) read
  //     measurably calmer than doing nothing, since throttling
  //     ingestion at the Event Gateway genuinely reduces load reaching
  //     the degraded broker partition class. But Consumer Group B's
  //     own processing lag and Consumer Group C's retry storm against
  //     the downstream are completely untouched by a producer-side
  //     lever -- consumerBLagMessages, consumerCRetryRatePerMinute, and
  //     downstreamHealthPct are identical to the unmitigated baseline.
  //     platformStatus stays "critical": two of the three independent
  //     root causes remain fully unaddressed, so a calmer-looking
  //     broker dashboard never earns acceptable/optimal on its own.
  //   topic-a-contaminated-active (THE HISTORICAL-DAMAGE TRAP, ACTIVE)
  //                                              UNSAFE   20/62/340/9800/18/critical
  //     -- unisolated + large batch + Consumer C still aggressive, past
  //     the exposure window. Topic A is actively losing durability
  //     RIGHT NOW. Never satisfiable.
  //   topic-a-scarred-live-safe (THE HISTORICAL-DAMAGE TRAP, SCARRED)
  //                                              UNSAFE   80/100/340/9000/25/critical
  //     -- isolation/batch size corrected AFTER the exposure window
  //     closed with the unsafe combination in effect. Live durability
  //     reads 100 (no new drops), but topicAEventsDroppedTotal is still
  //     340 -- the exact figure reached while contamination was
  //     active, carried forward unchanged. THIS is the proof that
  //     fixing the live configuration does not retroactively undo
  //     historical damage -- see the dedicated test. A nonzero
  //     historical-damage count on the durability-critical topic can
  //     NEVER be classified acceptable/optimal, regardless of how
  //     healthy every other metric reads.
  //   pressure-transferred-downstream (THE CENTRAL PRESSURE-TRANSFER
  //   TRAP)                                     UNSAFE   55/100/0/220/14/critical
  //     -- Consumer Group B naively scaled to 16 while Consumer Group
  //     C is still aggressive. consumerBLagMessages genuinely looks
  //     great (220) but downstreamHealthPct (14) is WORSE than doing
  //     nothing at all (35 in all-three-unmitigated) -- two consumer
  //     groups now contend for the same unprotected downstream
  //     capacity.
  //   bounded-retries-events-discarded          UNSAFE   55/100/0/9000/68/critical
  //     -- Consumer Group C's retries bounded (good) but DLQ disabled,
  //     so genuinely-exhausted events are discarded rather than
  //     durably preserved -- "dropping events merely to reduce lag is
  //     not acceptable" applied to Group C specifically.
  //   broker-and-consumer-b-outstanding          UNSAFE   55/100/0/9000/70/degraded
  //     -- downstream circuit breaker + retry fix engaged (Group C's
  //     problem genuinely resolving) but broker isolation and Group B
  //     concurrency both untouched -- those two problems remain exactly
  //     as bad as baseline.
  //   consumer-b-outstanding                    UNSAFE   90/100/0/8600/80/degraded
  //     -- broker isolated/batched AND Group C's retry mode fixed, but
  //     Group B's concurrency never raised enough -- Topic A safe,
  //     downstream protected, Group B's own independent root cause
  //     still unaddressed.
  //   all-mitigated-draining                    ACCEPTABLE 78/100/0/1100/72/degraded
  //     -- all three fixes correctly applied (isolated, bounded batch,
  //     Group B concurrency >= 8, Group C off "aggressive"), but the
  //     real elapsed recovery windows have not all fired yet. New
  //     damage has genuinely stopped; backlog/lag/downstream pressure
  //     are bounded and draining, not fully recovered.
  //   all-mitigated-recovered                   OPTIMAL  100/100/0/40/98/normal
  //     -- same correct combination, AND every real elapsed recovery
  //     window (broker, Group B drain, downstream) has fired. Fully
  //     recovered.
  //
  // Every UNSAFE state has either (a) an active correctness violation
  // (Topic A actively dropping, or events discarded via a disabled
  // DLQ), (b) a historical correctness violation carried forward
  // (topic-a-scarred-live-safe's nonzero topicAEventsDroppedTotal), (c)
  // a pressure-transfer violation worse than doing nothing
  // (pressure-transferred-downstream), or (d) one or more of the three
  // independent root causes left completely unaddressed. None is
  // "almost fixed" by coincidence of rounding -- each fails a real,
  // named gate matching successCondition/acceptableCondition's authored
  // thresholds in revenue-and-cost.ts.
  //
  // ACCEPTABLE requires: brokerPartitionHealth >= 70 AND
  // topicADurabilityPct >= 99 AND consumerBLagMessages <= 1,500 AND
  // downstreamHealthPct >= 60 -- genuinely bounded and draining on every
  // one of the three independent subsystems, with Topic A never
  // contaminated. OPTIMAL additionally requires brokerPartitionHealth
  // >= 95, consumerBLagMessages <= 100, and downstreamHealthPct >= 90 --
  // the fully-drained state, only reachable after every real elapsed
  // recovery window.
  //
  // Decision: candidate_declared. Whether the system currently reads
  // "safe" depends on which of several plausible-looking states the
  // candidate is in -- draining-but-bounded (acceptable), fully-
  // recovered (optimal), scarred-but-live-safe (unsafe despite looking
  // calm), or pressure-transferred (unsafe despite a great-looking
  // consumer-lag number) -- and distinguishing "this dashboard looks
  // calm because every subsystem was genuinely protected" from "this
  // dashboard looks calm because the metric candidates naturally watch
  // doesn't capture the one that matters" is exactly the judgment this
  // scenario exists to test. Automatic failure remains fully automatic
  // regardless of mode (topicADurabilityPct <= 50 sustained 45s), per
  // evaluateCandidateDeclaredFinish.
  //
  // Immediate-Finish audit (mandatory, phase6d.2.md's standing rule):
  // at t=0, before BROKER_PARTITION_DEGRADED_MS fires (T=20s),
  // incidentStartedAtMs stays null, so meetsSuccess/meetsAcceptable can
  // never evaluate true (tick.ts's `incidentStartedAtMs !== null` guard)
  // -- Finish is moot before T=20s regardless of the authored
  // thresholds. Once the broker-degraded-only rule becomes active at
  // T=20s, successCondition already fails outright
  // (consumerBLagMessages=200 <= 100? false) and acceptableCondition
  // also fails outright (downstreamHealthPct=98 >= 60 true,
  // brokerPartitionHealth=65 >= 70? false) -- so even the very first
  // possible evaluation after incident start does not qualify. A
  // zero-action candidate who Finishes at any point past T=20s
  // continues to fail both conditions as the state worsens through
  // broker-and-consumer-b-active (T=25s) and all-three-unmitigated
  // (T=30s onward) -- declared_unstable is the only reachable outcome
  // for a genuinely zero-action Finish, confirmed by the dedicated test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
