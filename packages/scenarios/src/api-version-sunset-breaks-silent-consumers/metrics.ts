import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  v1ErrorRate5xxPercent: 0.2,
  orderCreationFailureRatePercent: 0.3,
  unregisteredV1CallerCount: 2,
  registeredV1ConsumerMigratedPercent: 100,
  supportTicketBacklogCount: 3,
  gatewayTlsHandshakeFailureCount: 4,
  diagnosisPath: "not-attempted",
  remediationStrategy: "not-attempted",
  investigationQuality: "not-attempted",
};
