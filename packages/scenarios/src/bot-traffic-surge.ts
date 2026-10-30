import type { ScenarioDefinition } from "./types";
import {
  botTrafficSurgeSimulation,
  CACHE_AGGRESSIVENESS_KEY,
  CHALLENGE_POLICY_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  RATE_LIMIT_TIER_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "./bot-traffic-surge/definition";
import { botTrafficSurgeCandidateUI } from "./bot-traffic-surge/candidate-ui";
import { BOT_TRAFFIC_SURGE_SCORING } from "./bot-traffic-surge/scoring";

/**
 * Bot Traffic Surge — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6c.md, scenario 51). Automated traffic
 * is rising sharply against the public API, and it closely resembles
 * legitimate usage: realistic user-agents, requests distributed across
 * many source IPs, and normal-looking request shapes. The platform
 * serves real customers on the same edge and API surface the automated
 * traffic is hitting, and any defense that cannot tell the two apart
 * will inevitably catch some of both. The candidate must reduce load on
 * backend services without materially degrading the experience of
 * genuine customers.
 */
export const botTrafficSurge: ScenarioDefinition = {
  id: "bot-traffic-surge",
  slug: "bot-traffic-surge",
  version: 1,
  name: "Bot Traffic Surge",
  description:
    "Automated traffic against the public API has risen sharply. It carries realistic user-agents, is spread across many source IPs, and its request patterns look close enough to ordinary customer usage that a coarse, uniform defense will not cleanly separate the two. Backend services are under growing load, and the platform needs that load brought back to a sustainable level — but every real customer who gets wrongly challenged or blocked along the way is a real, measurable cost, not an acceptable side effect to wave away. Bring suspicious traffic and backend load back under control while keeping that cost to genuine customers as low as you can justify.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "linear",
  simulation: botTrafficSurgeSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Bot Mitigation", "Rate Limiting", "CAPTCHA", "Fraud/Abuse", "Edge Security"],
    skills: [
      "Distinguishing targeted, signal-driven defenses from coarse, uniform ones",
      "Reasoning about false-positive cost as a first-class metric, not a side effect",
      "Recognizing when a 'protected-looking' backend hides real customer harm",
      "Evaluating identity-scoped versus traffic-wide mitigations",
    ],
    shortDescription:
      "Automated traffic that looks almost exactly like real customers is rising fast, and a defense blunt enough to stop it will also catch genuine users.",
  },
};

export {
  botTrafficSurgeSimulation,
  botTrafficSurgeCandidateUI,
  BOT_TRAFFIC_SURGE_SCORING,
  CHALLENGE_POLICY_KEY,
  RATE_LIMIT_TIER_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  CACHE_AGGRESSIVENESS_KEY,
};
