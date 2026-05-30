"use client";

import {
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
} from "firebase/database";
import { realtimeDb } from "./firebase";
import { trace } from "./telemetry/trace";

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
  return trace("liveCanvas.clear", () => remove(ref(realtimeDb(), ROOT)));
}

/**
 * Ortak tuvali dinler.
 *
 * Değişiklik (Faz 3): `onValue` kaldırıldı — daha önce her stroke
 * güncellemesinde TÜM subtree'yi tekrar getiriyordu. Artık `onChildRemoved`
 * ile düğüm silinmesini dinliyoruz; parent ROOT silinince RTDB her child
 * için ayrı bir `onChildRemoved` fırlatır, bu sayede peer-side clear/undo
 * tek tip kanalla geliyor.
 */
export function subscribeLiveCanvas(handlers: {
  onAdd: (id: string, s: LiveStroke) => void;
  onChange: (id: string, s: LiveStroke) => void;
  onRemove: (id: string) => void;
}): () => void {
  const r = ref(realtimeDb(), ROOT);
  const u1 = onChildAdded(r, (snap) =>
    handlers.onAdd(snap.key as string, snap.val() as LiveStroke),
  );
  const u2 = onChildChanged(r, (snap) =>
    handlers.onChange(snap.key as string, snap.val() as LiveStroke),
  );
  const u3 = onChildRemoved(r, (snap) =>
    handlers.onRemove(snap.key as string),
  );
  return () => {
    u1();
    u2();
    u3();
  };
}
