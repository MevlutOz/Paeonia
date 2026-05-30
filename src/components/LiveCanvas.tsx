"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  type LiveStroke,
  newStroke,
  clearLiveCanvas,
} from "@/lib/liveCanvas";
import { useLiveCanvas } from "@/lib/hooks/useLiveCanvas";

interface Props {
  uid: string;
  onSend: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

const COLORS = [
  "#A93344",
  "#E06D78",
  "#E8B851",
  "#6FA663",
  "#5B82C9",
  "#9061B8",
  "#4A2E35",
];
const SIZES = [3, 6, 11];
const WRITE_THROTTLE_MS = 60;

export function LiveCanvas({ uid, onSend, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });

  // Tüm çizgiler RTDB id'sine göre (kendi + partner).
  const strokesRef = useRef<Map<string, LiveStroke>>(new Map());

  // Yerel çizim durumu.
  const drawing = useRef(false);
  const activeId = useRef<string | null>(null);
  const activeWrite = useRef<((s: LiveStroke) => void) | null>(null);
  const lastWrite = useRef(0);

  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(6);
  const [sending, setSending] = useState(false);

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const { w, h } = sizeRef.current;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokesRef.current.forEach((s) => {
      if (!s.pts || s.pts.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      if (s.pts.length === 1) {
        const p = s.pts[0];
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x * w, s.pts[0].y * h);
      for (let i = 1; i < s.pts.length; i++) {
        ctx.lineTo(s.pts[i].x * w, s.pts[i].y * h);
      }
      ctx.stroke();
    });
  }, []);

  // Canvas kurulumu (DPR + initial redraw).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    sizeRef.current = { w: rect.width, h: rect.height };
    redraw();
  }, [redraw]);

  // RTDB aboneliği — rAF-batched, frame başına tek redraw.
  useLiveCanvas({
    onUpsert: (id, s) => {
      if (id === activeId.current) return; // kendi aktif çizgim — yerelde çiziliyor
      strokesRef.current.set(id, s);
      redraw();
    },
    onRemove: (id) => {
      strokesRef.current.delete(id);
      redraw();
    },
    onAllCleared: () => {
      strokesRef.current.clear();
      redraw();
    },
  });

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const stroke: LiveStroke = {
      by: uid,
      color,
      size,
      pts: [pos(e)],
      done: false,
    };
    const handle = newStroke(stroke);
    activeId.current = handle.id;
    activeWrite.current = handle.write;
    lastWrite.current = Date.now();
    strokesRef.current.set(handle.id, stroke);
    redraw();
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !activeId.current) return;
    const stroke = strokesRef.current.get(activeId.current);
    if (!stroke) return;
    stroke.pts.push(pos(e));
    redraw();
    const now = Date.now();
    if (now - lastWrite.current >= WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      activeWrite.current?.(stroke);
    }
  }

  function onPointerUp() {
    if (!drawing.current || !activeId.current) return;
    drawing.current = false;
    const stroke = strokesRef.current.get(activeId.current);
    if (stroke) {
      stroke.done = true;
      activeWrite.current?.(stroke);
    }
    activeId.current = null;
    activeWrite.current = null;
  }

  async function handleAttach() {
    const canvas = canvasRef.current;
    if (!canvas || sending || strokesRef.current.size === 0) return;
    setSending(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSend(dataUrl);
      await clearLiveCanvas();
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="px-5">
        <div className="rounded-2xl overflow-hidden border border-peony-light/40 bg-white">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: "42vh", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      <div className="px-5 pt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={clsx(
                "h-9 w-9 rounded-full border-2 shrink-0 transition",
                color === c ? "border-aphrodite-dark scale-110" : "border-white",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-label={`Kalınlık ${s}`}
              className={clsx(
                "h-10 w-10 grid place-items-center rounded-xl border transition",
                size === s
                  ? "bg-peony-light/30 border-peony-default"
                  : "bg-white border-peony-light/50",
              )}
            >
              <span
                className="block rounded-full bg-aphrodite-dark"
                style={{ width: s + 4, height: s + 4 }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] flex gap-2">
        <button
          onClick={() => void clearLiveCanvas().catch(() => {})}
          type="button"
          className="btn-ghost flex-1"
        >
          Temizle
        </button>
        <button
          onClick={handleAttach}
          disabled={sending}
          type="button"
          className="btn-petal flex-1"
        >
          {sending ? "Asılıyor…" : "Bahçeye As"}
        </button>
      </div>
    </>
  );
}
