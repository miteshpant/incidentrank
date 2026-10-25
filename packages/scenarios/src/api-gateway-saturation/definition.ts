import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { apiGatewaySaturationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const apiGatewaySaturationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "gatewayStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The API gateway has entered a critical CPU/queueing state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The API gateway has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "gatewayCpuUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Gateway CPU utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Gateway CPU utilization has dropped back below 90%.",
      },
    },
    {
      key: "gatewayQueueDepth",
      trackPeak: true,
    },
    {
      key: "gatewayConnectionCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: apiGatewaySaturationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   gateway-saturating (baseline)              UNSAFE  cpu=94, critical
  //   connection-pool-exhausted (2nd wave)        UNSAFE  cpu=99, critical
  //   backend-scaled-no-relief (decoy, harmful)   UNSAFE  cpu=97, critical
  //   connection-reuse-partial                    UNSAFE  cpu=64, warning
  //   route-simplified-partial                    UNSAFE  cpu=58, warning
  //   gateway-scaled-partial                      UNSAFE  cpu=71, warning
  //   rate-limited-partial                        UNSAFE  cpu=55, warning
  //   auth-bypassed (trap)                        UNSAFE  cpu=19, normal,
  //                                                 but gatewaySaturationHealth
  //                                                 = "bypassed" — a required
  //                                                 security control was
  //                                                 removed, not a bounded
  //                                                 tradeoff. Numerically
  //                                                 clean but not safe to
  //                                                 hand back.
  //   lightweight-auth-recovery (alt. good path)  OPTIMAL cpu=26, normal,
  //                                                 gatewaySaturationHealth =
  //                                                 "fixed" — enforcement
  //                                                 stayed on; overhead was
  //                                                 genuinely removed via a
  //                                                 structurally different
  //                                                 mechanism (caching
  //                                                 introspection rather
  //                                                 than connection/routing
  //                                                 changes).
  //   gateway-fixed (connection reuse + simplified OPTIMAL cpu=22, normal,
  //    routing)                                    gatewaySaturationHealth =
  //                                                 "fixed".
  //
  // No ACCEPTABLE tier: every path that is not the real fix either (a)
  // stays numerically unhealthy (every partial-relief state above is
  // genuinely a "warning"/elevated-CPU state, not safe to hand back —
  // not "almost fixed," but actually still degraded), or (b) reaches
  // clean numbers only via the auth-bypass trap, which per section 10's
  // standard is excluded by definition: it is not a deliberate, bounded
  // tradeoff the business would accept, it is a stated correctness/
  // security requirement being violated. There is no state that is
  // genuinely, operationally safe to hand back while differing from the
  // optimal fix only in a legitimate, bounded way — so this scenario
  // intentionally has no acceptableCondition, per section 10's explicit
  // instruction not to invent a middle tier just because a partial path
  // exists.
  //
  // Decision: candidate_declared. "Did gateway CPU happen to drop below
  // 35%" is not, by itself, proof the system is safe to hand back — the
  // candidate must judge WHY it dropped (a real fix vs. a disabled
  // security control), which is exactly the judgment candidate_declared
  // exists to test. automatic would auto-resolve the instant the
  // numeric bar is crossed, which would silently reward the bypass trap
  // the moment its sustain window elapsed — exactly the failure mode
  // candidate_declared plus a string-gated successCondition prevents.
  //
  // ── Immediate-Finish audit (section 9) ─────────────────────────────
  // At t=0 (before the trafficGrowing trigger at 30s), gatewayCpuUtilization
  // (14) and gatewayStatus ("normal") both already satisfy
  // successCondition's numeric bars, but gatewaySaturationHealth starts
  // as "unresolved" (the initial value — see metrics.ts), never "fixed".
  // The successCondition's string-equality gate therefore fails from the
  // very first tick, independent of elapsed time, so an immediate
  // zero-action Finish is never eligible — not because of an added wait
  // requirement, but because "fixed" is never true until a genuine
  // mitigation rule actually sets it. See
  // api-gateway-saturation.test.ts's dedicated immediate-Finish test.
  completion: { mode: "candidate_declared" },
};
