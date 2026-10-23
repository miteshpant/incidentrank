import type { TimedEvent } from "@incidentrank/simulator";

const DEPLOYMENT_LOCK_ORDER_REGRESSION_MS = 30_000;
// A second wave: checkout traffic rises further while the lock-order
// conflict is still live. This is NOT a pure hidden timer — by this point
// (if the candidate hasn't fixed lock ordering or serialized writes) the
// candidate has already been observing climbing deadlocksPerSec and
// lockWaitTimeMs for four minutes straight, which is the observable reason
// to expect the system is still unstable and getting worse, not better.
// If the candidate HAS removed the lock-order conflict (canonical ordering
// or write serialization), this event's trigger is still set, but the
// rules below never match it against a healthy state, so it has no effect
// — it only amplifies an already-live conflict, never retroactively
// punishes a correct fix.
const TRAFFIC_SURGE_MS = DEPLOYMENT_LOCK_ORDER_REGRESSION_MS + 4 * 60_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "lock-order-regression-deployed",
    atMs: DEPLOYMENT_LOCK_ORDER_REGRESSION_MS,
    type: "TRIGGER_SET",
    message:
      "A recent deployment changed the order in which Order Service and Inventory Service acquire row locks on the shared orders/inventory tables. Concurrent checkouts are now deadlocking in PostgreSQL.",
    setTriggers: { lockOrderConflict: true },
  },
  {
    id: "checkout-traffic-surge",
    atMs: TRAFFIC_SURGE_MS,
    type: "TRIGGER_SET",
    message:
      "Checkout traffic has risen further during the incident window, increasing the rate of concurrent order/inventory transactions.",
    setTriggers: { lockOrderConflict: true, trafficSurge: true },
  },
];

export { DEPLOYMENT_LOCK_ORDER_REGRESSION_MS, TRAFFIC_SURGE_MS };
