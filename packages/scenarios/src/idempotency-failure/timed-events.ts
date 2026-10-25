import type { TimedEvent } from "@incidentrank/simulator";

// The idempotency store's primary node begins degrading — elevated
// lookup latency and intermittent timeouts, visible on
// idempotencyStoreHealth before any duplicate side effect has actually
// occurred yet.
const STORE_DEGRADING_MS = 30_000;

// A second wave: sustained degradation on the single-node store (no
// replica to fail over to) escalates from "intermittent timeouts" to
// "effectively unreachable" — but only as the continuation of an
// already-visible trend (idempotencyStoreHealth has been "warning" since
// STORE_DEGRADING_MS), never a surprise flip from a healthy-looking
// state. A candidate watching idempotencyStoreHealth and retryCountPerMin
// climb has every reason to expect this escalation on single-node mode.
const STORE_UNREACHABLE_MS = STORE_DEGRADING_MS + 3 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "idempotency-store-degrading",
    atMs: STORE_DEGRADING_MS,
    type: "TRIGGER_SET",
    message:
      "The idempotency store's primary node is showing elevated lookup latency and intermittent timeouts.",
    setTriggers: { storeDegrading: true },
  },
  {
    id: "idempotency-store-unreachable-on-single-node",
    atMs: STORE_UNREACHABLE_MS,
    type: "TRIGGER_SET",
    message:
      "Sustained degradation on the single-node idempotency store has escalated to the store becoming effectively unreachable.",
    setTriggers: { storeDegrading: true, storeUnreachable: true },
  },
];

export { STORE_DEGRADING_MS, STORE_UNREACHABLE_MS };
