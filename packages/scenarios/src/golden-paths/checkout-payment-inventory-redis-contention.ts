import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  REDIS_CONNECTION_POOL_KEY,
} from "../checkout-payment-inventory-redis-contention/definition";

const CONTENTION_BEGINS_MS = 30_000;

/**
 * Extracted from checkout-payment-inventory-redis-contention.test.ts's
 * "investigating Payment, then Inventory, then Redis, then fixing —
 * reaches the correlated path" — the scenario's own authored strong
 * path. definition.ts's completion has no acceptableCondition authored,
 * so the resolved outcome is automatically tier optimal.
 */
export const checkoutPaymentInventoryRedisContentionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "checkout-payment-inventory-redis-contention",
  actions: [
    { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
    { atMs: CONTENTION_BEGINS_MS + 2_000, controlKey: INSPECT_INVENTORY_DEPLOYS_KEY, value: true },
    { atMs: CONTENTION_BEGINS_MS + 3_000, controlKey: INSPECT_REDIS_CONNECTIONS_KEY, value: true },
    { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
  ],
  finishAtMs: CONTENTION_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
