export type { ScenarioDefinition, ScenarioLibraryMetadata, ScenarioCategory } from "./types";
export {
  paymentRetryStorm,
  paymentRetryStormSimulation,
  paymentRetryStormScoring,
} from "./payment-retry-storm";
export * from "./payment-retry-storm/controls";
export { paymentRetryStormCandidateUI } from "./payment-retry-storm/candidate-ui";

export type {
  CandidateMetricFormat,
  CandidateMetricDescriptor,
  CandidateControlDescriptor,
  CandidateComponentDescriptor,
  CandidateUIDescriptor,
} from "./candidate-ui";

export {
  dbConnectionSaturation,
  dbConnectionSaturationSimulation,
  dbConnectionSaturationCandidateUI,
  DB_CONNECTION_SATURATION_SCORING,
} from "./db-connection-saturation";

export {
  kafkaConsumerLag,
  kafkaConsumerLagSimulation,
  kafkaConsumerLagCandidateUI,
  KAFKA_CONSUMER_LAG_SCORING,
} from "./kafka-consumer-lag";

export {
  cacheStampede,
  cacheStampedeSimulation,
  cacheStampedeCandidateUI,
  CACHE_STAMPEDE_SCORING,
} from "./cache-stampede";

export {
  readReplicaLag,
  readReplicaLagSimulation,
  readReplicaLagCandidateUI,
  READ_REPLICA_LAG_SCORING,
} from "./read-replica-lag";

export {
  databaseLockContention,
  databaseLockContentionSimulation,
  databaseLockContentionCandidateUI,
  DATABASE_LOCK_CONTENTION_SCORING,
} from "./database-lock-contention";

export {
  slowQueryRegression,
  slowQueryRegressionSimulation,
  slowQueryRegressionCandidateUI,
  SLOW_QUERY_REGRESSION_SCORING,
} from "./slow-query-regression";

export {
  poisonMessageLoop,
  poisonMessageLoopSimulation,
  poisonMessageLoopCandidateUI,
  POISON_MESSAGE_LOOP_SCORING,
} from "./poison-message-loop";

export {
  kafkaPartitionSkew,
  kafkaPartitionSkewSimulation,
  kafkaPartitionSkewCandidateUI,
  KAFKA_PARTITION_SKEW_SCORING,
} from "./kafka-partition-skew";

export {
  consumerRebalanceStorm,
  consumerRebalanceStormSimulation,
  consumerRebalanceStormCandidateUI,
  CONSUMER_REBALANCE_STORM_SCORING,
} from "./consumer-rebalance-storm";

export {
  downstreamDependencyFailure,
  downstreamDependencyFailureSimulation,
  downstreamDependencyFailureCandidateUI,
  DOWNSTREAM_DEPENDENCY_FAILURE_SCORING,
} from "./downstream-dependency-failure";

export {
  cascadingServiceFailure,
  cascadingServiceFailureSimulation,
  cascadingServiceFailureCandidateUI,
  CASCADING_SERVICE_FAILURE_SCORING,
} from "./cascading-service-failure";

export {
  thirdPartyApiLatency,
  thirdPartyApiLatencySimulation,
  thirdPartyApiLatencyCandidateUI,
  THIRD_PARTY_API_LATENCY_SCORING,
} from "./third-party-api-latency";

export {
  rateLimitFailure,
  rateLimitFailureSimulation,
  rateLimitFailureCandidateUI,
  RATE_LIMIT_FAILURE_SCORING,
} from "./rate-limit-failure";

export {
  thunderingHerd,
  thunderingHerdSimulation,
  thunderingHerdCandidateUI,
  THUNDERING_HERD_SCORING,
} from "./thundering-herd";

export {
  deploymentRegression,
  deploymentRegressionSimulation,
  deploymentRegressionCandidateUI,
  DEPLOYMENT_REGRESSION_SCORING,
} from "./deployment-regression";

export {
  memoryLeak,
  memoryLeakSimulation,
  memoryLeakCandidateUI,
  MEMORY_LEAK_SCORING,
} from "./memory-leak";

export {
  autoscalingFailure,
  autoscalingFailureSimulation,
  autoscalingFailureCandidateUI,
  AUTOSCALING_FAILURE_SCORING,
} from "./autoscaling-failure";

export {
  authenticationServiceDegradation,
  authenticationServiceDegradationSimulation,
  authenticationServiceDegradationCandidateUI,
  AUTHENTICATION_SERVICE_DEGRADATION_SCORING,
} from "./authentication-service-degradation";

export {
  badConfigurationRollout,
  badConfigurationRolloutSimulation,
  badConfigurationRolloutCandidateUI,
  BAD_CONFIGURATION_ROLLOUT_SCORING,
} from "./bad-configuration-rollout";

// Phase 6B batch 1 (scenarios 21-25): foundational
export {
  missingDatabaseIndex,
  missingDatabaseIndexSimulation,
  missingDatabaseIndexCandidateUI,
  MISSING_DATABASE_INDEX_SCORING,
} from "./missing-database-index";

export {
  deadlockStorm,
  deadlockStormSimulation,
  deadlockStormCandidateUI,
  DEADLOCK_STORM_SCORING,
} from "./deadlock-storm";

export {
  messageRetryStorm,
  messageRetryStormSimulation,
  messageRetryStormCandidateUI,
  MESSAGE_RETRY_STORM_SCORING,
} from "./message-retry-storm";

export {
  cacheNodeFailure,
  cacheNodeFailureSimulation,
  cacheNodeFailureCandidateUI,
  CACHE_NODE_FAILURE_SCORING,
} from "./cache-node-failure";

export {
  serviceDiscoveryFailure,
  serviceDiscoveryFailureSimulation,
  serviceDiscoveryFailureCandidateUI,
  SERVICE_DISCOVERY_FAILURE_SCORING,
} from "./service-discovery-failure";

// Phase 6B batch 2 (scenarios 23,25,30,35,36): multi-system / pressure-transfer
export {
  hotDatabasePartition,
  hotDatabasePartitionSimulation,
  hotDatabasePartitionCandidateUI,
  HOT_DATABASE_PARTITION_SCORING,
} from "./hot-database-partition";

export {
  storageIopsSaturation,
  storageIopsSaturationSimulation,
  storageIopsSaturationCandidateUI,
  STORAGE_IOPS_SATURATION_SCORING,
} from "./storage-iops-saturation";

export {
  eventProcessingBackpressure,
  eventProcessingBackpressureSimulation,
  eventProcessingBackpressureCandidateUI,
  EVENT_PROCESSING_BACKPRESSURE_SCORING,
} from "./event-processing-backpressure";

export {
  dependencyTimeoutCascade,
  dependencyTimeoutCascadeSimulation,
  dependencyTimeoutCascadeCandidateUI,
  DEPENDENCY_TIMEOUT_CASCADE_SCORING,
} from "./dependency-timeout-cascade";

export {
  fanOutRequestExplosion,
  fanOutRequestExplosionSimulation,
  fanOutRequestExplosionCandidateUI,
  FAN_OUT_REQUEST_EXPLOSION_SCORING,
} from "./fan-out-request-explosion";

// Phase 6B batch 3 (scenarios 24,27,28,29,39): correctness-heavy
export {
  primaryDatabaseFailover,
  primaryDatabaseFailoverSimulation,
  primaryDatabaseFailoverCandidateUI,
  PRIMARY_DATABASE_FAILOVER_SCORING,
} from "./primary-database-failover";

export {
  deadLetterQueueExplosion,
  deadLetterQueueExplosionSimulation,
  deadLetterQueueExplosionCandidateUI,
  DEAD_LETTER_QUEUE_EXPLOSION_SCORING,
} from "./dead-letter-queue-explosion";

export {
  duplicateEventProcessing,
  duplicateEventProcessingSimulation,
  duplicateEventProcessingCandidateUI,
  DUPLICATE_EVENT_PROCESSING_SCORING,
} from "./duplicate-event-processing";

export {
  outOfOrderEvents,
  outOfOrderEventsSimulation,
  outOfOrderEventsCandidateUI,
  OUT_OF_ORDER_EVENTS_SCORING,
} from "./out-of-order-events";

export {
  distributedLockFailure,
  distributedLockFailureSimulation,
  distributedLockFailureCandidateUI,
  DISTRIBUTED_LOCK_FAILURE_SCORING,
} from "./distributed-lock-failure";

// Phase 6B batch 4 (scenarios 32,33,37,38,40): distributed systems
export {
  hotKeyCacheOverload,
  hotKeyCacheOverloadSimulation,
  hotKeyCacheOverloadCandidateUI,
  HOT_KEY_CACHE_OVERLOAD_SCORING,
} from "./hot-key-cache-overload";

export {
  cacheEvictionStorm,
  cacheEvictionStormSimulation,
  cacheEvictionStormCandidateUI,
  CACHE_EVICTION_STORM_SCORING,
} from "./cache-eviction-storm";

export {
  splitBrainIncident,
  splitBrainIncidentSimulation,
  splitBrainIncidentCandidateUI,
  SPLIT_BRAIN_INCIDENT_SCORING,
} from "./split-brain-incident";

export {
  leaderElectionStorm,
  leaderElectionStormSimulation,
  leaderElectionStormCandidateUI,
  LEADER_ELECTION_STORM_SCORING,
} from "./leader-election-storm";

export {
  crossRegionLatencySpike,
  crossRegionLatencySpikeSimulation,
  crossRegionLatencySpikeCandidateUI,
  CROSS_REGION_LATENCY_SPIKE_SCORING,
} from "./cross-region-latency-spike";

export {
  BUILT_IN_SCENARIO_CATALOG,
  getBuiltInScenarioEntry,
  listBuiltInScenarioEntries,
  listPublicBuiltInScenarioEntries,
} from "./library";
export type { BuiltInScenarioEntry, BuiltInScenarioCatalog } from "./library";
