import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  replicationLagMs: 80,
  staleReadRate: 0.5,
  writeLatencyMs: 20,
  queuedWrites: 0,
  replicaStatus: "normal",
};
