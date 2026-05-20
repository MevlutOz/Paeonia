"use client";

import {
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onChildChanged,
  onValue,
} from "firebase/database";
import { realtimeDb } from "./firebase";

export interface LivePoint {
  x: number; // 0–1 normalize
  y: number; // 0–1 normalize
}

export interface LiveStroke {
  by: string;
  color: string;
  size: number;
  pts: LivePoint[];
  done: boolean;
}

const ROOT = "liveCanvas/strokes";

/**
 * Yeni bir çizgi düğümü açar. Senkron olarak id döner; `write` ile düğüm
 * istenildiği kadar güncellenebilir (akış için throttle'lı çağrılır).
 */
export function newStroke(stroke: LiveStroke): {
  id: string;
  write: (s: LiveStroke) => void;
} {
  const r = push(ref(realtimeDb(), ROOT));
  void set(r, stroke);
  return {
    id: r.key as string,
    write: (s) => void set(r, s),
  };
}

/** Tüm ortak tuvali temizler (iki tarafta da). */
export function clearLiveCanvas(): Promise<void> {
  return remove(ref(realtimeDb(), ROOT));
}

/**
 * Ortak tuvali dinler. onAdd/onChange çizgi geldikçe/değiştikçe, onClear ise
 * tüm düğüm silindiğinde tetiklenir. Aboneliği iptal eden fonksiyon döner.
 */
export function subscribeLiveCanvas(handlers: {
  onAdd: (id: string, s: LiveStroke) => void;
  onChange: (id: string, s: LiveStroke) => void;
  onClear: () => void;
}): () => void {
  const r = ref(realtimeDb(), ROOT);
  const u1 = onChildAdded(r, (snap) =>
    handlers.onAdd(snap.key as string, snap.val() as LiveStroke),
  );
  const u2 = onChildChanged(r, (snap) =>
    handlers.onChange(snap.key as string, snap.val() as LiveStroke),
  );
  const u3 = onValue(r, (snap) => {
    if (!snap.exists()) handlers.onClear();
  });
  return () => {
    u1();
    u2();
    u3();
  };
}
