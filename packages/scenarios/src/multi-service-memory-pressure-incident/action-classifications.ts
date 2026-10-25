import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  CACHE_POLICY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  MAX_RESPONSE_SIZE_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
  RESPONSE_FIELD_SET_MODE_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6d.4.md section 18.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: RESPONSE_FIELD_SET_MODE_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "beneficial",
    feedback: {
      title: "Truncated the aggregation object at the source",
      explanation:
        "Reducing the response field set meant the Aggregator stopped building the full nested object from Dependency A, B, and C in the first place — the actual root cause, not the loudly-failing symptom. Memory and GC pressure on every component began a real but gradual decay rather than dropping instantly; full recovery still required the GC/heap decay window to elapse. No customer-visible correctness bound was crossed.",
    },
  },
  {
    id: "acr_2",
    controlKey: AGGREGATION_CONCURRENCY_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced how many oversized objects exist at once",
      explanation:
        "Lowering aggregation concurrency meant fewer of the Aggregator's oversized per-request objects were ever alive in memory simultaneously — a structurally different root-cause fix from trimming the response shape, but equally durable. Pressure decayed gradually across every component rather than instantly, and no dependency was treated as more or less important than another.",
    },
  },
  {
    id: "acr_3",
    controlKey: DEPENDENCY_A_INSTANCE_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the loudest symptom, not the root cause",
      explanation:
        "Adding instances to Dependency A gave it more aggregate heap headroom and real, measurable, but TEMPORARY relief — nothing about the Aggregator's oversized per-request object changed. Dependency B and C, never scaled, absorbed a larger relative share of the same unaddressed amplification and read worse than they would have otherwise, and Dependency A's own relief faded once enough time passed. This is the scenario's central trap: scaling a symptom service is not a durable fix while upstream amplification remains active.",
    },
  },
  {
    id: "acr_4",
    controlKey: MAX_RESPONSE_SIZE_KEY,
    valueEquals: "64kb",
    whenTriggerEquals: { memoryPressureActive: true },
    outcome: "harmful",
    feedback: {
      title: "Truncated past the correctness bound",
      explanation:
        "Capping the Aggregator's own response size looked clean on memory and latency, but it truncated an ALREADY-BUILT oversized object after the fact rather than reducing what was built — and at this cap, truncation cut past the explicit correctness bound the response is contractually required to carry. Enrichment completeness collapsed and the customer-visible error rate rose sharply: a correctness violation, not a capacity fix, and visibly so.",
    },
  },
  {
    id: "acr_5",
    controlKey: WORKER_COUNT_KEY,
    valueAtLeast: 32,
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the root location without fixing the root cause",
      explanation:
        "Adding Aggregator workers scaled the exact component where the oversized object is built, but did nothing to shrink what each worker actually builds and holds — more workers now build the SAME oversized object concurrently, so aggregate Aggregator memory pressure got worse, not better. Scaling the right-sounding component is not the same as fixing what it is doing.",
    },
  },
  {
    id: "acr_6",
    controlKey: API_CONCURRENCY_KEY,
    valueAtLeast: 400,
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "harmful",
    feedback: {
      title: "Admitted more demand into an unfixed root cause",
      explanation:
        "Raising API-tier concurrency let more inbound requests start at once, but each one still drove the same oversized Aggregator work. More concurrent demand on an unaddressed amplification source made memory pressure worse across the Aggregator and every dependency, not better.",
    },
  },
  {
    id: "acr_7",
    controlKey: PARTIAL_RESPONSE_MODE_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the fleet, not the root cause",
      explanation:
        "Allowing responses to complete without every dependency's full result meant the fleet stopped holding memory open waiting on a degraded call — a genuine, real protection against the invariant that the fleet must not enter restart/OOM churn. But the Aggregator still built the full oversized object for whichever dependencies DID respond in time, so memory pressure stayed elevated and enrichment completeness dropped. Real protection, not a finished fix.",
    },
  },
  {
    id: "acr_8",
    controlKey: CACHE_POLICY_KEY,
    valueEquals: "on",
    whenTriggerEquals: { dependencyAGcThrashing: true },
    outcome: "neutral",
    feedback: {
      title: "Cached the symptom, not the cause",
      explanation:
        "Caching the Aggregator's assembled response absorbed repeat identical requests, giving real but incomplete relief. The underlying enrichment payload is highly per-request/per-account variable, so most requests still missed the cache and paid the full oversized cost — a real, measurable improvement over doing nothing, but not a durable fix on its own.",
    },
  },
];
