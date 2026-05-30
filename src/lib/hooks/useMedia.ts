"use client";

import { useMemo } from "react";
import type { PhotoVariants } from "../types";

interface MediaSources {
  src: string;
  srcSet: string;
  sizes: string;
  placeholderSrc: string;
  fullSrc: string;
  hasVariants: boolean;
}

/**
 * Returns ready-to-use <img> attributes for a photo. Pass `variants` (the
 * thumb/medium/full URLs uploaded via uploadPhotoVariants) for srcSet-based
 * responsive loading; legacy uploads (no variants) fall back to a single src.
 */
export function useMedia(
  url: string | undefined,
  variants?: PhotoVariants | null,
  sizes = "(max-width: 768px) 100vw, 800px",
): MediaSources | null {
  return useMemo(() => {
    if (!url && !variants) return null;
    if (variants) {
      return {
        src: variants.medium,
        srcSet: `${variants.thumb} 300w, ${variants.medium} 800w, ${variants.full} 1800w`,
        sizes,
        placeholderSrc: variants.thumb,
        fullSrc: variants.full,
        hasVariants: true,
      };
    }
    const u = url as string;
    return {
      src: u,
      srcSet: "",
      sizes,
      placeholderSrc: u,
      fullSrc: u,
      hasVariants: false,
    };
  }, [url, variants, sizes]);
}
