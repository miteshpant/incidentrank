"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * Renders its children only until the client runtime mounts, then
 * disappears. For SSR-only content that a fuller client component
 * renders again once hydrated (e.g. a crawler/no-JS-visible public
 * landing block ahead of the real interactive briefing screen) — a
 * crawler or no-JS client never hydrates, so they see the children
 * unconditionally; a real browser sees them disappear once the richer
 * client content takes over, avoiding visible duplication.
 *
 * Uses useSyncExternalStore's standard SSR/client-snapshot divergence
 * (server snapshot "not hydrated yet", client snapshot "hydrated") —
 * the React-recommended way to detect hydration without a setState-in-
 * effect mount flag.
 */
export function HideOnceHydrated({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (hydrated) return null;
  return <>{children}</>;
}
