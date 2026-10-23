import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TARGETED_INDEX_ENABLED_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./controls";

export const missingDatabaseIndexCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "queryLatencyMs", label: "Query Latency", sourceStateKey: "queryLatencyMs", format: "duration" },
    { key: "dbCpuUtilization", label: "DB CPU", sourceStateKey: "dbCpuUtilization", format: "percentage" },
    { key: "scannedRowsPerQuery", label: "Scanned Rows / Query", sourceStateKey: "scannedRowsPerQuery", format: "number" },
    { key: "dbConnectionUtilization", label: "DB Connection Utilization", sourceStateKey: "dbConnectionUtilization", format: "percentage" },
    { key: "apiLatencyMs", label: "API Latency", sourceStateKey: "apiLatencyMs", format: "duration" },
    { key: "requestQueueDepth", label: "Request Queue Depth", sourceStateKey: "requestQueueDepth", format: "number" },
    { key: "dbStatus", label: "Database Status", sourceStateKey: "dbStatus", format: "status" },
  ],
  controls: [
    {
      key: TARGETED_INDEX_ENABLED_KEY,
      label: "Order History Index",
      componentId: "postgresql-primary",
      valueLabels: { false: "Missing", true: "Enabled" },
    },
    {
      key: API_INSTANCE_COUNT_KEY,
      label: "API Instances",
      componentId: "api-service",
    },
    {
      key: DB_CONNECTION_POOL_SIZE_KEY,
      label: "DB Connection Pool Size",
      componentId: "postgresql-primary",
    },
    {
      key: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
      label: "Order History Endpoint",
      componentId: "orders-service",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: QUERY_PAGE_SIZE_KEY,
      label: "Query Page Size",
      componentId: "orders-service",
    },
    {
      key: TEMPORARY_CACHE_ENABLED_KEY,
      label: "Temporary Cache",
      componentId: "orders-service",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api-service", label: "API Service" },
    { id: "orders-service", label: "Orders Service" },
    { id: "postgresql-primary", label: "PostgreSQL Primary" },
  ],
};
