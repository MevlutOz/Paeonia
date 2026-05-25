"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { MemorySong } from "@/lib/types";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";
import { useSpotifyPlayer } from "@/lib/SpotifyPlayerProvider";
import { SpotifyConnectCard } from "./SpotifyConnectCard";

interface Props {
  song: MemorySong;
}

const POLL_INTERVAL_MS = 250;
const POLL_INTERVAL_HIDDEN_MS = 1000;

/**
 * Plays a memory's song.
 * - New memories (song.spotifyTrackUri set): Spotify Web Playback SDK, loops
 *   the [startMs, endMs] window. Shows a connect CTA if the viewer isn't
 *   authenticated with Spotify yet.
 * - Old memories (song.previewUrl only): HTML5 Audio loop of the 30s preview.
 */
export function MemoryMusic({ song }: Props) {
  if (song.spotifyTrackUri) {
    return <SpotifyMemoryMusic song={song} />;
  }
  if (song.previewUrl) {
    return <ItunesMemoryMusic song={song} />;
  }
  return null;
}

/* ---------- Spotify path ---------- */

function SpotifyMemoryMusic({ song }: Props) {
  const auth = useSpotifyAuth();
  const player = useSpotifyPlayer();
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);
  // Auto-start fires only once per mount, the first time the player is ready.
  // If the browser blocks autoplay (e.g. iOS Safari without prior gesture),
  // we silently fall back to manual tap.
  const autoStartedRef = useRef(false);

  const startMs = song.startMs ?? 0;
  const endMs = song.endMs ?? startMs + 15_000;

  function clearPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function schedulePoll() {
    clearPoll();
    const interval =
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? POLL_INTERVAL_HIDDEN_MS
        : POLL_INTERVAL_MS;
    pollRef.current = window.setInterval(async () => {
      const pos = await player.getPosition();
      if (pos === null) return;
      if (pos >= endMs) {
        await player.seek(startMs);
      }
    }, interval);
  }

  async function start() {
    if (!song.spotifyTrackUri) return;
    if (starting || playing) return;
    // player.play() internally awaits SDK ready — we don't bail if !ready.
    // The UI shows "..." (starting state) until playback actually begins.
    setStarting(true);
    try {
      await player.play(song.spotifyTrackUri, startMs);
      setPlaying(true);
      schedulePoll();
    } catch (e) {
      console.warn("Memory music play failed:", e);
      setPlaying(false);
    } finally {
      setStarting(false);
    }
  }

  // Adjust polling cadence when tab hides/shows.
  useEffect(() => {
    function onVisibility() {
      if (pollRef.current !== null) schedulePoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start when player becomes ready. The user clicked into this page from
  // the memory list, so most browsers grant playback. If a browser blocks
  // autoplay (rare on desktop, possible on iOS Safari with strict settings),
  // start() catches the failure and the chip stays paused for manual tap.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!player.ready) return;
    if (playing || starting) return;
    autoStartedRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      clearPoll();
      void player.pause().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    // Synchronously activate the SDK's audio element while we still hold the
    // user gesture. THEN do async work. Otherwise iOS Safari blocks playback.
    player.activateElement();
    if (!playing) {
      void start();
    } else {
      void player.pause();
      clearPoll();
      setPlaying(false);
    }
  }

  // Auth/connection fallbacks
  if (auth.status === "disconnected") {
    return (
      <SpotifyConnectCard
        variant="compact"
        song={{
          title: song.title,
          artist: song.artist,
          artworkUrl: song.artworkUrl,
        }}
      />
    );
  }
  if (player.notPremium) {
    return (
      <SongChip
        song={song}
        action={
          <span className="text-[10px] text-white/80">Premium gerekli</span>
        }
        spinning={false}
      />
    );
  }
  if (player.error) {
    return (
      <SongChip
        song={song}
        action={
          <span className="text-[10px] text-white/80">Player hatası</span>
        }
        spinning={false}
      />
    );
  }

  return (
    <SongChip
      song={song}
      spinning={playing}
      onClick={toggle}
      action={
        starting ? (
          <span className="text-[10px] text-white/80">…</span>
        ) : playing ? (
          <PauseIcon />
        ) : (
          <PlayIcon />
        )
      }
    />
  );
}

/* ---------- iTunes path (eski anılar — değişmedi) ---------- */

function ItunesMemoryMusic({ song }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!song.previewUrl) return;
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
    <SongChip
      song={song}
      spinning={playing}
      onClick={toggle}
      action={playing ? <PauseIcon /> : <PlayIcon />}
    />
  );
}

/* ---------- Shared chip presentation ---------- */

function SongChip({
  song,
  spinning,
  onClick,
  action,
}: {
  song: MemorySong;
  spinning: boolean;
  onClick?: () => void;
  action: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full bg-aphrodite-dark/72 backdrop-blur-md text-white pl-1.5 pr-3 py-1.5 shadow-petal max-w-[80%]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={song.artworkUrl}
        alt=""
        className={clsx(
          "h-8 w-8 rounded-full object-cover border border-white/40",
          spinning && "animate-spin",
        )}
        style={spinning ? { animationDuration: "7s" } : undefined}
      />
      <div className="min-w-0 text-left leading-tight">
        <p className="text-xs font-semibold truncate">{song.title}</p>
        <p className="text-[10px] text-white/70 truncate">{song.artist}</p>
      </div>
      <span className="ml-0.5 shrink-0">{action}</span>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}
