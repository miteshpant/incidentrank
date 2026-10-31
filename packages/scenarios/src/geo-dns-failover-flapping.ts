import type { ScenarioDefinition } from "./types";
import {
  geoDnsFailoverFlappingSimulation,
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./geo-dns-failover-flapping/definition";
import { geoDnsFailoverFlappingCandidateUI } from "./geo-dns-failover-flapping/candidate-ui";
import { GEO_DNS_FAILOVER_FLAPPING_SCORING } from "./geo-dns-failover-flapping/scoring";

/**
 * GeoDNS Failover Flapping — a paid IncidentRank scenario. A
 * health-check-driven GeoDNS failover controller watches both regions'
 * latency and fails traffic over the instant a single probe looks slow,
 * then fails it right back the instant a single probe looks fast again.
 * Both US-East and US-West individually stay healthy throughout — the
 * region latency blips are real but brief and self-resolving, never a
 * genuine region-wide outage. The actual damage is entirely caused by
 * DNS itself oscillating: every flip tears down in-flight client
 * connections, driving up connection resets and error rates that have
 * nothing to do with either region's own health. The candidate must
 * recognize this is a health-check hysteresis/threshold-tuning problem —
 * requiring more consecutive failed probes and loosening the latency bar
 * a probe must exceed to count as a failure — not a capacity problem in
 * either region, and not something fixed by permanently pinning DNS to
 * one region (which only hides the symptom by disabling automated
 * failover protection entirely).
 */
export const geoDnsFailoverFlapping: ScenarioDefinition = {
  id: "geo-dns-failover-flapping",
  slug: "geo-dns-failover-flapping",
  version: 1,
  name: "Geo-DNS Failover Flapping",
  description:
    "Global clients are seeing a growing rate of connection resets and errors. Neither US-East nor US-West ever reports as unhealthy — each region's own p99 latency only blips briefly before recovering on its own. But GeoDNS failover activity keeps climbing: the controller is flipping traffic back and forth between regions on every transient blip, and every flip tears down in-flight client connections. Diagnose why the failover itself has become the outage, and restore stable routing without simply disabling automated failover.",
  difficulty: "senior",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: geoDnsFailoverFlappingSimulation,
  library: {
    category: "API & Traffic",
    tags: ["DNS", "Failover", "Health Checks", "Hysteresis", "Multi-Region"],
    primarySkill: "Diagnosing health-check hysteresis causing routing-level instability",
    skills: [
      "Distinguishing DNS-level routing instability from app-layer load imbalance",
      "Recognizing when the failover mechanism itself is the outage, not region capacity",
      "Evaluating a brittle pin-one-region shortcut versus a genuine threshold-tuning fix",
      "Reading flap/oscillation metrics distinct from steady-state health signals",
    ],
    shortDescription:
      "GeoDNS keeps failing traffic back and forth between two individually-healthy regions because its health check is too sensitive to transient latency blips.",
  },
};

export {
  geoDnsFailoverFlappingSimulation,
  geoDnsFailoverFlappingCandidateUI,
  GEO_DNS_FAILOVER_FLAPPING_SCORING,
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
};
