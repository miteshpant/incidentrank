import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  // ── retryCount ───────────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: RETRY_COUNT_KEY,
    valueEquals: 1,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Restoring the pre-deploy retry budget cut wasted dependency volume",
      explanation:
        "Lowering retry count from 2 to 1 directly removes a layer of pure waste: the External Dependency was never meaningfully degraded, so most of those retries succeeded on the first attempt anyway and every extra retry was wasted request, log, and telemetry volume. This is a real, bounded reliability tradeoff — the rare genuine transient failure now gets one fewer self-heal attempt — but it preserves correctness and a sane reliability floor, which retryCount = 0 does not.",
    },
  },
  {
    id: "acc_2",
    controlKey: RETRY_COUNT_KEY,
    valueEquals: 0,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "harmful",
    feedback: {
      title: "Removing retries entirely maximized savings but gave up real reliability",
      explanation:
        "Setting retry count to 0 squeezes out the most dependency-request-cost savings of any retryCount value, but it removes the Worker's only defense against the rare authentic transient dependency hiccup — a real request that would have self-healed on a single retry now simply fails. This measurably increases request failure rate (requestSuccessRate drops below every other reachable state in this scenario) for a cost win that retryCount = 1 captures almost as well without giving up that reliability floor.",
    },
  },
  {
    id: "acc_3",
    controlKey: RETRY_COUNT_KEY,
    valueEquals: 2,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving retry count at the deployed value leaves wasted dependency volume on the table",
      explanation:
        "Retry count 2 is the value the recent deploy left in place — not itself a new harmful action, but leaving it unchanged means the dependency-request-cost waste this deploy introduced is still fully present. Lowering it to 1 is the real, safe correction.",
    },
  },

  // ── retryOwnership ───────────────────────────────────────────────
  {
    id: "acc_4",
    controlKey: RETRY_OWNERSHIP_KEY,
    valueEquals: "worker-owns-retries",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Consolidating retry ownership to a single layer made retryCount mean what it says",
      explanation:
        "The deploy introduced a second, redundant retry loop at the API layer on top of the Worker's own retries, so a single failed dependency call was being retried by two independent layers at once — compounding call volume well beyond what retryCount alone would suggest. Consolidating ownership to the Worker alone removes that duplication with no correctness cost: exactly one layer retries, so the retryCount control now controls what it claims to.",
    },
  },
  {
    id: "acc_5",
    controlKey: RETRY_OWNERSHIP_KEY,
    valueEquals: "duplicated",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Duplicated retry ownership is the deployed default, not a new action",
      explanation:
        "Leaving retry ownership duplicated between the API and Worker layers means lowering retryCount alone will not fully fix dependency-request cost — both layers are still independently retrying. Consolidating ownership is required alongside retryCount to realize the full savings.",
    },
  },

  // ── loggingLevel ─────────────────────────────────────────────────
  {
    id: "acc_6",
    controlKey: LOGGING_LEVEL_KEY,
    valueEquals: "off",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "harmful",
    feedback: {
      title: "Disabling logging destroyed required audit coverage and debugging signal together",
      explanation:
        "Turning logging off makes every cost metric in this scenario look fantastic — dependency, logging, and telemetry cost all collapse to their lowest reachable values, and request success rate is untouched. That apparent win is not real: it does not merely trim noise, it disables the REQUIRED security/audit log lines (authentication/authorization decisions, payment-adjacent actions) this scenario's business invariant requires to stay intact, and it collapses operational debugging signal to zero. Every second this stayed active added to a permanent, non-resetting audit-log blind-window count that stays on the record even after logging is restored, and it materially penalizes Data Integrity and Reliability regardless of how good cost looked.",
    },
  },
  {
    id: "acc_7",
    controlKey: LOGGING_LEVEL_KEY,
    valueEquals: "standard",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Standard logging cut routine verbose noise while keeping required coverage intact",
      explanation:
        "Stepping logging down from verbose to standard removes routine full-detail tracing on every successful call while still capturing outcome, latency, and error detail on failure — a real, safe, bounded cost reduction with every REQUIRED audit/security log line and debugging signal left fully intact. On its own this is only a partial fix (it leaves telemetry and dependency-request cost untouched), which is this scenario's legitimate ACCEPTABLE tier rather than full optimal remediation.",
    },
  },
  {
    id: "acc_8",
    controlKey: LOGGING_LEVEL_KEY,
    valueEquals: "verbose",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Verbose logging is the deployed default, not a new action",
      explanation:
        "Leaving logging at verbose means full request/response detail is still being logged on every routine successful call, not just failures — real, avoidable logging cost left on the table. Stepping down to standard (or further reducing payload/sampling/retention noise) is the safe correction; turning logging off entirely is not.",
    },
  },

  // ── samplingRatePercent ──────────────────────────────────────────
  {
    id: "acc_9",
    controlKey: SAMPLING_RATE_PERCENT_KEY,
    valueEquals: 10,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Aggressive telemetry sampling cut cost with zero debugging-signal loss",
      explanation:
        "Sampling telemetry spans down to 10% removes the large majority of high-cardinality tracing cost. Telemetry is a statistical observability signal, not an individual evidentiary record, so a sampled subset still gives operators a statistically sound picture of system behavior — this is a pure, zero-tradeoff cost win, never a reduction in required audit coverage (which loggingLevel, not sampling, controls).",
    },
  },
  {
    id: "acc_10",
    controlKey: SAMPLING_RATE_PERCENT_KEY,
    valueEquals: 25,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Moderate telemetry sampling reduced cost at zero debugging-signal loss",
      explanation:
        "Sampling telemetry spans down to 25% is a real, safe cost reduction on the telemetry-ingestion axis — smaller than sampling to 10%, but still zero-cost on debugging signal since telemetry is a statistical signal, not an individual record.",
    },
  },
  {
    id: "acc_11",
    controlKey: SAMPLING_RATE_PERCENT_KEY,
    valueEquals: 100,
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Uncapped telemetry sampling is the deployed default, not a new action",
      explanation:
        "Leaving telemetry sampling at 100% means every span is still emitted uncapped — real, avoidable telemetry-ingestion cost left on the table. Sampling down is a pure cost win with no debugging-signal cost.",
    },
  },

  // ── payloadLoggingMode ───────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: PAYLOAD_LOGGING_MODE_KEY,
    valueEquals: "metadata-only",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Metadata-only payload logging kept every audit-relevant field while removing the real cost driver",
      explanation:
        "Logging identifiers, sizes, and outcome instead of full request/response bytes removes the actual storage/ingestion cost driver (large binary/blob fields logged on every call) while preserving every field a REQUIRED audit record needs (who, what action, when, what outcome). This is a genuinely safe cost reduction, never a reduction in audit coverage.",
    },
  },
  {
    id: "acc_13",
    controlKey: PAYLOAD_LOGGING_MODE_KEY,
    valueEquals: "full-payload",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Full-payload logging is the deployed default, not a new action",
      explanation:
        "Leaving payload logging at full-payload means entire request/response bodies, including large fields, are still logged on every call — real, avoidable storage and ingestion cost that metadata-only removes without any audit-coverage cost.",
    },
  },

  // ── telemetryDuplication ─────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: TELEMETRY_DUPLICATION_KEY,
    valueEquals: "deduplicated",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Deduplicating telemetry removed a pure, zero-information duplicate emission",
      explanation:
        "The deploy introduced a defect where the same logical call emitted an identical telemetry span twice — once from the API layer's instrumentation, once again from the Worker's. The second copy never carried any information the first didn't already have, so removing it is a pure cost win with zero debugging-signal cost whatsoever.",
    },
  },
  {
    id: "acc_15",
    controlKey: TELEMETRY_DUPLICATION_KEY,
    valueEquals: "duplicated",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Duplicated telemetry emission is the deployed defect, not a new action",
      explanation:
        "Leaving telemetry duplication in place means every call's telemetry is still being ingested twice for no additional signal — real, avoidable telemetry cost left on the table. Deduplicating is a pure cost win.",
    },
  },

  // ── retentionMode ────────────────────────────────────────────────
  {
    id: "acc_16",
    controlKey: RETENTION_MODE_KEY,
    valueEquals: "tiered",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Tiered retention kept required audit retention while cutting routine-log storage cost",
      explanation:
        "Moving routine operational/debug logs and telemetry to a cheaper, shorter-retention tier while leaving REQUIRED audit/security logs at their full, unchanged retention requirement is a real, safe cost lever — it never degrades audit coverage on its own, only the routine noise sitting alongside it in the same expensive hot-storage tier.",
    },
  },
  {
    id: "acc_17",
    controlKey: RETENTION_MODE_KEY,
    valueEquals: "uniform-hot",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "Uniform hot retention is the deployed default, not a new action",
      explanation:
        "Leaving every log line and telemetry span at the same expensive hot-storage tier and retention window, regardless of whether it is required audit evidence or routine debug noise, leaves real, avoidable storage cost on the table — tiering routine noise down is the safe correction.",
    },
  },

  // ── dependencyBackoff ────────────────────────────────────────────
  {
    id: "acc_18",
    controlKey: DEPENDENCY_BACKOFF_KEY,
    valueEquals: "exponential",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "beneficial",
    feedback: {
      title: "Exponential backoff spread retry traffic out without changing total retried volume",
      explanation:
        "Spacing retry attempts out with exponential backoff does not change how many times a call is retried (retryCount still controls that) — it spreads the SAME retries over more elapsed time, reducing peak request and logging rate. A real, secondary accelerant on top of fixing retryCount/retryOwnership directly, never a substitute for correcting them.",
    },
  },
  {
    id: "acc_19",
    controlKey: DEPENDENCY_BACKOFF_KEY,
    valueEquals: "none",
    whenTriggerEquals: { deployRegressionDetected: true },
    outcome: "neutral",
    feedback: {
      title: "No backoff is the deployed default, not a new action",
      explanation:
        "Leaving retries unbacked-off means wasted retry traffic is generated as fast as possible rather than spread out — not independently harmful, but it leaves a real, secondary cost reduction on the table on top of fixing retryCount/retryOwnership.",
    },
  },
];
