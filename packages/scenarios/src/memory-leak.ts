import type { ScenarioDefinition } from "./types";
import {
  memoryLeakSimulation,
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
  CACHE_EVICTION_POLICY_ENABLED_KEY,
} from "./memory-leak/definition";
import { memoryLeakCandidateUI } from "./memory-leak/candidate-ui";
import { MEMORY_LEAK_SCORING } from "./memory-leak/scoring";

/**
 * Memory Leak — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * recent deploy introduced a slow memory leak; usage is climbing
 * steadily and will OOM-kill the process if left untreated. The actual
 * code fix can't ship live — the candidate's job is to contain the blast
 * radius: a one-time restart buys temporary relief but the leak will
 * recur on the same schedule, while a durable memory-limit auto-restart
 * policy turns an unpredictable crash into a safe, scheduled one.
 */
export const memoryLeak: ScenarioDefinition = {
  id: "memory-leak",
  slug: "memory-leak",
  version: 1,
  name: "Memory Leak",
  description:
    "A recent deploy introduced a memory leak, and usage on the API service has begun climbing steadily. GC pauses are growing longer, error rates are rising, and left untreated the process will eventually be OOM-killed. You cannot ship a code fix live — diagnose how to contain the leak's impact before it takes the service down, and make sure your fix actually survives the leak recurring.",
  difficulty: "intermediate",
  estimatedMinutes: 15,
  isFree: false,
  simulation: memoryLeakSimulation,
  library: {
    category: "Infrastructure & Capacity",
    tags: ["Memory Management", "Observability", "Process Supervision", "OOM"],
    skills: [
      "Diagnosing memory leaks and GC pressure",
      "Containment vs. root-cause fixes under time pressure",
      "Process supervision and auto-restart policies",
      "Recognizing plausible-but-incomplete mitigations",
    ],
    shortDescription:
      "A deploy-introduced memory leak is climbing steadily toward an OOM crash, and the real fix can't ship live.",
  },
};

export {
  memoryLeakSimulation,
  memoryLeakCandidateUI,
  MEMORY_LEAK_SCORING,
  MANUAL_RESTART_TRIGGERED_KEY,
  MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
  CACHE_EVICTION_POLICY_ENABLED_KEY,
};
