"use client";

import { track } from "@vercel/analytics";

/**
 * Called from each route's top-level page component when the page has finished
 * its initial render. Used to measure route-to-interactive timing.
 *
 *   useEffect(() => { reportRouteReady("chat") }, []);
 */
export function reportRouteReady(route: string): void {
  if (typeof performance === "undefined") return;
  const t = Math.round(performance.now());
  track("route_ready", { route, ms: t });
}

/**
 * Generic event helper. Use sparingly — Vercel Analytics has a 200 events/sec
 * project-wide budget on the hobby tier.
 */
export function event(
  name: string,
  data?: Record<string, string | number | boolean>,
): void {
  track(name, data ?? {});
}
