"use client";

import { useEffect, useRef, useState } from "react";
import { searchMusic, type SongResult } from "@/lib/music";
import type { MemorySong } from "@/lib/types";
import { PeonyIcon } from "./PeonyIcon";

interface Props {
  value: MemorySong | null;
  onChange: (song: MemorySong | null) => void;
}

export function SongPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchMusic(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    return () => {
      previewRef.current?.pause();
    };
  }, []);

  function togglePreview(song: SongResult) {
    if (previewing === song.previewUrl) {
      previewRef.current?.pause();
      setPreviewing(null);
      return;
    }
    previewRef.current?.pause();
    const audio = new Audio(song.previewUrl);
    audio.volume = 0.9;
    previewRef.current = audio;
    void audio.play().catch(() => {});
    setPreviewing(song.previewUrl);
    audio.onended = () => setPreviewing(null);
  }

  function selectSong(song: SongResult) {
    previewRef.current?.pause();
    setPreviewing(null);
    onChange({
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      previewUrl: song.previewUrl,
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  if (value && !open) {
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
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Şarkı ara
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            previewRef.current?.pause();
            setPreviewing(null);
          }}
          className="text-xs text-aphrodite-dark/55"
        >
          Vazgeç
        </button>
      </div>
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
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-aphrodite-dark/55 py-3 text-center">
            Sonuç bulunamadı.
          </p>
        )}
        {results.map((song) => (
          <div
            key={song.trackId}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-peony-light/15"
          >
            <button
              type="button"
              onClick={() => togglePreview(song)}
              className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden"
              aria-label="Önizle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={song.artworkUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-aphrodite-dark/35 text-white">
                {previewing === song.previewUrl ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectSong(song)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="font-medium text-aphrodite-dark truncate">
                {song.title}
              </p>
              <p className="text-xs text-aphrodite-dark/60 truncate">
                {song.artist}
              </p>
            </button>
            <button
              type="button"
              onClick={() => selectSong(song)}
              className="text-xs font-medium text-white bg-peony-default rounded-full px-3 py-1.5 shrink-0"
            >
              Seç
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
