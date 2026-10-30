import type { ScenarioDefinition } from "./types";
import {
  checkoutPaymentInventoryRedisContentionSimulation,
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
  REDIS_CONNECTION_POOL_KEY,
} from "./checkout-payment-inventory-redis-contention/definition";
import { checkoutPaymentInventoryRedisContentionCandidateUI } from "./checkout-payment-inventory-redis-contention/candidate-ui";
import { CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING } from "./checkout-payment-inventory-redis-contention/scoring";

/**
 * Phase 10F reference incident — the first real, deliberately "parallel"-
 * structured scenario, built to validate the Phase 10F infrastructure
 * end to end (docs/implementation_plan/phase10f.md §17). Checkout,
 * Payment, and Inventory look like three independent problems at first
 * glance: Checkout is healthy (it uses a separate connection pool, never
 * explained to the candidate), Payment retries are elevated, and
 * Inventory p95 latency is elevated. Payment and Inventory in fact share
 * a Redis instance — Redis CPU/memory look completely normal (the
 * misleading signal), but Redis connection-pool utilization is pinned
 * near saturation, the actual shared root cause. The candidate must
 * correlate the two seemingly-separate symptoms back to the one
 * dependency both services have in common, rather than chasing either
 * symptom in isolation.
 */
export const checkoutPaymentInventoryRedisContention: ScenarioDefinition = {
  id: "checkout-payment-inventory-redis-contention",
  slug: "checkout-payment-inventory-redis-contention",
  version: 1,
  name: "Checkout, Payment & Inventory Redis Contention",
  description:
    "Checkout traffic looks completely healthy. Payment retries are climbing. Inventory's p95 latency is climbing. These look like two unrelated problems in two unrelated services — until you notice Payment and Inventory both depend on the same Redis instance. Redis CPU and memory look fine; its connection pool does not. Diagnose the shared dependency and restore both services without chasing either symptom in isolation.",
  difficulty: "staff",
  estimatedMinutes: 18,
  isFree: false,
  structure: "parallel",
  simulation: checkoutPaymentInventoryRedisContentionSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Redis", "Shared Dependencies", "Correlation", "Connection Pooling", "Caching"],
    primarySkill: "Correlating symptoms across services to a shared dependency",
    skills: [
      "Distinguishing independent symptoms from a shared root cause",
      "Reading connection-pool saturation vs. CPU/memory as different signals",
      "Recognizing a plausible-but-inferior single-service remediation",
      "Verifying recovery across every dependent service, not just one",
    ],
    shortDescription:
      "Payment retries and Inventory latency both climb — the shared cause is a Redis connection pool neither service's own metrics point to directly.",
  },
};

export {
  checkoutPaymentInventoryRedisContentionSimulation,
  checkoutPaymentInventoryRedisContentionCandidateUI,
  CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING,
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
  REDIS_CONNECTION_POOL_KEY,
};
