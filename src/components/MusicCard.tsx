"use client";

import clsx from "clsx";
import { detectMusicLink } from "@/lib/links";

interface Props {
  url: string;
  mine: boolean;
}

export function MusicCard({ url, mine }: Props) {
  const link = detectMusicLink(url);

  // Ayrıştırma başarısızsa düz bir bağlantıya düş.
  if (!link) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "px-4 py-2.5 font-sans underline break-all shadow-petal",
          mine
            ? "petal-bubble-me bg-peony-default text-white"
            : "petal-bubble-you bg-white/90 text-aphrodite-dark border border-peony-light/40",
        )}
      >
        {url}
      </a>
    );
  }

  const isSpotify = link.provider === "spotify";

  return (
    <div
      className={clsx(
        "relative shadow-petal overflow-hidden p-3",
        mine ? "petal-bubble-me" : "petal-bubble-you",
        "bg-gradient-to-br from-[#FBEFE2] to-[#F2D7BE] border border-peony-light/50",
      )}
      style={{ width: "min(78vw, 300px)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* yavaşça dönen plak / şakayık motifi */}
        <span className="relative h-7 w-7 shrink-0 grid place-items-center">
          <span className="absolute inset-0 rounded-full bg-aphrodite-dark animate-spin-slow" />
          <span className="absolute inset-[5px] rounded-full border border-peony-light/40" />
          <span className="absolute h-2 w-2 rounded-full bg-apollo-gold" />
        </span>
        <span className="font-display text-lg text-aphrodite-dark">
          {isSpotify ? "Spotify" : "YouTube"} · Mırıltı
        </span>
      </div>

      <div className="rounded-xl overflow-hidden border border-peony-light/40 bg-white">
        <iframe
          src={link.embedUrl}
          title={isSpotify ? "Spotify oynatıcı" : "YouTube oynatıcı"}
          loading="lazy"
          allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
          className="w-full block"
          style={{ height: isSpotify ? 152 : 169, border: 0 }}
        />
      </div>
    </div>
  );
}
