"use client";

import type { FirebasePerformance, PerformanceTrace } from "firebase/performance";

let perfPromise: Promise<FirebasePerformance | null> | null = null;

async function getPerf(): Promise<FirebasePerformance | null> {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV !== "production") return null;
  if (perfPromise) return perfPromise;

  perfPromise = (async () => {
    try {
      const [{ getPerformance }, { firebaseApp }] = await Promise.all([
        import("firebase/performance"),
        import("../firebase"),
      ]);
      return getPerformance(firebaseApp());
    } catch {
      return null;
    }
  })();

  return perfPromise;
}

/**
 * Wraps an async/sync function with a Firebase Performance custom trace.
 * In dev mode this is a no-op pass-through.
 *
 *   const messages = await trace("messages.subscribe", () => subscribeMessages(...));
 */
export async function trace<T>(
  name: string,
  fn: () => T | Promise<T>,
  attrs?: Record<string, string>,
): Promise<T> {
  const perf = await getPerf();
  if (!perf) return await fn();

  let t: PerformanceTrace | null = null;
  try {
    const { trace: makeTrace } = await import("firebase/performance");
    t = makeTrace(perf, name);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => t!.putAttribute(k, v));
    }
    t.start();
    const result = await fn();
    return result;
  } finally {
    try {
      t?.stop();
    } catch {}
  }
}

/**
 * Records a one-shot failure. Used by error paths.
 */
export async function traceFail(name: string, attrs?: Record<string, string>): Promise<void> {
  const perf = await getPerf();
  if (!perf) return;
  try {
    const { trace: makeTrace } = await import("firebase/performance");
    const t = makeTrace(perf, name);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => t.putAttribute(k, v));
    t.start();
    t.putAttribute("status", "fail");
    t.stop();
  } catch {}
}
