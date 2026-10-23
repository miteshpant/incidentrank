import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { missingDatabaseIndexRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  TARGETED_INDEX_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const missingDatabaseIndexSimulation: ScenarioSimulationDefinition = {
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
        enteringMessage: "The primary database has entered a critical CPU/contention state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The primary database has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "dbCpuUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "DB CPU utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "DB CPU utilization has dropped back below 90%.",
      },
    },
    {
      key: "scannedRowsPerQuery",
      trackPeak: true,
    },
    {
      key: "requestQueueDepth",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: missingDatabaseIndexRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   full-table-scan (baseline)              UNSAFE   dbCpu=88, critical
  //   scaled-contention (API scaled, harmful)  UNSAFE   dbCpu=98, critical
  //   pool-widened-contention (harmful)        UNSAFE   dbCpu=99, critical
  //   pool-saturated (second wave, no fix)     UNSAFE   dbCpu=95, critical
  //   page-size-reduced (partial)              UNSAFE   dbCpu=62, warning
  //   cache-warming (partial)                  UNSAFE   dbCpu=58, warning
  //   endpoint-disabled                        ACCEPTABLE  dbCpu=14, normal,
  //                                             but orderHistoryQueryHealth
  //                                             = "feature-disabled" — the
  //                                             feature was removed, not
  //                                             fixed.
  //   recovered-indexed                        OPTIMAL  dbCpu=18, normal,
  //                                             orderHistoryQueryHealth =
  //                                             "indexed" — the real
  //                                             database-side correction.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (fix vs. feature removal), so this is a legitimate
  // candidate for an acceptableCondition tier per section 9's standard
  // ("optional enrichment disabled while core customer path is
  // healthy" generalizes directly to "a non-critical feature disabled
  // while the rest of the platform is healthy"). The remaining states
  // (page-size reduction, cache warm-up, either harmful scaling path)
  // are real but incomplete mitigations that never cross either bar —
  // they are correctly left ineligible for Finish, not awarded a third
  // tier, per section 9's explicit "not almost passed, not partial
  // credit" rule.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // endpoint-disabled state. "Has DB CPU happened to drop below 30%" is
  // not, by itself, proof the system is safe to hand back — the
  // candidate must judge whether the drop came from a real fix or a
  // feature sacrifice, which is exactly the "is this safe enough to
  // hand back" judgment candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
