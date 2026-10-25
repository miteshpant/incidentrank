import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_INSTANCE_COUNT_KEY, PAYLOAD_SIZE_LIMIT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "memory-exhausted": 900,
  "payload-bloated": 560,
  "scaled-no-payload-relief": 540,
  "response-cache-partial": 480,
  "compressed-bandwidth-relief": 260,
  "payload-truncated": 320,
  "recovered-paginated": 0,
  "recovered-projected": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 420,
  perUnitMonthlyUsd: {
    [`${API_INSTANCE_COUNT_KEY}:4`]: 0,
    [`${API_INSTANCE_COUNT_KEY}:8`]: 240,
    [`${API_INSTANCE_COUNT_KEY}:16`]: 560,
    [`${API_INSTANCE_COUNT_KEY}:32`]: 1_180,
    [`${PAYLOAD_SIZE_LIMIT_KEY}:unlimited`]: 0,
    [`${PAYLOAD_SIZE_LIMIT_KEY}:512kb`]: 0,
    [`${PAYLOAD_SIZE_LIMIT_KEY}:128kb`]: 0,
  },
};

/**
 * Full recovery: the response shape itself was actually fixed
 * (payloadShapeHealth === "shape-fixed") — either via response
 * projection or a small page size — and every customer-facing metric is
 * healthy. Gating on payloadShapeHealth rather than only the numeric
 * metrics is deliberate: a tightened payload size limit also drives
 * memory/network/latency down, but that is truncation (see
 * acceptableCondition note in definition.ts's audit — ultimately NOT
 * treated as acceptable, see that audit), not a real fix.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "apiMemoryUtilization", operator: "less_than_or_equal", comparedTo: 35 },
    { key: "apiStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "payloadShapeHealth", operator: "equals", comparedTo: "shape-fixed" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "apiMemoryUtilization", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 60,
};
