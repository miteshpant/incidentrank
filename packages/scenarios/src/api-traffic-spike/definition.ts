import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { apiTrafficSpikeRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  DB_PROTECTION_MODE_KEY,
  CACHE_BEHAVIOR_KEY,
  REQUEST_QUEUE_MODE_KEY,
  RATE_LIMIT_MODE_KEY,
  NON_CRITICAL_ENDPOINT_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const apiTrafficSpikeSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "dbStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The database has entered a critical connection-pressure state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The database has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dbConnectionUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "DB connection utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "DB connection utilization has dropped back below 90%.",
      },
    },
    {
      key: "cacheHitRatePct",
      trackPeak: false,
    },
    {
      key: "requestQueueDepth",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: apiTrafficSpikeRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md sections 8-10) ──────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   traffic-spiking (baseline)                 UNSAFE      dbConnUtil=82, warning
  //   pool-saturated (second wave, no fix)        UNSAFE      dbConnUtil=99, critical
  //   scaled-contention (API scaled, harmful)      UNSAFE      dbConnUtil=99, critical
  //   pool-widened-contention (harmful)            UNSAFE      dbConnUtil=97, critical
  //   queue-bounded-partial (partial)              UNSAFE      dbConnUtil=86, warning
  //   db-protected-cache-cold                      ACCEPTABLE  dbConnUtil=58, warning->
  //                                                 not critical; trafficSpikeHealth
  //                                                 stays "unresolved" (DB shielded,
  //                                                 cache never fixed)
  //   rate-limited                                 ACCEPTABLE  dbConnUtil=30, normal;
  //                                                 legitimate traffic throttled
  //   endpoint-disabled                            ACCEPTABLE  dbConnUtil=28, normal;
  //                                                 trafficSpikeHealth =
  //                                                 "feature-disabled"
  //   recovered-protected (both fixes)             OPTIMAL     dbConnUtil=22, normal;
  //                                                 trafficSpikeHealth = "protected"
  //   recovered-cache-fixed (cache fix alone)       OPTIMAL     dbConnUtil=26, normal;
  //                                                 trafficSpikeHealth = "protected"
  //
  // Three states reach genuine, sustained-safe stability through visibly
  // different means than the two real root fixes (DB protected while the
  // cache stays cold, legitimate traffic throttled, or a feature
  // disabled), so this is a legitimate candidate for an acceptableCondition
  // tier per section 10's standard: each is a deliberate, bounded tradeoff
  // — not "almost fixed" or "partial credit" — the system genuinely is
  // safe to hand back, just not via the fullest recovery. The remaining
  // states (baseline, bounded-queue partial relief, either harmful
  // scaling path) are real but never cross either bar — dbConnUtil stays
  // above 60% and/or dbStatus stays critical — so they are correctly
  // left ineligible for Finish, not awarded a third tier.
  //
  // Decision: candidate_declared, with acceptableCondition covering the
  // three load-shedding tradeoff states. "Has DB connection utilization
  // happened to drop below 60%" is not, by itself, proof the system is
  // safe to hand back in the fullest sense — the candidate must judge
  // whether the recovery came from actually protecting the database (or
  // fixing the cache) versus shedding legitimate load/features, which is
  // exactly the "is this safe enough to hand back, and how durable is it"
  // judgment candidate_declared exists to test.
  //
  // ── Immediate-Finish audit (phase6c.md section 9) ──────────────────
  // At t=0 the incident has not started (trafficSpiking trigger unset);
  // the matched rule is healthy-default, whose values trivially satisfy
  // BOTH successCondition and acceptableCondition (dbConnUtil=18,
  // dbStatus=normal, trafficSpikeHealth="unresolved" is not "protected").
  // Left unguarded, an immediate zero-action Finish before the spike even
  // begins would resolve as "acceptable" for free. The incident has not
  // happened yet at that point, so this is not a legitimate observation
  // strategy — it is simply Finishing before there was anything to
  // observe. Both conditions' 30-second sustainedSeconds window (chosen
  // from this scenario's own timing scale: the spike begins at T=30s, and
  // 30s is long enough that a zero-action click at T=0 cannot possibly
  // satisfy it, since the attempt would have to sit in a sustained-true
  // state for 30 real seconds first) closes this: a candidate who clicks
  // Finish at T=0 has accrued 0 consecutive seconds in either bucket and
  // is correctly declared_unstable. Waiting out a genuinely stable
  // healthy system for 30s before the spike even starts (an edge case no
  // real candidate would do, since the incident briefing describes an
  // active spike) is the only way to reach this early, and it still
  // requires real elapsed time with the condition actually holding —
  // never a free click.
  completion: { mode: "candidate_declared", acceptableCondition },
};
