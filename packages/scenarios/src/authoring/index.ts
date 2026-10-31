export type {
  AuthoredDifficulty,
  AuthoredNodeType,
  AuthoredComparisonOperator,
  AuthoredMetricFormat,
  AuthoredScoringDimension,
  AuthoredBasics,
  AuthoredArchitectureNode,
  AuthoredArchitectureEdge,
  AuthoredArchitecture,
  AuthoredControlType,
  AuthoredControlValue,
  AuthoredControl,
  AuthoredStateValue,
  AuthoredInitialState,
  AuthoredMetric,
  AuthoredTimelineEvent,
  AuthoredRuleConditionOperator,
  AuthoredTriggerCondition,
  AuthoredControlCondition,
  AuthoredRuleCondition,
  AuthoredRule,
  AuthoredStateCondition,
  AuthoredOutcomeCondition,
  AuthoredScoringBand,
  AuthoredScoringMeasure,
  AuthoredScoringPenalty,
  AuthoredNaturalRecoveryCondition,
  AuthoredScoringDimensionConfig,
  AuthoredScoringConfig,
  AuthoredSeverityField,
  AuthoredNumericWatchField,
  AuthoredRevenueLossRatePerMinute,
  AuthoredInfrastructureCost,
  AuthoredImpactConfig,
  AuthoredActionClassification,
  AuthoredSimulationEventType,
  AuthoredScenario,
} from "./schema";

export type {
  AuthoredScenarioValidationError,
} from "./errors";
export { AuthoredScenarioValidationException } from "./errors";

export {
  validateAuthoredScenario,
  validateScoringDimension,
  SCORE_MAX_BY_DIMENSION,
  SCORING_DIMENSIONS,
} from "./validate";
export { compileAuthoredScenario } from "./compile";
export type { CompileAuthoredScenarioResult } from "./compile";
export { scoreAuthoredAttempt } from "./score";
export type { AuthoredScoreResult } from "./score";
export { authoredScenarioToCandidateUI } from "./candidate-ui";
