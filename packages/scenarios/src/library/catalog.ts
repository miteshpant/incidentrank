import { paymentRetryStorm, paymentRetryStormScoring } from "../payment-retry-storm";
import { paymentRetryStormCandidateUI } from "../payment-retry-storm/candidate-ui";
import {
  dbConnectionSaturation,
  dbConnectionSaturationCandidateUI,
  DB_CONNECTION_SATURATION_SCORING,
} from "../db-connection-saturation";
import {
  kafkaConsumerLag,
  kafkaConsumerLagCandidateUI,
  KAFKA_CONSUMER_LAG_SCORING,
} from "../kafka-consumer-lag";
import {
  cacheStampede,
  cacheStampedeCandidateUI,
  CACHE_STAMPEDE_SCORING,
} from "../cache-stampede";
import {
  readReplicaLag,
  readReplicaLagCandidateUI,
  READ_REPLICA_LAG_SCORING,
} from "../read-replica-lag";
import {
  databaseLockContention,
  databaseLockContentionCandidateUI,
  DATABASE_LOCK_CONTENTION_SCORING,
} from "../database-lock-contention";
import {
  slowQueryRegression,
  slowQueryRegressionCandidateUI,
  SLOW_QUERY_REGRESSION_SCORING,
} from "../slow-query-regression";
import {
  poisonMessageLoop,
  poisonMessageLoopCandidateUI,
  POISON_MESSAGE_LOOP_SCORING,
} from "../poison-message-loop";
import {
  kafkaPartitionSkew,
  kafkaPartitionSkewCandidateUI,
  KAFKA_PARTITION_SKEW_SCORING,
} from "../kafka-partition-skew";
import {
  consumerRebalanceStorm,
  consumerRebalanceStormCandidateUI,
  CONSUMER_REBALANCE_STORM_SCORING,
} from "../consumer-rebalance-storm";
import {
  downstreamDependencyFailure,
  downstreamDependencyFailureCandidateUI,
  DOWNSTREAM_DEPENDENCY_FAILURE_SCORING,
} from "../downstream-dependency-failure";
import {
  cascadingServiceFailure,
  cascadingServiceFailureCandidateUI,
  CASCADING_SERVICE_FAILURE_SCORING,
} from "../cascading-service-failure";
import {
  thirdPartyApiLatency,
  thirdPartyApiLatencyCandidateUI,
  THIRD_PARTY_API_LATENCY_SCORING,
} from "../third-party-api-latency";
import {
  rateLimitFailure,
  rateLimitFailureCandidateUI,
  RATE_LIMIT_FAILURE_SCORING,
} from "../rate-limit-failure";
import {
  thunderingHerd,
  thunderingHerdCandidateUI,
  THUNDERING_HERD_SCORING,
} from "../thundering-herd";
import {
  deploymentRegression,
  deploymentRegressionCandidateUI,
  DEPLOYMENT_REGRESSION_SCORING,
} from "../deployment-regression";
import { memoryLeak, memoryLeakCandidateUI, MEMORY_LEAK_SCORING } from "../memory-leak";
import {
  autoscalingFailure,
  autoscalingFailureCandidateUI,
  AUTOSCALING_FAILURE_SCORING,
} from "../autoscaling-failure";
import {
  authenticationServiceDegradation,
  authenticationServiceDegradationCandidateUI,
  AUTHENTICATION_SERVICE_DEGRADATION_SCORING,
} from "../authentication-service-degradation";
import {
  badConfigurationRollout,
  badConfigurationRolloutCandidateUI,
  BAD_CONFIGURATION_ROLLOUT_SCORING,
} from "../bad-configuration-rollout";
import type { BuiltInScenarioCatalog } from "./types";

/**
 * The single source of truth for every IncidentRank-owned (built-in)
 * scenario — runtime, candidate UI, and scoring together, keyed by slug.
 * Every data-driven consumer (the scenario registry, the public library
 * page, the assessment scenario route, scoreAttempt) resolves against
 * this catalog instead of hardcoding per-slug branches. Adding scenario
 * #21 (or #101) means adding one entry here — see
 * docs/implementation_plan/phase6.md's scoring-convergence and
 * data-driven-registry mandates. Order here is insertion order only; it
 * carries no product meaning (library sort/grouping is a presentation
 * concern, computed from each entry's own metadata, never from catalog
 * iteration order).
 */
export const BUILT_IN_SCENARIO_CATALOG: BuiltInScenarioCatalog = {
  [paymentRetryStorm.slug]: {
    definition: paymentRetryStorm,
    candidateUI: paymentRetryStormCandidateUI,
    scoring: paymentRetryStormScoring,
  },
  [dbConnectionSaturation.slug]: {
    definition: dbConnectionSaturation,
    candidateUI: dbConnectionSaturationCandidateUI,
    scoring: DB_CONNECTION_SATURATION_SCORING,
  },
  [kafkaConsumerLag.slug]: {
    definition: kafkaConsumerLag,
    candidateUI: kafkaConsumerLagCandidateUI,
    scoring: KAFKA_CONSUMER_LAG_SCORING,
  },
  [cacheStampede.slug]: {
    definition: cacheStampede,
    candidateUI: cacheStampedeCandidateUI,
    scoring: CACHE_STAMPEDE_SCORING,
  },
  [readReplicaLag.slug]: {
    definition: readReplicaLag,
    candidateUI: readReplicaLagCandidateUI,
    scoring: READ_REPLICA_LAG_SCORING,
  },
  [databaseLockContention.slug]: {
    definition: databaseLockContention,
    candidateUI: databaseLockContentionCandidateUI,
    scoring: DATABASE_LOCK_CONTENTION_SCORING,
  },
  [slowQueryRegression.slug]: {
    definition: slowQueryRegression,
    candidateUI: slowQueryRegressionCandidateUI,
    scoring: SLOW_QUERY_REGRESSION_SCORING,
  },
  [poisonMessageLoop.slug]: {
    definition: poisonMessageLoop,
    candidateUI: poisonMessageLoopCandidateUI,
    scoring: POISON_MESSAGE_LOOP_SCORING,
  },
  [kafkaPartitionSkew.slug]: {
    definition: kafkaPartitionSkew,
    candidateUI: kafkaPartitionSkewCandidateUI,
    scoring: KAFKA_PARTITION_SKEW_SCORING,
  },
  [consumerRebalanceStorm.slug]: {
    definition: consumerRebalanceStorm,
    candidateUI: consumerRebalanceStormCandidateUI,
    scoring: CONSUMER_REBALANCE_STORM_SCORING,
  },
  [downstreamDependencyFailure.slug]: {
    definition: downstreamDependencyFailure,
    candidateUI: downstreamDependencyFailureCandidateUI,
    scoring: DOWNSTREAM_DEPENDENCY_FAILURE_SCORING,
  },
  [cascadingServiceFailure.slug]: {
    definition: cascadingServiceFailure,
    candidateUI: cascadingServiceFailureCandidateUI,
    scoring: CASCADING_SERVICE_FAILURE_SCORING,
  },
  [thirdPartyApiLatency.slug]: {
    definition: thirdPartyApiLatency,
    candidateUI: thirdPartyApiLatencyCandidateUI,
    scoring: THIRD_PARTY_API_LATENCY_SCORING,
  },
  [rateLimitFailure.slug]: {
    definition: rateLimitFailure,
    candidateUI: rateLimitFailureCandidateUI,
    scoring: RATE_LIMIT_FAILURE_SCORING,
  },
  [thunderingHerd.slug]: {
    definition: thunderingHerd,
    candidateUI: thunderingHerdCandidateUI,
    scoring: THUNDERING_HERD_SCORING,
  },
  [deploymentRegression.slug]: {
    definition: deploymentRegression,
    candidateUI: deploymentRegressionCandidateUI,
    scoring: DEPLOYMENT_REGRESSION_SCORING,
  },
  [memoryLeak.slug]: {
    definition: memoryLeak,
    candidateUI: memoryLeakCandidateUI,
    scoring: MEMORY_LEAK_SCORING,
  },
  [autoscalingFailure.slug]: {
    definition: autoscalingFailure,
    candidateUI: autoscalingFailureCandidateUI,
    scoring: AUTOSCALING_FAILURE_SCORING,
  },
  [authenticationServiceDegradation.slug]: {
    definition: authenticationServiceDegradation,
    candidateUI: authenticationServiceDegradationCandidateUI,
    scoring: AUTHENTICATION_SERVICE_DEGRADATION_SCORING,
  },
  [badConfigurationRollout.slug]: {
    definition: badConfigurationRollout,
    candidateUI: badConfigurationRolloutCandidateUI,
    scoring: BAD_CONFIGURATION_ROLLOUT_SCORING,
  },
};
