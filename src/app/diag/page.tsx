"use client";

import { useEffect, useState } from "react";

type Line = { label: string; value: string; ok?: boolean };

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  vapid: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  allowedUids: process.env.NEXT_PUBLIC_ALLOWED_UIDS,
};

function mask(v?: string) {
  if (!v) return "(BOŞ!)";
  if (v.length <= 10) return v;
  return v.slice(0, 6) + "…" + v.slice(-4);
}

export default function DiagPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const out: Line[] = [];

    out.push({ label: "apiKey", value: mask(cfg.apiKey), ok: !!cfg.apiKey });
    out.push({ label: "authDomain", value: cfg.authDomain || "(BOŞ!)", ok: !!cfg.authDomain });
    out.push({ label: "projectId", value: cfg.projectId || "(BOŞ!)", ok: !!cfg.projectId });
    out.push({ label: "appId", value: mask(cfg.appId), ok: !!cfg.appId });
    out.push({ label: "vapidKey", value: mask(cfg.vapid), ok: !!cfg.vapid });
    out.push({ label: "allowedUids", value: cfg.allowedUids || "(BOŞ!)", ok: !!cfg.allowedUids });
    setLines([...out]);

    async function runTests() {
      // Test 1: raw fetch to Identity Toolkit
      try {
        const r = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "diag@example.com",
              password: "diag-wrong",
              returnSecureToken: true,
            }),
          },
        );
        const text = await r.text();
        const expected = text.includes("INVALID_LOGIN_CREDENTIALS") || r.status === 400;
        out.push({
          label: "TEST 1 · Firebase'e ulaşım (fetch)",
          value: `HTTP ${r.status} — ${expected ? "ULAŞILDI ✓" : text.slice(0, 120)}`,
          ok: expected,
        });
      } catch (e) {
        out.push({
          label: "TEST 1 · Firebase'e ulaşım (fetch)",
          value: `ENGELLENDİ — ${e instanceof Error ? e.name + ": " + e.message : String(e)}`,
          ok: false,
        });
      }
      setLines([...out]);

      // Test 2: googleapis genel erişim
      try {
        const r = await fetch("https://www.googleapis.com/discovery/v1/apis?fields=kind", {
          method: "GET",
        });
        out.push({
          label: "TEST 2 · googleapis.com genel erişim",
          value: `HTTP ${r.status} — ${r.ok ? "ULAŞILDI ✓" : "sorunlu"}`,
          ok: r.ok,
        });
      } catch (e) {
        out.push({
          label: "TEST 2 · googleapis.com genel erişim",
          value: `ENGELLENDİ — ${e instanceof Error ? e.message : String(e)}`,
          ok: false,
        });
      }
      setLines([...out]);

      // Test 2b: fetch with the EXACT custom headers the Firebase SDK adds
      try {
        const t0 = performance.now();
        const r = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Client-Version": "Chrome/JsCore/11.0.2/FirebaseCore-web",
              "X-Firebase-gmpid": cfg.appId ?? "",
              "X-Firebase-Client": btoa(
                JSON.stringify({ heartbeats: [], version: 2 }),
              ),
            },
            body: JSON.stringify({
              email: "diag2@example.com",
              password: "diag-wrong",
              returnSecureToken: true,
              clientType: "CLIENT_TYPE_WEB",
            }),
          },
        );
        const dt = Math.round(performance.now() - t0);
        const text = await r.text();
        const expected = text.includes("INVALID_LOGIN_CREDENTIALS") || r.status === 400;
        out.push({
          label: "TEST 2b · SDK-tarzı header'larla fetch",
          value: `HTTP ${r.status} (${dt}ms) — ${expected ? "ULAŞILDI ✓" : text.slice(0, 120)}`,
          ok: expected,
        });
      } catch (e) {
        out.push({
          label: "TEST 2b · SDK-tarzı header'larla fetch",
          value: `ENGELLENDİ — ${e instanceof Error ? e.name + ": " + e.message : String(e)}`,
          ok: false,
        });
      }
      setLines([...out]);

      // Test 3: Firebase SDK signIn (gerçek hata kodu)
      try {
        const { initializeApp, getApps, getApp } = await import("firebase/app");
        const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
        const app = getApps().length ? getApp() : initializeApp(cfg as never);
        const auth = getAuth(app);
        try {
          const t0 = performance.now();
          await signInWithEmailAndPassword(auth, "diag@example.com", "diag-wrong");
          out.push({ label: "TEST 3 · Firebase SDK signIn", value: "beklenmedik başarı", ok: false });
          void t0;
        } catch (e) {
          const t0 = performance.now();
          const code = (e as { code?: string })?.code ?? "bilinmiyor";
          const msg = (e as { message?: string })?.message ?? "";
          const reachable = code !== "auth/network-request-failed";
          out.push({
            label: "TEST 3 · Firebase SDK signIn (hata kodu)",
            value: `${code}${msg ? " — " + msg.slice(0, 120) : ""}`,
            ok: reachable,
          });
          void t0;
        }
      } catch (e) {
        out.push({
          label: "TEST 3 · Firebase SDK signIn",
          value: `SDK yükleme hatası — ${e instanceof Error ? e.message : String(e)}`,
          ok: false,
        });
      }
      setLines([...out]);
      setRunning(false);
    }

    void runTests();
  }, []);

  return (
    <main className="min-h-dvh px-5 py-8 max-w-xl mx-auto font-sans">
      <h1 className="font-display text-3xl text-aphrodite-dark">Paeonia · Teşhis</h1>
      <p className="text-aphrodite-dark/60 text-sm mt-1">
        {running ? "Testler çalışıyor…" : "Tamamlandı. Aşağıdaki sonuçların ekran görüntüsünü gönder."}
      </p>

      <div className="mt-6 space-y-2">
        {lines.map((l, i) => (
          <div
            key={i}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: l.ok === undefined ? "#ddd" : l.ok ? "#7CB342" : "#A93344",
              background: l.ok === false ? "rgba(169,51,68,0.06)" : "white",
            }}
          >
            <div className="font-semibold text-aphrodite-dark">{l.label}</div>
            <div className="text-aphrodite-dark/80 break-words font-mono text-xs mt-0.5">
              {l.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-aphrodite-dark/50">
        <p>Origin: {typeof window !== "undefined" ? window.location.origin : ""}</p>
        <p>UserAgent: {typeof navigator !== "undefined" ? navigator.userAgent : ""}</p>
        <p>Online: {typeof navigator !== "undefined" ? String(navigator.onLine) : ""}</p>
      </div>
    </main>
  );
}
