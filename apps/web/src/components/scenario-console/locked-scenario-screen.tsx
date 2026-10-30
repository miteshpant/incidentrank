import Link from "next/link";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import type { PracticeAccessResult } from "@/lib/practice-access";
import { UseIncidentPassButton } from "./use-incident-pass-button";
import { ScenarioMetadata } from "./scenario-metadata";

/**
 * Copy variants per the locked scenario's exact access reason (Phase 8:
 * docs/implementation_plan/phase8_admin_promotional_access_referrals.md
 * §42, corrected by phase8loc.md Step 18; Phase 9 payments superseded
 * the original "coming soon" default — a candidate with no entitlement
 * and no pass can genuinely upgrade now, so the default points at
 * /pricing instead of claiming the feature doesn't exist). The Incident
 * Pass variants require the actual bind affordance (a client component
 * with the explicit confirmation step — "Use your Incident Pass for
 * this incident? Once selected, this pass can't be moved to another
 * incident"), added separately rather than inline here to keep this
 * component a plain server-renderable presentational shell. No inline
 * checkout button in any variant — upgrading always routes through the
 * real /pricing page.
 */
function lockedMessage(access: PracticeAccessResult | undefined): string {
  if (access && !access.allowed && access.reason === "incident_pass_available") {
    return "You have an available Incident Pass. Use it to unlock this one incident.";
  }
  if (access && !access.allowed && access.reason === "incident_pass_bound_elsewhere") {
    return "Your Incident Pass is already assigned to another scenario.";
  }
  return "This is a Pro scenario. Upgrade to Pro to unlock it.";
}

/** Whether the "Upgrade to Pro" link below the message should render —
 * every case except the two Incident Pass states, which have their own
 * resolution path (bind the pass, or it's already bound elsewhere). */
function shouldShowUpgradeLink(access: PracticeAccessResult | undefined): boolean {
  if (!access || access.allowed) return true;
  return access.reason !== "incident_pass_available" && access.reason !== "incident_pass_bound_elsewhere";
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

        {shouldShowUpgradeLink(access) && (
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
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
