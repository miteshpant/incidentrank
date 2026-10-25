import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  COMPRESSION_ENABLED_KEY,
  PAGE_SIZE_KEY,
  PAYLOAD_SIZE_LIMIT_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  RESPONSE_PROJECTION_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: RESPONSE_PROJECTION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "beneficial",
    feedback: {
      title: "Reshaped the response to what callers actually need",
      explanation:
        "Projecting the response down to the fields callers actually use removed the newly expanded nested objects from the wire entirely. Payload size, serialization cost, memory pressure, and network utilization all dropped together — this addresses the actual shape change rather than any of its downstream symptoms.",
    },
  },
  {
    id: "acr_2",
    controlKey: PAGE_SIZE_KEY,
    valueAtMost: 25,
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped how much nested detail any one response carries",
      explanation:
        "Sharply reducing the page size meant each individual response expanded far fewer nested records, so per-request payload size and serialization cost both came down for real — a structurally different route to the same kind of fix as response projection, rather than a workaround.",
    },
  },
  {
    id: "acr_3",
    controlKey: API_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled capacity without shrinking the work",
      explanation:
        "Adding API instances spread the same oversized responses across more processes, which did ease how much memory pressure any single instance carried. But every individual request was still exactly as large to serialize and exactly as expensive to transfer — payload size and network utilization stayed exactly where they started, because the number of instances was never the actual constraint.",
    },
  },
  {
    id: "acr_4",
    controlKey: COMPRESSION_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "neutral",
    feedback: {
      title: "Shrank the wire, not the work",
      explanation:
        "Enabling compression meaningfully reduced bytes transferred and the portion of tail latency caused by transfer time. But the API tier still had to build the full oversized object graph in memory before compressing it, so serialization cost and memory pressure stayed elevated — a genuine, real improvement on a different part of the problem than the one actually driving the incident.",
    },
  },
  {
    id: "acr_5",
    controlKey: PAYLOAD_SIZE_LIMIT_KEY,
    valueEquals: "512kb",
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "harmful",
    feedback: {
      title: "Capped the response by cutting off data silently",
      explanation:
        "Enforcing a hard size limit made memory, network, and latency metrics look healthy, but responses that exceeded the cap were truncated before reaching the caller. Clients depending on the fields that got cut off began failing — this traded a capacity problem for a correctness problem rather than actually fixing the oversized response shape.",
    },
  },
  {
    id: "acr_6",
    controlKey: PAYLOAD_SIZE_LIMIT_KEY,
    valueEquals: "128kb",
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "harmful",
    feedback: {
      title: "A tighter cap, cutting off even more data silently",
      explanation:
        "Tightening the size limit further truncated even more of each response before it reached the caller, driving the error rate higher than the looser cap did. Metrics that only measure size or latency looked better, but more callers were now failing against data they depended on and never received.",
    },
  },
  {
    id: "acr_7",
    controlKey: RESPONSE_CACHE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { payloadRegressed: true },
    outcome: "neutral",
    feedback: {
      title: "Cached a response shape that rarely repeats",
      explanation:
        "Caching the full serialized response skips re-serialization and re-transfer on a hit, but the nested data this regression expands varies heavily per account and per request — most calls still missed the cache and paid the full oversized cost. A legitimate, real mitigation whose effectiveness depends on how repetitive the underlying traffic actually is.",
    },
  },
];
