"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { onUser } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";
import { subscribeMessages, toggleFavorite } from "@/lib/messages";
import { reportRouteReady } from "@/lib/telemetry/events";
import type { Message, PhotoVariants } from "@/lib/types";
import { useMedia } from "@/lib/hooks/useMedia";
import { PeonyIcon } from "@/components/PeonyIcon";
import { Lightbox } from "@/components/Lightbox";

function FavoriteThumb({ message }: { message: Message }) {
  const isVideo = message.type === "video";
  const media = useMedia(
    isVideo ? undefined : message.content,
    message.variants,
    "(max-width: 768px) 45vw, 200px",
  );

  if (isVideo) {
    return (
      <>
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
        <span className="absolute bottom-1 right-1 h-7 w-7 grid place-items-center rounded-full bg-white/85 shadow-blush-soft">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 5v14l11-7L8 5Z"
              fill="currentColor"
              className="text-peony-dark"
            />
          </svg>
        </span>
      </>
    );
  }

  if (!media) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.src}
      srcSet={media.srcSet || undefined}
      sizes={media.sizes}
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

export default function AlbumPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lightbox, setLightbox] = useState<{
    kind: "image" | "video";
    url: string;
    variants?: PhotoVariants | null;
    poster?: string | null;
  } | null>(null);
  const routeReadyFired = useRef(false);

  useEffect(() => {
    const unsub = onUser((u) => {
      setChecked(true);
      if (!u || !isAllowedUid(u.uid)) {
        router.replace("/login");
        return;
      }
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMessages((m) => setMessages(m));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (user && !routeReadyFired.current) {
      routeReadyFired.current = true;
      reportRouteReady("album");
    }
  }, [user]);

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  const favorites = messages.filter(
    (m) =>
      m.isFavorited &&
      (m.type === "drawing" || m.type === "photo" || m.type === "video"),
  );

  function openFavorite(m: Message) {
    if (m.type === "video") {
      setLightbox({
        kind: "video",
        url: m.content,
        poster: m.poster,
      });
    } else {
      setLightbox({
        kind: "image",
        url: m.content,
        variants: m.variants,
      });
    }
  }

  return (
    <main className="album-parchment relative mx-auto max-w-xl min-h-dvh flex flex-col">
      <header className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/home")}
          aria-label="Ana sayfa"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-peony-default">
          <PeonyIcon size={22} glow />
          <h1 className="font-display text-2xl text-aphrodite-dark">
            Kurutulmuş Yapraklar
          </h1>
        </div>
        <span className="w-9" aria-hidden />
      </header>

      {favorites.length === 0 ? (
        <div className="flex-1 grid place-items-center px-8">
          <div className="text-center text-aphrodite-dark/60 max-w-xs">
            <p className="font-display text-2xl text-aphrodite-dark">
              Albüm henüz boş
            </p>
            <p className="text-sm mt-2">
              Sohbette bir çizime, fotoğrafa veya videoya çift dokun — burada
              preslensin.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="grid grid-cols-2 gap-4">
            {favorites.map((m, i) => (
              <figure
                key={m.id}
                className="relative bg-white p-2 pb-6 shadow-petal"
                style={{ transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)` }}
              >
                <button
                  type="button"
                  onClick={() => openFavorite(m)}
                  className="relative block w-full overflow-hidden"
                  style={{ aspectRatio: "1 / 1" }}
                  aria-label="Büyüt"
                >
                  <FavoriteThumb message={m} />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(m.id, false).catch(() => {})}
                  aria-label="Favoriden çıkar"
                  className="absolute top-1 right-1 h-8 w-8 grid place-items-center rounded-full bg-white/85 shadow-blush-soft active:scale-90"
                >
                  <PeonyIcon size={18} glow />
                </button>
                <figcaption className="absolute bottom-1 left-0 right-0 text-center text-[10px] uppercase tracking-wider text-aphrodite-dark/50">
                  {m.createdAt
                    ? new Date(m.createdAt.toMillis()).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "short",
                      })
                    : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <Lightbox
        url={lightbox?.url ?? null}
        kind={lightbox?.kind ?? "image"}
        variants={lightbox?.variants ?? null}
        poster={lightbox?.poster ?? null}
        onClose={() => setLightbox(null)}
      />
    </main>
  );
}
