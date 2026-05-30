"use client";

type Unsubscribe = () => void;
type Push<T> = (value: T) => void;
type Factory<T> = (push: Push<T>) => Unsubscribe;

interface Entry<T> {
  refCount: number;
  lastValue: T | undefined;
  unsubscribe: Unsubscribe;
  graceTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(v: T) => void>;
}

const GRACE_MS = 30_000;
const registry = new Map<string, Entry<unknown>>();

/**
 * Subscribe to a deduplicated, ref-counted source.
 *
 * If another consumer is already subscribed under the same `key`, this call
 * piggybacks on the existing subscription. When the last consumer unsubscribes,
 * the underlying source is kept alive for GRACE_MS to absorb fast remount
 * cycles (e.g. user bouncing between /home and /chat).
 */
export function subscribeShared<T>(
  key: string,
  factory: Factory<T>,
  listener: (v: T) => void,
): Unsubscribe {
  let entry = registry.get(key) as Entry<T> | undefined;

  if (entry) {
    if (entry.graceTimer) {
      clearTimeout(entry.graceTimer);
      entry.graceTimer = undefined;
    }
    entry.refCount++;
    entry.listeners.add(listener);
    if (entry.lastValue !== undefined) listener(entry.lastValue);
  } else {
    const created: Entry<T> = {
      refCount: 1,
      lastValue: undefined,
      unsubscribe: () => {},
      listeners: new Set([listener]),
    };
    created.unsubscribe = factory((v) => {
      created.lastValue = v;
      created.listeners.forEach((l) => l(v));
    });
    registry.set(key, created as Entry<unknown>);
    entry = created;
  }

  return () => {
    const e = entry!;
    e.refCount--;
    e.listeners.delete(listener);
    if (e.refCount === 0) {
      e.graceTimer = setTimeout(() => {
        e.unsubscribe();
        registry.delete(key);
      }, GRACE_MS);
    }
  };
}

/** Test/dev helper. Drops every entry and unsubscribes from sources. */
export function _clearRegistry(): void {
  registry.forEach((e) => {
    if (e.graceTimer) clearTimeout(e.graceTimer);
    e.unsubscribe();
  });
  registry.clear();
}

/** Read-only snapshot for debugging. */
export function _snapshot(): Array<{ key: string; refCount: number; hasValue: boolean }> {
  return Array.from(registry.entries()).map(([key, e]) => ({
    key,
    refCount: e.refCount,
    hasValue: e.lastValue !== undefined,
  }));
}
