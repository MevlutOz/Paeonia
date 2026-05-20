"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "firebase/auth";
import { onUser, signOut } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";
import { PeonyIcon } from "@/components/PeonyIcon";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

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

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="relative min-h-dvh mx-auto max-w-xl px-5 flex flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -right-10 w-60 h-60 bg-peony-light/35 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -left-12 w-64 h-64 bg-apollo-gold/15 rounded-full blur-3xl" />
      </div>

      <header className="relative pt-[max(env(safe-area-inset-top),20px)] flex items-center justify-between">
        <div className="flex items-center gap-2 text-peony-default">
          <PeonyIcon size={30} glow />
          <h1 className="font-display text-3xl text-aphrodite-dark">Paeonia</h1>
        </div>
        <button
          type="button"
          onClick={() => signOut().then(() => router.replace("/login"))}
          className="text-xs text-aphrodite-dark/55 hover:text-peony-dark"
        >
          Çık
        </button>
      </header>

      <p className="relative font-sans text-aphrodite-dark/65 mt-2">
        Gizli bahçemize hoş geldin. Bugün ne yapalım?
      </p>

      <div className="relative flex-1 flex flex-col justify-center gap-4 py-8">
        <Link
          href="/chat"
          className="group glass-card rounded-3xl p-5 flex items-center gap-4 transition active:scale-[0.98] hover:shadow-blush-soft"
        >
          <div className="h-14 w-14 shrink-0 grid place-items-center rounded-2xl bg-peony-default/15 text-peony-default p-3">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl text-aphrodite-dark">Mesajlar</h2>
            <p className="text-sm text-aphrodite-dark/60">
              Fısıltılar, çizimler, mahcup anlar
            </p>
          </div>
        </Link>

        <Link
          href="/memories"
          className="group glass-card rounded-3xl p-5 flex items-center gap-4 transition active:scale-[0.98] hover:shadow-blush-soft"
        >
          <div className="h-14 w-14 shrink-0 grid place-items-center rounded-2xl bg-apollo-gold/20 text-apollo-gold p-3">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 5h3l1.5-2h7L18 5h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm8 4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl text-aphrodite-dark">Anılar</h2>
            <p className="text-sm text-aphrodite-dark/60">
              Fotoğraflar, tarihler, kolajlar
            </p>
          </div>
        </Link>

        <Link
          href="/plans"
          className="group glass-card rounded-3xl p-5 flex items-center gap-4 transition active:scale-[0.98] hover:shadow-blush-soft"
        >
          <div className="h-14 w-14 shrink-0 grid place-items-center rounded-2xl bg-peony-dark/15 text-peony-dark p-3">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 5h10v2H9V5Zm0 6h10v2H9v-2Zm0 6h10v2H9v-2ZM4.5 4.2 6 5.7 3.3 8.4 1.5 6.6l1-1 .8.8 1.2-1.2ZM4.5 10.2 6 11.7l-2.7 2.7-1.8-1.8 1-1 .8.8 1.2-1.2ZM4.5 16.2 6 17.7l-2.7 2.7-1.8-1.8 1-1 .8.8 1.2-1.2Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl text-aphrodite-dark">Planlar</h2>
            <p className="text-sm text-aphrodite-dark/60">
              Birlikte yapmak istedikleriniz
            </p>
          </div>
        </Link>
      </div>

      <p className="relative text-center text-[11px] text-aphrodite-dark/40 pb-[max(env(safe-area-inset-bottom),16px)]">
        Paeonia · Şakayık ve Apollon
      </p>
    </main>
  );
}
