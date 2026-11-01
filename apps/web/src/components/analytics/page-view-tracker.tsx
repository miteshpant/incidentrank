"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires exactly one `page_view` (or `incident_view`, via the `eventName`
 * override) per real mount — a client component with an empty-dependency
 * useEffect runs once per navigation, never again on a parent rerender,
 * satisfying spec §4's "avoid double-counting caused by React rerenders."
 * A ref guard additionally protects against React 18 Strict Mode's
 * deliberate double-invoke of effects in development, so local dev never
 * shows inflated counts either.
 */
export function PageViewTracker({
  eventName = "page_view",
  scenarioSlug,
}: {
  eventName?: "page_view" | "incident_view";
  scenarioSlug?: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent(eventName, { scenarioSlug });
  }, [eventName, scenarioSlug]);

  return null;
}
