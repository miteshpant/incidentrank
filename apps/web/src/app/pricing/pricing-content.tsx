import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isPaymentsEnabled } from "@/lib/server/feature-flags";
import { evaluatePaidPracticeEntitlement } from "@/lib/server/stripe/entitlements";
import { getFoundingCapacity } from "@/lib/server/stripe/founding-allocation";
import { CheckoutButton } from "@/components/checkout-button";

/**
 * Pricing cards for Pro and Founding Engineer (docs/implementation_plan/
 * phase9.md §13/§33). When PAYMENTS_ENABLED is off, shows "coming soon"
 * copy with no checkout buttons at all, matching the locked-scenario
 * screen's existing not-yet-available convention. Founding capacity is
 * read live from foundingEngineerAllocations — never a hardcoded "100"
 * claimed count.
 */
export async function PricingContent() {
  if (!isPaymentsEnabled()) {
    return (
      <div className="mt-10 rounded-md border border-border p-6">
        <p className="text-sm text-muted">
          Pro and Founding Engineer access are coming soon.
        </p>
      </div>
    );
  }

  const user = await getOrCreateCurrentUser();
  const [entitlement, capacity] = await Promise.all([
    user ? evaluatePaidPracticeEntitlement(user.id) : Promise.resolve(null),
    getFoundingCapacity(),
  ]);

  const isFounding = entitlement === "founding_lifetime";
  const isPro = entitlement === "pro";

  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col rounded-md border border-border p-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Pro</h2>
        <p className="mt-2 text-2xl font-semibold">$9.99/mo</p>
        <p className="mt-1 text-sm text-muted">or $79/yr — all premium incidents, while active.</p>

        <div className="mt-6 flex flex-col gap-2">
          <CheckoutButton
            plan="pro_monthly"
            label={isPro ? "Already Pro" : "Choose Monthly"}
            disabled={isFounding || isPro}
            signedIn={!!user}
          />
          <CheckoutButton
            plan="pro_annual"
            label={isPro ? "Already Pro" : "Choose Annual"}
            disabled={isFounding || isPro}
            signedIn={!!user}
          />
        </div>

        {isFounding && (
          <p className="mt-3 text-xs text-muted">
            You already have Founding Engineer lifetime access.
          </p>
        )}
      </div>

      <div className="flex flex-col rounded-md border border-border p-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Founding Engineer
        </h2>
        <p className="mt-2 text-2xl font-semibold">$99 one-time</p>
        <p className="mt-1 text-sm text-muted">Lifetime access to every premium incident.</p>
        <p className="mt-3 text-xs text-muted">
          {capacity.soldOut
            ? "Sold out — all 100 Founding Engineer spots have been claimed."
            : `${capacity.issued + capacity.reserved} of 100 claimed.`}
        </p>

        <div className="mt-6">
          <CheckoutButton
            plan="founding_lifetime"
            label={isFounding ? "Already Founding" : capacity.soldOut ? "Sold Out" : "Become a Founding Engineer"}
            disabled={isFounding || capacity.soldOut}
            signedIn={!!user}
          />
        </div>
      </div>
    </div>
  );
}
