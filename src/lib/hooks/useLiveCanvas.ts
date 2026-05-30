"use client";

import { useEffect, useRef } from "react";
import { subscribeLiveCanvas, type LiveStroke } from "../liveCanvas";

interface Handlers {
  /** Called on add or modify. Multiple deltas in the same frame are coalesced. */
  onUpsert: (id: string, s: LiveStroke) => void;
  /** Called when a stroke is removed (peer clear/undo). */
  onRemove: (id: string) => void;
  /** Called once when all strokes have been removed (parent cleared). */
  onAllCleared: () => void;
}

/**
 * Shared live-canvas subscription with rAF batching. Multiple deltas arriving
 * in the same animation frame are flushed together as a single callback wave,
 * so the consumer only redraws once per frame.
 */
export function useLiveCanvas(handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const pendingUpserts = new Map<string, LiveStroke>();
    const pendingRemoves = new Set<string>();
    let frameQueued = false;
    const activeStrokeIds = new Set<string>();

    const flush = () => {
      frameQueued = false;
      const hadRemoves = pendingRemoves.size > 0;
      pendingUpserts.forEach((s, id) => {
        handlersRef.current.onUpsert(id, s);
        activeStrokeIds.add(id);
      });
      pendingRemoves.forEach((id) => {
        handlersRef.current.onRemove(id);
        activeStrokeIds.delete(id);
      });
      pendingUpserts.clear();
      pendingRemoves.clear();
      if (hadRemoves && activeStrokeIds.size === 0) {
        handlersRef.current.onAllCleared();
      }
    };

    const schedule = () => {
      if (frameQueued) return;
      frameQueued = true;
      requestAnimationFrame(flush);
    };

    const unsubscribe = subscribeLiveCanvas({
      onAdd: (id, s) => {
        pendingRemoves.delete(id);
        pendingUpserts.set(id, s);
        schedule();
      },
      onChange: (id, s) => {
        pendingRemoves.delete(id);
        pendingUpserts.set(id, s);
        schedule();
      },
      onRemove: (id) => {
        pendingUpserts.delete(id);
        pendingRemoves.add(id);
        schedule();
      },
    });

    return () => unsubscribe();
  }, []);
}
