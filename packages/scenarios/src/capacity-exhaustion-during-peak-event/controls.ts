import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Which traffic classes are admitted at all when the system is under
 * peak pressure. "all-admitted" (default) lets every request class
 * through with no policy-based shedding — this is the zero-action
 * baseline, and it is NOT safe at genuine peak load: it is what lets
 * optional traffic keep competing for the same cache/DB capacity as
 * checkout. "shed-optional" is the scenario's core policy-based
 * triage lever (business invariant #5: "traffic shedding must be
 * policy-based") — it declines search/personalization requests AT THE
 * EDGE, before they ever reach API Fleet/Cache/Database at all, which
 * is strictly more protective than merely disabling the downstream
 * search service (that still absorbs the request and its edge/API
 * cost; this prevents it from being admitted in the first place).
 * "shed-aggressive" additionally sheds non-critical reads ON the
 * critical path's own surface (e.g. speculative pre-fetch, low-value
 * personalization fragments embedded in cart/checkout pages) — a
 * deeper cut, reserved for the most severe pressure.
 */
export const TRAFFIC_CLASS_PRIORITY_KEY = "trafficClassPriority";

/**
 * Edge-level admission control / load shedding independent of traffic
 * class — a blunt, random-looking rejection of SOME fraction of inbound
 * requests regardless of what they are. "off" (default) admits
 * everything. "random-shed" exists specifically as the scenario's
 * named anti-pattern: it reduces total inbound volume (and therefore
 * looks like it helps every metric a little) but is NOT policy-based —
 * it sheds checkout and search traffic in the same proportion, directly
 * violating business invariant #5 and #1 (critical traffic is not
 * being deliberately protected, just statistically likely to survive
 * proportionally to its share of traffic). It is a deliberate decoy:
 * tempting because it is the single blunt lever that touches every
 * downstream metric at once, but it never satisfies this scenario's
 * triage requirement.
 */
export const LOAD_SHEDDING_KEY = "loadShedding";

/**
 * Admission control specifically in front of the Payment/Transaction
 * Service — a SEPARATE, business-critical-path-scoped lever from the
 * generic edge-level admission control above. "open" (default) admits
 * every checkout/transaction request that reaches API Fleet.
 * "protect-critical" applies bounded concurrency/queueing in front of
 * the payment service itself so a sudden burst cannot exceed what the
 * Database can safely absorb from the critical path alone — this is
 * the lever that most directly expresses "critical traffic remains
 * available as long as SAFELY possible" (not unconditionally, and not
 * via a lucky proportional survival from generic shedding).
 */
export const ADMISSION_CONTROL_KEY = "admissionControl";

/**
 * API Fleet's own request-handling concurrency ceiling. "standard"
 * (default) is calibrated for ordinary traffic, not peak-event volume.
 * "high" raises the ceiling, which looks like the obvious "scale up"
 * answer — but it is this scenario's primary PRESSURE-TRANSFER TRAP
 * (phase6d.4.md section 14, mechanism #1): more concurrent requests
 * admitted at the API tier simply means more concurrent requests
 * reaching Cache and Database at the same time. Raised alone (without
 * dbConnectionBudget tightened and without optional traffic shed),
 * `high` pushes the database measurably closer to saturation — see
 * rules.ts's "capacity-escalation-trap" state.
 */
export const API_CONCURRENCY_KEY = "apiConcurrency";

/**
 * Cache's TTL/refresh posture for the catalog/product keys under peak
 * load. "standard" (default) is the ordinary TTL, which under peak
 * traffic's wider, colder key-access pattern degrades hit rate as the
 * incident progresses. "extended-ttl" widens TTLs for read-mostly
 * catalog/product data specifically — a real, durable hit-rate
 * improvement that reduces the volume of requests that ever reach the
 * database, independent of how much traffic is admitted. This is one
 * of the scenario's required >= 3 meaningful levers for a strong path:
 * cache strategy alone never fully protects the database, but it
 * measurably reduces the load every other lever has to handle.
 */
export const CACHE_STRATEGY_KEY = "cacheStrategy";

/**
 * Hard ceiling on concurrent Database connections the whole platform
 * (checkout + catalog/cache-miss + async workers) may hold at once.
 * "unbounded" (default) lets every tier's connection demand sum freely
 * — exactly what makes dbConnectionUtilizationPercent climb toward
 * saturation as cache hit rate falls and worker concurrency rises.
 * "bounded" caps total connections at a safe ceiling — the scenario's
 * most direct expression of business invariant #3 ("the database must
 * not be pushed into collapse"). Bounding alone has a real, honest
 * cost: once the cap binds, EXCESS demand queues or is rejected at the
 * database's own admission edge rather than queuing invisibly inside
 * the database itself — which is exactly why it must be combined with
 * genuinely reducing demand (shedding optional traffic, extending
 * cache TTLs), not relied on alone.
 */
export const DB_CONNECTION_BUDGET_KEY = "dbConnectionBudget";

/**
 * Whether the Search/Personalization Service is serving normally or
 * disabled. "enabled" (default) serves full personalized search/
 * enrichment, which consumes real Cache and Database capacity shared
 * with the checkout and catalog-read paths (see architecture.ts).
 * "disabled" turns it off entirely — the single clearest expression of
 * business invariant #2 ("optional personalization/search may be
 * degraded or disabled") and the central sacrifice this scenario is
 * built around: disabling it frees cache and DB capacity for the
 * critical path, at the real, honest, measured cost of
 * searchAvailabilityStatus going from normal to disabled, which must
 * be visible and explained, never silent.
 */
export const OPTIONAL_FEATURE_DISABLE_KEY = "optionalFeatureDisable";

/**
 * Whether API Fleet defers non-urgent accepted work (order
 * confirmations, receipt generation, inventory reconciliation, loyalty
 * crediting) onto the Async Queue rather than doing it synchronously
 * in the request path. "synchronous" (default) does this work inline,
 * on the Database connection the original request is already holding
 * — real, extra DB pressure on every checkout request, not just
 * extra latency. "defer-to-queue" moves it off the synchronous
 * request path entirely onto the Async Queue, which is this scenario's
 * most direct lever for "accepted async work must remain durable while
 * freeing synchronous capacity" (business invariant #4): it reduces
 * per-request DB connection hold time on the critical path at the real
 * cost of queue depth, which must drain, not simply be ignored once
 * created.
 */
export const ASYNC_DEFERRAL_KEY = "asyncDeferral";

/**
 * Async Worker fleet's processing concurrency. "standard" (default) is
 * calibrated for ordinary backlog depth. "high" drains the Async Queue
 * backlog much faster — but every async worker write lands on the SAME
 * Database the critical path is also using (see architecture.ts's
 * async-workers -> database edge). This is this scenario's SECOND
 * pressure-transfer trap (mechanism #3): draining the backlog
 * aggressively while the database is already under real pressure
 * trades a queue-depth problem for a database-connection-pressure
 * problem — the backlog is bounded and visibly draining either way,
 * but "high" measurably raises dbConnectionUtilizationPercent while
 * the DB is still tight, precisely the premature-drain trap this
 * scenario's recovery-lag design is built to catch.
 */
export const WORKER_CONCURRENCY_KEY = "workerConcurrency";

/**
 * Whether Edge/CDN is routing a portion of peak traffic to a secondary
 * region's full stack (its own Edge/API/Cache capacity, sharing only
 * the primary Database and Async Queue/Workers) or keeping all traffic
 * on the primary region. "primary-only" (default) concentrates 100% of
 * peak demand onto the primary region's Edge/API/Cache tier. "split-
 * regional" routes a real share of read-mostly catalog/search traffic
 * to the secondary region's Edge/API/Cache, relieving PRIMARY Edge/API/
 * Cache pressure specifically — but since both regions ultimately still
 * share the same Database, this never reduces DB pressure by itself; it
 * is a genuine, distinct relief for the edge/API/cache tier only, which
 * is exactly why it is one input to an alternate strong strategy rather
 * than a single fix-everything lever.
 */
export const REGIONAL_ROUTING_KEY = "regionalRouting";

export const controls: ControlDefinition[] = [
  {
    key: TRAFFIC_CLASS_PRIORITY_KEY,
    allowedValues: ["all-admitted", "shed-optional", "shed-aggressive"],
    initialValue: "all-admitted",
  },
  {
    key: LOAD_SHEDDING_KEY,
    allowedValues: ["off", "random-shed"],
    initialValue: "off",
  },
  {
    key: ADMISSION_CONTROL_KEY,
    allowedValues: ["open", "protect-critical"],
    initialValue: "open",
  },
  {
    key: API_CONCURRENCY_KEY,
    allowedValues: ["standard", "high"],
    initialValue: "standard",
  },
  {
    key: CACHE_STRATEGY_KEY,
    allowedValues: ["standard", "extended-ttl"],
    initialValue: "standard",
  },
  {
    key: DB_CONNECTION_BUDGET_KEY,
    allowedValues: ["unbounded", "bounded"],
    initialValue: "unbounded",
  },
  {
    key: OPTIONAL_FEATURE_DISABLE_KEY,
    allowedValues: ["enabled", "disabled"],
    initialValue: "enabled",
  },
  {
    key: ASYNC_DEFERRAL_KEY,
    allowedValues: ["synchronous", "defer-to-queue"],
    initialValue: "synchronous",
  },
  {
    key: WORKER_CONCURRENCY_KEY,
    allowedValues: ["standard", "high"],
    initialValue: "standard",
  },
  {
    key: REGIONAL_ROUTING_KEY,
    allowedValues: ["primary-only", "split-regional"],
    initialValue: "primary-only",
  },
];
