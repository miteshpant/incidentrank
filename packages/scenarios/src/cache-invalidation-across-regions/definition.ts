import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cacheInvalidationAcrossRegionsRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cacheInvalidationAcrossRegionsSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "usFreshnessStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "US Cache is now serving reads past the authored freshness bound.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "US Cache freshness has recovered.",
      },
    },
    {
      key: "euInvalidationStormStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "EU Cache is actively re-evicting healthy keys due to duplicated invalidation delivery.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "EU Cache's revalidation storm has stopped.",
      },
    },
    {
      key: "originStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Origin Store has entered a critical overload state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Origin Store has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "staleServesPastFreshnessBoundCount",
      trackPeak: true,
      threshold: {
        value: 300,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Stale serves past the freshness bound have crossed 300.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Stale serves past the freshness bound have dropped back below 300.",
      },
    },
    {
      key: "originRequestsPerSec",
      trackPeak: true,
    },
    {
      key: "euRevalidationStormRatePerMin",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: cacheInvalidationAcrossRegionsRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d3.md section 10, same rigor as
  // distributed-coordination-failure/definition.ts) ───────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (usFreshnessStatus / euInvalidationStormStatus /
  // apacFreshnessStatus / originStatus / invalidationSystemStatus /
  // staleServesPastFreshnessBoundCount):
  //
  //   baseline-desync                           UNSAFE  critical/critical/normal/warning /multi-region-degraded /  60
  //   eu-storm-contagion-unisolated              UNSAFE  critical/critical/warning/critical/multi-region-degraded/420
  //   global-bypass-origin-overload               UNSAFE  normal/normal/normal/critical  /global-bypass-overload /180
  //   global-bypass-origin-overload-sustained     UNSAFE  normal/normal/normal/critical  /global-bypass-overload /620
  //   global-bypass-refresh-concurrency-amp.      UNSAFE  normal/normal/normal/critical  /global-bypass-overload /180
  //   us-targeted-bypass-eu-storming                UNSAFE  normal/critical/normal/warning /targeted-partial       / 60
  //   us-targeted-bypass-eu-storming-sustained      UNSAFE  normal/critical/normal/warning /targeted-partial       /420
  //   eu-targeted-dedup-us-stale                    UNSAFE  critical/normal/normal/normal  /targeted-partial       / 70
  //   origin-capacity-only-partial-relief          UNSAFE  critical/critical/normal/warning/multi-region-degraded / 60
  //   high-refresh-concurrency-amplifies-storm     UNSAFE  critical/critical/normal/critical/multi-region-degraded/180
  //   long-ttl-worsens-staleness-bound             UNSAFE  critical/critical/normal/warning/multi-region-degraded /260
  //   recovery-just-engaged                        UNSAFE  normal/normal/normal/warning   /targeted-partial       /180
  //   recovery-window1-draining                    UNSAFE  normal/normal/normal/warning   /targeted-partial       /180
  //   recovery-window2-near-recovered              UNSAFE  normal/normal/normal/normal    /targeted-partial       /180  (originStatus normal but invalidationSystemStatus not yet "fully-recovered" — the explicit-tag gate)
  //   bounded-acceptable-swr                      ACCEPTABLE warning/normal/normal/normal /bounded-acceptable     / 70
  //   fully-recovered                              OPTIMAL  normal/normal/normal/normal   /fully-recovered        /180
  //   fully-recovered-via-swr                      OPTIMAL  normal/normal/normal/normal   /fully-recovered        / 70
  //
  // Every UNSAFE state leaves at least one real, currently-active
  // freshness/correctness/capacity problem: either US is still serving
  // reads past its freshness bound (usFreshnessStatus critical), EU is
  // still actively re-evicting healthy keys (euInvalidationStormStatus
  // critical), Origin is under real pressure (originStatus warning/
  // critical), or — in recovery-window2-near-recovered's case — every
  // individual metric happens to read "normal" at that instant but
  // invalidationSystemStatus explicitly still reads "targeted-partial"
  // rather than "fully-recovered", because the full recovery window
  // has not yet elapsed and the state is not yet proven durable. This
  // is the same "do not let a momentarily-quiet state masquerade as
  // genuinely stable" discipline distributed-coordination-failure's
  // reconciled-unfenced-residual-duplication state applies.
  //
  // bounded-acceptable-swr is the one genuine ACCEPTABLE tier: US is
  // explicitly bounded-stale (never unbounded/critical), EU's storm has
  // genuinely stopped, Origin is protected, and
  // invalidationSystemStatus explicitly tags it "bounded-acceptable" —
  // a deliberate, defensible, SAFE tradeoff per phase6d3.md's explicit
  // encouragement of "one region may legitimately keep serving bounded
  // stale data while invalidation catches up elsewhere," not a failure
  // state to be eliminated. It scores below OPTIMAL (see scoring.ts)
  // but is genuinely Finish-eligible.
  //
  // fully-recovered / fully-recovered-via-swr are the two OPTIMAL
  // routes: both regional problems genuinely fixed, isolation engaged,
  // Origin fully settled, AND the full recovery window elapsed (never
  // reachable instantly — recovery lag is real).
  //
  // Because a genuine, defensible ACCEPTABLE tier exists (unlike
  // distributed-coordination-failure, which authors none) AND reaching
  // either tier depends on whether the whole system is currently safe
  // enough to hand back rather than on an objective single-condition
  // trigger (the candidate must judge "is US's bounded staleness an
  // acceptable tradeoff for THIS data class, right now" — business
  // invariant #2's "may be acceptable," not "is always acceptable"),
  // this scenario is `candidate_declared`, with
  // completion.acceptableCondition wired to bounded-acceptable-swr's
  // exact gate.
  completion: { mode: "candidate_declared", acceptableCondition },
};
