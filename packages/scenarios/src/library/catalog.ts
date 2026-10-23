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
import {
  missingDatabaseIndex,
  missingDatabaseIndexCandidateUI,
  MISSING_DATABASE_INDEX_SCORING,
} from "../missing-database-index";
import {
  deadlockStorm,
  deadlockStormCandidateUI,
  DEADLOCK_STORM_SCORING,
} from "../deadlock-storm";
import {
  messageRetryStorm,
  messageRetryStormCandidateUI,
  MESSAGE_RETRY_STORM_SCORING,
} from "../message-retry-storm";
import {
  cacheNodeFailure,
  cacheNodeFailureCandidateUI,
  CACHE_NODE_FAILURE_SCORING,
} from "../cache-node-failure";
import {
  serviceDiscoveryFailure,
  serviceDiscoveryFailureCandidateUI,
  SERVICE_DISCOVERY_FAILURE_SCORING,
} from "../service-discovery-failure";
import {
  hotDatabasePartition,
  hotDatabasePartitionCandidateUI,
  HOT_DATABASE_PARTITION_SCORING,
} from "../hot-database-partition";
import {
  storageIopsSaturation,
  storageIopsSaturationCandidateUI,
  STORAGE_IOPS_SATURATION_SCORING,
} from "../storage-iops-saturation";
import {
  eventProcessingBackpressure,
  eventProcessingBackpressureCandidateUI,
  EVENT_PROCESSING_BACKPRESSURE_SCORING,
} from "../event-processing-backpressure";
import {
  dependencyTimeoutCascade,
  dependencyTimeoutCascadeCandidateUI,
  DEPENDENCY_TIMEOUT_CASCADE_SCORING,
} from "../dependency-timeout-cascade";
import {
  fanOutRequestExplosion,
  fanOutRequestExplosionCandidateUI,
  FAN_OUT_REQUEST_EXPLOSION_SCORING,
} from "../fan-out-request-explosion";
import {
  primaryDatabaseFailover,
  primaryDatabaseFailoverCandidateUI,
  PRIMARY_DATABASE_FAILOVER_SCORING,
} from "../primary-database-failover";
import {
  deadLetterQueueExplosion,
  deadLetterQueueExplosionCandidateUI,
  DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
} from "../dead-letter-queue-explosion";
import {
  duplicateEventProcessing,
  duplicateEventProcessingCandidateUI,
  DUPLICATE_EVENT_PROCESSING_SCORING,
} from "../duplicate-event-processing";
import {
  outOfOrderEvents,
  outOfOrderEventsCandidateUI,
  OUT_OF_ORDER_EVENTS_SCORING,
} from "../out-of-order-events";
import {
  distributedLockFailure,
  distributedLockFailureCandidateUI,
  DISTRIBUTED_LOCK_FAILURE_SCORING,
} from "../distributed-lock-failure";
import {
  hotKeyCacheOverload,
  hotKeyCacheOverloadCandidateUI,
  HOT_KEY_CACHE_OVERLOAD_SCORING,
} from "../hot-key-cache-overload";
import {
  cacheEvictionStorm,
  cacheEvictionStormCandidateUI,
  CACHE_EVICTION_STORM_SCORING,
} from "../cache-eviction-storm";
import {
  splitBrainIncident,
  splitBrainIncidentCandidateUI,
  SPLIT_BRAIN_INCIDENT_SCORING,
} from "../split-brain-incident";
import {
  leaderElectionStorm,
  leaderElectionStormCandidateUI,
  LEADER_ELECTION_STORM_SCORING,
} from "../leader-election-storm";
import {
  crossRegionLatencySpike,
  crossRegionLatencySpikeCandidateUI,
  CROSS_REGION_LATENCY_SPIKE_SCORING,
} from "../cross-region-latency-spike";
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
  // Phase 6B batch 1 (scenarios 21-25): foundational
  [missingDatabaseIndex.slug]: {
    definition: missingDatabaseIndex,
    candidateUI: missingDatabaseIndexCandidateUI,
    scoring: MISSING_DATABASE_INDEX_SCORING,
  },
  [deadlockStorm.slug]: {
    definition: deadlockStorm,
    candidateUI: deadlockStormCandidateUI,
    scoring: DEADLOCK_STORM_SCORING,
  },
  [messageRetryStorm.slug]: {
    definition: messageRetryStorm,
    candidateUI: messageRetryStormCandidateUI,
    scoring: MESSAGE_RETRY_STORM_SCORING,
  },
  [cacheNodeFailure.slug]: {
    definition: cacheNodeFailure,
    candidateUI: cacheNodeFailureCandidateUI,
    scoring: CACHE_NODE_FAILURE_SCORING,
  },
  [serviceDiscoveryFailure.slug]: {
    definition: serviceDiscoveryFailure,
    candidateUI: serviceDiscoveryFailureCandidateUI,
    scoring: SERVICE_DISCOVERY_FAILURE_SCORING,
  },
  // Phase 6B batch 2 (scenarios 23,25,30,35,36): multi-system / pressure-transfer
  [hotDatabasePartition.slug]: {
    definition: hotDatabasePartition,
    candidateUI: hotDatabasePartitionCandidateUI,
    scoring: HOT_DATABASE_PARTITION_SCORING,
  },
  [storageIopsSaturation.slug]: {
    definition: storageIopsSaturation,
    candidateUI: storageIopsSaturationCandidateUI,
    scoring: STORAGE_IOPS_SATURATION_SCORING,
  },
  [eventProcessingBackpressure.slug]: {
    definition: eventProcessingBackpressure,
    candidateUI: eventProcessingBackpressureCandidateUI,
    scoring: EVENT_PROCESSING_BACKPRESSURE_SCORING,
  },
  [dependencyTimeoutCascade.slug]: {
    definition: dependencyTimeoutCascade,
    candidateUI: dependencyTimeoutCascadeCandidateUI,
    scoring: DEPENDENCY_TIMEOUT_CASCADE_SCORING,
  },
  [fanOutRequestExplosion.slug]: {
    definition: fanOutRequestExplosion,
    candidateUI: fanOutRequestExplosionCandidateUI,
    scoring: FAN_OUT_REQUEST_EXPLOSION_SCORING,
  },
  // Phase 6B batch 3 (scenarios 24,27,28,29,39): correctness-heavy
  [primaryDatabaseFailover.slug]: {
    definition: primaryDatabaseFailover,
    candidateUI: primaryDatabaseFailoverCandidateUI,
    scoring: PRIMARY_DATABASE_FAILOVER_SCORING,
  },
  [deadLetterQueueExplosion.slug]: {
    definition: deadLetterQueueExplosion,
    candidateUI: deadLetterQueueExplosionCandidateUI,
    scoring: DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
  },
  [duplicateEventProcessing.slug]: {
    definition: duplicateEventProcessing,
    candidateUI: duplicateEventProcessingCandidateUI,
    scoring: DUPLICATE_EVENT_PROCESSING_SCORING,
  },
  [outOfOrderEvents.slug]: {
    definition: outOfOrderEvents,
    candidateUI: outOfOrderEventsCandidateUI,
    scoring: OUT_OF_ORDER_EVENTS_SCORING,
  },
  [distributedLockFailure.slug]: {
    definition: distributedLockFailure,
    candidateUI: distributedLockFailureCandidateUI,
    scoring: DISTRIBUTED_LOCK_FAILURE_SCORING,
  },
  // Phase 6B batch 4 (scenarios 32,33,37,38,40): distributed systems
  [hotKeyCacheOverload.slug]: {
    definition: hotKeyCacheOverload,
    candidateUI: hotKeyCacheOverloadCandidateUI,
    scoring: HOT_KEY_CACHE_OVERLOAD_SCORING,
  },
  [cacheEvictionStorm.slug]: {
    definition: cacheEvictionStorm,
    candidateUI: cacheEvictionStormCandidateUI,
    scoring: CACHE_EVICTION_STORM_SCORING,
  },
  [splitBrainIncident.slug]: {
    definition: splitBrainIncident,
    candidateUI: splitBrainIncidentCandidateUI,
    scoring: SPLIT_BRAIN_INCIDENT_SCORING,
  },
  [leaderElectionStorm.slug]: {
    definition: leaderElectionStorm,
    candidateUI: leaderElectionStormCandidateUI,
    scoring: LEADER_ELECTION_STORM_SCORING,
  },
  [crossRegionLatencySpike.slug]: {
    definition: crossRegionLatencySpike,
    candidateUI: crossRegionLatencySpikeCandidateUI,
    scoring: CROSS_REGION_LATENCY_SPIKE_SCORING,
  },
};
