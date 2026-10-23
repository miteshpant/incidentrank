import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { cacheNodeFailureRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_NODE_COUNT_KEY,
  FAILOVER_MODE_KEY,
  DB_REQUEST_PROTECTION_KEY,
  CACHE_WARMING_MODE_KEY,
  APPLICATION_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const cacheNodeFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "cacheStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The cache layer has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The cache layer has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dbReadsPerSecond",
      trackPeak: true,
      threshold: {
        value: 1_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Database read rate has crossed 1,000 reads/sec.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Database read rate has dropped back below 1,000 reads/sec.",
      },
    },
    {
      key: "cacheNodeLoadPercent",
      trackPeak: true,
    },
    {
      key: "evictionRatePerMinute",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: cacheNodeFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Completion-mode audit (per docs/implementation_plan/phase6b.md
  // section 8):
  //
  // UNSAFE states — node-down-unmitigated (baseline, no mitigation),
  // rate-limited-without-capacity-masking (database survives but hit
  // rate and API latency stay degraded — this is the scenario's
  // documented masking trap, explicitly NOT a safe handback state per
  // section 9's standard: it is a partial mitigation that looks
  // survivable on one metric while leaving the real capacity gap
  // unaddressed), warming-induced-db-spike / db-overload-amplified /
  // compounded-db-overload-critical (all cross the failure threshold
  // given sustained time).
  //
  // OPTIMAL states — capacity-restored-with-db-protection-recovery
  // (replace the lost node's capacity) and
  // origin-fallback-with-coalescing-recovery (deliberately fall back to
  // origin, protected by request coalescing) — two independently
  // legitimate strategies, both fully meeting successCondition with no
  // caveat or tradeoff attached.
  //
  // No ACCEPTABLE tier: the only candidate for one — rate-limited
  // protection without replacing capacity — is precisely the masking
  // trap this scenario is designed to penalize, not a genuinely safe
  // partial state (per section 9, "partial mitigation deserves credit"
  // is explicitly excluded). There is no state that is safe-but-
  // imperfect; every reachable state is either fully recovered or still
  // carrying a real, unaddressed capacity/pressure problem.
  //
  // Mode: automatic. Both good paths restore an objective, unambiguous
  // recovery signal (hit rate back up, database read rate back to
  // baseline, status out of critical) with no hidden caveat that would
  // make "the metrics look fine" different from "it's actually safe" —
  // unlike scenarios with a genuine safe-but-imperfect tier, there is no
  // reason to require a candidate declaration here.
  completion: { mode: "automatic" },
};
