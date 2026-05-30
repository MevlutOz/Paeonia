"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeShared } from "../registry/subscriptionRegistry";
import { subscribeMessagesPaginated, markReadBatch } from "../messages";
import type { Message } from "../types";

interface UseMessagesState {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
}

interface SharedState {
  messages: Map<string, Message>;
  hasMore: boolean;
  loadMore: () => Promise<number>;
}

const PAGE_SIZE = 50;
const KEY = `messages:page=${PAGE_SIZE}`;

/**
 * Stale-while-revalidate hook around Firestore messages. Multiple components
 * subscribing share a single onSnapshot via subscriptionRegistry.
 */
export function useMessages(): UseMessagesState & {
  loadMore: () => Promise<number>;
  markVisibleAsRead: (ids: string[]) => void;
} {
  const [state, setState] = useState<UseMessagesState>({
    messages: [],
    loading: true,
    hasMore: true,
  });
  const sharedRef = useRef<SharedState | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeShared<SharedState>(
      KEY,
      (push) => {
        const local: SharedState = {
          messages: new Map(),
          hasMore: true,
          loadMore: async () => 0,
        };
        const { unsubscribe: u, loadMore } = subscribeMessagesPaginated((delta, initial) => {
          delta.added.forEach((m) => local.messages.set(m.id, m));
          delta.modified.forEach((m) => local.messages.set(m.id, m));
          delta.removed.forEach((id) => local.messages.delete(id));
          if (initial && delta.added.length < PAGE_SIZE) local.hasMore = false;
          push({ ...local, messages: new Map(local.messages) });
        }, PAGE_SIZE);
        local.loadMore = async () => {
          const got = await loadMore();
          if (got < PAGE_SIZE) {
            local.hasMore = false;
            push({ ...local, messages: new Map(local.messages) });
          }
          return got;
        };
        return u;
      },
      (shared) => {
        sharedRef.current = shared;
        const sorted = Array.from(shared.messages.values()).sort((a, b) => {
          const ta = a.createdAt?.seconds ?? 0;
          const tb = b.createdAt?.seconds ?? 0;
          return ta - tb;
        });
        setState({ messages: sorted, loading: false, hasMore: shared.hasMore });
      },
    );
    return unsubscribe;
  }, []);

  const loadMore = useCallback(async () => {
    return sharedRef.current?.loadMore() ?? 0;
  }, []);

  const pendingReadsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markVisibleAsRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    ids.forEach((id) => pendingReadsRef.current.add(id));
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      const batch = Array.from(pendingReadsRef.current);
      pendingReadsRef.current.clear();
      flushTimerRef.current = null;
      void markReadBatch(batch).catch(() => {
        batch.forEach((id) => pendingReadsRef.current.add(id));
      });
    }, 400);
  }, []);

  return { ...state, loadMore, markVisibleAsRead };
}

/**
 * Prewarm the messages subscription without rendering. Returns the registry
 * unsubscribe. Call this from /home's idle callback to keep the registry
 * warm for /chat's first paint — the 30s grace window in subscriptionRegistry
 * means /home → /chat hits a cached snapshot.
 */
export function prewarmMessages(): () => void {
  return subscribeShared<SharedState>(
    KEY,
    (push) => {
      const local: SharedState = {
        messages: new Map(),
        hasMore: true,
        loadMore: async () => 0,
      };
      const { unsubscribe: u, loadMore } = subscribeMessagesPaginated((delta, initial) => {
        delta.added.forEach((m) => local.messages.set(m.id, m));
        delta.modified.forEach((m) => local.messages.set(m.id, m));
        delta.removed.forEach((id) => local.messages.delete(id));
        if (initial && delta.added.length < PAGE_SIZE) local.hasMore = false;
        push({ ...local, messages: new Map(local.messages) });
      }, PAGE_SIZE);
      local.loadMore = async () => {
        const got = await loadMore();
        if (got < PAGE_SIZE) {
          local.hasMore = false;
          push({ ...local, messages: new Map(local.messages) });
        }
        return got;
      };
      return u;
    },
    () => {
      // no-op listener: we just want the subscription warm in the registry
    },
  );
}
