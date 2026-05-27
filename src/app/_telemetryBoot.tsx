"use client";

import { useEffect } from "react";
import { startVitals } from "@/lib/telemetry/vitals";
import { initFirebasePerf } from "@/lib/firebase";

/**
 * Mounted once at the root. Boots web-vitals + Firebase Performance Monitoring
 * once the browser is idle (or after 1s as fallback).
 *
 * Idle-deferred so it doesn't compete with LCP-critical work.
 */
export function TelemetryBoot() {
  useEffect(() => {
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
    const run = () => {
      startVitals();
      initFirebasePerf();
    };
    if (typeof idle === "function") {
      idle(run, { timeout: 2000 });
    } else {
      setTimeout(run, 1000);
    }
  }, []);
  return null;
}
