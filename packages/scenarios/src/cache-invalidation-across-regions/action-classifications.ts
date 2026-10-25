import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` explaining the system consequence, including
 * (per phase6d3.md section 17) where pressure moved and what historical
 * consequence was created or avoided. Neutral rule ids only.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: GLOBAL_CACHE_BYPASS_KEY,
    valueEquals: true,
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "harmful",
    feedback: {
      title: "Disabled caching globally across all three regions",
      explanation:
        "Global bypass maximizes freshness everywhere, including in APAC, which was never broken and was carrying the majority of steady-state cache-hit traffic. Every region's read volume now lands on Origin Store at once — originRequestsPerSec and originLatencyMs come out measurably worse than targeting only US's actual freshness problem. This is the tempting-but-unsafe path: it looks maximally thorough but transfers pressure straight into an Origin overload risk, which Business Invariant 'Origin capacity must be protected' forbids trading away for freshness everywhere.",
    },
  },
  {
    id: "acr_2",
    controlKey: US_CACHE_MODE_KEY,
    valueEquals: "bypass",
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Bypassed US Cache specifically",
      explanation:
        "Routing US reads straight to Origin Store fixes US's stale-read problem immediately and stops new stale-serve damage from accruing, without touching EU or APAC's cache behavior at all. Origin now absorbs US's full read volume — real, visible pressure, but strictly less than a global bypass would create, since APAC's untouched hit-rate traffic never reaches Origin under this targeted response.",
    },
  },
  {
    id: "acr_3",
    controlKey: EU_INVALIDATION_REPLAY_MODE_KEY,
    valueEquals: "deduplicated",
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled invalidation deduplication for EU",
      explanation:
        "Deduplication recognizes a repeat invalidation for a key already evicted within a short window and drops it instead of re-processing it — this stops EU's revalidation storm at its source (duplicate delivery), not merely its symptom. euRevalidationStormRatePerMin drops to zero and Origin's EU-driven load disappears. This has no effect on US's delayed-invalidation problem, which is a structurally different mechanism.",
    },
  },
  {
    id: "acr_4",
    controlKey: EU_INVALIDATION_REPLAY_MODE_KEY,
    valueEquals: "blind-replay",
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "neutral",
    feedback: {
      title: "Left EU invalidation replay mode unchanged",
      explanation:
        "Blind-replay is this scenario's root-cause default for EU — leaving it in place does not itself make anything worse (it is not a newly applied harmful action), but EU's revalidation storm continues to re-evict and re-fetch healthy keys for as long as it stays set this way.",
    },
  },
  {
    id: "acr_5",
    controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated EU's invalidator from the shared publisher",
      explanation:
        "Giving EU's consumer its own isolated connection to the Invalidation Stream / Publisher means EU's replay storm — however bad — can no longer add processing lag to US or APAC's invalidation delivery through the shared connection. This directly protects the business invariant 'regional isolation is preferable to global origin collapse,' extended here to cross-region invalidator contagion rather than only origin capacity, and is a required gate before full recovery is reachable.",
    },
  },
  {
    id: "acr_6",
    controlKey: STALE_WHILE_REVALIDATE_KEY,
    valueEquals: true,
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled stale-while-revalidate for US",
      explanation:
        "Stale-while-revalidate serves the currently-cached value immediately while triggering exactly one background refresh per key, instead of routing every US request to Origin. This bounds US's staleness to a real, authored window — never unbounded — while keeping Origin load materially lower than a full regional bypass. A legitimate, defensible way to satisfy 'a bounded stale-read window may be acceptable,' not merely a weaker copy of bypass.",
    },
  },
  {
    id: "acr_7",
    controlKey: ORIGIN_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "neutral",
    feedback: {
      title: "Raised Origin concurrency",
      explanation:
        "Higher Origin concurrency lets Origin Store absorb more concurrent request volume without its own latency collapsing — real, legitimate relief for whatever load is currently hitting it. It does nothing to fix the root invalidation desynchronization: US still serves stale reads past the freshness bound and EU's storm still recurs. On its own, capacity never reaches the acceptable or optimal tier, and it costs real infrastructure spend.",
    },
  },
  {
    id: "acr_8",
    controlKey: REFRESH_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "harmful",
    feedback: {
      title: "Raised refresh concurrency while a region was still actively broken",
      explanation:
        "Refresh concurrency controls how many concurrent revalidation fetches a region may issue against Origin while repopulating. Raised while EU is still blind-replaying (or while global bypass is active), this means more concurrent duplicate/bypassed refetches hit Origin at once per unit of real time — originRequestsPerSec and originLatencyMs come out measurably worse than the same trigger state at low concurrency. The same lever becomes a real accelerant of recovery once a genuine fix is already in effect, which is why this is only harmful in the specific context it was applied here.",
    },
  },
  {
    id: "acr_9",
    controlKey: US_TTL_SECONDS_KEY,
    valueAtLeast: 900,
    whenTriggerEquals: { invalidationDesyncActive: true },
    outcome: "harmful",
    feedback: {
      title: "Raised US Cache TTL to its longest setting",
      explanation:
        "A longer TTL does reduce how often US re-fetches from Origin on ordinary expiry — a small, real reduction in Origin load. But it directly widens the worst-case staleness window before any uninvalidated value naturally expires, which, combined with the already-delayed invalidation stream, makes US's stale-read rate measurably worse rather than better. This is the explicit, authored tradeoff named in the business invariant 'a bounded stale-read window may be acceptable' — a longer TTL moves the wrong direction on that bound while the invalidation path itself is still broken.",
    },
  },
];
