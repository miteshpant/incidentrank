import type { ControlDefinition } from "@incidentrank/simulator";

export const CLIENT_JITTER_ENABLED_KEY = "clientJitterEnabled";
export const API_GATEWAY_INSTANCES_KEY = "apiGatewayInstances";
export const REQUEST_QUEUEING_ENABLED_KEY = "requestQueueingEnabled";

export const controls: ControlDefinition[] = [
  {
    key: CLIENT_JITTER_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  { key: API_GATEWAY_INSTANCES_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
  {
    key: REQUEST_QUEUEING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
