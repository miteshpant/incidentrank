import type { TimedEvent } from "@incidentrank/simulator";

const REGISTRY_DEGRADES_MS = 30_000;
// A second, larger batch of registry entries goes stale if the candidate
// has not refreshed/bypassed the bad snapshot in time. This is not a
// hidden surprise: the registry's underlying unhealthy-entry count is
// continuously rising and candidate-visible the entire time via
// healthyEndpointCount (falling) and discoveryRefreshAgeSeconds (rising)
// in rules.ts's stale-registry-default/retry-amplification states, well
// before this second wave lands — see the Observable Evidence audit.
const SECOND_WAVE_MS = REGISTRY_DEGRADES_MS + 90_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "registry-begins-returning-stale-endpoints",
    atMs: REGISTRY_DEGRADES_MS,
    type: "TRIGGER_SET",
    message:
      "The service registry has begun returning stale endpoint entries for Service C — several registered instances are no longer actually reachable.",
    setTriggers: { registryDegraded: true },
  },
  {
    id: "registry-second-wave",
    atMs: SECOND_WAVE_MS,
    type: "TRIGGER_SET",
    message:
      "A second batch of Service C registry entries has gone stale, shrinking the pool of genuinely healthy endpoints further.",
    setTriggers: { registryDegraded: true, registrySecondWave: true },
  },
];

export { REGISTRY_DEGRADES_MS, SECOND_WAVE_MS };
