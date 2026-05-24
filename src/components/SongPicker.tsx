"use client";

import { useEffect, useState } from "react";
import type { MemorySong } from "@/lib/types";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";
import { pickArtwork, searchTracks, type SpotifyTrack } from "@/lib/spotify/api";
import { PeonyIcon } from "./PeonyIcon";
import { SpotifyConnectCard } from "./SpotifyConnectCard";

interface Props {
  value: MemorySong | null;
  onChange: (song: MemorySong | null) => void;
}

export function SongPicker({ value, onChange }: Props) {
  const { status, accessToken } = useSpotifyAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const items = await searchTracks(q, accessToken);
        setResults(items);
      } catch (e) {
        setResults([]);
        setSearchError(
          e instanceof Error ? e.message : "Arama yapılamadı",
        );
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, open, accessToken]);

  function selectTrack(track: SpotifyTrack) {
    // Task 10 will hand off to SongTrimmer first; for now save with default trim.
    onChange({
      title: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      artworkUrl: pickArtwork(track),
      spotifyTrackUri: track.uri,
      spotifyTrackId: track.id,
      durationMs: track.duration_ms,
      startMs: 0,
      endMs: Math.min(15_000, track.duration_ms),
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  // Selected song card (collapsed view)
  if (value && !open) {
    const trimSec = value.endMs != null && value.startMs != null
      ? Math.round((value.endMs - value.startMs) / 1000)
      : null;
    return (
      <div>
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Şarkı
        </span>
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-white/70 border border-peony-light/50 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.artworkUrl}
            alt=""
            className="h-12 w-12 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-aphrodite-dark truncate">
              {value.title}
            </p>
            <p className="text-xs text-aphrodite-dark/60 truncate">
              {value.artist}
              {trimSec !== null && ` · ${trimSec} sn parça`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-peony-default px-2 py-1"
          >
            Değiştir
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Şarkıyı kaldır"
            className="h-7 w-7 grid place-items-center rounded-full bg-aphrodite-dark/10 text-aphrodite-dark/60"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // "Şarkı ekle" idle button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-2xl border-2 border-dashed border-peony-light/60 px-4 py-3 text-peony-default active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
        </svg>
        <span className="font-medium">Şarkı ekle</span>
      </button>
    );
  }

  // Open: either connect CTA or search UI
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Şarkı ara
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-aphrodite-dark/55"
        >
          Vazgeç
        </button>
      </div>

      {status !== "connected" || !accessToken ? (
        <div className="mt-2">
          <SpotifyConnectCard variant="full" />
        </div>
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Şarkı veya sanatçı adı…"
            className="input-petal mt-1"
          />

          <div className="mt-2 max-h-64 overflow-y-auto chat-scroll rounded-xl">
            {searching && (
              <div className="py-4 grid place-items-center text-peony-default">
                <PeonyIcon size={28} glow />
              </div>
            )}
            {searchError && !searching && (
              <p className="text-sm text-red-600 py-3 text-center">
                {searchError}
              </p>
            )}
            {!searching &&
              !searchError &&
              query.trim().length >= 2 &&
              results.length === 0 && (
                <p className="text-sm text-aphrodite-dark/55 py-3 text-center">
                  Sonuç bulunamadı.
                </p>
              )}
            {results.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => selectTrack(track)}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-peony-light/15 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pickArtwork(track)}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-aphrodite-dark truncate">
                    {track.name}
                  </p>
                  <p className="text-xs text-aphrodite-dark/60 truncate">
                    {track.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
                <span className="text-xs font-medium text-white bg-peony-default rounded-full px-3 py-1.5 shrink-0">
                  Seç
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
