import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { isLaunchDiscountsEnabled, isPaymentsEnabled } from "@/lib/server/feature-flags";
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
  // docs/implementation_plan/phase10e.md §3/§4/§5/§42: only an eligible,
  // not-yet-entitled visitor sees launch-offer copy — an existing Pro
  // subscriber or Founding holder is already ineligible for a NEW
  // discounted checkout (their checkout buttons are disabled below
  // regardless), so showing "launch offer" copy to them would be
  // misleading. Never implies the discount lasts forever; always states
  // the exact renewal/base price in the same sentence.
  const showLaunchOffers = isLaunchDiscountsEnabled() && !isFounding && !isPro;

  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col rounded-md border border-border p-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Pro</h2>
        <p className="mt-2 text-2xl font-semibold">$9.99/mo</p>
        <p className="mt-1 text-sm text-muted">or $79/yr — all premium incidents, while active.</p>
        {showLaunchOffers && (
          <div className="mt-3 flex flex-col gap-1 rounded border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted">
            <p>
              <span className="text-foreground">Launch offer:</span> 75% off your first 3 months.
              Then $9.99/month.
            </p>
            <p>
              <span className="text-foreground">Launch offer:</span> 50% off your first year.
              Then $79/year.
            </p>
          </div>
        )}

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
        {showLaunchOffers && (
          <p className="mt-3 rounded border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted">
            <span className="text-foreground">Launch offer:</span> 50% off the one-time price —
            pay roughly half of $99 at checkout. First 100 only.
          </p>
        )}
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
