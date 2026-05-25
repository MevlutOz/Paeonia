"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useSpotifyPlayer } from "@/lib/useSpotifyPlayer";

interface Props {
  trackUri: string;
  durationMs: number;
  artworkUrl: string;
  title: string;
  artist: string;
  initialStartMs?: number;
  initialEndMs?: number;
  onCancel: () => void;
  onConfirm: (startMs: number, endMs: number) => void;
}

const MIN_MS = 5_000;
const MAX_MS = 30_000;
const SNAP_MS = 1_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function snap(v: number): number {
  return Math.round(v / SNAP_MS) * SNAP_MS;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Dual-handle slider over the full song timeline. User picks a 5-30 second
 * window; ▶ Önizle plays it (loops back to start when the window ends).
 */
export function SongTrimmer({
  trackUri,
  durationMs,
  artworkUrl,
  title,
  artist,
  initialStartMs = 0,
  initialEndMs,
  onCancel,
  onConfirm,
}: Props) {
  const safeMaxEnd = Math.min(MAX_MS, durationMs);
  const [startMs, setStartMs] = useState(
    clamp(initialStartMs, 0, Math.max(0, durationMs - MIN_MS)),
  );
  const [endMs, setEndMs] = useState(
    clamp(initialEndMs ?? Math.min(15_000, durationMs), MIN_MS, durationMs),
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  // Anchor data for the "drag the whole window" gesture — captured on pointerdown,
  // read on pointermove, cleared on pointerup.
  const windowDragRef = useRef<{
    startX: number;
    initStart: number;
    initEnd: number;
    trackWidth: number;
  } | null>(null);

  const player = useSpotifyPlayer();
  const previewPollRef = useRef<number | null>(null);

  const widthSpan = Math.max(durationMs, 1);
  const startPct = (startMs / widthSpan) * 100;
  const endPct = (endMs / widthSpan) * 100;
  const lengthMs = endMs - startMs;

  function stopPreview() {
    if (previewPollRef.current !== null) {
      window.clearInterval(previewPollRef.current);
      previewPollRef.current = null;
    }
    void player.pause().catch(() => {});
    setPreviewing(false);
  }

  useEffect(() => {
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user moves a handle while previewing, restart preview so they hear
  // the new window — but only after a short debounce.
  useEffect(() => {
    if (!previewing) return;
    const id = window.setTimeout(() => {
      void startPreview();
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs]);

  async function startPreview() {
    if (previewStarting) return;
    setPreviewStarting(true);
    try {
      // player.play() awaits SDK ready internally — safe to call before ready.
      await player.play(trackUri, startMs);
      setPreviewing(true);
      if (previewPollRef.current !== null)
        window.clearInterval(previewPollRef.current);
      previewPollRef.current = window.setInterval(async () => {
        const pos = await player.getPosition();
        if (pos === null) return;
        if (pos >= endMs) {
          await player.pause();
          stopPreview();
        }
      }, 250);
    } catch (e) {
      console.warn("Preview play failed:", e);
      setPreviewing(false);
    } finally {
      setPreviewStarting(false);
    }
  }

  function handlePointer(
    which: "start" | "end",
    clientX: number,
    rect: DOMRect,
  ) {
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawMs = snap(ratio * durationMs);
    if (which === "start") {
      const upperByMin = endMs - MIN_MS;
      const lowerByMax = Math.max(0, endMs - safeMaxEnd);
      setStartMs(clamp(rawMs, lowerByMax, upperByMin));
    } else {
      const upperByMax = Math.min(durationMs, startMs + safeMaxEnd);
      setEndMs(clamp(rawMs, startMs + MIN_MS, upperByMax));
    }
  }

  function bindHandle(which: "start" | "end") {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = trackRef.current!.getBoundingClientRect();
        handlePointer(which, e.clientX, rect);
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const rect = trackRef.current!.getBoundingClientRect();
        handlePointer(which, e.clientX, rect);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  function bindWindow() {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        // If the user grabbed a handle, the handle's stopPropagation prevents
        // us from getting this — so we're safely in "drag the middle" mode.
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = trackRef.current!.getBoundingClientRect();
        windowDragRef.current = {
          startX: e.clientX,
          initStart: startMs,
          initEnd: endMs,
          trackWidth: rect.width,
        };
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = windowDragRef.current;
        if (!drag) return;
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const deltaPx = e.clientX - drag.startX;
        const deltaMs = snap((deltaPx / drag.trackWidth) * durationMs);
        const length = drag.initEnd - drag.initStart;
        let newStart = drag.initStart + deltaMs;
        let newEnd = drag.initEnd + deltaMs;
        if (newStart < 0) {
          newStart = 0;
          newEnd = length;
        }
        if (newEnd > durationMs) {
          newEnd = durationMs;
          newStart = durationMs - length;
        }
        setStartMs(newStart);
        setEndMs(newEnd);
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        windowDragRef.current = null;
      },
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Parçayı seç
        </span>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onCancel();
          }}
          className="text-xs text-aphrodite-dark/55"
        >
          Vazgeç
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white/70 border border-peony-light/50 p-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artworkUrl}
          alt=""
          className="h-12 w-12 rounded-lg object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="font-medium text-aphrodite-dark truncate">{title}</p>
          <p className="text-xs text-aphrodite-dark/60 truncate">
            {artist} · {fmt(durationMs)}
          </p>
        </div>
      </div>

      <div>
        <div
          ref={trackRef}
          className="relative h-10 rounded-full bg-peony-light/30 select-none touch-none"
        >
          {/* selected window — draggable from the middle */}
          <div
            {...bindWindow()}
            className="absolute top-0 h-full bg-peony-default/55 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center gap-0.5"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
            aria-label="Parçayı sürükle"
          >
            {/* Subtle grip dots so users know the middle is grabbable. */}
            <span className="h-1 w-1 rounded-full bg-white/70" />
            <span className="h-1 w-1 rounded-full bg-white/70" />
            <span className="h-1 w-1 rounded-full bg-white/70" />
          </div>
          {/* start handle */}
          <button
            type="button"
            aria-label="Başlangıç"
            {...bindHandle("start")}
            className="absolute top-1/2 -translate-y-1/2 h-7 w-7 -ml-3.5 rounded-full bg-apollo-gold border-2 border-white shadow-petal touch-none"
            style={{ left: `${startPct}%` }}
          />
          {/* end handle */}
          <button
            type="button"
            aria-label="Bitiş"
            {...bindHandle("end")}
            className="absolute top-1/2 -translate-y-1/2 h-7 w-7 -ml-3.5 rounded-full bg-apollo-gold border-2 border-white shadow-petal touch-none"
            style={{ left: `${endPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-aphrodite-dark/55">
          <span>0:00</span>
          <span className="text-aphrodite-dark/80 font-medium">
            {fmt(startMs)} → {fmt(endMs)} · {Math.round(lengthMs / 1000)} sn
          </span>
          <span>{fmt(durationMs)}</span>
        </div>
        {/* Önizle butonu slider'a bitişik dursun — kullanıcı scroll etmeden görsün. */}
        <button
          type="button"
          onClick={() => {
            // Synchronously unlock iOS Safari's audio element inside the gesture.
            player.activateElement();
            if (previewing) stopPreview();
            else void startPreview();
          }}
          disabled={previewStarting}
          className={clsx(
            "mt-2 w-full py-2 rounded-full font-medium text-sm",
            "bg-aphrodite-dark/85 text-white disabled:opacity-70",
          )}
        >
          {previewing
            ? `❚❚ Durdur`
            : previewStarting
            ? "Hazırlanıyor…"
            : `▶ Önizle (${Math.round(lengthMs / 1000)} sn)`}
        </button>
        {player.notPremium && (
          <p className="text-xs text-red-600 text-center mt-1">
            Önizleme için Spotify Premium gerekiyor 🌹
          </p>
        )}
        {player.error && (
          <p className="text-xs text-red-600 text-center mt-1">{player.error}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          stopPreview();
          onConfirm(startMs, endMs);
        }}
        className="w-full py-2.5 rounded-full bg-peony-default text-white font-medium"
      >
        Bu parçayı kullan
      </button>
    </div>
  );
}
