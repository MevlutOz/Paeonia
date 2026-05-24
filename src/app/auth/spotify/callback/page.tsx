"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";
import {
  authStorageKeys,
  cacheAccessToken,
  exchangeCode,
} from "@/lib/spotify/auth";
import { PeonyIcon } from "@/components/PeonyIcon";

/**
 * Wait for Firebase's first onAuthStateChanged fire. Spotify's OAuth redirect
 * is a full page reload, so currentUser is null in the first tick after mount.
 */
function awaitAuthUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(firebaseAuth(), (u) => {
      unsub();
      resolve(u);
    });
  });
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // Spotify auth codes are single-use. React StrictMode double-fires effects
  // in dev — the second call would 400 with "invalid_grant" if we let it run.
  // This ref makes the exchange idempotent across re-mounts within the same
  // page load.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const errorParam = params.get("error");
    if (errorParam) {
      setError(`Spotify reddetti: ${errorParam}`);
      return;
    }
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("Yanıtta kod veya state eksik.");
      return;
    }
    const savedState = localStorage.getItem(authStorageKeys.state);
    const verifier = localStorage.getItem(authStorageKeys.verifier);
    const returnTo =
      localStorage.getItem(authStorageKeys.returnTo) ?? "/memories";
    if (state !== savedState) {
      setError("State eşleşmiyor (olası CSRF).");
      return;
    }
    if (!verifier) {
      setError("PKCE verifier kayıp.");
      return;
    }

    // Clear the verifier eagerly so any stray re-run can't reuse it either.
    localStorage.removeItem(authStorageKeys.verifier);
    localStorage.removeItem(authStorageKeys.state);
    localStorage.removeItem(authStorageKeys.returnTo);

    (async () => {
      try {
        // Wait for Firebase auth hydration BEFORE consuming the auth code.
        // The code expires fast (~10 min) but Firebase rehydration is sub-second
        // — this is safe and avoids the "Firebase oturumu yok" race.
        const user = await awaitAuthUser();
        if (!user) {
          setError("Firebase oturumu yok — önce Paeonia'ya giriş yap.");
          return;
        }
        const tokens = await exchangeCode({ code, verifier });
        await setDoc(
          doc(firestore(), "users", user.uid),
          {
            spotifyRefreshToken: tokens.refresh_token,
            spotifyConnectedAt: serverTimestamp(),
          },
          { merge: true },
        );
        cacheAccessToken(tokens.access_token, tokens.expires_in);
        router.replace(returnTo);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
        setError(msg);
      }
    })();
  }, [params, router]);

  return (
    <main className="min-h-dvh grid place-items-center p-4 text-center">
      {error ? (
        <div className="max-w-sm">
          <p className="text-red-600 mb-3">{error}</p>
          <button
            onClick={() => router.push("/memories")}
            className="px-4 py-2 rounded-full bg-peony-default text-white"
          >
            Anılara dön
          </button>
        </div>
      ) : (
        <div>
          <PeonyIcon size={56} glow />
          <p className="mt-3 text-aphrodite-dark/70">
            Spotify&apos;a bağlanıyor…
          </p>
        </div>
      )}
    </main>
  );
}

export default function SpotifyCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh grid place-items-center p-4">
          <PeonyIcon size={56} glow />
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
