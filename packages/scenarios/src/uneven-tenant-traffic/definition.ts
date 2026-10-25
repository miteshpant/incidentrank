import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { unevenTenantTrafficRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  PER_TENANT_QUOTA_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  CACHING_ENABLED_KEY,
  WORKLOAD_ROUTING_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const unevenTenantTrafficSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "sharedFleetStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The shared service fleet has entered a critical contention state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The shared service fleet has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "sharedDataLayerUtilizationPct",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Shared data layer utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Shared data layer utilization has dropped back below 90%.",
      },
    },
    {
      key: "otherTenantLatencyMs",
      trackPeak: true,
    },
    {
      key: "hotTenantQps",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: unevenTenantTrafficRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   hot-tenant-traffic (baseline)                UNSAFE   fleet
  //                                                 critical,
  //                                                 otherTenantLatencyMs
  //                                                 =260,
  //                                                 fairnessMode=
  //                                                 unresolved
  //   data-layer-saturated (second wave)            UNSAFE   fleet
  //                                                 critical,
  //                                                 otherTenantLatencyMs
  //                                                 =590
  //   fleet-scaled-trap (scaling alone, harmful)    UNSAFE   fleet
  //                                                 NORMAL but
  //                                                 otherTenantLatencyMs
  //                                                 =380 — the fleet
  //                                                 LOOKS healthy while
  //                                                 every other tenant
  //                                                 is still degraded;
  //                                                 fairnessMode=
  //                                                 scaled-only. This is
  //                                                 the scenario's
  //                                                 binding "scaling
  //                                                 cannot fix fairness"
  //                                                 trap, and it must
  //                                                 never satisfy
  //                                                 success/acceptable
  //                                                 despite looking
  //                                                 calm.
  //   hot-tenant-deprioritized (partial)            UNSAFE   fleet
  //                                                 warning,
  //                                                 otherTenantLatencyMs
  //                                                 =95
  //   caching-partial (partial)                     UNSAFE   fleet
  //                                                 warning,
  //                                                 otherTenantLatencyMs
  //                                                 =88
  //   moderate-quota-partial (partial)              UNSAFE   fleet
  //                                                 warning,
  //                                                 otherTenantLatencyMs
  //                                                 =72
  //   hot-tenant-isolated (dedicated capacity)      ACCEPTABLE  fleet
  //                                                 normal,
  //                                                 otherTenantLatencyMs
  //                                                 =40,
  //                                                 fairnessMode=
  //                                                 fair-share-restored,
  //                                                 throttledRequestRate
  //                                                 PerSec=0 — every
  //                                                 tenant protected and
  //                                                 the hot tenant's own
  //                                                 throughput untouched,
  //                                                 but paid for with
  //                                                 real, ongoing
  //                                                 infrastructure cost.
  //   hot-tenant-throttled (strict quota)           OPTIMAL  fleet
  //                                                 normal,
  //                                                 otherTenantLatencyMs
  //                                                 =41,
  //                                                 fairnessMode=
  //                                                 fair-share-restored,
  //                                                 throttledRequestRate
  //                                                 PerSec=3800 — the
  //                                                 direct fairness
  //                                                 lever, zero new
  //                                                 infrastructure cost,
  //                                                 real visible cost to
  //                                                 the hot tenant's own
  //                                                 throughput.
  //   hot-tenant-lane-capped (dedicated lane)       OPTIMAL  fleet
  //                                                 normal,
  //                                                 otherTenantLatencyMs
  //                                                 =42,
  //                                                 fairnessMode=
  //                                                 fair-share-restored,
  //                                                 throttledRequestRate
  //                                                 PerSec=3700 — same
  //                                                 tradeoff shape as
  //                                                 strict quota (caps
  //                                                 the hot tenant's own
  //                                                 share, zero new
  //                                                 infrastructure cost),
  //                                                 via a different
  //                                                 mechanism.
  //
  // Three states reach genuine, sustained-safe stability through two
  // distinctly different cost structures (throttle the hot tenant's own
  // throughput at zero new infra cost, vs. pay real ongoing
  // infrastructure cost to avoid throttling anyone) — this is a
  // legitimate candidate for an acceptableCondition tier per section
  // 10's standard: isolation is not "almost fixed" or "partial credit,"
  // it is a deliberately different, equally final tradeoff. The
  // remaining unsafe states are real but incomplete mitigations, or — in
  // fleet-scaled-trap's case — a mitigation that makes the fleet LOOK
  // healthy while leaving the actual fairness problem completely
  // unaddressed; none of them cross either bar, and none are awarded a
  // third tier, per section 10's explicit "not almost passed, not
  // partial credit" rule.
  //
  // Decision: candidate_declared, with acceptableCondition covering the
  // isolation tradeoff (throttledRequestRatePerSec === 0 while
  // fairnessMode === "fair-share-restored"). "Is the shared fleet's own
  // status normal" is not, by itself, proof the system is safe to hand
  // back — fleet-scaled-trap proves a healthy-looking fleet can coexist
  // with an entirely unaddressed fairness problem. The candidate must
  // judge whether every OTHER tenant's latency is actually back to a
  // fair baseline and whether that was bought by throttling the hot
  // tenant or by paying for dedicated capacity — exactly the "is this
  // safe enough to hand back" judgment candidate_declared exists to
  // test.
  //
  // Immediate-Finish audit: at t=0 (before the 30s trigger even fires),
  // otherTenantLatencyMs=40 already satisfies the <=50 numeric bar, but
  // tenantFairnessMode="unresolved" never equals "fair-share-restored"
  // and throttledRequestRatePerSec=0 fails the optimal tier's
  // greater-than-0 clause — so neither successCondition nor
  // acceptableCondition is satisfiable at t=0 regardless of elapsed
  // time, and zero-action immediate Finish can never resolve at any
  // point in the attempt. sustainedSeconds=30 additionally requires a
  // genuine fairness fix to hold for a real observation window (this
  // scenario's incident ticks at 1s resolution and its second wave is
  // 3 minutes out, so 30s is a meaningful fraction of the scenario's own
  // timescale, not an arbitrary pad) before Finish becomes eligible at
  // all.
  completion: { mode: "candidate_declared", acceptableCondition },
};
