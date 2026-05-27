"use client";

import { track } from "@vercel/analytics";

let started = false;

/**
 * Lazy-imports web-vitals and forwards CLS/LCP/INP/FCP/TTFB to Vercel Analytics.
 * Safe to call multiple times — only the first call subscribes.
 *
 * Why lazy: web-vitals adds ~1.5kB gzip but we only need it on the client,
 * and only once per page load.
 */
export function startVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  void (async () => {
    try {
      const { onCLS, onLCP, onINP, onFCP, onTTFB } = await import("web-vitals");
      const report = (metric: { name: string; value: number; id: string }) => {
        track("web_vital", {
          name: metric.name,
          value: Math.round(metric.value * 100) / 100,
          id: metric.id,
          pwa: typeof navigator !== "undefined" && "standalone" in navigator
            ? String((navigator as Navigator & { standalone?: boolean }).standalone === true)
            : "false",
        });
      };
      onCLS(report);
      onLCP(report);
      onINP(report);
      onFCP(report);
      onTTFB(report);
    } catch {}
  })();
}
