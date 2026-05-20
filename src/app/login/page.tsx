"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth";
import { onUser } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";
import { PeonyIcon } from "@/components/PeonyIcon";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onUser((user) => {
      if (user && isAllowedUid(user.uid)) router.replace("/home");
    });
    return () => unsub();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/home");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message.replace("Firebase: ", "")
          : "Giriş yapılamadı.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm glass-card rounded-3xl p-7">
        <div className="flex items-center gap-3 text-peony-default">
          <PeonyIcon size={36} glow />
          <h1 className="font-display text-3xl text-aphrodite-dark">Gizli Bahçe</h1>
        </div>
        <p className="text-aphrodite-dark/70 mt-2 text-sm">
          Yalnız ikimize ait. Davetlinin anahtarıyla gir.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
              E-posta
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-petal mt-1"
              placeholder="sen@bahce.app"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
              Anahtar
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-petal mt-1"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="text-peony-dark text-sm bg-peony-light/30 rounded-xl px-3 py-2 border border-peony-default/30">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-petal w-full mt-2">
            {loading ? "Açılıyor…" : "Bahçeye Gir"}
          </button>
        </form>

        <p className="text-[11px] text-aphrodite-dark/45 text-center mt-5">
          Paeonia · Şakayık ve Apollon
        </p>
      </div>
    </main>
  );
}
