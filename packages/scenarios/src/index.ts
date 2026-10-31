export type { ScenarioDefinition, ScenarioLibraryMetadata, ScenarioCategory, ScenarioStructure } from "./types";
export { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";
export type { IncidentNarrative, IncidentNarrativeEntry } from "./narrative";
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

// Phase 6C batch 1 (scenarios 41-45): microservices/dependencies + API traffic
export {
  partialRegionalDependencyFailure,
  partialRegionalDependencyFailureSimulation,
  partialRegionalDependencyFailureCandidateUI,
  PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
} from "./partial-regional-dependency-failure";

export {
  dependencyRateLimitExhaustion,
  dependencyRateLimitExhaustionSimulation,
  dependencyRateLimitExhaustionCandidateUI,
  DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
} from "./dependency-rate-limit-exhaustion";

export {
  apiTrafficSpike,
  apiTrafficSpikeSimulation,
  apiTrafficSpikeCandidateUI,
  API_TRAFFIC_SPIKE_SCORING,
} from "./api-traffic-spike";

export {
  rateLimitMisconfiguration,
  rateLimitMisconfigurationSimulation,
  rateLimitMisconfigurationCandidateUI,
  RATE_LIMIT_MISCONFIGURATION_SCORING,
} from "./rate-limit-misconfiguration";

export {
  loadBalancerImbalance,
  loadBalancerImbalanceSimulation,
  loadBalancerImbalanceCandidateUI,
  LOAD_BALANCER_IMBALANCE_SCORING,
} from "./load-balancer-imbalance";

// Phase 6C batch 2 (scenarios 46-50): API traffic management
export {
  cacheRevalidationHerd,
  cacheRevalidationHerdSimulation,
  cacheRevalidationHerdCandidateUI,
  CACHE_REVALIDATION_HERD_SCORING,
} from "./cache-revalidation-herd";

export {
  requestTimeoutCascade,
  requestTimeoutCascadeSimulation,
  requestTimeoutCascadeCandidateUI,
  REQUEST_TIMEOUT_CASCADE_SCORING,
} from "./request-timeout-cascade";

export {
  largePayloadRegression,
  largePayloadRegressionSimulation,
  largePayloadRegressionCandidateUI,
  LARGE_PAYLOAD_REGRESSION_SCORING,
} from "./large-payload-regression";

export {
  apiGatewaySaturation,
  apiGatewaySaturationSimulation,
  apiGatewaySaturationCandidateUI,
  API_GATEWAY_SATURATION_SCORING,
} from "./api-gateway-saturation";

export {
  webhookDeliveryStorm,
  webhookDeliveryStormSimulation,
  webhookDeliveryStormCandidateUI,
  WEBHOOK_DELIVERY_STORM_SCORING,
} from "./webhook-delivery-storm";

// Phase 6C batch 3 (scenarios 51-55): traffic/distributed systems
export {
  botTrafficSurge,
  botTrafficSurgeSimulation,
  botTrafficSurgeCandidateUI,
  BOT_TRAFFIC_SURGE_SCORING,
} from "./bot-traffic-surge";

export {
  unevenTenantTraffic,
  unevenTenantTrafficSimulation,
  unevenTenantTrafficCandidateUI,
  UNEVEN_TENANT_TRAFFIC_SCORING,
} from "./uneven-tenant-traffic";

export {
  networkPartition,
  networkPartitionSimulation,
  networkPartitionCandidateUI,
  NETWORK_PARTITION_SCORING,
} from "./network-partition";

export {
  quorumLoss,
  quorumLossSimulation,
  quorumLossCandidateUI,
  QUORUM_LOSS_SCORING,
} from "./quorum-loss";

export {
  replicationBacklog,
  replicationBacklogSimulation,
  replicationBacklogCandidateUI,
  REPLICATION_BACKLOG_SCORING,
} from "./replication-backlog";

// Phase 6C batch 4 (scenarios 56-60): distributed systems + deployments
export {
  consistencyVsAvailabilityIncident,
  consistencyVsAvailabilityIncidentSimulation,
  consistencyVsAvailabilityIncidentCandidateUI,
  CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
} from "./consistency-vs-availability-incident";

export {
  duplicateRequestProcessing,
  duplicateRequestProcessingSimulation,
  duplicateRequestProcessingCandidateUI,
  DUPLICATE_REQUEST_PROCESSING_SCORING,
} from "./duplicate-request-processing";

export {
  idempotencyFailure,
  idempotencyFailureSimulation,
  idempotencyFailureCandidateUI,
  IDEMPOTENCY_FAILURE_SCORING,
} from "./idempotency-failure";

export {
  distributedCoordinationFailure,
  distributedCoordinationFailureSimulation,
  distributedCoordinationFailureCandidateUI,
  DISTRIBUTED_COORDINATION_FAILURE_SCORING,
} from "./distributed-coordination-failure";

export {
  partialRolloutRegression,
  partialRolloutRegressionSimulation,
  partialRolloutRegressionCandidateUI,
  PARTIAL_ROLLOUT_REGRESSION_SCORING,
} from "./partial-rollout-regression";

// Phase 6D batch 1 (scenarios 61-65): global/platform incidents
export {
  multiRegionPaymentPlatformDegradation,
  multiRegionPaymentPlatformDegradationSimulation,
  multiRegionPaymentPlatformDegradationCandidateUI,
  MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
} from "./multi-region-payment-platform-degradation";

export {
  globalCheckoutBrownout,
  globalCheckoutBrownoutSimulation,
  globalCheckoutBrownoutCandidateUI,
  GLOBAL_CHECKOUT_BROWNOUT_SCORING,
} from "./global-checkout-brownout";

export {
  multiTenantControlPlaneOverload,
  multiTenantControlPlaneOverloadSimulation,
  multiTenantControlPlaneOverloadCandidateUI,
  MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
} from "./multi-tenant-control-plane-overload";

export {
  regionalFailoverCausesGlobalOverload,
  regionalFailoverSimulation,
  regionalFailoverCandidateUI,
  REGIONAL_FAILOVER_SCORING,
} from "./regional-failover-causes-global-overload";

export {
  crossServiceRetryAmplification,
  crossServiceRetryAmplificationSimulation,
  crossServiceRetryAmplificationCandidateUI,
  CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
} from "./cross-service-retry-amplification";

// Phase 6D batch 2 (scenarios 66-70): data/event correctness incidents
export {
  ledgerReconciliationDivergence,
  ledgerReconciliationDivergenceSimulation,
  ledgerReconciliationDivergenceCandidateUI,
  LEDGER_RECONCILIATION_DIVERGENCE_SCORING,
} from "./ledger-reconciliation-divergence";

export {
  hotShardReplicaLagFailoverRisk,
  hotShardReplicaLagFailoverRiskSimulation,
  hotShardReplicaLagFailoverRiskCandidateUI,
  HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
} from "./hot-shard-replica-lag-failover-risk";

export {
  eventPlatformPartialOutage,
  eventPlatformPartialOutageSimulation,
  eventPlatformPartialOutageCandidateUI,
  EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING,
} from "./event-platform-partial-outage";

export {
  searchPlatformCascade,
  searchPlatformCascadeSimulation,
  searchPlatformCascadeCandidateUI,
  SEARCH_PLATFORM_CASCADE_SCORING,
} from "./search-platform-cascade";

export {
  apiMigrationDualWriteFailure,
  apiMigrationDualWriteFailureSimulation,
  apiMigrationDualWriteFailureCandidateUI,
  API_MIGRATION_DUAL_WRITE_FAILURE_SCORING,
} from "./api-migration-dual-write-failure";

// Phase 6D batch 3 (scenarios 71-75): migration/identity/data platform incidents
export {
  schemaMigrationUnderLiveTraffic,
  schemaMigrationUnderLiveTrafficSimulation,
  schemaMigrationUnderLiveTrafficCandidateUI,
  SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING,
} from "./schema-migration-under-live-traffic";

export {
  cacheInvalidationAcrossRegions,
  cacheInvalidationAcrossRegionsSimulation,
  cacheInvalidationAcrossRegionsCandidateUI,
  CACHE_INVALIDATION_ACROSS_REGIONS_SCORING,
} from "./cache-invalidation-across-regions";

export {
  identityPlatformDegradation,
  identityPlatformDegradationSimulation,
  identityPlatformDegradationCandidateUI,
  IDENTITY_PLATFORM_DEGRADATION_SCORING,
} from "./identity-platform-degradation";

export {
  authorizationPolicyRolloutFailure,
  authorizationPolicyRolloutFailureSimulation,
  authorizationPolicyRolloutFailureCandidateUI,
  AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
} from "./authorization-policy-rollout-failure";

export {
  dataPipelineFreshnessCollapse,
  dataPipelineFreshnessCollapseSimulation,
  dataPipelineFreshnessCollapseCandidateUI,
  DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING,
} from "./data-pipeline-freshness-collapse";

// Phase 6D batch 4 (scenarios 76-80): peak-load/cross-platform incidents
export {
  backfillOverwhelmsProduction,
  backfillOverwhelmsProductionSimulation,
  backfillOverwhelmsProductionCandidateUI,
  BACKFILL_OVERWHELMS_PRODUCTION_SCORING,
} from "./backfill-overwhelms-production";

export {
  multiServiceMemoryPressureIncident,
  multiServiceMemoryPressureIncidentSimulation,
  multiServiceMemoryPressureIncidentCandidateUI,
  MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
} from "./multi-service-memory-pressure-incident";

export {
  globalFeatureRolloutIncident,
  globalFeatureRolloutIncidentSimulation,
  globalFeatureRolloutIncidentCandidateUI,
  GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
} from "./global-feature-rollout-incident";

export {
  capacityExhaustionDuringPeakEvent,
  capacityExhaustionDuringPeakEventSimulation,
  capacityExhaustionDuringPeakEventCandidateUI,
  CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
} from "./capacity-exhaustion-during-peak-event";

export {
  cascadingFailureAcrossSharedPlatform,
  cascadingFailureAcrossSharedPlatformSimulation,
  cascadingFailureAcrossSharedPlatformCandidateUI,
  CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
} from "./cascading-failure-across-shared-platform";

// Phase 6E batch 1 (scenarios 81-85): security/authorization/abuse-prevention incidents
export {
  privilegeEscalationViaStaleAuthorizationCache,
  privilegeEscalationViaStaleAuthorizationCacheSimulation,
  privilegeEscalationViaStaleAuthorizationCacheCandidateUI,
  PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
} from "./privilege-escalation-via-stale-authorization-cache";

export {
  serviceToServiceCredentialRotationFailure,
  serviceToServiceCredentialRotationFailureSimulation,
  serviceToServiceCredentialRotationFailureCandidateUI,
  SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
} from "./service-to-service-credential-rotation-failure";

export {
  fraudControlDegradationDuringPaymentSurge,
  fraudControlDegradationSimulation,
  fraudControlDegradationCandidateUI,
  FRAUD_CONTROL_DEGRADATION_SCORING,
} from "./fraud-control-degradation-during-payment-surge";

export {
  abusePreventionFalsePositiveStorm,
  abusePreventionFalsePositiveStormSimulation,
  abusePreventionFalsePositiveStormCandidateUI,
  ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING,
} from "./abuse-prevention-false-positive-storm";

export {
  secretLeakageContainmentIncident,
  secretLeakageContainmentIncidentSimulation,
  secretLeakageContainmentIncidentCandidateUI,
  SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING,
} from "./secret-leakage-containment-incident";

// Phase 6E batch 2 (scenarios 86-90): cost-efficiency and internal-data incidents
export {
  runawayCloudSpendDuringHealthyTraffic,
  runawayCloudSpendDuringHealthyTrafficSimulation,
  runawayCloudSpendDuringHealthyTrafficCandidateUI,
  RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
} from "./runaway-cloud-spend-during-healthy-traffic";

export {
  crossRegionReplicationCostExplosion,
  crossRegionReplicationCostExplosionSimulation,
  crossRegionReplicationCostExplosionCandidateUI,
  CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
} from "./cross-region-replication-cost-explosion";

export {
  overprovisionedResilienceDuringLowRiskPeriod,
  overprovisionedResilienceDuringLowRiskPeriodSimulation,
  overprovisionedResilienceDuringLowRiskPeriodCandidateUI,
  OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
} from "./overprovisioned-resilience-during-low-risk-period";

export {
  expensiveRetryAndLoggingAmplification,
  expensiveRetryAndLoggingAmplificationSimulation,
  expensiveRetryAndLoggingAmplificationCandidateUI,
  EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
} from "./expensive-retry-and-logging-amplification";

export {
  modelFeatureFreshnessDegradation,
  modelFeatureFreshnessDegradationSimulation,
  modelFeatureFreshnessDegradationCandidateUI,
  MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
} from "./model-feature-freshness-degradation";

// Phase 6E batch 3 (scenarios 91-95): ML/analytics/compliance incidents
export {
  trainingPipelineProducesCorruptedModelArtifact,
  trainingPipelineProducesCorruptedModelArtifactSimulation,
  trainingPipelineProducesCorruptedModelArtifactCandidateUI,
  TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
} from "./training-pipeline-produces-corrupted-model-artifact";

export {
  analyticsWarehouseQueryContention,
  analyticsWarehouseQueryContentionSimulation,
  analyticsWarehouseQueryContentionCandidateUI,
  ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
} from "./analytics-warehouse-query-contention";

export {
  dataLineageBreakDuringEtlMigration,
  dataLineageBreakDuringEtlMigrationSimulation,
  dataLineageBreakDuringEtlMigrationCandidateUI,
  DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
} from "./data-lineage-break-during-etl-migration";

export {
  mlInferenceCostVsQualityIncident,
  mlInferenceCostVsQualityIncidentSimulation,
  mlInferenceCostVsQualityIncidentCandidateUI,
  ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
} from "./ml-inference-cost-vs-quality-incident";

export {
  dataRetentionPolicyMisconfiguration,
  dataRetentionPolicyMisconfigurationSimulation,
  dataRetentionPolicyMisconfigurationCandidateUI,
  DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
} from "./data-retention-policy-misconfiguration";

// Phase 6E batch 4 (scenarios 96-100): privacy, auditability, long-horizon remediation, proactive capacity, and enterprise migration governance incidents — final Phase 6E batch
export {
  privacyDeletionBacklog,
  privacyDeletionBacklogSimulation,
  privacyDeletionBacklogCandidateUI,
  PRIVACY_DELETION_BACKLOG_SCORING,
} from "./privacy-deletion-backlog";

export {
  auditLogIntegrityFailure,
  auditLogIntegrityFailureSimulation,
  auditLogIntegrityFailureCandidateUI,
  AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
} from "./audit-log-integrity-failure";

export {
  certificateExpiryAcrossLargeFleet,
  certificateExpiryAcrossLargeFleetSimulation,
  certificateExpiryAcrossLargeFleetCandidateUI,
  CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
} from "./certificate-expiry-across-large-fleet";

export {
  emergencyCapacityReservationDecision,
  emergencyCapacityReservationDecisionSimulation,
  emergencyCapacityReservationDecisionCandidateUI,
  EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING,
} from "./emergency-capacity-reservation-decision";

export {
  enterpriseWideDependencyDeprecation,
  enterpriseWideDependencyDeprecationSimulation,
  enterpriseWideDependencyDeprecationCandidateUI,
  ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING,
} from "./enterprise-wide-dependency-deprecation";

// Phase 10F reference incident
export {
  checkoutPaymentInventoryRedisContention,
  checkoutPaymentInventoryRedisContentionSimulation,
  checkoutPaymentInventoryRedisContentionCandidateUI,
  CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING,
} from "./checkout-payment-inventory-redis-contention";

// Phase 10G — first weekly batch (15 scenarios).
export {
  connectionPoolStarvation,
  connectionPoolStarvationCandidateUI,
  CONNECTION_POOL_STARVATION_SCORING,
} from "./connection-pool-starvation";
export {
  staleFeatureFlagKillSwitch,
  staleFeatureFlagKillSwitchCandidateUI,
  STALE_FEATURE_FLAG_KILL_SWITCH_SCORING,
} from "./stale-feature-flag-kill-switch";
export {
  retryBudgetExhaustion,
  retryBudgetExhaustionCandidateUI,
  RETRY_BUDGET_EXHAUSTION_SCORING,
} from "./retry-budget-exhaustion";
export {
  cronJobOverlapDoubleRun,
  cronJobOverlapDoubleRunCandidateUI,
  CRON_JOB_OVERLAP_DOUBLE_RUN_SCORING,
} from "./cron-job-overlap-double-run";
export {
  corsMisconfigurationBlocksPartners,
  corsMisconfigurationBlocksPartnersCandidateUI,
  CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING,
} from "./cors-misconfiguration-blocks-partners";
export {
  gracefulShutdownDropsInFlightRequests,
  gracefulShutdownDropsInFlightRequestsCandidateUI,
  GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING,
} from "./graceful-shutdown-drops-in-flight-requests";
export {
  geoDnsFailoverFlapping,
  geoDnsFailoverFlappingCandidateUI,
  GEO_DNS_FAILOVER_FLAPPING_SCORING,
} from "./geo-dns-failover-flapping";
export {
  orphanedBackgroundWorkerQueueGrowth,
  orphanedBackgroundWorkerQueueGrowthCandidateUI,
  ORPHANED_BACKGROUND_WORKER_QUEUE_GROWTH_SCORING,
} from "./orphaned-background-worker-queue-growth";
export {
  multiAzStorageFailureDuringMigration,
  multiAzStorageFailureDuringMigrationCandidateUI,
  MULTI_AZ_STORAGE_FAILURE_DURING_MIGRATION_SCORING,
} from "./multi-az-storage-failure-during-migration";
export {
  apiVersionSunsetBreaksSilentConsumers,
  apiVersionSunsetBreaksSilentConsumersCandidateUI,
  API_VERSION_SUNSET_BREAKS_SILENT_CONSUMERS_SCORING,
} from "./api-version-sunset-breaks-silent-consumers";
export {
  sessionAffinityLossAfterCacheFailover,
  sessionAffinityLossAfterCacheFailoverCandidateUI,
  SESSION_AFFINITY_LOSS_AFTER_CACHE_FAILOVER_SCORING,
} from "./session-affinity-loss-after-cache-failover";
export {
  writeAmplificationFromMisconfiguredCompaction,
  writeAmplificationFromMisconfiguredCompactionCandidateUI,
  WRITE_AMPLIFICATION_FROM_MISCONFIGURED_COMPACTION_SCORING,
} from "./write-amplification-from-misconfigured-compaction";
export {
  crossTeamSchemaContractDrift,
  crossTeamSchemaContractDriftCandidateUI,
  CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING,
} from "./cross-team-schema-contract-drift";
export {
  regulatoryDataResidencyViolationDuringFailover,
  regulatoryDataResidencyViolationDuringFailoverCandidateUI,
  REGULATORY_DATA_RESIDENCY_VIOLATION_DURING_FAILOVER_SCORING,
} from "./regulatory-data-residency-violation-during-failover";
export {
  platformWideClockSkewBreaksDistributedConsensus,
  platformWideClockSkewBreaksDistributedConsensusCandidateUI,
  PLATFORM_WIDE_CLOCK_SKEW_BREAKS_DISTRIBUTED_CONSENSUS_SCORING,
} from "./platform-wide-clock-skew-breaks-distributed-consensus";

export {
  BUILT_IN_SCENARIO_CATALOG,
  getBuiltInScenarioEntry,
  listBuiltInScenarioEntries,
  listPublicBuiltInScenarioEntries,
  validateBuiltInScenario,
  canPublishScenario,
} from "./library";
export type { BuiltInScenarioEntry, BuiltInScenarioCatalog } from "./library";
