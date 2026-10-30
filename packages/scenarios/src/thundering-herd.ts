import type { ScenarioDefinition } from "./types";
import {
  thunderingHerdSimulation,
  CLIENT_JITTER_ENABLED_KEY,
  API_GATEWAY_INSTANCES_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
} from "./thundering-herd/definition";
import { thunderingHerdCandidateUI } from "./thundering-herd/candidate-ui";
import { THUNDERING_HERD_SCORING } from "./thundering-herd/scoring";

/**
 * Thundering Herd — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A large
 * fleet of clients all share the exact same schedule — e.g. a config
 * refresh that fires at the top of every hour — and at that synchronized
 * moment every client hits the API gateway at once, even though average
 * traffic over the hour is entirely reasonable. The candidate must
 * recognize that the durable fix is spreading the fleet's schedule out
 * at the source (jitter), not simply buying more gateway capacity to
 * absorb a spike that will recur on the exact same schedule.
 */
export const thunderingHerd: ScenarioDefinition = {
  id: "thundering-herd",
  slug: "thundering-herd",
  version: 1,
  name: "Thundering Herd",
  description:
    "Your entire client fleet shares the same scheduled config refresh, and the clock has just struck the top of the hour. Every client is hitting the API gateway at the exact same instant, request volume has spiked far beyond anything your average traffic would suggest, and the auth service is struggling to keep up. Diagnose the synchronized spike and stop it from overwhelming the gateway again next hour.",
  difficulty: "senior",
  estimatedMinutes: 12,
  isFree: false,
  structure: "linear",
  simulation: thunderingHerdSimulation,
  library: {
    category: "API & Traffic",
    tags: ["Traffic Spikes", "Jitter", "Load Shedding", "Synchronized Clients", "Rate Limiting"],
    skills: [
      "Diagnosing synchronized-client traffic spikes",
      "Jitter and schedule-spreading strategies",
      "Load shedding vs. capacity scaling tradeoffs",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "An entire client fleet's synchronized schedule fires at once, sending a massive instantaneous spike at the API gateway.",
  },
};

export {
  thunderingHerdSimulation,
  thunderingHerdCandidateUI,
  THUNDERING_HERD_SCORING,
  CLIENT_JITTER_ENABLED_KEY,
  API_GATEWAY_INSTANCES_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
};
