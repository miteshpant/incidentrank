import type { ScenarioGoldenPath } from "./types";
import { abusePreventionFalsePositiveStormGoldenPath } from "./abuse-prevention-false-positive-storm";
import { analyticsWarehouseQueryContentionGoldenPath } from "./analytics-warehouse-query-contention";
import { apiGatewaySaturationGoldenPath } from "./api-gateway-saturation";
import { apiMigrationDualWriteFailureGoldenPath } from "./api-migration-dual-write-failure";
import { apiTrafficSpikeGoldenPath } from "./api-traffic-spike";
import { auditLogIntegrityFailureGoldenPath } from "./audit-log-integrity-failure";
import { authenticationServiceDegradationGoldenPath } from "./authentication-service-degradation";
import { authorizationPolicyRolloutFailureGoldenPath } from "./authorization-policy-rollout-failure";
import { autoscalingFailureGoldenPath } from "./autoscaling-failure";
import { backfillOverwhelmsProductionGoldenPath } from "./backfill-overwhelms-production";
import { badConfigurationRolloutGoldenPath } from "./bad-configuration-rollout";
import { botTrafficSurgeGoldenPath } from "./bot-traffic-surge";
import { cacheEvictionStormGoldenPath } from "./cache-eviction-storm";
import { cacheInvalidationAcrossRegionsGoldenPath } from "./cache-invalidation-across-regions";
import { cacheNodeFailureGoldenPath } from "./cache-node-failure";
import { cacheRevalidationHerdGoldenPath } from "./cache-revalidation-herd";
import { cacheStampedeGoldenPath } from "./cache-stampede";
import { capacityExhaustionDuringPeakEventGoldenPath } from "./capacity-exhaustion-during-peak-event";
import { cascadingFailureAcrossSharedPlatformGoldenPath } from "./cascading-failure-across-shared-platform";
import { cascadingServiceFailureGoldenPath } from "./cascading-service-failure";
import { certificateExpiryAcrossLargeFleetGoldenPath } from "./certificate-expiry-across-large-fleet";
import { consistencyVsAvailabilityIncidentGoldenPath } from "./consistency-vs-availability-incident";
import { consumerRebalanceStormGoldenPath } from "./consumer-rebalance-storm";
import { crossRegionLatencySpikeGoldenPath } from "./cross-region-latency-spike";
import { crossRegionReplicationCostExplosionGoldenPath } from "./cross-region-replication-cost-explosion";
import { crossServiceRetryAmplificationGoldenPath } from "./cross-service-retry-amplification";
import { dataLineageBreakDuringEtlMigrationGoldenPath } from "./data-lineage-break-during-etl-migration";
import { dataPipelineFreshnessCollapseGoldenPath } from "./data-pipeline-freshness-collapse";
import { dataRetentionPolicyMisconfigurationGoldenPath } from "./data-retention-policy-misconfiguration";
import { databaseConnectionSaturationGoldenPath } from "./database-connection-saturation";
import { databaseLockContentionGoldenPath } from "./database-lock-contention";
import { deadLetterQueueExplosionGoldenPath } from "./dead-letter-queue-explosion";
import { deadlockStormGoldenPath } from "./deadlock-storm";
import { dependencyRateLimitExhaustionGoldenPath } from "./dependency-rate-limit-exhaustion";
import { dependencyTimeoutCascadeGoldenPath } from "./dependency-timeout-cascade";
import { deploymentRegressionGoldenPath } from "./deployment-regression";
import { distributedCoordinationFailureGoldenPath } from "./distributed-coordination-failure";
import { distributedLockFailureGoldenPath } from "./distributed-lock-failure";
import { downstreamDependencyFailureGoldenPath } from "./downstream-dependency-failure";
import { duplicateEventProcessingGoldenPath } from "./duplicate-event-processing";
import { duplicateRequestProcessingGoldenPath } from "./duplicate-request-processing";
import { emergencyCapacityReservationDecisionGoldenPath } from "./emergency-capacity-reservation-decision";
import { enterpriseWideDependencyDeprecationGoldenPath } from "./enterprise-wide-dependency-deprecation";
import { eventPlatformPartialOutageGoldenPath } from "./event-platform-partial-outage";
import { eventProcessingBackpressureGoldenPath } from "./event-processing-backpressure";
import { expensiveRetryAndLoggingAmplificationGoldenPath } from "./expensive-retry-and-logging-amplification";
import { fanOutRequestExplosionGoldenPath } from "./fan-out-request-explosion";
import { fraudControlDegradationDuringPaymentSurgeGoldenPath } from "./fraud-control-degradation-during-payment-surge";
import { globalCheckoutBrownoutGoldenPath } from "./global-checkout-brownout";
import { globalFeatureRolloutIncidentGoldenPath } from "./global-feature-rollout-incident";
import { hotDatabasePartitionGoldenPath } from "./hot-database-partition";
import { hotKeyCacheOverloadGoldenPath } from "./hot-key-cache-overload";
import { hotShardReplicaLagFailoverRiskGoldenPath } from "./hot-shard-replica-lag-failover-risk";
import { idempotencyFailureGoldenPath } from "./idempotency-failure";
import { identityPlatformDegradationGoldenPath } from "./identity-platform-degradation";
import { kafkaConsumerLagGoldenPath } from "./kafka-consumer-lag";
import { kafkaPartitionSkewGoldenPath } from "./kafka-partition-skew";
import { largePayloadRegressionGoldenPath } from "./large-payload-regression";
import { leaderElectionStormGoldenPath } from "./leader-election-storm";
import { ledgerReconciliationDivergenceGoldenPath } from "./ledger-reconciliation-divergence";
import { loadBalancerImbalanceGoldenPath } from "./load-balancer-imbalance";
import { memoryLeakGoldenPath } from "./memory-leak";
import { messageRetryStormGoldenPath } from "./message-retry-storm";
import { missingDatabaseIndexGoldenPath } from "./missing-database-index";
import { mlInferenceCostVsQualityIncidentGoldenPath } from "./ml-inference-cost-vs-quality-incident";
import { modelFeatureFreshnessDegradationGoldenPath } from "./model-feature-freshness-degradation";
import { multiRegionPaymentPlatformDegradationGoldenPath } from "./multi-region-payment-platform-degradation";
import { multiServiceMemoryPressureIncidentGoldenPath } from "./multi-service-memory-pressure-incident";
import { multiTenantControlPlaneOverloadGoldenPath } from "./multi-tenant-control-plane-overload";
import { networkPartitionGoldenPath } from "./network-partition";
import { outOfOrderEventsGoldenPath } from "./out-of-order-events";
import { overprovisionedResilienceDuringLowRiskPeriodGoldenPath } from "./overprovisioned-resilience-during-low-risk-period";
import { partialRegionalDependencyFailureGoldenPath } from "./partial-regional-dependency-failure";
import { partialRolloutRegressionGoldenPath } from "./partial-rollout-regression";
import { paymentRetryStormGoldenPath } from "./payment-retry-storm";
import { poisonMessageLoopGoldenPath } from "./poison-message-loop";
import { primaryDatabaseFailoverGoldenPath } from "./primary-database-failover";
import { privacyDeletionBacklogGoldenPath } from "./privacy-deletion-backlog";
import { privilegeEscalationViaStaleAuthorizationCacheGoldenPath } from "./privilege-escalation-via-stale-authorization-cache";
import { quorumLossGoldenPath } from "./quorum-loss";
import { rateLimitFailureGoldenPath } from "./rate-limit-failure";
import { rateLimitMisconfigurationGoldenPath } from "./rate-limit-misconfiguration";
import { readReplicaLagGoldenPath } from "./read-replica-lag";
import { regionalFailoverCausesGlobalOverloadGoldenPath } from "./regional-failover-causes-global-overload";
import { replicationBacklogGoldenPath } from "./replication-backlog";
import { requestTimeoutCascadeGoldenPath } from "./request-timeout-cascade";
import { runawayCloudSpendDuringHealthyTrafficGoldenPath } from "./runaway-cloud-spend-during-healthy-traffic";
import { schemaMigrationUnderLiveTrafficGoldenPath } from "./schema-migration-under-live-traffic";
import { searchPlatformCascadeGoldenPath } from "./search-platform-cascade";
import { secretLeakageContainmentIncidentGoldenPath } from "./secret-leakage-containment-incident";
import { serviceDiscoveryFailureGoldenPath } from "./service-discovery-failure";
import { serviceToServiceCredentialRotationFailureGoldenPath } from "./service-to-service-credential-rotation-failure";
import { slowQueryRegressionGoldenPath } from "./slow-query-regression";
import { splitBrainIncidentGoldenPath } from "./split-brain-incident";
import { storageIopsSaturationGoldenPath } from "./storage-iops-saturation";
import { thirdPartyApiLatencyGoldenPath } from "./third-party-api-latency";
import { thunderingHerdGoldenPath } from "./thundering-herd";
import { trainingPipelineProducesCorruptedModelArtifactGoldenPath } from "./training-pipeline-produces-corrupted-model-artifact";
import { unevenTenantTrafficGoldenPath } from "./uneven-tenant-traffic";
import { webhookDeliveryStormGoldenPath } from "./webhook-delivery-storm";

/**
 * Every built-in scenario's canonical golden path, keyed by slug — see
 * types.ts. Internal test-support only, never re-exported from
 * packages/scenarios/src/index.ts.
 */
export const GOLDEN_PATHS: Record<string, ScenarioGoldenPath> = {
  [abusePreventionFalsePositiveStormGoldenPath.scenarioSlug]: abusePreventionFalsePositiveStormGoldenPath,
  [analyticsWarehouseQueryContentionGoldenPath.scenarioSlug]: analyticsWarehouseQueryContentionGoldenPath,
  [apiGatewaySaturationGoldenPath.scenarioSlug]: apiGatewaySaturationGoldenPath,
  [apiMigrationDualWriteFailureGoldenPath.scenarioSlug]: apiMigrationDualWriteFailureGoldenPath,
  [apiTrafficSpikeGoldenPath.scenarioSlug]: apiTrafficSpikeGoldenPath,
  [auditLogIntegrityFailureGoldenPath.scenarioSlug]: auditLogIntegrityFailureGoldenPath,
  [authenticationServiceDegradationGoldenPath.scenarioSlug]: authenticationServiceDegradationGoldenPath,
  [authorizationPolicyRolloutFailureGoldenPath.scenarioSlug]: authorizationPolicyRolloutFailureGoldenPath,
  [autoscalingFailureGoldenPath.scenarioSlug]: autoscalingFailureGoldenPath,
  [backfillOverwhelmsProductionGoldenPath.scenarioSlug]: backfillOverwhelmsProductionGoldenPath,
  [badConfigurationRolloutGoldenPath.scenarioSlug]: badConfigurationRolloutGoldenPath,
  [botTrafficSurgeGoldenPath.scenarioSlug]: botTrafficSurgeGoldenPath,
  [cacheEvictionStormGoldenPath.scenarioSlug]: cacheEvictionStormGoldenPath,
  [cacheInvalidationAcrossRegionsGoldenPath.scenarioSlug]: cacheInvalidationAcrossRegionsGoldenPath,
  [cacheNodeFailureGoldenPath.scenarioSlug]: cacheNodeFailureGoldenPath,
  [cacheRevalidationHerdGoldenPath.scenarioSlug]: cacheRevalidationHerdGoldenPath,
  [cacheStampedeGoldenPath.scenarioSlug]: cacheStampedeGoldenPath,
  [capacityExhaustionDuringPeakEventGoldenPath.scenarioSlug]: capacityExhaustionDuringPeakEventGoldenPath,
  [cascadingFailureAcrossSharedPlatformGoldenPath.scenarioSlug]: cascadingFailureAcrossSharedPlatformGoldenPath,
  [cascadingServiceFailureGoldenPath.scenarioSlug]: cascadingServiceFailureGoldenPath,
  [certificateExpiryAcrossLargeFleetGoldenPath.scenarioSlug]: certificateExpiryAcrossLargeFleetGoldenPath,
  [consistencyVsAvailabilityIncidentGoldenPath.scenarioSlug]: consistencyVsAvailabilityIncidentGoldenPath,
  [consumerRebalanceStormGoldenPath.scenarioSlug]: consumerRebalanceStormGoldenPath,
  [crossRegionLatencySpikeGoldenPath.scenarioSlug]: crossRegionLatencySpikeGoldenPath,
  [crossRegionReplicationCostExplosionGoldenPath.scenarioSlug]: crossRegionReplicationCostExplosionGoldenPath,
  [crossServiceRetryAmplificationGoldenPath.scenarioSlug]: crossServiceRetryAmplificationGoldenPath,
  [dataLineageBreakDuringEtlMigrationGoldenPath.scenarioSlug]: dataLineageBreakDuringEtlMigrationGoldenPath,
  [dataPipelineFreshnessCollapseGoldenPath.scenarioSlug]: dataPipelineFreshnessCollapseGoldenPath,
  [dataRetentionPolicyMisconfigurationGoldenPath.scenarioSlug]: dataRetentionPolicyMisconfigurationGoldenPath,
  [databaseConnectionSaturationGoldenPath.scenarioSlug]: databaseConnectionSaturationGoldenPath,
  [databaseLockContentionGoldenPath.scenarioSlug]: databaseLockContentionGoldenPath,
  [deadLetterQueueExplosionGoldenPath.scenarioSlug]: deadLetterQueueExplosionGoldenPath,
  [deadlockStormGoldenPath.scenarioSlug]: deadlockStormGoldenPath,
  [dependencyRateLimitExhaustionGoldenPath.scenarioSlug]: dependencyRateLimitExhaustionGoldenPath,
  [dependencyTimeoutCascadeGoldenPath.scenarioSlug]: dependencyTimeoutCascadeGoldenPath,
  [deploymentRegressionGoldenPath.scenarioSlug]: deploymentRegressionGoldenPath,
  [distributedCoordinationFailureGoldenPath.scenarioSlug]: distributedCoordinationFailureGoldenPath,
  [distributedLockFailureGoldenPath.scenarioSlug]: distributedLockFailureGoldenPath,
  [downstreamDependencyFailureGoldenPath.scenarioSlug]: downstreamDependencyFailureGoldenPath,
  [duplicateEventProcessingGoldenPath.scenarioSlug]: duplicateEventProcessingGoldenPath,
  [duplicateRequestProcessingGoldenPath.scenarioSlug]: duplicateRequestProcessingGoldenPath,
  [emergencyCapacityReservationDecisionGoldenPath.scenarioSlug]: emergencyCapacityReservationDecisionGoldenPath,
  [enterpriseWideDependencyDeprecationGoldenPath.scenarioSlug]: enterpriseWideDependencyDeprecationGoldenPath,
  [eventPlatformPartialOutageGoldenPath.scenarioSlug]: eventPlatformPartialOutageGoldenPath,
  [eventProcessingBackpressureGoldenPath.scenarioSlug]: eventProcessingBackpressureGoldenPath,
  [expensiveRetryAndLoggingAmplificationGoldenPath.scenarioSlug]: expensiveRetryAndLoggingAmplificationGoldenPath,
  [fanOutRequestExplosionGoldenPath.scenarioSlug]: fanOutRequestExplosionGoldenPath,
  [fraudControlDegradationDuringPaymentSurgeGoldenPath.scenarioSlug]: fraudControlDegradationDuringPaymentSurgeGoldenPath,
  [globalCheckoutBrownoutGoldenPath.scenarioSlug]: globalCheckoutBrownoutGoldenPath,
  [globalFeatureRolloutIncidentGoldenPath.scenarioSlug]: globalFeatureRolloutIncidentGoldenPath,
  [hotDatabasePartitionGoldenPath.scenarioSlug]: hotDatabasePartitionGoldenPath,
  [hotKeyCacheOverloadGoldenPath.scenarioSlug]: hotKeyCacheOverloadGoldenPath,
  [hotShardReplicaLagFailoverRiskGoldenPath.scenarioSlug]: hotShardReplicaLagFailoverRiskGoldenPath,
  [idempotencyFailureGoldenPath.scenarioSlug]: idempotencyFailureGoldenPath,
  [identityPlatformDegradationGoldenPath.scenarioSlug]: identityPlatformDegradationGoldenPath,
  [kafkaConsumerLagGoldenPath.scenarioSlug]: kafkaConsumerLagGoldenPath,
  [kafkaPartitionSkewGoldenPath.scenarioSlug]: kafkaPartitionSkewGoldenPath,
  [largePayloadRegressionGoldenPath.scenarioSlug]: largePayloadRegressionGoldenPath,
  [leaderElectionStormGoldenPath.scenarioSlug]: leaderElectionStormGoldenPath,
  [ledgerReconciliationDivergenceGoldenPath.scenarioSlug]: ledgerReconciliationDivergenceGoldenPath,
  [loadBalancerImbalanceGoldenPath.scenarioSlug]: loadBalancerImbalanceGoldenPath,
  [memoryLeakGoldenPath.scenarioSlug]: memoryLeakGoldenPath,
  [messageRetryStormGoldenPath.scenarioSlug]: messageRetryStormGoldenPath,
  [missingDatabaseIndexGoldenPath.scenarioSlug]: missingDatabaseIndexGoldenPath,
  [mlInferenceCostVsQualityIncidentGoldenPath.scenarioSlug]: mlInferenceCostVsQualityIncidentGoldenPath,
  [modelFeatureFreshnessDegradationGoldenPath.scenarioSlug]: modelFeatureFreshnessDegradationGoldenPath,
  [multiRegionPaymentPlatformDegradationGoldenPath.scenarioSlug]: multiRegionPaymentPlatformDegradationGoldenPath,
  [multiServiceMemoryPressureIncidentGoldenPath.scenarioSlug]: multiServiceMemoryPressureIncidentGoldenPath,
  [multiTenantControlPlaneOverloadGoldenPath.scenarioSlug]: multiTenantControlPlaneOverloadGoldenPath,
  [networkPartitionGoldenPath.scenarioSlug]: networkPartitionGoldenPath,
  [outOfOrderEventsGoldenPath.scenarioSlug]: outOfOrderEventsGoldenPath,
  [overprovisionedResilienceDuringLowRiskPeriodGoldenPath.scenarioSlug]: overprovisionedResilienceDuringLowRiskPeriodGoldenPath,
  [partialRegionalDependencyFailureGoldenPath.scenarioSlug]: partialRegionalDependencyFailureGoldenPath,
  [partialRolloutRegressionGoldenPath.scenarioSlug]: partialRolloutRegressionGoldenPath,
  [paymentRetryStormGoldenPath.scenarioSlug]: paymentRetryStormGoldenPath,
  [poisonMessageLoopGoldenPath.scenarioSlug]: poisonMessageLoopGoldenPath,
  [primaryDatabaseFailoverGoldenPath.scenarioSlug]: primaryDatabaseFailoverGoldenPath,
  [privacyDeletionBacklogGoldenPath.scenarioSlug]: privacyDeletionBacklogGoldenPath,
  [privilegeEscalationViaStaleAuthorizationCacheGoldenPath.scenarioSlug]: privilegeEscalationViaStaleAuthorizationCacheGoldenPath,
  [quorumLossGoldenPath.scenarioSlug]: quorumLossGoldenPath,
  [rateLimitFailureGoldenPath.scenarioSlug]: rateLimitFailureGoldenPath,
  [rateLimitMisconfigurationGoldenPath.scenarioSlug]: rateLimitMisconfigurationGoldenPath,
  [readReplicaLagGoldenPath.scenarioSlug]: readReplicaLagGoldenPath,
  [regionalFailoverCausesGlobalOverloadGoldenPath.scenarioSlug]: regionalFailoverCausesGlobalOverloadGoldenPath,
  [replicationBacklogGoldenPath.scenarioSlug]: replicationBacklogGoldenPath,
  [requestTimeoutCascadeGoldenPath.scenarioSlug]: requestTimeoutCascadeGoldenPath,
  [runawayCloudSpendDuringHealthyTrafficGoldenPath.scenarioSlug]: runawayCloudSpendDuringHealthyTrafficGoldenPath,
  [schemaMigrationUnderLiveTrafficGoldenPath.scenarioSlug]: schemaMigrationUnderLiveTrafficGoldenPath,
  [searchPlatformCascadeGoldenPath.scenarioSlug]: searchPlatformCascadeGoldenPath,
  [secretLeakageContainmentIncidentGoldenPath.scenarioSlug]: secretLeakageContainmentIncidentGoldenPath,
  [serviceDiscoveryFailureGoldenPath.scenarioSlug]: serviceDiscoveryFailureGoldenPath,
  [serviceToServiceCredentialRotationFailureGoldenPath.scenarioSlug]: serviceToServiceCredentialRotationFailureGoldenPath,
  [slowQueryRegressionGoldenPath.scenarioSlug]: slowQueryRegressionGoldenPath,
  [splitBrainIncidentGoldenPath.scenarioSlug]: splitBrainIncidentGoldenPath,
  [storageIopsSaturationGoldenPath.scenarioSlug]: storageIopsSaturationGoldenPath,
  [thirdPartyApiLatencyGoldenPath.scenarioSlug]: thirdPartyApiLatencyGoldenPath,
  [thunderingHerdGoldenPath.scenarioSlug]: thunderingHerdGoldenPath,
  [trainingPipelineProducesCorruptedModelArtifactGoldenPath.scenarioSlug]: trainingPipelineProducesCorruptedModelArtifactGoldenPath,
  [unevenTenantTrafficGoldenPath.scenarioSlug]: unevenTenantTrafficGoldenPath,
  [webhookDeliveryStormGoldenPath.scenarioSlug]: webhookDeliveryStormGoldenPath,
};
