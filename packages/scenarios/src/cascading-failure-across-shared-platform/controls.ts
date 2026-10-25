import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Per-product isolation at the Shared Gateway. "normal" lets a
 * product's traffic (including its retries) through unrestricted.
 * "isolated" sheds a large fraction of that product's traffic at the
 * edge before it ever reaches Shared Identity/Messaging/Database —
 * this is the lever that actually stops Product B's retry
 * amplification from continuing to multiply load onto the shared
 * platform. Isolating the WRONG product (Product C, the bystander, or
 * Product A without also addressing its connection hold time) removes
 * real revenue for that product while doing nothing to relieve the
 * platform, which is the required wrong-target trap surface.
 */
export const PRODUCT_A_ISOLATION_KEY = "productAIsolation";
export const PRODUCT_B_ISOLATION_KEY = "productBIsolation";
export const PRODUCT_C_ISOLATION_KEY = "productCIsolation";

/**
 * Per-product priority at the Shared Gateway's admission controller.
 * "standard" (default) admits all three products' traffic on equal
 * footing even while the platform is saturated. "deprioritized" lowers
 * a single product's admission priority so its traffic is shed first
 * under contention, protecting remaining shared-platform capacity for
 * the other two products — a softer, more surgical alternative to full
 * isolation (business invariant #4: products may be intentionally
 * degraded, not necessarily fully cut off).
 */
export const PRODUCT_B_PRIORITY_KEY = "productBPriority";

/**
 * Per-product retry policy, enforced at the Shared Gateway. "aggressive"
 * (Product B's actual pre-incident default) retries failed/slow calls
 * against Shared Identity immediately and repeatedly — this is the
 * literal mechanism of Product B's amplification: every Shared Identity
 * latency spike multiplies into several retried calls instead of one.
 * "bounded" caps retry count and backs off between attempts, which
 * directly reduces the amplification multiplier without fully isolating
 * the product. This is a genuine ALTERNATE lever to full isolation —
 * bounding retries can relieve amplification pressure even while
 * productBIsolation stays "normal", though more slowly and less
 * completely than isolation.
 */
export const PRODUCT_B_RETRY_POLICY_KEY = "productBRetryPolicy";

/**
 * Shared Identity's own circuit breaker. "closed" (default) keeps
 * Shared Identity accepting every incoming validation request no matter
 * how degraded it already is, including the full amplified volume from
 * Product B's retries — this is what allows a slow dependency to be
 * driven into total collapse by load it cannot absorb. "open" sheds
 * excess load AT Shared Identity itself, protecting it so it can
 * actually recover, at the cost of a bounded number of requests being
 * told to fail fast (fail-closed on identity, never fail-open — see
 * identityFailureMode) rather than queuing indefinitely.
 */
export const IDENTITY_CIRCUIT_BREAKER_KEY = "identityCircuitBreaker";

/**
 * How Shared Identity itself behaves when it cannot complete a
 * validation in time. "fail-open" (the dangerous, tempting lever) treats
 * an unverifiable token as valid rather than rejecting it — this
 * directly violates business invariant #2 ("critical identity
 * correctness must be preserved") and is classified UNSAFE
 * unconditionally, no matter how good availability looks afterward.
 * "fail-closed" (default) rejects anything it cannot verify in time,
 * which is the only identity posture ever compatible with a safe
 * resolution.
 */
export const IDENTITY_FAILURE_MODE_KEY = "identityFailureMode";

/**
 * Shared Cache's assist policy for identity-lookup results. "passive"
 * (default) only serves a cached validation result when one already
 * exists with time remaining on its TTL — under the incident, Shared
 * Identity is slow to populate fresh entries, so the cache does little
 * to absorb load. "assist" extends how long a recently-valid result may
 * be served while Shared Identity is degraded (a bounded, short grace
 * window, not an unbounded stale-forever policy), which is the genuine
 * "protect the root shared dependency" lever distinct from isolating
 * any product — it reduces the volume of validation calls that actually
 * reach Shared Identity regardless of which products are isolated.
 */
export const CACHE_ASSIST_POLICY_KEY = "cacheAssistPolicy";

/**
 * Shared Metadata's read/write posture once identity cannot be reliably
 * verified. "normal" keeps metadata writes fully live even while
 * identity correctness is degraded — this is where the tempting
 * "everything should just keep working" instinct creates real risk:
 * writing metadata under unverified identity is a durability/
 * correctness hazard, not merely a availability tradeoff. "read-only"
 * stops new writes (queuing them safely rather than discarding them)
 * while continuing to serve reads, protecting durability at a real,
 * bounded availability cost (business invariant #3: shared metadata/
 * database durability must not be traded away for short-term
 * availability).
 */
export const METADATA_WRITE_POLICY_KEY = "metadataWritePolicy";

/**
 * Shared Database connection budget. "unbounded" (default) lets every
 * product's connections compete for the pool with no per-product
 * ceiling — this is what lets Product A's long-held connections (a
 * side effect of waiting on slow identity validation) slowly exhaust
 * the shared pool for every other product too, the quiet starvation
 * mechanism. "capped" enforces a hard per-product ceiling, which
 * directly stops one product from exhausting shared capacity for
 * everyone (business invariant #1) regardless of how long that
 * product's connections stay open.
 */
export const DB_CONNECTION_BUDGET_KEY = "dbConnectionBudget";

/**
 * Shared Messaging consumer concurrency (Async Workers). "normal"
 * (default) processes the backlog at its pre-incident rate — once a
 * real backlog has formed, normal concurrency alone drains it very
 * slowly. "scaled" raises consumer concurrency, draining the backlog
 * materially faster — but ONLY once Shared Database connection pressure
 * is itself under control, since each additional worker also holds its
 * own Shared Database connection while committing processed work. This
 * is this scenario's authored pressure-transfer lever on the messaging
 * side: scaling Async Workers before the DB connection budget is capped
 * pushes MORE concurrent connections at an already-exhausted pool.
 */
export const ASYNC_WORKER_CONCURRENCY_KEY = "asyncWorkerConcurrency";

/**
 * Whether newly-enqueued (not yet consumed) async work may be deferred
 * — held at Shared Messaging rather than immediately dispatched to
 * Async Workers — while the platform is still under containment.
 * "immediate" (default) dispatches as fast as workers can pull,
 * competing with backlog drain for the same worker concurrency.
 * "deferred" holds new low-priority work back so Async Workers spend
 * their (currently scarce) concurrency draining the EXISTING backlog
 * first rather than racing new work against it — this does not discard
 * any work (business invariant: accepted work stays durable), it only
 * reorders when it is dispatched.
 */
export const ASYNC_WORKLOAD_DEFERRAL_KEY = "asyncWorkloadDeferral";

/**
 * Final restoration lever: once containment has actually worked, this
 * is the order in which isolated/deprioritized products are brought
 * back to normal. "none" (default/initial) means no restoration
 * decision has been made yet — products remain however isolation left
 * them. "root-first" restores in the deliberate, business-safe order
 * (Product C — the bystander — first, then Product A once DB pressure
 * has genuinely drained, then Product B last, only once BOTH recovery-
 * lag subsystems have drained and amplification is confirmed gone).
 * "all-at-once" restores every isolated product simultaneously,
 * regardless of whether backlogs have drained — this is the required
 * unsafe-early-restoration trap: removing isolation before Shared
 * Identity has recovered AND both backlogs have drained retriggers the
 * cascade, with a real, measurably worse outcome than deliberate
 * ordered restoration reaching the exact same final isolation state.
 */
export const RESTORATION_ORDER_KEY = "restorationOrder";

export const controls: ControlDefinition[] = [
  { key: PRODUCT_A_ISOLATION_KEY, allowedValues: ["normal", "isolated"], initialValue: "normal" },
  { key: PRODUCT_B_ISOLATION_KEY, allowedValues: ["normal", "isolated"], initialValue: "normal" },
  { key: PRODUCT_C_ISOLATION_KEY, allowedValues: ["normal", "isolated"], initialValue: "normal" },
  {
    key: PRODUCT_B_PRIORITY_KEY,
    allowedValues: ["standard", "deprioritized"],
    initialValue: "standard",
  },
  {
    key: PRODUCT_B_RETRY_POLICY_KEY,
    allowedValues: ["aggressive", "bounded"],
    initialValue: "aggressive",
  },
  {
    key: IDENTITY_CIRCUIT_BREAKER_KEY,
    allowedValues: ["closed", "open"],
    initialValue: "closed",
  },
  {
    key: IDENTITY_FAILURE_MODE_KEY,
    allowedValues: ["fail-closed", "fail-open"],
    initialValue: "fail-closed",
  },
  {
    key: CACHE_ASSIST_POLICY_KEY,
    allowedValues: ["passive", "assist"],
    initialValue: "passive",
  },
  {
    key: METADATA_WRITE_POLICY_KEY,
    allowedValues: ["normal", "read-only"],
    initialValue: "normal",
  },
  {
    key: DB_CONNECTION_BUDGET_KEY,
    allowedValues: ["unbounded", "capped"],
    initialValue: "unbounded",
  },
  {
    key: ASYNC_WORKER_CONCURRENCY_KEY,
    allowedValues: ["normal", "scaled"],
    initialValue: "normal",
  },
  {
    key: ASYNC_WORKLOAD_DEFERRAL_KEY,
    allowedValues: ["immediate", "deferred"],
    initialValue: "immediate",
  },
  {
    key: RESTORATION_ORDER_KEY,
    allowedValues: ["none", "root-first", "all-at-once"],
    initialValue: "none",
  },
];
