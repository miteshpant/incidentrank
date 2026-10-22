import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_GATEWAY_INSTANCES_KEY,
  CLIENT_JITTER_ENABLED_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "client-fleet": "healthy",
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "config-service": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "client-fleet": "healthy",
  "api-gateway": "degraded",
  "auth-service": "degraded",
  "config-service": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "client-fleet": "healthy",
  "api-gateway": "critical",
  "auth-service": "critical",
  "config-service": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "client-fleet": "healthy",
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "config-service": "healthy",
};

export const herdRules: Rule[] = [
  {
    id: "scaled-without-jitter-masked",
    when: {
      triggerEquals: { synchronizedSpike: true },
      controlAtLeast: { [API_GATEWAY_INSTANCES_KEY]: 16 },
      controlEquals: { [CLIENT_JITTER_ENABLED_KEY]: false },
    },
    incidentState: "masked-recurring",
    values: {
      requestsPerSecond: 9_500,
      gatewayErrorRate: 1.5,
      authServiceLatencyMs: 220,
      rejectedRequestCount: 40,
      gatewayStatus: "warning",
    },
    componentHealth: degradedHealth,
  },
  {
    id: "jitter-enabled-recovery",
    when: {
      triggerEquals: { synchronizedSpike: true },
      controlEquals: { [CLIENT_JITTER_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      requestsPerSecond: 420,
      gatewayErrorRate: 0.2,
      authServiceLatencyMs: 35,
      rejectedRequestCount: 0,
      gatewayStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },
  {
    id: "queueing-only-partial",
    when: {
      triggerEquals: { synchronizedSpike: true },
      controlEquals: { [REQUEST_QUEUEING_ENABLED_KEY]: true, [CLIENT_JITTER_ENABLED_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      requestsPerSecond: 11_000,
      gatewayErrorRate: 6,
      authServiceLatencyMs: 900,
      rejectedRequestCount: 150,
      gatewayStatus: "warning",
    },
    componentHealth: degradedHealth,
  },
  {
    id: "gateway-partially-scaled",
    when: {
      triggerEquals: { synchronizedSpike: true },
      controlAtLeast: { [API_GATEWAY_INSTANCES_KEY]: 8 },
    },
    incidentState: "degraded",
    values: {
      requestsPerSecond: 10_500,
      gatewayErrorRate: 10,
      authServiceLatencyMs: 1_400,
      rejectedRequestCount: 320,
      gatewayStatus: "warning",
    },
    componentHealth: degradedHealth,
  },
  {
    id: "herd-critical-default",
    when: { triggerEquals: { synchronizedSpike: true } },
    incidentState: "overwhelmed",
    values: {
      requestsPerSecond: 12_000,
      gatewayErrorRate: 35,
      authServiceLatencyMs: 4_500,
      rejectedRequestCount: 900,
      gatewayStatus: "critical",
    },
    componentHealth: criticalHealth,
  },
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestsPerSecond: 80,
      gatewayErrorRate: 0.1,
      authServiceLatencyMs: 30,
      rejectedRequestCount: 0,
      gatewayStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
