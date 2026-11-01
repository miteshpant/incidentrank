import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { IncidentConsole } from "./incident-console";

export default function PaymentRetryStormPage() {
  return (
    <>
      <PageViewTracker eventName="incident_view" scenarioSlug="payment-retry-storm" />
      <IncidentConsole />
    </>
  );
}
