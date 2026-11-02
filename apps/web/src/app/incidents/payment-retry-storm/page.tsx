import type { Metadata } from "next";
import { paymentRetryStorm, toPublicScenarioMetadata } from "@incidentrank/scenarios";
import { appBaseUrl } from "@/lib/server/app-url";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { PublicScenarioLanding } from "@/components/scenario-console/public-scenario-landing";
import { ScenarioStructuredData } from "@/components/scenario-console/scenario-structured-data";
import { IncidentConsole } from "./incident-console";

const PUBLIC_SCENARIO = toPublicScenarioMetadata(paymentRetryStorm);

export function generateMetadata(): Metadata {
  const url = `${appBaseUrl()}/incidents/payment-retry-storm`;
  const title = `${PUBLIC_SCENARIO.name} — System Design Incident Practice | IncidentRank`;

  return {
    title,
    description: PUBLIC_SCENARIO.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: PUBLIC_SCENARIO.description,
      url,
      siteName: "IncidentRank",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description: PUBLIC_SCENARIO.description,
    },
  };
}

export default function PaymentRetryStormPage() {
  return (
    <>
      <PageViewTracker eventName="incident_view" scenarioSlug="payment-retry-storm" />
      <PublicScenarioLanding metadata={PUBLIC_SCENARIO} />
      <ScenarioStructuredData metadata={PUBLIC_SCENARIO} />
      <IncidentConsole />
    </>
  );
}
