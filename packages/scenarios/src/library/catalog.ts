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
import {
  partialRegionalDependencyFailure,
  partialRegionalDependencyFailureCandidateUI,
  PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
} from "../partial-regional-dependency-failure";
import {
  dependencyRateLimitExhaustion,
  dependencyRateLimitExhaustionCandidateUI,
  DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
} from "../dependency-rate-limit-exhaustion";
import {
  apiTrafficSpike,
  apiTrafficSpikeCandidateUI,
  API_TRAFFIC_SPIKE_SCORING,
} from "../api-traffic-spike";
import {
  rateLimitMisconfiguration,
  rateLimitMisconfigurationCandidateUI,
  RATE_LIMIT_MISCONFIGURATION_SCORING,
} from "../rate-limit-misconfiguration";
import {
  loadBalancerImbalance,
  loadBalancerImbalanceCandidateUI,
  LOAD_BALANCER_IMBALANCE_SCORING,
} from "../load-balancer-imbalance";
import {
  cacheRevalidationHerd,
  cacheRevalidationHerdCandidateUI,
  CACHE_REVALIDATION_HERD_SCORING,
} from "../cache-revalidation-herd";
import {
  requestTimeoutCascade,
  requestTimeoutCascadeCandidateUI,
  REQUEST_TIMEOUT_CASCADE_SCORING,
} from "../request-timeout-cascade";
import {
  largePayloadRegression,
  largePayloadRegressionCandidateUI,
  LARGE_PAYLOAD_REGRESSION_SCORING,
} from "../large-payload-regression";
import {
  apiGatewaySaturation,
  apiGatewaySaturationCandidateUI,
  API_GATEWAY_SATURATION_SCORING,
} from "../api-gateway-saturation";
import {
  webhookDeliveryStorm,
  webhookDeliveryStormCandidateUI,
  WEBHOOK_DELIVERY_STORM_SCORING,
} from "../webhook-delivery-storm";
import {
  botTrafficSurge,
  botTrafficSurgeCandidateUI,
  BOT_TRAFFIC_SURGE_SCORING,
} from "../bot-traffic-surge";
import {
  unevenTenantTraffic,
  unevenTenantTrafficCandidateUI,
  UNEVEN_TENANT_TRAFFIC_SCORING,
} from "../uneven-tenant-traffic";
import {
  networkPartition,
  networkPartitionCandidateUI,
  NETWORK_PARTITION_SCORING,
} from "../network-partition";
import { quorumLoss, quorumLossCandidateUI, QUORUM_LOSS_SCORING } from "../quorum-loss";
import {
  replicationBacklog,
  replicationBacklogCandidateUI,
  REPLICATION_BACKLOG_SCORING,
} from "../replication-backlog";
import {
  consistencyVsAvailabilityIncident,
  consistencyVsAvailabilityIncidentCandidateUI,
  CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
} from "../consistency-vs-availability-incident";
import {
  duplicateRequestProcessing,
  duplicateRequestProcessingCandidateUI,
  DUPLICATE_REQUEST_PROCESSING_SCORING,
} from "../duplicate-request-processing";
import {
  idempotencyFailure,
  idempotencyFailureCandidateUI,
  IDEMPOTENCY_FAILURE_SCORING,
} from "../idempotency-failure";
import {
  distributedCoordinationFailure,
  distributedCoordinationFailureCandidateUI,
  DISTRIBUTED_COORDINATION_FAILURE_SCORING,
} from "../distributed-coordination-failure";
import {
  partialRolloutRegression,
  partialRolloutRegressionCandidateUI,
  PARTIAL_ROLLOUT_REGRESSION_SCORING,
} from "../partial-rollout-regression";
import {
  multiRegionPaymentPlatformDegradation,
  multiRegionPaymentPlatformDegradationCandidateUI,
  MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
} from "../multi-region-payment-platform-degradation";
import {
  globalCheckoutBrownout,
  globalCheckoutBrownoutCandidateUI,
  GLOBAL_CHECKOUT_BROWNOUT_SCORING,
} from "../global-checkout-brownout";
import {
  multiTenantControlPlaneOverload,
  multiTenantControlPlaneOverloadCandidateUI,
  MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
} from "../multi-tenant-control-plane-overload";
import {
  regionalFailoverCausesGlobalOverload,
  regionalFailoverCandidateUI,
  REGIONAL_FAILOVER_SCORING,
} from "../regional-failover-causes-global-overload";
import {
  crossServiceRetryAmplification,
  crossServiceRetryAmplificationCandidateUI,
  CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
} from "../cross-service-retry-amplification";
import {
  ledgerReconciliationDivergence,
  ledgerReconciliationDivergenceCandidateUI,
  LEDGER_RECONCILIATION_DIVERGENCE_SCORING,
} from "../ledger-reconciliation-divergence";
import {
  hotShardReplicaLagFailoverRisk,
  hotShardReplicaLagFailoverRiskCandidateUI,
  HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
} from "../hot-shard-replica-lag-failover-risk";
import {
  eventPlatformPartialOutage,
  eventPlatformPartialOutageCandidateUI,
  EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING,
} from "../event-platform-partial-outage";
import {
  searchPlatformCascade,
  searchPlatformCascadeCandidateUI,
  SEARCH_PLATFORM_CASCADE_SCORING,
} from "../search-platform-cascade";
import {
  apiMigrationDualWriteFailure,
  apiMigrationDualWriteFailureCandidateUI,
  API_MIGRATION_DUAL_WRITE_FAILURE_SCORING,
} from "../api-migration-dual-write-failure";
import {
  schemaMigrationUnderLiveTraffic,
  schemaMigrationUnderLiveTrafficCandidateUI,
  SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING,
} from "../schema-migration-under-live-traffic";
import {
  cacheInvalidationAcrossRegions,
  cacheInvalidationAcrossRegionsCandidateUI,
  CACHE_INVALIDATION_ACROSS_REGIONS_SCORING,
} from "../cache-invalidation-across-regions";
import {
  identityPlatformDegradation,
  identityPlatformDegradationCandidateUI,
  IDENTITY_PLATFORM_DEGRADATION_SCORING,
} from "../identity-platform-degradation";
import {
  authorizationPolicyRolloutFailure,
  authorizationPolicyRolloutFailureCandidateUI,
  AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
} from "../authorization-policy-rollout-failure";
import {
  dataPipelineFreshnessCollapse,
  dataPipelineFreshnessCollapseCandidateUI,
  DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING,
} from "../data-pipeline-freshness-collapse";
import {
  backfillOverwhelmsProduction,
  backfillOverwhelmsProductionCandidateUI,
  BACKFILL_OVERWHELMS_PRODUCTION_SCORING,
} from "../backfill-overwhelms-production";
import {
  multiServiceMemoryPressureIncident,
  multiServiceMemoryPressureIncidentCandidateUI,
  MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
} from "../multi-service-memory-pressure-incident";
import {
  globalFeatureRolloutIncident,
  globalFeatureRolloutIncidentCandidateUI,
  GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
} from "../global-feature-rollout-incident";
import {
  capacityExhaustionDuringPeakEvent,
  capacityExhaustionDuringPeakEventCandidateUI,
  CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
} from "../capacity-exhaustion-during-peak-event";
import {
  cascadingFailureAcrossSharedPlatform,
  cascadingFailureAcrossSharedPlatformCandidateUI,
  CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
} from "../cascading-failure-across-shared-platform";
import {
  privilegeEscalationViaStaleAuthorizationCache,
  privilegeEscalationViaStaleAuthorizationCacheCandidateUI,
  PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
} from "../privilege-escalation-via-stale-authorization-cache";
import {
  serviceToServiceCredentialRotationFailure,
  serviceToServiceCredentialRotationFailureCandidateUI,
  SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
} from "../service-to-service-credential-rotation-failure";
import {
  fraudControlDegradationDuringPaymentSurge,
  fraudControlDegradationCandidateUI,
  FRAUD_CONTROL_DEGRADATION_SCORING,
} from "../fraud-control-degradation-during-payment-surge";
import {
  abusePreventionFalsePositiveStorm,
  abusePreventionFalsePositiveStormCandidateUI,
  ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING,
} from "../abuse-prevention-false-positive-storm";
import {
  secretLeakageContainmentIncident,
  secretLeakageContainmentIncidentCandidateUI,
  SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING,
} from "../secret-leakage-containment-incident";
import {
  runawayCloudSpendDuringHealthyTraffic,
  runawayCloudSpendDuringHealthyTrafficCandidateUI,
  RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
} from "../runaway-cloud-spend-during-healthy-traffic";
import {
  crossRegionReplicationCostExplosion,
  crossRegionReplicationCostExplosionCandidateUI,
  CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
} from "../cross-region-replication-cost-explosion";
import {
  overprovisionedResilienceDuringLowRiskPeriod,
  overprovisionedResilienceDuringLowRiskPeriodCandidateUI,
  OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
} from "../overprovisioned-resilience-during-low-risk-period";
import {
  expensiveRetryAndLoggingAmplification,
  expensiveRetryAndLoggingAmplificationCandidateUI,
  EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
} from "../expensive-retry-and-logging-amplification";
import {
  modelFeatureFreshnessDegradation,
  modelFeatureFreshnessDegradationCandidateUI,
  MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
} from "../model-feature-freshness-degradation";
import {
  trainingPipelineProducesCorruptedModelArtifact,
  trainingPipelineProducesCorruptedModelArtifactCandidateUI,
  TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
} from "../training-pipeline-produces-corrupted-model-artifact";
import {
  analyticsWarehouseQueryContention,
  analyticsWarehouseQueryContentionCandidateUI,
  ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
} from "../analytics-warehouse-query-contention";
import {
  dataLineageBreakDuringEtlMigration,
  dataLineageBreakDuringEtlMigrationCandidateUI,
  DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
} from "../data-lineage-break-during-etl-migration";
import {
  mlInferenceCostVsQualityIncident,
  mlInferenceCostVsQualityIncidentCandidateUI,
  ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
} from "../ml-inference-cost-vs-quality-incident";
import {
  dataRetentionPolicyMisconfiguration,
  dataRetentionPolicyMisconfigurationCandidateUI,
  DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
} from "../data-retention-policy-misconfiguration";
import {
  privacyDeletionBacklog,
  privacyDeletionBacklogCandidateUI,
  PRIVACY_DELETION_BACKLOG_SCORING,
} from "../privacy-deletion-backlog";
import {
  auditLogIntegrityFailure,
  auditLogIntegrityFailureCandidateUI,
  AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
} from "../audit-log-integrity-failure";
import {
  certificateExpiryAcrossLargeFleet,
  certificateExpiryAcrossLargeFleetCandidateUI,
  CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
} from "../certificate-expiry-across-large-fleet";
import {
  emergencyCapacityReservationDecision,
  emergencyCapacityReservationDecisionCandidateUI,
  EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING,
} from "../emergency-capacity-reservation-decision";
import {
  enterpriseWideDependencyDeprecation,
  enterpriseWideDependencyDeprecationCandidateUI,
  ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING,
} from "../enterprise-wide-dependency-deprecation";
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
  // Phase 6C batch 1 (scenarios 41-45): microservices/dependencies + API traffic
  [partialRegionalDependencyFailure.slug]: {
    definition: partialRegionalDependencyFailure,
    candidateUI: partialRegionalDependencyFailureCandidateUI,
    scoring: PARTIAL_REGIONAL_DEPENDENCY_FAILURE_SCORING,
  },
  [dependencyRateLimitExhaustion.slug]: {
    definition: dependencyRateLimitExhaustion,
    candidateUI: dependencyRateLimitExhaustionCandidateUI,
    scoring: DEPENDENCY_RATE_LIMIT_EXHAUSTION_SCORING,
  },
  [apiTrafficSpike.slug]: {
    definition: apiTrafficSpike,
    candidateUI: apiTrafficSpikeCandidateUI,
    scoring: API_TRAFFIC_SPIKE_SCORING,
  },
  [rateLimitMisconfiguration.slug]: {
    definition: rateLimitMisconfiguration,
    candidateUI: rateLimitMisconfigurationCandidateUI,
    scoring: RATE_LIMIT_MISCONFIGURATION_SCORING,
  },
  [loadBalancerImbalance.slug]: {
    definition: loadBalancerImbalance,
    candidateUI: loadBalancerImbalanceCandidateUI,
    scoring: LOAD_BALANCER_IMBALANCE_SCORING,
  },
  // Phase 6C batch 2 (scenarios 46-50): API traffic management
  [cacheRevalidationHerd.slug]: {
    definition: cacheRevalidationHerd,
    candidateUI: cacheRevalidationHerdCandidateUI,
    scoring: CACHE_REVALIDATION_HERD_SCORING,
  },
  [requestTimeoutCascade.slug]: {
    definition: requestTimeoutCascade,
    candidateUI: requestTimeoutCascadeCandidateUI,
    scoring: REQUEST_TIMEOUT_CASCADE_SCORING,
  },
  [largePayloadRegression.slug]: {
    definition: largePayloadRegression,
    candidateUI: largePayloadRegressionCandidateUI,
    scoring: LARGE_PAYLOAD_REGRESSION_SCORING,
  },
  [apiGatewaySaturation.slug]: {
    definition: apiGatewaySaturation,
    candidateUI: apiGatewaySaturationCandidateUI,
    scoring: API_GATEWAY_SATURATION_SCORING,
  },
  [webhookDeliveryStorm.slug]: {
    definition: webhookDeliveryStorm,
    candidateUI: webhookDeliveryStormCandidateUI,
    scoring: WEBHOOK_DELIVERY_STORM_SCORING,
  },
  // Phase 6C batch 3 (scenarios 51-55): traffic/distributed systems
  [botTrafficSurge.slug]: {
    definition: botTrafficSurge,
    candidateUI: botTrafficSurgeCandidateUI,
    scoring: BOT_TRAFFIC_SURGE_SCORING,
  },
  [unevenTenantTraffic.slug]: {
    definition: unevenTenantTraffic,
    candidateUI: unevenTenantTrafficCandidateUI,
    scoring: UNEVEN_TENANT_TRAFFIC_SCORING,
  },
  [networkPartition.slug]: {
    definition: networkPartition,
    candidateUI: networkPartitionCandidateUI,
    scoring: NETWORK_PARTITION_SCORING,
  },
  [quorumLoss.slug]: {
    definition: quorumLoss,
    candidateUI: quorumLossCandidateUI,
    scoring: QUORUM_LOSS_SCORING,
  },
  [replicationBacklog.slug]: {
    definition: replicationBacklog,
    candidateUI: replicationBacklogCandidateUI,
    scoring: REPLICATION_BACKLOG_SCORING,
  },
  // Phase 6C batch 4 (scenarios 56-60): distributed systems + deployments
  [consistencyVsAvailabilityIncident.slug]: {
    definition: consistencyVsAvailabilityIncident,
    candidateUI: consistencyVsAvailabilityIncidentCandidateUI,
    scoring: CONSISTENCY_VS_AVAILABILITY_INCIDENT_SCORING,
  },
  [duplicateRequestProcessing.slug]: {
    definition: duplicateRequestProcessing,
    candidateUI: duplicateRequestProcessingCandidateUI,
    scoring: DUPLICATE_REQUEST_PROCESSING_SCORING,
  },
  [idempotencyFailure.slug]: {
    definition: idempotencyFailure,
    candidateUI: idempotencyFailureCandidateUI,
    scoring: IDEMPOTENCY_FAILURE_SCORING,
  },
  [distributedCoordinationFailure.slug]: {
    definition: distributedCoordinationFailure,
    candidateUI: distributedCoordinationFailureCandidateUI,
    scoring: DISTRIBUTED_COORDINATION_FAILURE_SCORING,
  },
  [partialRolloutRegression.slug]: {
    definition: partialRolloutRegression,
    candidateUI: partialRolloutRegressionCandidateUI,
    scoring: PARTIAL_ROLLOUT_REGRESSION_SCORING,
  },
  // Phase 6D batch 1 (scenarios 61-65): global/platform incidents
  [multiRegionPaymentPlatformDegradation.slug]: {
    definition: multiRegionPaymentPlatformDegradation,
    candidateUI: multiRegionPaymentPlatformDegradationCandidateUI,
    scoring: MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
  },
  [globalCheckoutBrownout.slug]: {
    definition: globalCheckoutBrownout,
    candidateUI: globalCheckoutBrownoutCandidateUI,
    scoring: GLOBAL_CHECKOUT_BROWNOUT_SCORING,
  },
  [multiTenantControlPlaneOverload.slug]: {
    definition: multiTenantControlPlaneOverload,
    candidateUI: multiTenantControlPlaneOverloadCandidateUI,
    scoring: MULTI_TENANT_CONTROL_PLANE_OVERLOAD_SCORING,
  },
  [regionalFailoverCausesGlobalOverload.slug]: {
    definition: regionalFailoverCausesGlobalOverload,
    candidateUI: regionalFailoverCandidateUI,
    scoring: REGIONAL_FAILOVER_SCORING,
  },
  [crossServiceRetryAmplification.slug]: {
    definition: crossServiceRetryAmplification,
    candidateUI: crossServiceRetryAmplificationCandidateUI,
    scoring: CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
  },
  // Phase 6D batch 2 (scenarios 66-70): data/event correctness incidents
  [ledgerReconciliationDivergence.slug]: {
    definition: ledgerReconciliationDivergence,
    candidateUI: ledgerReconciliationDivergenceCandidateUI,
    scoring: LEDGER_RECONCILIATION_DIVERGENCE_SCORING,
  },
  [hotShardReplicaLagFailoverRisk.slug]: {
    definition: hotShardReplicaLagFailoverRisk,
    candidateUI: hotShardReplicaLagFailoverRiskCandidateUI,
    scoring: HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
  },
  [eventPlatformPartialOutage.slug]: {
    definition: eventPlatformPartialOutage,
    candidateUI: eventPlatformPartialOutageCandidateUI,
    scoring: EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING,
  },
  [searchPlatformCascade.slug]: {
    definition: searchPlatformCascade,
    candidateUI: searchPlatformCascadeCandidateUI,
    scoring: SEARCH_PLATFORM_CASCADE_SCORING,
  },
  [apiMigrationDualWriteFailure.slug]: {
    definition: apiMigrationDualWriteFailure,
    candidateUI: apiMigrationDualWriteFailureCandidateUI,
    scoring: API_MIGRATION_DUAL_WRITE_FAILURE_SCORING,
  },
  // Phase 6D batch 3 (scenarios 71-75): migration/identity/data platform incidents
  [schemaMigrationUnderLiveTraffic.slug]: {
    definition: schemaMigrationUnderLiveTraffic,
    candidateUI: schemaMigrationUnderLiveTrafficCandidateUI,
    scoring: SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING,
  },
  [cacheInvalidationAcrossRegions.slug]: {
    definition: cacheInvalidationAcrossRegions,
    candidateUI: cacheInvalidationAcrossRegionsCandidateUI,
    scoring: CACHE_INVALIDATION_ACROSS_REGIONS_SCORING,
  },
  [identityPlatformDegradation.slug]: {
    definition: identityPlatformDegradation,
    candidateUI: identityPlatformDegradationCandidateUI,
    scoring: IDENTITY_PLATFORM_DEGRADATION_SCORING,
  },
  [authorizationPolicyRolloutFailure.slug]: {
    definition: authorizationPolicyRolloutFailure,
    candidateUI: authorizationPolicyRolloutFailureCandidateUI,
    scoring: AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
  },
  [dataPipelineFreshnessCollapse.slug]: {
    definition: dataPipelineFreshnessCollapse,
    candidateUI: dataPipelineFreshnessCollapseCandidateUI,
    scoring: DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING,
  },
  // Phase 6D batch 4 (scenarios 76-80): peak-load/cross-platform incidents
  [backfillOverwhelmsProduction.slug]: {
    definition: backfillOverwhelmsProduction,
    candidateUI: backfillOverwhelmsProductionCandidateUI,
    scoring: BACKFILL_OVERWHELMS_PRODUCTION_SCORING,
  },
  [multiServiceMemoryPressureIncident.slug]: {
    definition: multiServiceMemoryPressureIncident,
    candidateUI: multiServiceMemoryPressureIncidentCandidateUI,
    scoring: MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING,
  },
  [globalFeatureRolloutIncident.slug]: {
    definition: globalFeatureRolloutIncident,
    candidateUI: globalFeatureRolloutIncidentCandidateUI,
    scoring: GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
  },
  [capacityExhaustionDuringPeakEvent.slug]: {
    definition: capacityExhaustionDuringPeakEvent,
    candidateUI: capacityExhaustionDuringPeakEventCandidateUI,
    scoring: CAPACITY_EXHAUSTION_DURING_PEAK_EVENT_SCORING,
  },
  [cascadingFailureAcrossSharedPlatform.slug]: {
    definition: cascadingFailureAcrossSharedPlatform,
    candidateUI: cascadingFailureAcrossSharedPlatformCandidateUI,
    scoring: CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
  },
  // Phase 6E batch 1 (scenarios 81-85): security/authorization/abuse-prevention incidents
  [privilegeEscalationViaStaleAuthorizationCache.slug]: {
    definition: privilegeEscalationViaStaleAuthorizationCache,
    candidateUI: privilegeEscalationViaStaleAuthorizationCacheCandidateUI,
    scoring: PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
  },
  [serviceToServiceCredentialRotationFailure.slug]: {
    definition: serviceToServiceCredentialRotationFailure,
    candidateUI: serviceToServiceCredentialRotationFailureCandidateUI,
    scoring: SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
  },
  [fraudControlDegradationDuringPaymentSurge.slug]: {
    definition: fraudControlDegradationDuringPaymentSurge,
    candidateUI: fraudControlDegradationCandidateUI,
    scoring: FRAUD_CONTROL_DEGRADATION_SCORING,
  },
  [abusePreventionFalsePositiveStorm.slug]: {
    definition: abusePreventionFalsePositiveStorm,
    candidateUI: abusePreventionFalsePositiveStormCandidateUI,
    scoring: ABUSE_PREVENTION_FALSE_POSITIVE_STORM_SCORING,
  },
  [secretLeakageContainmentIncident.slug]: {
    definition: secretLeakageContainmentIncident,
    candidateUI: secretLeakageContainmentIncidentCandidateUI,
    scoring: SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING,
  },
  // Phase 6E batch 2 (scenarios 86-90): cost-efficiency and internal-data incidents
  [runawayCloudSpendDuringHealthyTraffic.slug]: {
    definition: runawayCloudSpendDuringHealthyTraffic,
    candidateUI: runawayCloudSpendDuringHealthyTrafficCandidateUI,
    scoring: RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
  },
  [crossRegionReplicationCostExplosion.slug]: {
    definition: crossRegionReplicationCostExplosion,
    candidateUI: crossRegionReplicationCostExplosionCandidateUI,
    scoring: CROSS_REGION_REPLICATION_COST_EXPLOSION_SCORING,
  },
  [overprovisionedResilienceDuringLowRiskPeriod.slug]: {
    definition: overprovisionedResilienceDuringLowRiskPeriod,
    candidateUI: overprovisionedResilienceDuringLowRiskPeriodCandidateUI,
    scoring: OVERPROVISIONED_RESILIENCE_DURING_LOW_RISK_PERIOD_SCORING,
  },
  [expensiveRetryAndLoggingAmplification.slug]: {
    definition: expensiveRetryAndLoggingAmplification,
    candidateUI: expensiveRetryAndLoggingAmplificationCandidateUI,
    scoring: EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
  },
  [modelFeatureFreshnessDegradation.slug]: {
    definition: modelFeatureFreshnessDegradation,
    candidateUI: modelFeatureFreshnessDegradationCandidateUI,
    scoring: MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
  },
  // Phase 6E batch 3 (scenarios 91-95): ML/analytics/compliance incidents
  [trainingPipelineProducesCorruptedModelArtifact.slug]: {
    definition: trainingPipelineProducesCorruptedModelArtifact,
    candidateUI: trainingPipelineProducesCorruptedModelArtifactCandidateUI,
    scoring: TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
  },
  [analyticsWarehouseQueryContention.slug]: {
    definition: analyticsWarehouseQueryContention,
    candidateUI: analyticsWarehouseQueryContentionCandidateUI,
    scoring: ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING,
  },
  [dataLineageBreakDuringEtlMigration.slug]: {
    definition: dataLineageBreakDuringEtlMigration,
    candidateUI: dataLineageBreakDuringEtlMigrationCandidateUI,
    scoring: DATA_LINEAGE_BREAK_DURING_ETL_MIGRATION_SCORING,
  },
  [mlInferenceCostVsQualityIncident.slug]: {
    definition: mlInferenceCostVsQualityIncident,
    candidateUI: mlInferenceCostVsQualityIncidentCandidateUI,
    scoring: ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
  },
  [dataRetentionPolicyMisconfiguration.slug]: {
    definition: dataRetentionPolicyMisconfiguration,
    candidateUI: dataRetentionPolicyMisconfigurationCandidateUI,
    scoring: DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
  },
  // Phase 6E batch 4 (scenarios 96-100): privacy, auditability, long-horizon remediation, proactive capacity, and enterprise migration governance incidents — final Phase 6E batch
  [privacyDeletionBacklog.slug]: {
    definition: privacyDeletionBacklog,
    candidateUI: privacyDeletionBacklogCandidateUI,
    scoring: PRIVACY_DELETION_BACKLOG_SCORING,
  },
  [auditLogIntegrityFailure.slug]: {
    definition: auditLogIntegrityFailure,
    candidateUI: auditLogIntegrityFailureCandidateUI,
    scoring: AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
  },
  [certificateExpiryAcrossLargeFleet.slug]: {
    definition: certificateExpiryAcrossLargeFleet,
    candidateUI: certificateExpiryAcrossLargeFleetCandidateUI,
    scoring: CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
  },
  [emergencyCapacityReservationDecision.slug]: {
    definition: emergencyCapacityReservationDecision,
    candidateUI: emergencyCapacityReservationDecisionCandidateUI,
    scoring: EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING,
  },
  [enterpriseWideDependencyDeprecation.slug]: {
    definition: enterpriseWideDependencyDeprecation,
    candidateUI: enterpriseWideDependencyDeprecationCandidateUI,
    scoring: ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING,
  },
};
