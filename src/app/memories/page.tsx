"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { subscribeMemories } from "@/lib/memories";
import { formatMemoryDate } from "@/lib/format";
import type { Memory } from "@/lib/types";
import { PeonyIcon } from "@/components/PeonyIcon";

export default function MemoriesPage() {
  const router = useRouter();
  const { user, checked } = useAuthUser();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMemories((m) => {
      setMemories(m);
      setLoaded(true);
    });
    return () => unsub();
  }, [user]);

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="relative mx-auto max-w-xl min-h-dvh px-4 flex flex-col">
      <header className="pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push("/home")}
          aria-label="Ana sayfa"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-peony-default">
          <PeonyIcon size={24} glow />
          <h1 className="font-display text-2xl text-aphrodite-dark">Anılar</h1>
        </div>
        <Link
          href="/memories/new"
          className="h-9 px-3 grid place-items-center rounded-full bg-peony-default text-white text-sm font-medium shadow-petal active:scale-95"
        >
          + Yeni
        </Link>
      </header>

      {!loaded ? (
        <div className="flex-1 grid place-items-center">
          <PeonyIcon size={40} glow />
        </div>
      ) : memories.length === 0 ? (
        <div className="flex-1 grid place-items-center px-8">
          <div className="text-center text-aphrodite-dark/60 max-w-xs">
            <div className="text-peony-light flex justify-center mb-3">
              <PeonyIcon size={56} />
            </div>
            <p className="font-display text-2xl text-aphrodite-dark">
              Henüz anı yok
            </p>
            <p className="text-sm mt-2">
              İlk anınızı ekleyin — bir tarih, bir mekan, birkaç fotoğraf.
            </p>
            <Link href="/memories/new" className="btn-petal mt-5">
              İlk anıyı ekle
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-8">
          {memories.map((m) => (
            <Link
              key={m.id}
              href={`/memories/${m.id}`}
              className="glass-card rounded-2xl overflow-hidden active:scale-[0.98] transition"
            >
              <div className="aspect-[4/3] bg-peony-light/30 relative">
                {m.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.photos[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-peony-default/50">
                    <PeonyIcon size={32} />
                  </div>
                )}
                {m.photos.length > 1 && (
                  <span className="absolute top-2 right-2 text-[10px] font-medium bg-aphrodite-dark/55 text-white rounded-full px-2 py-0.5">
                    {m.photos.length} foto
                  </span>
                )}
              </div>
              <div className="p-3">
                <h2 className="font-display text-lg text-aphrodite-dark leading-tight line-clamp-1">
                  {m.title || "İsimsiz anı"}
                </h2>
                <p className="text-xs text-aphrodite-dark/55 mt-0.5">
                  {formatMemoryDate(m.date)}
                </p>
                {m.place && (
                  <p className="text-xs text-peony-default mt-0.5 line-clamp-1">
                    {m.place}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
