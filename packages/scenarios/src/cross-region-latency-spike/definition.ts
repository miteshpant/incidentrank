import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { crossRegionLatencySpikeRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  TRAFFIC_LOCALITY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  CROSS_REGION_DEPENDENCY_KEY,
  REGIONAL_FAILOVER_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const crossRegionLatencySpikeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "backboneStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The inter-region backbone has entered a critical latency state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The inter-region backbone has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "interRegionRttMs",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Inter-region RTT has crossed 300ms.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Inter-region RTT has dropped back below 300ms.",
      },
    },
    {
      key: "replicationLagMs",
      trackPeak: true,
    },
    {
      key: "usCustomerLatencyMs",
      trackPeak: true,
    },
    {
      key: "euCustomerLatencyMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: crossRegionLatencySpikeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   payment-consistency-relaxed (payment relaxed)         UNSAFE
  //     — paymentAuthConsistency="relaxed-unsafe". Every customer-
  //     facing latency metric reads healthy; the correctness gate
  //     fails anyway. Must never satisfy success or acceptable.
  //   sustained-degraded-no-relaxation (second wave, no
  //     relaxation of general traffic)                       UNSAFE
  //     — backboneStatus="critical", latency 720/740ms. The backbone
  //     issue has visibly failed to clear on its own.
  //   always-global-amplified (locality=alwaysGlobal)         UNSAFE
  //     — backboneStatus="critical", latency 610/640ms. Strictly
  //     worse than doing nothing.
  //   failover-adds-rtt (regionalFailover=true)               UNSAFE
  //     — backboneStatus="critical", one region's latency pushed to
  //     610ms by the added hop.
  //   general-traffic-relaxed (general traffic relaxed,
  //     payment untouched)                                    OPTIMAL
  //     — usLat=110, euLat=120, backboneStatus="warning",
  //     paymentAuthConsistency="strong". Satisfies successCondition.
  //   fully-synchronous-degraded (patient, nothing relaxed,
  //     before the sustained second wave fires)                ACCEPTABLE
  //     — usLat=540, euLat=560, backboneStatus="warning" (the
  //     backbone issue itself is real, but this state does not yet
  //     reflect a confirmed-unresolved second wave),
  //     paymentAuthConsistency="strong". Fails successCondition's
  //     150ms bar but satisfies acceptableCondition's 600ms bar —
  //     genuinely safe, just slower, exactly the "patient /
  //     correctness-maximal" strategy phase6b.md section 40 requires
  //     to remain a legitimate, scoreable choice rather than a trap.
  //
  // Two independently legitimate strategies reach genuinely safe
  // states (general-traffic-relaxed = optimal/fast,
  // fully-synchronous-degraded = acceptable/patient) with materially
  // different dimension profiles (recovery time, revenue loss,
  // replication-lag exposure) — this is the section 40 requirement in
  // concrete form, not a tie manufactured for its own sake. Relaxing
  // payment auth specifically is the one state excluded from both
  // tiers regardless of how healthy availability reads, per the
  // scenario's explicit business constraint. The patient path does
  // NOT stay acceptable indefinitely: once the backbone issue is
  // confirmed not to be clearing on its own (the sustained second
  // wave, with its own observable precursor — syncWriteLatencyMs and
  // both regions' customer latency already elevated since the
  // incident began), the unmitigated patient state is reclassified
  // UNSAFE (sustained-degraded-no-relaxation) — patience was a
  // legitimate SHORT-TERM judgment, not a standing exemption from
  // eventually acting.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // fully-synchronous-degraded state. "Has regional latency happened
  // to read below some threshold" is not, by itself, proof of safety
  // — the candidate must judge whether payment auth is still
  // correctly synchronous, which is exactly the "is this safe enough
  // to hand back" judgment candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
