import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHING_ENABLED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the post-incident-feedback requirement
 * (docs/implementation_plan/phase6c.md section 14). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: CACHING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { quotaDrawingDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Cached repeat lookups",
      explanation:
        "Enabling the cache let repeat lookups for the same underlying data be served without a fresh call to the dependency. Call volume against the quota dropped durably, which matters more than a one-time dip — the reduction holds for the rest of the rolling window, not just the moment it was enabled.",
    },
  },
  {
    id: "acr_2",
    controlKey: REQUEST_COALESCING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { quotaDrawingDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Coalesced concurrent duplicate requests",
      explanation:
        "Merging concurrent, identical in-flight requests into a single downstream call meant a burst of duplicate work consumed one unit of quota instead of many. Combined with caching, this is what let call volume fall durably below the quota's sustainable burn rate for the rest of the window.",
    },
  },
  {
    id: "acr_3",
    controlKey: RETRY_AGGRESSIVENESS_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { providerThrottling: true },
    outcome: "harmful",
    feedback: {
      title: "Retried harder against a hard quota",
      explanation:
        "The dependency enforces a hard request quota on a rolling window, not a transient failure that retrying can wait out. Once the provider started returning 429s, firing immediate, repeated retries meant every retry attempt was itself another request counted against the same shrinking window — the 429 rate and the application success rate both got measurably worse than taking no action at all, and the remaining quota was driven to zero before the window could reset.",
    },
  },
  {
    id: "acr_4",
    controlKey: PRIORITY_TRAFFIC_POLICY_KEY,
    valueEquals: "priority-only",
    whenTriggerEquals: { quotaDrawingDown: true },
    outcome: "beneficial",
    feedback: {
      title: "Shed low-priority traffic to protect quota",
      explanation:
        "Restricting downstream calls to high-priority requests meant lower-priority lookups stopped competing for the same shrinking quota. Call volume fell below the sustainable burn rate for the rest of the window — a different tradeoff than caching: it works by deferring/dropping less-important work, not by making every request cheaper.",
    },
  },
  {
    id: "acr_5",
    controlKey: OPTIONAL_FEATURE_SUPPRESSED_KEY,
    valueEquals: true,
    whenTriggerEquals: { quotaDrawingDown: true },
    outcome: "neutral",
    feedback: {
      title: "Removed load by removing a feature",
      explanation:
        "Suppressing the optional enrichment feature removed an entire category of calls to the dependency, and every quota/429/success metric recovered. But the feature itself was unavailable to customers for as long as it stayed off — this stabilizes the platform by trading away functionality, not by making the dependency's call volume sustainable.",
    },
  },
  {
    id: "acr_6",
    controlKey: DEPENDENCY_CONCURRENCY_KEY,
    valueEquals: "capped",
    whenTriggerEquals: { quotaDrawingDown: true },
    outcome: "neutral",
    feedback: {
      title: "Smoothed bursts without reducing total volume enough",
      explanation:
        "Capping concurrency smooths bursts and trims some call volume by naturally queueing excess demand, giving real but incomplete relief. It does not, by itself, bring total call volume below the quota's sustainable burn rate the way caching, coalescing, or shedding low-priority traffic can.",
    },
  },
];
