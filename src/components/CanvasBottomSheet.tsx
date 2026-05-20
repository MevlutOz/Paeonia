"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PeonyIcon } from "./PeonyIcon";
import { LiveCanvas } from "./LiveCanvas";

interface Props {
  open: boolean;
  onClose: () => void;
  onSend: (dataUrl: string) => Promise<void>;
  partnerOnline: boolean;
  uid: string;
}

type Tool = "brush" | "eraser" | "fill";

const PRESETS = [
  "#4A2E35", "#A93344", "#E06D78", "#F2A7B3", "#E8B851", "#F4C96B",
  "#C9472F", "#E2873D", "#6FA663", "#3FA0A0", "#5B82C9", "#9061B8",
  "#FFFFFF",
];

const STROKES = [3, 6, 11, 20];
const ERASE = "#FFFFFF";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/** Scanline flood fill with a visited mask (tolerant, loop-safe). */
function floodFill(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  fillHex: string,
  w: number,
  h: number,
): void {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const si = (sy * w + sx) * 4;
  const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
  const [fr, fg, fb] = hexToRgb(fillHex);
  if (Math.abs(tr - fr) <= 2 && Math.abs(tg - fg) <= 2 && Math.abs(tb - fb) <= 2) {
    return;
  }
  const tol = 48;
  const matches = (i: number) =>
    Math.abs(d[i] - tr) <= tol &&
    Math.abs(d[i + 1] - tg) <= tol &&
    Math.abs(d[i + 2] - tb) <= tol &&
    Math.abs(d[i + 3] - ta) <= tol;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    let nx = x;
    while (nx >= 0 && !visited[y * w + nx] && matches((y * w + nx) * 4)) nx--;
    nx++;
    let up = false;
    let dn = false;
    while (nx < w && !visited[y * w + nx] && matches((y * w + nx) * 4)) {
      const p = y * w + nx;
      visited[p] = 1;
      const i = p * 4;
      d[i] = fr;
      d[i + 1] = fg;
      d[i + 2] = fb;
      d[i + 3] = 255;
      if (y > 0) {
        const upp = (y - 1) * w + nx;
        if (!visited[upp] && matches(upp * 4)) {
          if (!up) {
            stack.push(nx, y - 1);
            up = true;
          }
        } else {
          up = false;
        }
      }
      if (y < h - 1) {
        const dnp = (y + 1) * w + nx;
        if (!visited[dnp] && matches(dnp * 4)) {
          if (!dn) {
            stack.push(nx, y + 1);
            dn = true;
          }
        } else {
          dn = false;
        }
      }
      nx++;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function CanvasBottomSheet({
  open,
  onClose,
  onSend,
  partnerOnline,
  uid,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dprRef = useRef(1);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(PRESETS[2]);
  const [stroke, setStroke] = useState(6);
  const [recent, setRecent] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const [mode, setMode] = useState<"solo" | "live">("solo");

  // Partner çevrimdışı olursa tek-başına moda geri dön.
  useEffect(() => {
    if (!partnerOnline && mode === "live") setMode("solo");
  }, [partnerOnline, mode]);

  const paintWhite = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }, []);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    paintWhite(ctx, canvas.width, canvas.height);
    ctxRef.current = ctx;
    undoStack.current = [];
    setHasDrawn(false);
  }, [open, paintWhite]);

  function activeColor() {
    return tool === "eraser" ? ERASE : color;
  }

  function cssPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pushUndo() {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > 25) undoStack.current.shift();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    e.preventDefault();
    pushUndo();

    if (tool === "fill") {
      const dpr = dprRef.current;
      const p = cssPos(e);
      floodFill(
        ctx,
        Math.floor(p.x * dpr),
        Math.floor(p.y * dpr),
        color,
        canvas.width,
        canvas.height,
      );
      setHasDrawn(true);
      return;
    }

    drawing.current = true;
    const p = cssPos(e);
    lastPos.current = p;
    ctx.beginPath();
    ctx.fillStyle = activeColor();
    ctx.arc(p.x, p.y, stroke / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasDrawn(true);
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = ctxRef.current;
    if (!ctx || !lastPos.current) return;
    const p = cssPos(e);
    ctx.strokeStyle = activeColor();
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPos.current = p;
  }

  function onPointerUp() {
    drawing.current = false;
    lastPos.current = null;
  }

  function handleUndo() {
    const ctx = ctxRef.current;
    const snap = undoStack.current.pop();
    if (!ctx || !snap) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(snap, 0, 0);
    ctx.restore();
    if (undoStack.current.length === 0) setHasDrawn(false);
  }

  function handleClear() {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    pushUndo();
    paintWhite(ctx, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function pickColor(hex: string) {
    setColor(hex);
    if (tool === "eraser") setTool("brush");
  }

  function pickCustom(hex: string) {
    setColor(hex);
    if (tool === "eraser") setTool("brush");
    setRecent((prev) => {
      if (PRESETS.includes(hex.toUpperCase()) || prev.includes(hex)) return prev;
      return [hex, ...prev].slice(0, 5);
    });
  }

  async function handleSend() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn || sending) return;
    setSending(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSend(dataUrl);
      const ctx = ctxRef.current;
      if (ctx) paintWhite(ctx, canvas.width, canvas.height);
      undoStack.current = [];
      setHasDrawn(false);
      onClose();
    } finally {
      setSending(false);
    }
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    {
      id: "brush",
      label: "Fırça",
      icon: (
        <path
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-9.96a1 1 0 0 0 0-1.41l-2.59-2.59a1 1 0 0 0-1.41 0l-2 2 4 4 2-2Z"
          fill="currentColor"
        />
      ),
    },
    {
      id: "eraser",
      label: "Silgi",
      icon: (
        <path
          d="M16.24 3.56a2 2 0 0 1 2.83 0l1.37 1.37a2 2 0 0 1 0 2.83L10.6 18.6H6.4l-2.97-2.97a2 2 0 0 1 0-2.83L16.24 3.56Zm-7 13.04l7.6-7.6-3.84-3.84-7.6 7.6 3.84 3.84Z"
          fill="currentColor"
        />
      ),
    },
    {
      id: "fill",
      label: "Dolgu",
      icon: (
        <path
          d="M19 11.5s2 2.17 2 3.5a2 2 0 1 1-4 0c0-1.33 2-3.5 2-3.5ZM5.21 10 10 5.21l5.79 5.79a1 1 0 0 1 0 1.41l-5.08 5.09a2 2 0 0 1-2.83 0L3.8 13.41a1 1 0 0 1 0-1.41L5.2 10Zm1.42 1.41L9.96 14.7l3.34-3.29H6.63Z"
          fill="currentColor"
        />
      ),
    },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className={clsx(
          "fixed inset-0 z-40 bg-aphrodite-dark/30 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden
      />
      <div
        className={clsx(
          "fixed z-50 left-0 right-0 bottom-0 transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto max-w-xl rounded-t-3xl bg-nymph-bg shadow-petal border-t border-peony-light/40">
          <div className="pt-3">
            <span className="block h-1.5 w-12 rounded-full bg-peony-light/60 mx-auto" />
          </div>

          <div className="px-5 pt-2">
            <div className="flex rounded-xl bg-peony-light/20 p-1">
              <button
                type="button"
                onClick={() => setMode("solo")}
                className={clsx(
                  "flex-1 h-9 rounded-lg text-sm font-medium transition",
                  mode === "solo"
                    ? "bg-white text-aphrodite-dark shadow-petal"
                    : "text-aphrodite-dark/55",
                )}
              >
                Tek Başına
              </button>
              <button
                type="button"
                onClick={() => partnerOnline && setMode("live")}
                disabled={!partnerOnline}
                className={clsx(
                  "flex-1 h-9 rounded-lg text-sm font-medium transition",
                  mode === "live"
                    ? "bg-white text-aphrodite-dark shadow-petal"
                    : "text-aphrodite-dark/55",
                  !partnerOnline && "opacity-40",
                )}
              >
                {partnerOnline ? "Ortak Tuval 🌅" : "Ortak Tuval · çevrimdışı"}
              </button>
            </div>
          </div>

          {mode === "solo" && (
            <>
          <div className="px-5 pt-2 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-peony-default">
              <PeonyIcon size={20} />
              <h2 className="font-display text-xl text-aphrodite-dark">Çiz</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleUndo} className="btn-ghost text-sm px-3 py-1.5" type="button">
                Geri
              </button>
              <button onClick={handleClear} className="btn-ghost text-sm px-3 py-1.5" type="button">
                Temizle
              </button>
            </div>
          </div>

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

          {/* tools + sizes */}
          <div className="px-5 pt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  aria-label={t.label}
                  className={clsx(
                    "h-10 px-2.5 grid place-items-center rounded-xl border transition",
                    tool === t.id
                      ? "bg-peony-default text-white border-peony-default"
                      : "bg-white text-aphrodite-dark/75 border-peony-light/50",
                  )}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    {t.icon}
                  </svg>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {STROKES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStroke(s)}
                  aria-label={`Kalınlık ${s}`}
                  className={clsx(
                    "h-10 w-10 grid place-items-center rounded-xl border transition",
                    stroke === s
                      ? "bg-peony-light/30 border-peony-default"
                      : "bg-white border-peony-light/50",
                  )}
                >
                  <span
                    className="block rounded-full bg-aphrodite-dark"
                    style={{ width: Math.min(s, 22), height: Math.min(s, 22) }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* colors */}
          <div className="px-5 pt-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <label
                className="relative h-9 w-9 shrink-0 rounded-full grid place-items-center cursor-pointer"
                style={{
                  background:
                    "conic-gradient(#ff0044,#ff9900,#ffee00,#33dd33,#00ccdd,#3366ff,#aa44dd,#ff0044)",
                }}
                aria-label="Özel renk"
              >
                <span
                  className="h-[22px] w-[22px] rounded-full border-2 border-white"
                  style={{ background: color }}
                />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => pickCustom(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>

              <div className="h-7 w-px bg-peony-light/40 shrink-0" />

              {recent.map((hex) => (
                <button
                  key={`r-${hex}`}
                  type="button"
                  onClick={() => pickColor(hex)}
                  aria-label={hex}
                  className={clsx(
                    "h-9 w-9 rounded-full border-2 shrink-0 transition",
                    color.toLowerCase() === hex.toLowerCase()
                      ? "border-aphrodite-dark scale-110"
                      : "border-white",
                  )}
                  style={{ background: hex }}
                />
              ))}
              {recent.length > 0 && (
                <div className="h-7 w-px bg-peony-light/40 shrink-0" />
              )}

              {PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => pickColor(hex)}
                  aria-label={hex}
                  className={clsx(
                    "h-9 w-9 rounded-full border-2 shrink-0 transition",
                    color.toUpperCase() === hex && tool !== "eraser"
                      ? "border-aphrodite-dark scale-110 shadow-blush-soft"
                      : hex === "#FFFFFF"
                        ? "border-peony-light/60"
                        : "border-white",
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>

          <div className="px-5 pt-2 pb-[max(env(safe-area-inset-bottom),16px)] flex gap-2">
            <button onClick={onClose} type="button" className="btn-ghost flex-1">
              Kapat
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !hasDrawn}
              type="button"
              className="btn-petal flex-1"
            >
              {sending ? "Açılıyor…" : "Gönder"}
            </button>
          </div>
            </>
          )}

          {mode === "live" && (
            <LiveCanvas uid={uid} onSend={onSend} onClose={onClose} />
          )}
        </div>
      </div>
    </>
  );
}
