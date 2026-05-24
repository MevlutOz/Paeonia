"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";
import type { MemorySong } from "./types";

export interface SongResult extends MemorySong {
  // iTunes search results always have a preview URL (Cloud Function filters
  // entries without one). Narrow the optional MemorySong.previewUrl to required.
  previewUrl: string;
  trackId: number;
}

/** Searches songs through the searchMusic Cloud Function (iTunes proxy). */
export async function searchMusic(query: string): Promise<SongResult[]> {
  const q = query.trim();
  if (!q) return [];
  const fns = getFunctions(firebaseApp(), "europe-west1");
  const call = httpsCallable<{ query: string }, { results: SongResult[] }>(
    fns,
    "searchMusic",
  );
  const res = await call({ query: q });
  return res.data.results ?? [];
}
