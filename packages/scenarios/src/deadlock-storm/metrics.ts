import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  deadlocksPerSec: 0,
  transactionRetries: 0,
  lockWaitTimeMs: 20,
  checkoutFailureRate: 0,
  inventoryUpdateLatencyMs: 40,
  dbConnectionsInUse: 30,
  dbStatus: "normal",
};
