import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  blocked: 500,
  "security-regressed": 0,
  recovering: 0,
  healthy: 0,
};

// This scenario introduces no new infrastructure spend — every remediation
// is a configuration/policy change, not a capacity change — so cost is
// flat at baseline for every control value. costEfficiency's banding
// still applies generically; it simply always lands in the top band.
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 150,
  perUnitMonthlyUsd: {},
};

/**
 * The success condition can only read numeric/string state values — it
 * has no way to tell "the error rate dropped because we fixed CORS
 * correctly" apart from "the error rate dropped because we reopened the
 * API to the entire internet" using the error-rate metrics alone. That
 * distinction is carried by `corsPolicyStatus`, an explicit severity
 * field the wildcard-overcorrection rule sets to "critical" specifically
 * so this successCondition can never be satisfied that way — mirroring
 * how authentication-service-degradation's signature-verification-bypass
 * path is kept out of its own successCondition. A candidate who declares
 * Finish after setting wildcard-open is correctly refused a "resolved"
 * outcome even though every traffic metric looks perfect.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "partnerApiErrorRatePercent", operator: "less_than_or_equal", comparedTo: 5 },
    {
      key: "partnerCorsPreflightRejectionRatePercent",
      operator: "less_than_or_equal",
      comparedTo: 5,
    },
    { key: "corsPolicyStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "partnerApiErrorRatePercent", operator: "greater_than_or_equal", comparedTo: 90 },
  ],
  sustainedSeconds: 60,
};
