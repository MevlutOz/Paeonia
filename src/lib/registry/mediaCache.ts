"use client";

import { photoVariantUrl } from "../storage";

/**
 * In-memory cache that pre-computes variant URLs for photo strings once. Avoids
 * recomputing the regex on every render. Module-scoped so /memories and
 * /album share the same cache.
 */
const cache = new Map<string, { thumb: string; medium: string; full: string }>();

export function getVariants(url: string) {
  let hit = cache.get(url);
  if (hit) return hit;
  hit = {
    thumb: photoVariantUrl(url, "thumb"),
    medium: photoVariantUrl(url, "medium"),
    full: photoVariantUrl(url, "full"),
  };
  cache.set(url, hit);
  return hit;
}

export function _clearMediaCache(): void {
  cache.clear();
}
