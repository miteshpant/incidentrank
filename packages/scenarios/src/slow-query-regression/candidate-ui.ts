import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONNECTION_POOL_SIZE_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  QUERY_TIMEOUT_MS_KEY,
} from "./controls";

export const slowQueryRegressionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "queryLatencyP99Ms", label: "Query Latency P99", sourceStateKey: "queryLatencyP99Ms", format: "duration" },
    { key: "cpuUtilization", label: "CPU Utilization", sourceStateKey: "cpuUtilization", format: "percentage" },
    { key: "queuedQueries", label: "Queued Queries", sourceStateKey: "queuedQueries", format: "number" },
    { key: "rowsScanned", label: "Rows Scanned", sourceStateKey: "rowsScanned", format: "number" },
    { key: "queryStatus", label: "Query Status", sourceStateKey: "queryStatus", format: "status" },
  ],
  controls: [
    {
      key: QUERY_TIMEOUT_MS_KEY,
      label: "Query Timeout",
      componentId: "query-planner",
      valueLabels: { "1000": "1s", "5000": "5s", "15000": "15s", "60000": "60s" },
    },
    {
      key: FORCE_INDEX_HINT_ENABLED_KEY,
      label: "Force Index Hint",
      componentId: "query-planner",
      valueLabels: { false: "Off", true: "On" },
    },
    { key: CONNECTION_POOL_SIZE_KEY, label: "Connection Pool Size", componentId: "primary-database" },
  ],
  components: [
    { id: "api-service", label: "API Service" },
    { id: "query-planner", label: "Query Planner" },
    { id: "primary-database", label: "Primary Database" },
    { id: "stats-collector", label: "Statistics Collector" },
  ],
};
