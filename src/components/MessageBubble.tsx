"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Message, PhotoVariants } from "@/lib/types";
import { useMedia } from "@/lib/hooks/useMedia";
import { PeonyIcon } from "./PeonyIcon";
import { MusicCard } from "./MusicCard";
import { markRevealed, toggleFavorite } from "@/lib/messages";

interface Props {
  message: Message;
  mine: boolean;
  onOpenImage: (url: string, variants?: PhotoVariants | null) => void;
  onOpenVideo: (url: string, poster?: string | null) => void;
}

export function MessageBubble({
  message,
  mine,
  onOpenImage,
  onOpenVideo,
}: Props) {
  const isImageMedia = message.type === "drawing" || message.type === "photo";
  const isVideo = message.type === "video";
  const media = useMedia(
    isImageMedia ? message.content : undefined,
    message.variants,
    "280px",
  );
  const [revealed, setRevealed] = useState(
    message.isRevealed || mine || isVideo,
  );
  const [blushing, setBlushing] = useState(false);
  const blushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message.isRevealed) setRevealed(true);
  }, [message.isRevealed]);

  useEffect(() => {
    return () => {
      if (blushTimer.current) clearTimeout(blushTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  function reveal() {
    setRevealed(true);
    setBlushing(true);
    blushTimer.current = setTimeout(() => setBlushing(false), 2000);
    void markRevealed(message.id).catch(() => {});
  }

  function favorite() {
    void toggleFavorite(message.id, !message.isFavorited).catch(() => {});
  }

  function handleImageTap() {
    // Açılmamış karşı görsel: ilk dokunuş her zaman açar (gecikmesiz).
    if (!revealed && !mine) {
      reveal();
      return;
    }
    // Açılmış görsel: tek dokunuş büyütür, çift dokunuş favoriler.
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      favorite();
      return;
    }
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      onOpenImage(message.content, message.variants);
    }, 280);
  }

  function handleVideoTap() {
    // Video reveal yok; doğrudan tek/çift tap pattern.
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      favorite();
      return;
    }
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      onOpenVideo(message.content, message.poster);
    }, 280);
  }

  const time = message.createdAt
    ? new Date(message.createdAt.toMillis()).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={clsx("flex w-full animate-floatUp", mine ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[78%] relative",
          mine ? "items-end" : "items-start",
          "flex flex-col gap-1",
        )}
      >
        {message.type === "text" && (
          <div
            className={clsx(
              "px-4 py-2.5 font-sans leading-relaxed shadow-petal",
              mine
                ? "petal-bubble-me bg-peony-default text-white"
                : "petal-bubble-you bg-white/90 text-aphrodite-dark border border-peony-light/40",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        )}

        {message.type === "music" && (
          <MusicCard url={message.content} mine={mine} />
        )}

        {isImageMedia && media && (
          <div className="relative">
            <button
              type="button"
              onClick={handleImageTap}
              className={clsx(
                "relative overflow-hidden shadow-petal block",
                mine ? "petal-bubble-me" : "petal-bubble-you",
                "bg-peony-light/40",
                blushing && "animate-blush",
              )}
              style={{ width: "min(72vw, 280px)", aspectRatio: "1 / 1" }}
              aria-label={
                revealed
                  ? "Tek dokun: büyüt · çift dokun: favori"
                  : "Mahcup görüntü — dokun"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.src}
                srcSet={media.srcSet || undefined}
                sizes={media.sizes}
                alt=""
                loading="lazy"
                decoding="async"
                className={clsx(
                  "absolute inset-0 w-full h-full object-cover transition-[filter] duration-500",
                  !revealed && "blur-xl scale-110 saturate-[0.85]",
                )}
              />
              {!revealed && (
                <div className="absolute inset-0 grid place-items-center bg-white/15 backdrop-blur-md">
                  <div className="flex flex-col items-center text-peony-dark">
                    <PeonyIcon size={36} glow />
                    <span className="text-xs mt-1 font-medium tracking-wide">
                      Dokunarak aç
                    </span>
                  </div>
                </div>
              )}
            </button>

            {revealed && (
              <button
                type="button"
                onClick={favorite}
                aria-label={message.isFavorited ? "Favoriden çıkar" : "Favorile"}
                aria-pressed={message.isFavorited}
                className={clsx(
                  "absolute top-2 right-2 h-9 w-9 grid place-items-center rounded-full transition active:scale-90",
                  message.isFavorited
                    ? "bg-white/85 shadow-blush-soft"
                    : "bg-aphrodite-dark/30 backdrop-blur-sm",
                )}
              >
                <PeonyIcon size={20} glow={message.isFavorited} />
              </button>
            )}
          </div>
        )}

        {isVideo && (
          <div className="relative">
            <button
              type="button"
              onClick={handleVideoTap}
              className={clsx(
                "relative overflow-hidden shadow-petal block",
                mine ? "petal-bubble-me" : "petal-bubble-you",
                "bg-aphrodite-dark",
                blushing && "animate-blush",
              )}
              style={{ width: "min(72vw, 280px)", aspectRatio: "1 / 1" }}
              aria-label="Tek dokun: oynat · çift dokun: favori"
            >
              {message.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.poster}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-aphrodite-dark" />
              )}
              <div className="absolute inset-0 grid place-items-center bg-aphrodite-dark/20">
                <span className="h-14 w-14 grid place-items-center rounded-full bg-white/85 shadow-petal">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 5v14l11-7L8 5Z"
                      fill="currentColor"
                      className="text-peony-dark"
                    />
                  </svg>
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={favorite}
              aria-label={message.isFavorited ? "Favoriden çıkar" : "Favorile"}
              aria-pressed={message.isFavorited}
              className={clsx(
                "absolute top-2 right-2 h-9 w-9 grid place-items-center rounded-full transition active:scale-90",
                message.isFavorited
                  ? "bg-white/85 shadow-blush-soft"
                  : "bg-aphrodite-dark/30 backdrop-blur-sm",
              )}
            >
              <PeonyIcon size={20} glow={message.isFavorited} />
            </button>
          </div>
        )}

        <div
          className={clsx(
            "flex items-center gap-1.5 text-[10px] uppercase tracking-wider",
            mine ? "text-aphrodite-dark/55 justify-end" : "text-aphrodite-dark/45",
          )}
        >
          <span>{time}</span>
          {mine && (
            <span
              title={message.isRead ? "Görüldü" : "Gönderildi"}
              className={clsx(
                "transition-opacity",
                message.isRead
                  ? "opacity-100 text-peony-default"
                  : "opacity-40 text-aphrodite-dark",
              )}
            >
              <PeonyIcon size={12} glow={message.isRead} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
