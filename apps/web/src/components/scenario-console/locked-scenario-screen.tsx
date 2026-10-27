import Link from "next/link";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import type { PracticeAccessResult } from "@/lib/practice-access";
import { UseIncidentPassButton } from "./use-incident-pass-button";
import { ScenarioMetadata } from "./scenario-metadata";

/**
 * Phase 8 copy variants per the locked scenario's exact access reason
 * (docs/implementation_plan/phase8_admin_promotional_access_referrals.md
 * §42, corrected by phase8loc.md Step 18) — "Pro — coming soon" is the
 * default no-entitlement state; the Incident Pass variants require the
 * actual bind affordance (a client component with the explicit
 * confirmation step — "Use your Incident Pass for this incident? Once
 * selected, this pass can't be moved to another incident"), added
 * separately rather than inline here to keep this component a plain
 * server-renderable presentational shell. No checkout button in any
 * variant.
 */
function lockedMessage(access: PracticeAccessResult | undefined): string {
  if (!access || access.allowed) {
    return "Pro — coming soon. This scenario isn't available in practice mode yet.";
  }
  if (access.reason === "incident_pass_available") {
    return "You have an available Incident Pass. Use it to unlock this one incident.";
  }
  if (access.reason === "incident_pass_bound_elsewhere") {
    return "Your Incident Pass is already assigned to another scenario.";
  }
  return "Pro — coming soon. This scenario isn't available in practice mode yet.";
}

export function LockedScenarioScreen({
  scenario,
  access,
  availablePassId,
}: {
  scenario: ScenarioDefinition;
  access?: PracticeAccessResult;
  /** Required to render the "Use Incident Pass" affordance — only
   * meaningful when access.reason === "incident_pass_available". */
  availablePassId?: string;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
          🔒 Paid
        </span>

        <div className="mt-4">
          <ScenarioMetadata scenario={scenario} />
        </div>

        <p className="mt-6 rounded-md border border-border bg-background p-4 text-sm text-muted">
          {lockedMessage(access)}
        </p>

        {access &&
          !access.allowed &&
          access.reason === "incident_pass_available" &&
          availablePassId && (
            <UseIncidentPassButton
              passId={availablePassId}
              scenarioSlug={scenario.slug}
              scenarioName={scenario.name}
            />
          )}

        <Link
          href="/incidents"
          className="mt-8 inline-block rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Back to Incidents
        </Link>
      </div>
    </main>
  );
}
