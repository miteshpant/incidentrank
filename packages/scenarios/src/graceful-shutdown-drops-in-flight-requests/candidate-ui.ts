import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DEPLOY_STRATEGY_KEY,
  DRAIN_TIMEOUT_SECONDS_KEY,
  INSPECT_DEPLOY_HISTORY_KEY,
  INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
  INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const gracefulShutdownDropsInFlightRequestsCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "droppedRequestsPerDeploy",
      label: "Dropped Requests Per Deploy",
      sourceStateKey: "droppedRequestsPerDeploy",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "checkoutErrorRate",
      label: "Checkout Error Rate",
      sourceStateKey: "checkoutErrorRate",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "deployDurationSeconds",
      label: "Deploy Duration",
      sourceStateKey: "deployDurationSeconds",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "orderEventsLagMessages",
      label: "Order Events Queue Lag",
      sourceStateKey: "orderEventsLagMessages",
      format: "number",
      roleInIncident: "noise",
    },
    {
      key: "podTerminationGraceExceededCount",
      label: "Pods Killed Before Drain Completed",
      sourceStateKey: "podTerminationGraceExceededCount",
      format: "number",
      roleInIncident: "root_cause",
    },
    {
      key: "cpuThrottlePercent",
      label: "CPU Throttle",
      sourceStateKey: "cpuThrottlePercent",
      format: "percentage",
      roleInIncident: "context",
    },
  ],
  controls: [
    {
      key: INSPECT_SHUTDOWN_HOOK_LOGS_KEY,
      label: "Inspect Shutdown Hook Logs",
      componentId: "orders-api",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_LOAD_BALANCER_DRAIN_EVENTS_KEY,
      label: "Inspect Load Balancer Drain Events",
      componentId: "load-balancer",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_DEPLOY_HISTORY_KEY,
      label: "Inspect Deploy History",
      componentId: "deploy-controller",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: DRAIN_TIMEOUT_SECONDS_KEY,
      label: "Pod Termination Grace Period / Drain Timeout",
      componentId: "orders-api",
      kind: "remediation",
      valueLabels: { "0": "Default (0s)", "5": "5s", "15": "15s", "30": "30s", "45": "45s" },
    },
    {
      key: DEPLOY_STRATEGY_KEY,
      label: "Deploy Strategy",
      componentId: "deploy-controller",
      kind: "remediation",
      valueLabels: { rolling: "Rolling", surge: "Surge", "blue-green": "Blue-Green" },
    },
    {
      key: REPLICA_COUNT_KEY,
      label: "Replica Count",
      componentId: "orders-api",
      kind: "remediation",
      valueLabels: { "4": "4", "6": "6", "8": "8", "12": "12" },
    },
  ],
  components: [
    { id: "deploy-controller", label: "Deploy Controller" },
    { id: "orders-api", label: "Orders API" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "order-events-queue", label: "Order Events Queue" },
  ],
};
