import type { ControlDefinition } from "@incidentrank/simulator";

export const MAX_INSTANCE_COUNT_KEY = "maxInstanceCount";
export const SCALE_UP_COOLDOWN_SECONDS_KEY = "scaleUpCooldownSeconds";
export const SCALE_UP_THRESHOLD_PERCENT_KEY = "scaleUpThresholdPercent";

export const controls: ControlDefinition[] = [
  { key: MAX_INSTANCE_COUNT_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
  {
    key: SCALE_UP_COOLDOWN_SECONDS_KEY,
    allowedValues: [300, 120, 60, 30],
    initialValue: 300,
  },
  {
    key: SCALE_UP_THRESHOLD_PERCENT_KEY,
    allowedValues: [95, 85, 70, 50],
    initialValue: 95,
  },
];
