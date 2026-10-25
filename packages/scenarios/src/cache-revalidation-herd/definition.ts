import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cacheRevalidationHerdRules } from "./rules";
import { failureCondition, infrastructureCost, revenueLossRatePerMinute, successCondition } from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  TTL_JITTER_ENABLED_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  API_INSTANCE_COUNT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cacheRevalidationHerdSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "originStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Origin has entered a critical overload state under the refresh herd.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Origin has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "originQps",
      trackPeak: true,
      threshold: {
        value: 3_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Origin QPS has crossed 3,000 — far above steady-state.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Origin QPS has dropped back below 3,000.",
      },
    },
    { key: "concurrentRefreshes", trackPeak: true },
    { key: "refreshFailureRatePct", trackPeak: true },
  ],
  timedEvents,
  rules: cacheRevalidationHerdRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   healthy / expiry-approaching (pre-incident/precursor)  n/a — before
  //                                           incidentStartedAtMs is set
  //   herding (baseline, no action)            UNSAFE   originQps=5400,
  //                                             critical, recurring
  //   scaled-herd (API instances raised)        UNSAFE   originQps=9600,
  //                                             critical, WORSE than
  //                                             baseline
  //   retry-amplified (short backoff)           UNSAFE   originQps=6400,
  //                                             critical, WORSE than
  //                                             baseline
  //   herd-retry-amplifying (second wave)       UNSAFE   originQps=7200,
  //                                             critical
  //   concurrency-masked (concurrency limit     UNSAFE   originQps=3100,
  //     raised alone, no coalescing/jitter/SWR)          warning,
  //                                             refreshFailureRatePct=8,
  //                                             will recur next expiry
  //   jittered (TTL jitter)                     OPTIMAL  originQps=90,
  //                                             normal, revalidationMode
  //                                             = "jittered"
  //   coalesced (single-flight coalescing)      OPTIMAL  originQps=95,
  //                                             normal, revalidationMode
  //                                             = "coalesced"
  //   stale-served (stale-while-revalidate)     OPTIMAL  originQps=85,
  //                                             normal, revalidationMode
  //                                             = "stale-served"
  //
  // Unlike Missing Database Index (which has a genuine "feature removed,
  // not fixed" tier that is honestly safe to hand back despite being
  // non-optimal), every state this scenario reaches that is NOT fully
  // safe is also NOT durably stable — concurrency-masked still sits at
  // originQps=3100 (far above the ~90-95 steady-state every optimal path
  // reaches) with origin in "warning" and a measurable refresh failure
  // rate, and the underlying per-instance racing that caused it is
  // untouched: the exact same herd will recur at the next synchronized
  // expiry with no jitter/coalescing/SWR in place. That is "ineffective
  // mitigation," not "safe enough to hand back" — section 10's standard
  // explicitly excludes it. No state in this rule table qualifies for an
  // acceptableCondition tier.
  //
  // Decision: this scenario's three genuinely safe states are all
  // equally durable (none sacrifices a feature, none accepts a named
  // operational cost the way Missing Database Index's endpoint-disabled
  // tier does — stale-while-revalidate's "briefly stale reads" tradeoff
  // is itself part of reaching the SAME successCondition bar, not a
  // separate lower bar), so there is no genuine second tier to add.
  // "Has origin's QPS/failure rate/status objectively recovered" is a
  // real, objective, observable recovery condition — not a judgment call
  // about whether a non-optimal state is safe enough to accept. This
  // scenario is therefore automatic, not candidate_declared.
  //
  // (No completion field set below — omitting it defaults to
  // { mode: "automatic" }, per ScenarioSimulationDefinition's doc
  // comment.)
};
