import type { TimedEvent } from "@incidentrank/simulator";

const DEPENDENCY_BLIP_MS = 30_000;
// A second wave: if the Gateway's own retries keep adding new in-flight
// chains on top of ones that were never cancelled, the accumulation
// compounds for several minutes until in-flight requests and connection
// utilization reach their own ceiling — but only as the continuation of
// an already-visible trend (inFlightRequests and abandonedInFlightRequests
// have both been climbing since DEPENDENCY_BLIP_MS whenever cancellation
// is off), never a surprise flip from a healthy-looking state. A
// candidate watching inFlightRequests and connectionUtilizationPercent
// climb has every reason to expect this.
const ACCUMULATION_SATURATION_MS = DEPENDENCY_BLIP_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "dependency-latency-blip",
    atMs: DEPENDENCY_BLIP_MS,
    type: "TRIGGER_SET",
    message:
      "The Dependency's response latency has risen. Calls into it from Service B are starting to take noticeably longer, and the Gateway's retries are starting to fire.",
    setTriggers: { dependencyBlip: true },
  },
  {
    id: "in-flight-accumulation-saturating",
    atMs: ACCUMULATION_SATURATION_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained, uncancelled retry chains have driven in-flight request counts and connection utilization close to their ceiling across every layer.",
    setTriggers: { dependencyBlip: true, accumulationSaturating: true },
  },
];

export { DEPENDENCY_BLIP_MS, ACCUMULATION_SATURATION_MS };
