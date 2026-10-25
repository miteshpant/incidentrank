import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
} from "./controls";

export const searchPlatformCascadeCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "rankingLatencyMs", label: "Ranking Service Latency", sourceStateKey: "rankingLatencyMs", format: "duration" },
    { key: "coordinatorInFlightRequests", label: "Coordinator In-Flight Requests", sourceStateKey: "coordinatorInFlightRequests", format: "number" },
    { key: "indexClusterAConnections", label: "Index Cluster A Connections", sourceStateKey: "indexClusterAConnections", format: "number" },
    { key: "indexClusterBConnections", label: "Index Cluster B Connections", sourceStateKey: "indexClusterBConnections", format: "number" },
    { key: "featureStoreQps", label: "Feature Store QPS", sourceStateKey: "featureStoreQps", format: "number" },
    { key: "searchApiP99Ms", label: "Search API p99 Latency", sourceStateKey: "searchApiP99Ms", format: "duration" },
    { key: "basicSearchSuccessRatePercent", label: "Basic Search Success Rate", sourceStateKey: "basicSearchSuccessRatePercent", format: "percentage" },
    { key: "rankedResponsePercent", label: "Ranked Response Rate", sourceStateKey: "rankedResponsePercent", format: "percentage" },
    { key: "staleOrUnrelatedResultsServedCount", label: "Stale/Unrelated Results Served (Historical)", sourceStateKey: "staleOrUnrelatedResultsServedCount", format: "number" },
    { key: "coordinatorPressureStatus", label: "Coordinator Pressure", sourceStateKey: "coordinatorPressureStatus", format: "status" },
  ],
  controls: [
    {
      key: RANKING_INCLUSION_KEY,
      label: "Ranking Inclusion",
      componentId: "query-coordinator",
      valueLabels: { included: "Included", excluded: "Excluded" },
    },
    {
      key: RANKING_TIMEOUT_MS_KEY,
      label: "Ranking Timeout",
      componentId: "ranking-service",
      valueLabels: { "5000": "5000ms", "1500": "1500ms", "400": "400ms" },
    },
    {
      key: FEATURE_STORE_USAGE_KEY,
      label: "Feature Store Usage",
      componentId: "feature-store",
      valueLabels: { full: "Full", reduced: "Reduced", off: "Off" },
    },
    {
      key: QUERY_CONCURRENCY_KEY,
      label: "Query Concurrency Limit",
      componentId: "query-coordinator",
      valueLabels: { "100": "100", "200": "200", "400": "400" },
    },
    {
      key: PARTIAL_RESULT_MODE_KEY,
      label: "Partial Result Mode",
      componentId: "query-coordinator",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: CACHE_KEY,
      label: "Query Result Cache",
      componentId: "search-api",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: INDEX_TIMEOUT_MS_KEY,
      label: "Index Timeout",
      componentId: "index-cluster-a",
      valueLabels: { "3000": "3000ms", "1200": "1200ms" },
    },
    {
      key: API_CAPACITY_KEY,
      label: "Search API Capacity",
      componentId: "search-api",
      valueLabels: { "100": "100", "200": "200", "400": "400" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "search-api", label: "Search API" },
    { id: "query-coordinator", label: "Query Coordinator" },
    { id: "index-cluster-a", label: "Index Cluster A" },
    { id: "index-cluster-b", label: "Index Cluster B" },
    { id: "ranking-service", label: "Ranking Service" },
    { id: "feature-store", label: "Feature Store" },
  ],
};
