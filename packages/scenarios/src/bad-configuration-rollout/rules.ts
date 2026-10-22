import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "config-service": "healthy",
  "api-service": "healthy",
  "backend-service": "healthy",
  client: "healthy",
};
const criticalHealth: Record<string, ComponentHealth> = {
  "config-service": "critical",
  "api-service": "critical",
  "backend-service": "healthy",
  client: "critical",
};
const recoveringHealth: Record<string, ComponentHealth> = {
  "config-service": "healthy",
  "api-service": "healthy",
  "backend-service": "healthy",
  client: "healthy",
};

export const badConfigRules: Rule[] = [
  {
    id: "scaled-instances-without-revert-harmful",
    when: {
      triggerEquals: { badConfigActive: true },
      controlAtLeast: { [API_SERVICE_INSTANCES_KEY]: 8 },
      controlEquals: { [CONFIG_REVERT_ENABLED_KEY]: false },
    },
    incidentState: "config-wasted-capacity",
    values: {
      requestRejectionRate: 62,
      affectedUserCount: 8_500,
      apiServiceCpuUtilization: 18,
      timeSinceConfigPushMs: 60_000,
      configStatus: "critical",
    },
    componentHealth: criticalHealth,
  },
  {
    id: "config-revert-recovery",
    when: {
      triggerEquals: { badConfigActive: true },
      controlEquals: { [CONFIG_REVERT_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      requestRejectionRate: 0.2,
      affectedUserCount: 0,
      apiServiceCpuUtilization: 20,
      timeSinceConfigPushMs: 60_000,
      configStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },
  {
    id: "freeze-without-revert-partial",
    when: {
      triggerEquals: { badConfigActive: true },
      controlEquals: { [CONFIG_CHANGE_FREEZE_ENABLED_KEY]: true },
    },
    incidentState: "config-frozen-unresolved",
    values: {
      requestRejectionRate: 60,
      affectedUserCount: 8_200,
      apiServiceCpuUtilization: 20,
      timeSinceConfigPushMs: 60_000,
      configStatus: "critical",
    },
    componentHealth: criticalHealth,
  },
  {
    id: "bad-config-critical-default",
    when: { triggerEquals: { badConfigActive: true } },
    incidentState: "config-broken",
    values: {
      requestRejectionRate: 58,
      affectedUserCount: 8_000,
      apiServiceCpuUtilization: 19,
      timeSinceConfigPushMs: 60_000,
      configStatus: "critical",
    },
    componentHealth: criticalHealth,
  },
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestRejectionRate: 0.1,
      affectedUserCount: 0,
      apiServiceCpuUtilization: 20,
      timeSinceConfigPushMs: 0,
      configStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
