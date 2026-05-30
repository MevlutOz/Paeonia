"use client";

import { useMemo } from "react";
import { getVariants } from "../registry/mediaCache";

interface MediaSources {
  src: string;
  srcSet: string;
  sizes: string;
  placeholderSrc: string;
  fullSrc: string;
  /** True if the URL follows the variant naming convention. */
  hasVariants: boolean;
}

/**
 * Returns ready-to-use <img> attributes for a photo URL. Falls back cleanly
 * for legacy uploads (single URL, no srcSet) so old chat/memory photos still
 * render.
 */
export function useMedia(
  url: string | undefined,
  sizes = "(max-width: 768px) 100vw, 800px",
): MediaSources | null {
  return useMemo(() => {
    if (!url) return null;
    const v = getVariants(url);
    const hasVariants = v.thumb !== url || v.medium !== url || v.full !== url;
    if (!hasVariants) {
      return {
        src: url,
        srcSet: "",
        sizes,
        placeholderSrc: url,
        fullSrc: url,
        hasVariants: false,
      };
    }
    return {
      src: v.medium,
      srcSet: `${v.thumb} 300w, ${v.medium} 800w, ${v.full} 1800w`,
      sizes,
      placeholderSrc: v.thumb,
      fullSrc: v.full,
      hasVariants: true,
    };
  }, [url, sizes]);
}
