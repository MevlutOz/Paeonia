"use client";

import clsx from "clsx";
import type { CollageLayout, MemoryPhoto } from "@/lib/types";
import { useMedia } from "@/lib/hooks/useMedia";

interface Props {
  photos: MemoryPhoto[];
  collage: CollageLayout;
  selecting?: boolean;
  selectedIndex?: number | null;
  onCellTap?: (index: number) => void;
  onCellOpen?: (index: number) => void;
}

function CollageCellImage({ photo }: { photo: MemoryPhoto }) {
  const media = useMedia(photo.url, photo.variants, "(max-width: 768px) 50vw, 300px");
  if (!media) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.src}
      srcSet={media.srcSet || undefined}
      sizes={media.sizes}
      alt=""
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover"
      draggable={false}
    />
  );
}

export function Collage({
  photos,
  collage,
  selecting = false,
  selectedIndex = null,
  onCellTap,
  onCellOpen,
}: Props) {
  if (photos.length === 0) {
    return (
      <div
        className="rounded-2xl bg-peony-light/25 grid place-items-center text-peony-default/60"
        style={{ aspectRatio: "4 / 5" }}
      >
        Fotoğraf yok
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden bg-white shadow-petal"
      style={{
        aspectRatio: "4 / 5",
        display: "grid",
        gap: "5px",
        padding: "5px",
        gridTemplateColumns: `repeat(${collage.cols}, 1fr)`,
        gridTemplateRows: `repeat(${collage.rows}, 1fr)`,
      }}
    >
      {collage.cells.map((cell, i) => {
        const photo = photos[i];
        if (!photo) return null;
        return (
          <button
            key={i}
            type="button"
            onClick={() => (selecting ? onCellTap?.(i) : onCellOpen?.(i))}
            className={clsx(
              "relative overflow-hidden bg-peony-light/20 transition",
              selecting &&
                (selectedIndex === i
                  ? "ring-[3px] ring-peony-default z-10"
                  : "ring-1 ring-peony-light/40"),
            )}
            style={{
              gridColumn: `${cell.col} / span ${cell.colSpan}`,
              gridRow: `${cell.row} / span ${cell.rowSpan}`,
            }}
          >
            <CollageCellImage photo={photo} />
            {selecting && (
              <span className="absolute bottom-1 left-1 h-5 w-5 grid place-items-center rounded-full bg-aphrodite-dark/65 text-white text-[10px] font-semibold">
                {i + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
