import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How many times the Worker retries a call to the External Dependency
 * before giving up. 2 (default/root-cause state) is the value a recent
 * deploy raised this to — the dependency itself is NOT meaningfully
 * degraded (see architecture.ts's decoy note), so every one of these
 * retries is pure waste: extra dependency request volume, extra log
 * lines, extra telemetry spans, for a dependency that would have
 * succeeded on the first attempt almost every time. 1 restores the
 * pre-deploy retry budget; 0 removes retries entirely (a real
 * reliability tradeoff — the rare genuine transient failure now surfaces
 * immediately instead of self-healing).
 */
export const RETRY_COUNT_KEY = "retryCount";

/**
 * Whether retries are owned independently by BOTH the API layer and the
 * Worker layer ("duplicated", default/root-cause state — the deploy
 * introduced a second, redundant retry loop at the API layer on top of
 * the Worker's own retries, so a single failed dependency call can be
 * retried by two independent layers, compounding call volume and log/
 * telemetry volume well beyond what retryCount alone would suggest) or
 * consolidated to a single owner ("worker-owns-retries", the correct
 * ownership model — exactly one layer retries, so retryCount means what
 * it says). This is a real, distinct lever from retryCount itself:
 * lowering retryCount while leaving ownership duplicated still retries
 * twice as much as the number suggests.
 */
export const RETRY_OWNERSHIP_KEY = "retryOwnership";

/**
 * Verbosity of structured application logs emitted by the API and
 * Worker. "verbose" (default/root-cause state) logs full request/
 * response detail on every call, including routine successful ones —
 * the deploy left this on globally rather than scoping it to failures or
 * a sampled subset. "standard" logs normal operational detail (request
 * outcome, latency, error detail on failure) without full verbose
 * tracing. "off" is the scenario's central forbidden lever: it disables
 * ALL logging from the API and Worker, including the REQUIRED
 * security/audit log lines (authentication/authorization decisions,
 * payment-adjacent actions) that this scenario's business invariant says
 * must remain intact — this is never a legitimate cost lever, because it
 * destroys operational debugging signal and audit evidence together,
 * not merely trims noise. See auditLogIntegrityStatus in metrics.ts.
 */
export const LOGGING_LEVEL_KEY = "loggingLevel";

/**
 * What fraction of TELEMETRY spans (distinct from the structured
 * application logs loggingLevel controls) are actually emitted to the
 * Telemetry Pipeline. 100 (default/root-cause state) emits every span
 * uncapped. 25/10 sample down telemetry volume — a real, legitimate cost
 * lever for high-cardinality tracing data, since telemetry spans (unlike
 * audit logs) are a statistical observability signal, not an individual
 * evidentiary record — a sampled subset still gives operators a
 * statistically sound picture of system behavior.
 */
export const SAMPLING_RATE_PERCENT_KEY = "samplingRatePercent";

/**
 * Whether logged request/response payloads are captured at full size.
 * "full-payload" (default/root-cause state) logs the entire request and
 * response body on every call, including large binary/blob fields that
 * add real storage and ingestion cost without adding real debugging
 * value for the overwhelming majority of calls. "metadata-only" logs
 * identifiers, sizes, and outcome instead of raw payload bytes — this
 * preserves enough operational debugging signal (and keeps every
 * REQUIRED audit-relevant field intact: who, what action, when, what
 * outcome) while removing the actual payload-size cost driver, a
 * genuinely safe cost reduction, never a reduction in audit coverage.
 */
export const PAYLOAD_LOGGING_MODE_KEY = "payloadLoggingMode";

/**
 * Whether the Logging + Telemetry Pipeline emits the SAME telemetry span
 * twice — once from the API layer's own instrumentation and once again
 * from the Worker's, for the identical logical call — a duplicate-
 * emission defect the same deploy introduced alongside the retry-
 * ownership duplication. "duplicated" (default/root-cause state) doubles
 * telemetry ingestion volume and cost for no additional signal at all
 * (the second copy carries no information the first didn't already
 * have). "deduplicated" removes the redundant second emission — a pure,
 * zero-tradeoff cost win with no debugging-signal cost whatsoever, since
 * the duplicate copy was never informative to begin with.
 */
export const TELEMETRY_DUPLICATION_KEY = "telemetryDuplication";

/**
 * How long logs and telemetry are retained in the Log Store before
 * expiring. "uniform-hot" (default/root-cause state) retains EVERY log
 * line and telemetry span at the same expensive hot-storage tier and
 * retention window, regardless of whether it is a REQUIRED audit record
 * or routine debug noise. "tiered" retains required audit/security logs
 * at their full (unchanged) retention requirement while moving routine
 * operational/debug logs and telemetry to a cheaper, shorter-retention
 * tier — a real cost lever that is only safe when the tiering rule
 * itself still preserves every audit-required record at its full
 * requirement (see metrics.ts's auditLogIntegrityStatus, which tiered
 * retention never degrades on its own).
 */
export const RETENTION_MODE_KEY = "retentionMode";

/**
 * Backoff strategy the Worker uses between retry attempts against the
 * External Dependency. "none" (default/root-cause state) retries
 * immediately with no delay, maximizing the rate at which wasted retry
 * traffic (and its associated logging/telemetry volume) is generated.
 * "exponential" spaces retries out, which does not change the total
 * retryCount but spreads the SAME retries over more elapsed time,
 * reducing peak request/logging rate without changing total retried
 * volume — a real, if secondary, accelerant on top of fixing retryCount/
 * retryOwnership directly, never a substitute for them.
 */
export const DEPENDENCY_BACKOFF_KEY = "dependencyBackoff";

export const controls: ControlDefinition[] = [
  {
    key: RETRY_COUNT_KEY,
    allowedValues: [2, 1, 0],
    initialValue: 2,
  },
  {
    key: RETRY_OWNERSHIP_KEY,
    allowedValues: ["duplicated", "worker-owns-retries"],
    initialValue: "duplicated",
  },
  {
    key: LOGGING_LEVEL_KEY,
    allowedValues: ["verbose", "standard", "off"],
    initialValue: "verbose",
  },
  {
    key: SAMPLING_RATE_PERCENT_KEY,
    allowedValues: [100, 25, 10],
    initialValue: 100,
  },
  {
    key: PAYLOAD_LOGGING_MODE_KEY,
    allowedValues: ["full-payload", "metadata-only"],
    initialValue: "full-payload",
  },
  {
    key: TELEMETRY_DUPLICATION_KEY,
    allowedValues: ["duplicated", "deduplicated"],
    initialValue: "duplicated",
  },
  {
    key: RETENTION_MODE_KEY,
    allowedValues: ["uniform-hot", "tiered"],
    initialValue: "uniform-hot",
  },
  {
    key: DEPENDENCY_BACKOFF_KEY,
    allowedValues: ["none", "exponential"],
    initialValue: "none",
  },
];
