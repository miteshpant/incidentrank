"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/dashboard", label: "Customer & Revenue" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/promotional-invites", label: "Promotional Invites" },
  { href: "/admin/incident-passes", label: "Incident Passes" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/admin-users", label: "Admin Users" },
  { href: "/admin/privacy-requests", label: "Privacy Requests" },
  { href: "/admin/paid-entitlements", label: "Paid Entitlements", paymentsOnly: true },
  { href: "/admin/stripe-subscriptions", label: "Stripe Subscriptions", paymentsOnly: true },
  { href: "/admin/founding-allocations", label: "Founding Allocations", paymentsOnly: true },
  { href: "/admin/webhook-events", label: "Webhook Events", paymentsOnly: true },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  const pathname = usePathname();

  // Unauthenticated invite-acceptance flow — the recipient isn't
  // necessarily an admin yet, so showing admin section tabs here would be
  // misleading.
  if (pathname.startsWith("/admin/invite/")) return null;

  const items = ADMIN_NAV_ITEMS.filter((item) => !("paymentsOnly" in item) || paymentsEnabled);

  return (
    <nav className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-1 px-6 font-mono text-xs">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-3 transition-colors ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
