"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PhotoVariants } from "@/lib/types";
import { useMedia } from "@/lib/hooks/useMedia";
import { PeonyIcon } from "./PeonyIcon";

interface Props {
  url: string | null;
  variants?: PhotoVariants | null;
  onClose: () => void;
}

export function Lightbox({ url, variants, onClose }: Props) {
  const media = useMedia(url ?? undefined, variants);

  useEffect(() => {
    if (!url) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [url, onClose]);

  return (
    <AnimatePresence>
      {url && media && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center p-4 bg-aphrodite-dark/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 h-11 w-11 grid place-items-center rounded-full bg-white/90 text-peony-dark shadow-petal active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <motion.div
            className="relative"
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.fullSrc}
              alt=""
              className="max-w-[94vw] max-h-[82vh] object-contain rounded-3xl shadow-blush"
            />
          </motion.div>

          <div className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-0 right-0 flex justify-center">
            <span className="flex items-center gap-1.5 text-white/70 text-xs">
              <PeonyIcon size={13} />
              kapatmak için dokun
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
