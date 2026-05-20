"use client";

import clsx from "clsx";
import { templatesForCount, layoutFromTemplate } from "@/lib/collage";
import type { CollageLayout } from "@/lib/types";

interface Props {
  count: number;
  currentTemplateId: string;
  onPick: (layout: CollageLayout) => void;
}

export function CollageTemplatePicker({
  count,
  currentTemplateId,
  onPick,
}: Props) {
  const templates = templatesForCount(count);
  if (templates.length < 2) return null;

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-aphrodite-dark/60 mb-1.5">
        Düzen
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(layoutFromTemplate(t))}
            aria-label={t.name}
            className={clsx(
              "shrink-0 rounded-xl p-1.5 border-2 transition",
              currentTemplateId === t.id
                ? "border-peony-default bg-peony-light/20"
                : "border-peony-light/30 bg-white",
            )}
          >
            <div
              className="w-14"
              style={{
                aspectRatio: "4 / 5",
                display: "grid",
                gap: "2px",
                gridTemplateColumns: `repeat(${t.cols}, 1fr)`,
                gridTemplateRows: `repeat(${t.rows}, 1fr)`,
              }}
            >
              {t.cells.map((cell, i) => (
                <div
                  key={i}
                  className="bg-peony-default/45 rounded-[2px]"
                  style={{
                    gridColumn: `${cell.col} / span ${cell.colSpan}`,
                    gridRow: `${cell.row} / span ${cell.rowSpan}`,
                  }}
                />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
