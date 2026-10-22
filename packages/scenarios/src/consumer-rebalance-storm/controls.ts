import type { ControlDefinition } from "@incidentrank/simulator";

export const DEPLOY_STRATEGY_KEY = "deployStrategy";
export const SESSION_TIMEOUT_MS_KEY = "sessionTimeoutMs";
export const STATIC_GROUP_MEMBERSHIP_ENABLED_KEY = "staticGroupMembershipEnabled";

export const controls: ControlDefinition[] = [
  {
    key: DEPLOY_STRATEGY_KEY,
    allowedValues: ["rolling-one-at-a-time", "rolling-batched", "blue-green"],
    initialValue: "rolling-one-at-a-time",
  },
  {
    key: SESSION_TIMEOUT_MS_KEY,
    allowedValues: [6_000, 10_000, 30_000, 60_000],
    initialValue: 10_000,
  },
  {
    key: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
