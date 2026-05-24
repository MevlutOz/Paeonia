"use client";

import clsx from "clsx";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";

interface Props {
  variant?: "full" | "compact";
  // Optional metadata shown alongside the CTA (used in MemoryMusic fallback).
  song?: { title: string; artist: string; artworkUrl: string } | null;
}

/**
 * "Spotify'a bağlan" CTA. Two visual variants:
 * - full: standalone block inside SongPicker before search starts
 * - compact: inline card used as MemoryMusic fallback (shows song metadata)
 */
export function SpotifyConnectCard({ variant = "full", song = null }: Props) {
  const { status, login, error } = useSpotifyAuth();
  const busy = status === "connecting" || status === "loading";

  if (variant === "compact" && song) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-aphrodite-dark/72 backdrop-blur-md text-white pl-1.5 pr-3 py-1.5 shadow-petal max-w-[90%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={song.artworkUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover border border-white/40"
        />
        <div className="min-w-0 text-left leading-tight">
          <p className="text-xs font-semibold truncate">{song.title}</p>
          <p className="text-[10px] text-white/70 truncate">{song.artist}</p>
        </div>
        <button
          type="button"
          onClick={login}
          disabled={busy}
          className="ml-1 shrink-0 text-[10px] font-bold uppercase tracking-wider bg-apollo-gold text-aphrodite-dark px-2 py-1 rounded-full disabled:opacity-60"
        >
          {busy ? "…" : "Bağlan"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-dashed border-peony-light/60 p-4 text-center",
        variant === "full" && "py-6",
      )}
    >
      <p className="text-aphrodite-dark/80 mb-2 text-sm">
        Şarkı kırpmak için önce Spotify&apos;a bağlan 🌹
      </p>
      <p className="text-aphrodite-dark/55 text-xs mb-3">
        Premium hesabın gerekiyor — bir kez bağlanırsın, hep hazır olur.
      </p>
      <button
        type="button"
        onClick={login}
        disabled={busy}
        className="px-4 py-2 rounded-full bg-peony-default text-white font-medium disabled:opacity-60"
      >
        {busy ? "Yönlendiriliyor…" : "Spotify'a bağlan"}
      </button>
      {error && (
        <p className="text-red-600 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
