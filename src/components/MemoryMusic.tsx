"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { MemorySong } from "@/lib/types";

interface Props {
  song: MemorySong;
}

/** Plays a memory's 30s song snippet (looping) with a now-playing chip. */
export function MemoryMusic({ song }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(song.previewUrl);
    audio.loop = true;
    audio.volume = 0.85;
    audioRef.current = audio;

    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [song.previewUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 rounded-full bg-aphrodite-dark/72 backdrop-blur-md text-white pl-1.5 pr-3 py-1.5 shadow-petal max-w-[80%]"
      aria-label={playing ? "Müziği duraklat" : "Müziği çal"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={song.artworkUrl}
        alt=""
        className={clsx(
          "h-8 w-8 rounded-full object-cover border border-white/40",
          playing && "animate-spin",
        )}
        style={playing ? { animationDuration: "7s" } : undefined}
      />
      <div className="min-w-0 text-left leading-tight">
        <p className="text-xs font-semibold truncate">{song.title}</p>
        <p className="text-[10px] text-white/70 truncate">{song.artist}</p>
      </div>
      <span className="ml-0.5 shrink-0">
        {playing ? (
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
  );
}
