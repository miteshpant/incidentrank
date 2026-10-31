import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { corsMisconfigurationRules } from "./rules";
import {
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const corsMisconfigurationBlocksPartnersSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "corsPolicyStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "CORS policy status has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CORS policy status has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "partnerApiErrorRatePercent",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Partner API error rate has crossed 50%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Partner API error rate has dropped back below 50%.",
      },
    },
    { key: "partnerCorsPreflightRejectionRatePercent", trackPeak: true },
  ],
  timedEvents,
  rules: corsMisconfigurationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // Phase 6.1: candidate-declared completion — deliberately no
  // acceptableCondition. There is exactly one genuinely safe recovery
  // state (allowlisting the known partner origins) and no legitimate
  // safe-but-imperfect middle tier: the wildcard-open path is not a
  // bounded tradeoff, it is a security regression that must never be
  // handed back as acceptable. This scenario's candidate-declared value
  // is the wildcard trap itself — testing whether the candidate notices
  // the system is NOT actually safe to hand back even though every
  // traffic metric looks perfect.
  completion: { mode: "candidate_declared" },
};
