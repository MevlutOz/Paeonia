# Anılar — Spotify Şarkı Kırpma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anılar modülünde şarkı seçimini iTunes preview yerine tam Spotify entegrasyonuna taşı ve kullanıcının IG Stories tarzı 5–30 sn'lik bir parça kırpmasına izin ver.

**Architecture:** Spotify Authorization Code with PKCE (client-side, server gerekmez) — refresh token Firestore `users/{uid}` doc'unda saklanır, access token sessionStorage'da yaşar. Spotify Web API arama için, Web Playback SDK oynatma için kullanılır. Eski iTunes preview'lı anılar geri uyumlu çalmaya devam eder.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firebase Firestore, Spotify Web API + Web Playback SDK (script tag, NPM paketi yok), Tailwind CSS, mevcut Paeonia design tokens (`peony-*`, `apollo-gold`, `aphrodite-dark`).

**Spec:** `docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md`

**Manuel kurulum önkoşulları (engineer'in başlamadan kontrol etmesi):**
- `.env.local`'da `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` dolu mu? (`grep SPOTIFY .env.local`)
- Spotify Dashboard'da Redirect URIs kayıtlı mı? (`http://127.0.0.1:3000/auth/spotify/callback`, `https://paeoniam.vercel.app/auth/spotify/callback`)
- User Management'a iki kullanıcı eklendi mi?

---

## File Structure

**New:**
```
src/lib/spotify/
├─ auth.ts          PKCE flow + token exchange + refresh
├─ api.ts           Web API REST wrapper (search + getTrack)
└─ player.ts        SDK lazy loader + Player singleton

src/lib/
├─ useSpotifyAuth.ts    Hook: { status, accessToken, login, logout, isPremium }
└─ useSpotifyPlayer.ts  Hook: { ready, deviceId, state, play, pause, seek }

src/components/
├─ SpotifyConnectCard.tsx   "Spotify'a bağlan" CTA (variants: full, compact)
└─ SongTrimmer.tsx          Dual-handle slider + preview button

src/app/auth/spotify/
└─ callback/page.tsx     OAuth redirect handler
```

**Modified:**
```
src/lib/types.ts                 MemorySong + PaeoniaUser genişletme
src/components/SongPicker.tsx    iTunes → Spotify search + Trim step
src/components/MemoryMusic.tsx   Spotify SDK path + iTunes fallback korunur
README.md                        Spotify Developer App kurulum bölümü
```

**Unchanged (önemli — bilerek):**
```
functions/index.js               searchMusic Cloud Function (eski anılar için)
src/lib/music.ts                 iTunes helper (eski anılar için)
src/components/MusicCard.tsx     chat müzik mesajları
firestore.rules                  users/{uid} update zaten owner-only
```

---

## Test Strategy

Projede Vitest/Jest yok ve bu plan kapsamında eklemiyoruz. Doğrulama:
1. **TypeScript check** her commit'te (`npx tsc --noEmit`)
2. **Dev server smoke** ilgili sayfayı tarayıcıda aç, console temiz olmalı
3. **Manual integration** her task sonundaki "Verify" adımları

---

## Task 1: MemorySong + PaeoniaUser type extensions

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Read current types.ts**

Run: open `src/lib/types.ts` — confirm `MemorySong` and `PaeoniaUser` interfaces exist as expected.

- [ ] **Step 2: Extend MemorySong with optional Spotify fields**

Replace the `MemorySong` interface (lines ~42-47) with:

```ts
export interface MemorySong {
  title: string;
  artist: string;
  artworkUrl: string;
  // Spotify path — yeni anılar için
  spotifyTrackUri?: string;   // "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"
  spotifyTrackId?: string;
  durationMs?: number;        // tam şarkı süresi (trim UI için)
  startMs?: number;           // kırpma başı
  endMs?: number;             // kırpma sonu (endMs - startMs ∈ [5000, 30000])
  // iTunes path — eski anılar için (yeni anılarda yazılmaz)
  previewUrl?: string;
}
```

- [ ] **Step 3: Extend PaeoniaUser with Spotify fields**

Replace the `PaeoniaUser` interface (lines ~5-10) with:

```ts
export interface PaeoniaUser {
  uid: string;
  displayName: string;
  fcmToken?: string | null;
  partnerId?: string | null;
  spotifyRefreshToken?: string | null;
  spotifyConnectedAt?: Timestamp | null;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: zero errors (existing code uses only the unchanged fields).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): MemorySong + PaeoniaUser için Spotify alanları"
```

---

## Task 2: Spotify PKCE auth library

**Files:**
- Create: `src/lib/spotify/auth.ts`

- [ ] **Step 1: Create the directory and file**

Create the file `src/lib/spotify/auth.ts` with the full content below.

- [ ] **Step 2: Write the auth library**

```ts
/**
 * Spotify Authorization Code with PKCE flow.
 *
 * Public Spotify API ile birlikte client-side PKCE flow yürütür. Server-side
 * client secret gerekmez. Refresh token'lar Firestore users/{uid} doc'una
 * yazılır; access token'lar sessionStorage'da yaşar (tab kapanınca silinir).
 *
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §8
 */

const SCOPE = "streaming user-read-email user-read-private";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

const STORAGE_KEY = {
  verifier: "sp_pkce_verifier",
  state: "sp_oauth_state",
  returnTo: "sp_return_to",
  accessToken: "sp_access_token",
  expiresAt: "sp_expires_at",
} as const;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: "Bearer";
  scope: string;
}

/** Base64url encode a byte array (no padding, URL-safe alphabet). */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Generate a PKCE verifier + S256 challenge pair. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64url(new Uint8Array(hash));
  return { verifier, challenge };
}

function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function redirectUri(): string {
  return `${window.location.origin}/auth/spotify/callback`;
}

function clientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID tanımlı değil");
  return id;
}

/**
 * Begin the OAuth flow. Saves verifier/state/returnTo to localStorage
 * then redirects to Spotify's authorize endpoint. Never returns.
 */
export async function login(returnTo: string = window.location.pathname): Promise<void> {
  const { verifier, challenge } = await generatePkce();
  const state = randomState();
  localStorage.setItem(STORAGE_KEY.verifier, verifier);
  localStorage.setItem(STORAGE_KEY.state, state);
  localStorage.setItem(STORAGE_KEY.returnTo, returnTo);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    redirect_uri: redirectUri(),
    scope: SCOPE,
  });
  window.location.assign(`${AUTHORIZE_ENDPOINT}?${params}`);
}

/**
 * Exchange the authorization code for tokens. Throws on failure.
 * Called only from /auth/spotify/callback.
 */
export async function exchangeCode(params: {
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: params.verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Refresh an access token using a stored refresh token. Spotify may rotate
 * the refresh_token; caller must persist the new one if present.
 */
export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Cache an access token + its expiry in sessionStorage. */
export function cacheAccessToken(token: string, expiresInSec: number): void {
  sessionStorage.setItem(STORAGE_KEY.accessToken, token);
  sessionStorage.setItem(
    STORAGE_KEY.expiresAt,
    String(Date.now() + expiresInSec * 1000),
  );
}

/** Read the cached access token if still valid (≥60s remaining). */
export function readAccessToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY.accessToken);
  const expiresAt = Number(sessionStorage.getItem(STORAGE_KEY.expiresAt) ?? 0);
  if (!token) return null;
  if (Date.now() > expiresAt - 60_000) return null;
  return token;
}

/** Clear access token cache (refresh token stays in Firestore). */
export function clearAccessToken(): void {
  sessionStorage.removeItem(STORAGE_KEY.accessToken);
  sessionStorage.removeItem(STORAGE_KEY.expiresAt);
}

/** Storage keys used by callback page to pop the saved verifier/state. */
export const authStorageKeys = STORAGE_KEY;
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Browser console smoke test**

Start dev server if not running (`npm run dev`). In browser console at `http://127.0.0.1:3000/`:

```js
const m = await import("/src/lib/spotify/auth.ts");  // Next will fail this path
```

That import path won't work in production-built code, so verify by running the dev server and visiting `/diag` (existing route). Open DevTools console and just confirm there are NO new errors. Real auth flow test comes in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/auth.ts
git commit -m "feat(spotify): PKCE auth library — login, exchange, refresh"
```

---

## Task 3: OAuth callback page

**Files:**
- Create: `src/app/auth/spotify/callback/page.tsx`

- [ ] **Step 1: Create the callback page**

Create the file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";
import {
  authStorageKeys,
  cacheAccessToken,
  exchangeCode,
} from "@/lib/spotify/auth";
import { PeonyIcon } from "@/components/PeonyIcon";

export default function SpotifyCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    (async () => {
      try {
        const tokens = await exchangeCode({ code, verifier });
        const user = firebaseAuth().currentUser;
        if (!user) throw new Error("Firebase oturumu yok.");
        await setDoc(
          doc(firestore(), "users", user.uid),
          {
            spotifyRefreshToken: tokens.refresh_token,
            spotifyConnectedAt: serverTimestamp(),
          },
          { merge: true },
        );
        cacheAccessToken(tokens.access_token, tokens.expires_in);
        localStorage.removeItem(authStorageKeys.verifier);
        localStorage.removeItem(authStorageKeys.state);
        localStorage.removeItem(authStorageKeys.returnTo);
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
            Spotify'a bağlanıyor…
          </p>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Dev server smoke**

Start dev server if needed. Visit `http://127.0.0.1:3000/auth/spotify/callback` directly.
Expected: page renders error "Yanıtta kod veya state eksik." (because no params). UI is themed correctly.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/spotify/callback/page.tsx
git commit -m "feat(spotify): OAuth callback page"
```

---

## Task 4: useSpotifyAuth hook

**Files:**
- Create: `src/lib/useSpotifyAuth.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuthUser } from "./useAuthUser";
import { firestore } from "./firebase";
import {
  cacheAccessToken,
  clearAccessToken,
  login,
  readAccessToken,
  refresh,
} from "./spotify/auth";

export type SpotifyAuthStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface State {
  status: SpotifyAuthStatus;
  accessToken: string | null;
  error: string | null;
}

/**
 * Tracks the current user's Spotify connection state.
 * - On mount: reads refresh token from Firestore, refreshes access token if needed.
 * - login(): redirects to Spotify (never returns).
 * - logout(): clears access token + Firestore refresh token field.
 */
export function useSpotifyAuth() {
  const { user, checked } = useAuthUser();
  const [state, setState] = useState<State>({
    status: "loading",
    accessToken: null,
    error: null,
  });

  useEffect(() => {
    if (!checked) return;
    if (!user) {
      setState({ status: "disconnected", accessToken: null, error: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cached = readAccessToken();
        if (cached) {
          if (!cancelled)
            setState({ status: "connected", accessToken: cached, error: null });
          return;
        }
        const snap = await getDoc(doc(firestore(), "users", user.uid));
        const refreshToken = snap.data()?.spotifyRefreshToken as
          | string
          | undefined;
        if (!refreshToken) {
          if (!cancelled)
            setState({
              status: "disconnected",
              accessToken: null,
              error: null,
            });
          return;
        }
        const tokens = await refresh(refreshToken);
        cacheAccessToken(tokens.access_token, tokens.expires_in);
        // Spotify may rotate refresh tokens — persist if changed.
        if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
          await setDoc(
            doc(firestore(), "users", user.uid),
            { spotifyRefreshToken: tokens.refresh_token },
            { merge: true },
          );
        }
        if (!cancelled)
          setState({
            status: "connected",
            accessToken: tokens.access_token,
            error: null,
          });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Spotify bağlanamadı";
        setState({ status: "error", accessToken: null, error: msg });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, checked]);

  const startLogin = useCallback(() => {
    setState((s) => ({ ...s, status: "connecting" }));
    void login(window.location.pathname);
  }, []);

  const logout = useCallback(async () => {
    clearAccessToken();
    if (user) {
      await setDoc(
        doc(firestore(), "users", user.uid),
        { spotifyRefreshToken: null },
        { merge: true },
      );
    }
    setState({ status: "disconnected", accessToken: null, error: null });
  }, [user]);

  return {
    status: state.status,
    accessToken: state.accessToken,
    error: state.error,
    login: startLogin,
    logout,
  };
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useSpotifyAuth.ts
git commit -m "feat(spotify): useSpotifyAuth hook with refresh-on-mount"
```

---

## Task 5: Spotify Web API client

**Files:**
- Create: `src/lib/spotify/api.ts`

- [ ] **Step 1: Write the API library**

```ts
/**
 * Thin REST wrapper over the Spotify Web API. Caller passes the access token.
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §5.1
 */

const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  uri: string;             // "spotify:track:..."
  name: string;
  artists: { name: string }[];
  album: { images: { url: string; height: number; width: number }[] };
  duration_ms: number;
  is_playable?: boolean;
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify API ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

export async function searchTracks(
  query: string,
  accessToken: string,
  limit = 20,
): Promise<SpotifyTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await get<{ tracks: { items: SpotifyTrack[] } }>(
    `/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`,
    accessToken,
  );
  return data.tracks?.items ?? [];
}

export async function getTrack(
  trackId: string,
  accessToken: string,
): Promise<SpotifyTrack> {
  return await get<SpotifyTrack>(`/tracks/${trackId}`, accessToken);
}

/** Pick the largest artwork that's ≤640px (Spotify returns sorted by size). */
export function pickArtwork(track: SpotifyTrack): string {
  const imgs = track.album.images ?? [];
  if (imgs.length === 0) return "";
  // Spotify returns images sorted largest first; we want middle (~300x300).
  return imgs[Math.min(1, imgs.length - 1)].url;
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/spotify/api.ts
git commit -m "feat(spotify): Web API client — searchTracks, getTrack"
```

---

## Task 6: SpotifyConnectCard component

**Files:**
- Create: `src/components/SpotifyConnectCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import clsx from "clsx";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";

interface Props {
  variant?: "full" | "compact";
  // Optional metadata shown alongside the CTA (used in MemoryMusic fallback).
  song?: { title: string; artist: string; artworkUrl: string } | null;
}

/**
 * "Spotify'a bağlan" CTA. Two visual variants:
 * - full: standalone block inside SongPicker before search starts
 * - compact: inline card used as MemoryMusic fallback (shows song metadata)
 */
export function SpotifyConnectCard({ variant = "full", song = null }: Props) {
  const { status, login, error } = useSpotifyAuth();
  const busy = status === "connecting" || status === "loading";

  if (variant === "compact" && song) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-aphrodite-dark/72 backdrop-blur-md text-white pl-1.5 pr-3 py-1.5 shadow-petal max-w-[90%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={song.artworkUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover border border-white/40"
        />
        <div className="min-w-0 text-left leading-tight">
          <p className="text-xs font-semibold truncate">{song.title}</p>
          <p className="text-[10px] text-white/70 truncate">{song.artist}</p>
        </div>
        <button
          type="button"
          onClick={login}
          disabled={busy}
          className="ml-1 shrink-0 text-[10px] font-bold uppercase tracking-wider bg-apollo-gold text-aphrodite-dark px-2 py-1 rounded-full disabled:opacity-60"
        >
          {busy ? "…" : "Bağlan"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-dashed border-peony-light/60 p-4 text-center",
        variant === "full" && "py-6",
      )}
    >
      <p className="text-aphrodite-dark/80 mb-2 text-sm">
        Şarkı kırpmak için önce Spotify'a bağlan 🌹
      </p>
      <p className="text-aphrodite-dark/55 text-xs mb-3">
        Premium hesabın gerekiyor — bir kez bağlanırsın, hep hazır olur.
      </p>
      <button
        type="button"
        onClick={login}
        disabled={busy}
        className="px-4 py-2 rounded-full bg-peony-default text-white font-medium disabled:opacity-60"
      >
        {busy ? "Yönlendiriliyor…" : "Spotify'a bağlan"}
      </button>
      {error && (
        <p className="text-red-600 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SpotifyConnectCard.tsx
git commit -m "feat(spotify): SpotifyConnectCard CTA (full + compact)"
```

---

## Task 7: SongPicker — Spotify search migration (no trim yet)

**Files:**
- Modify: `src/components/SongPicker.tsx`

- [ ] **Step 1: Replace the file**

Open `src/components/SongPicker.tsx`. We're rewriting it to use Spotify search instead of iTunes. Trim step comes in Task 9. Replace the whole file with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { MemorySong } from "@/lib/types";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";
import { pickArtwork, searchTracks, type SpotifyTrack } from "@/lib/spotify/api";
import { PeonyIcon } from "./PeonyIcon";
import { SpotifyConnectCard } from "./SpotifyConnectCard";

interface Props {
  value: MemorySong | null;
  onChange: (song: MemorySong | null) => void;
}

export function SongPicker({ value, onChange }: Props) {
  const { status, accessToken } = useSpotifyAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const items = await searchTracks(q, accessToken);
        setResults(items);
      } catch (e) {
        setResults([]);
        setSearchError(
          e instanceof Error ? e.message : "Arama yapılamadı",
        );
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, open, accessToken]);

  function selectTrack(track: SpotifyTrack) {
    // Task 9 will hand off to SongTrimmer instead of saving directly.
    onChange({
      title: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      artworkUrl: pickArtwork(track),
      spotifyTrackUri: track.uri,
      spotifyTrackId: track.id,
      durationMs: track.duration_ms,
      startMs: 0,
      endMs: Math.min(15_000, track.duration_ms),
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  // Selected song card (collapsed view)
  if (value && !open) {
    const trimSec = value.endMs && value.startMs != null
      ? Math.round((value.endMs - value.startMs) / 1000)
      : null;
    return (
      <div>
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Şarkı
        </span>
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-white/70 border border-peony-light/50 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.artworkUrl}
            alt=""
            className="h-12 w-12 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-aphrodite-dark truncate">
              {value.title}
            </p>
            <p className="text-xs text-aphrodite-dark/60 truncate">
              {value.artist}
              {trimSec !== null && ` · ${trimSec} sn parça`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-peony-default px-2 py-1"
          >
            Değiştir
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Şarkıyı kaldır"
            className="h-7 w-7 grid place-items-center rounded-full bg-aphrodite-dark/10 text-aphrodite-dark/60"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // "Şarkı ekle" idle button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-2xl border-2 border-dashed border-peony-light/60 px-4 py-3 text-peony-default active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
        </svg>
        <span className="font-medium">Şarkı ekle</span>
      </button>
    );
  }

  // Open: either connect CTA or search UI
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Şarkı ara
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-aphrodite-dark/55"
        >
          Vazgeç
        </button>
      </div>

      {status !== "connected" || !accessToken ? (
        <div className="mt-2">
          <SpotifyConnectCard variant="full" />
        </div>
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Şarkı veya sanatçı adı…"
            className="input-petal mt-1"
          />

          <div className="mt-2 max-h-64 overflow-y-auto chat-scroll rounded-xl">
            {searching && (
              <div className="py-4 grid place-items-center text-peony-default">
                <PeonyIcon size={28} glow />
              </div>
            )}
            {searchError && !searching && (
              <p className="text-sm text-red-600 py-3 text-center">
                {searchError}
              </p>
            )}
            {!searching &&
              !searchError &&
              query.trim().length >= 2 &&
              results.length === 0 && (
                <p className="text-sm text-aphrodite-dark/55 py-3 text-center">
                  Sonuç bulunamadı.
                </p>
              )}
            {results.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => selectTrack(track)}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-peony-light/15 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pickArtwork(track)}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-aphrodite-dark truncate">
                    {track.name}
                  </p>
                  <p className="text-xs text-aphrodite-dark/60 truncate">
                    {track.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
                <span className="text-xs font-medium text-white bg-peony-default rounded-full px-3 py-1.5 shrink-0">
                  Seç
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual integration test — full auth + search round-trip**

Start dev server: `npm run dev`
Open `http://127.0.0.1:3000/memories/new` in browser (must be logged in to Paeonia).

1. Click **Şarkı ekle** → expect `SpotifyConnectCard` (full variant).
2. Click **Spotify'a bağlan** → browser redirects to `accounts.spotify.com`.
3. Approve Paeonia. Spotify redirects back to `/auth/spotify/callback?code=…`.
4. Callback page shows "Spotify'a bağlanıyor…" briefly, then redirects to `/memories/new`.
5. Click **Şarkı ekle** again → expect the search input.
6. Type a song name → results appear (12 items, with album art).
7. Click **Seç** on one → song card shows "Şarkı Adı · Sanatçı · 15 sn parça".
8. Open Firebase Console → Firestore → `users/{your-uid}` → confirm `spotifyRefreshToken` and `spotifyConnectedAt` are set.

If any step fails, debug before continuing. Common issues:
- "INVALID_REDIRECT_URI" → Spotify Dashboard'da `http://127.0.0.1:3000/auth/spotify/callback` (NOT `localhost`) kayıtlı olmalı.
- "user not registered" → Spotify Dashboard → User Management'a Spotify e-mail'inin eklenmiş olması gerek.

- [ ] **Step 4: Commit**

```bash
git add src/components/SongPicker.tsx
git commit -m "feat(spotify): SongPicker'ı Spotify arama'ya çevir (trim henüz yok)"
```

---

## Task 8: Spotify Player library + hook

**Files:**
- Create: `src/lib/spotify/player.ts`
- Create: `src/lib/useSpotifyPlayer.ts`

- [ ] **Step 1: Write the player library**

Create `src/lib/spotify/player.ts`:

```ts
/**
 * Lazy loader + singleton wrapper for Spotify's Web Playback SDK.
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §7
 */

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: PlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface PlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: unknown) => void): void;
  removeListener(event: string, cb?: (data: unknown) => void): void;
  getCurrentState(): Promise<PlayerState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  togglePlay(): Promise<void>;
  setVolume(value: number): Promise<void>;
}

export interface PlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: { uri: string; id: string };
  };
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

let sdkPromise: Promise<void> | null = null;

/** Load the Spotify Web Playback SDK script exactly once. */
export function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("SDK requires browser"));
      return;
    }
    // If already loaded (HMR reload), resolve immediately.
    if (window.Spotify) {
      resolve();
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => reject(new Error("Spotify SDK script yüklenemedi"));
    document.body.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Create and connect a player instance. Caller provides a function that
 * yields a fresh access token (called by SDK before each privileged action).
 */
export async function createPlayer(
  getToken: () => string | null,
): Promise<SpotifyPlayer> {
  await loadSdk();
  if (!window.Spotify) throw new Error("Spotify SDK hazır değil");
  const player = new window.Spotify.Player({
    name: "Paeonia 🌹",
    volume: 0.85,
    getOAuthToken: (cb) => {
      const t = getToken();
      if (t) cb(t);
    },
  });
  const ok = await player.connect();
  if (!ok) throw new Error("Spotify player connect() false döndü");
  return player;
}

/** REST helper: start playback of a specific URI at a position on a device. */
export async function startPlayback(opts: {
  accessToken: string;
  deviceId: string;
  trackUri: string;
  positionMs: number;
}): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${opts.deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [opts.trackUri],
        position_ms: opts.positionMs,
      }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const txt = await res.text();
    throw new Error(`Spotify play failed ${res.status}: ${txt}`);
  }
}

/** REST helper: silently transfer playback to our device. */
export async function transferPlayback(opts: {
  accessToken: string;
  deviceId: string;
}): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/me/player`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [opts.deviceId], play: false }),
  });
  // 204 = success, 404 = no active device (fine)
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Transfer failed ${res.status}: ${txt}`);
  }
}
```

- [ ] **Step 2: Write the player hook**

Create `src/lib/useSpotifyPlayer.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotifyAuth } from "./useSpotifyAuth";
import {
  createPlayer,
  startPlayback,
  transferPlayback,
  type SpotifyPlayer,
} from "./spotify/player";

interface State {
  ready: boolean;
  deviceId: string | null;
  error: string | null;
  notPremium: boolean;
}

/**
 * Owns a single Spotify.Player instance for the current tab. Returns a play()
 * helper that starts a track at a specific position. Loop/seek logic is the
 * caller's responsibility (e.g. MemoryMusic polls and calls seek on its own).
 */
export function useSpotifyPlayer() {
  const { accessToken, status } = useSpotifyAuth();
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  const [state, setState] = useState<State>({
    ready: false,
    deviceId: null,
    error: null,
    notPremium: false,
  });
  const playerRef = useRef<SpotifyPlayer | null>(null);

  useEffect(() => {
    if (status !== "connected" || !accessToken) {
      setState({ ready: false, deviceId: null, error: null, notPremium: false });
      return;
    }

    let disposed = false;
    let player: SpotifyPlayer | null = null;

    (async () => {
      try {
        player = await createPlayer(() => accessTokenRef.current);
        if (disposed) {
          player.disconnect();
          return;
        }
        playerRef.current = player;
        player.addListener("ready", (data) => {
          const d = data as { device_id: string };
          setState({
            ready: true,
            deviceId: d.device_id,
            error: null,
            notPremium: false,
          });
        });
        player.addListener("not_ready", () => {
          setState((s) => ({ ...s, ready: false }));
        });
        player.addListener("initialization_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
        });
        player.addListener("authentication_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: `Auth: ${d.message}` }));
        });
        player.addListener("account_error", () => {
          setState((s) => ({ ...s, notPremium: true }));
        });
        player.addListener("playback_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
        });
      } catch (e) {
        if (!disposed) {
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e.message : "Player hatası",
          }));
        }
      }
    })();

    return () => {
      disposed = true;
      if (player) {
        try {
          player.disconnect();
        } catch {
          /* ignore */
        }
      }
      playerRef.current = null;
    };
  }, [status, accessToken]);

  async function play(trackUri: string, positionMs: number): Promise<void> {
    const token = accessTokenRef.current;
    if (!token || !state.deviceId)
      throw new Error("Player veya token hazır değil");
    await transferPlayback({ accessToken: token, deviceId: state.deviceId });
    await startPlayback({
      accessToken: token,
      deviceId: state.deviceId,
      trackUri,
      positionMs,
    });
  }

  async function pause(): Promise<void> {
    await playerRef.current?.pause();
  }

  async function seek(positionMs: number): Promise<void> {
    await playerRef.current?.seek(positionMs);
  }

  async function getPosition(): Promise<number | null> {
    const s = await playerRef.current?.getCurrentState();
    return s?.position ?? null;
  }

  return {
    ready: state.ready,
    deviceId: state.deviceId,
    error: state.error,
    notPremium: state.notPremium,
    play,
    pause,
    seek,
    getPosition,
  };
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/spotify/player.ts src/lib/useSpotifyPlayer.ts
git commit -m "feat(spotify): Web Playback SDK loader + useSpotifyPlayer hook"
```

---

## Task 9: SongTrimmer component

**Files:**
- Create: `src/components/SongTrimmer.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useSpotifyPlayer } from "@/lib/useSpotifyPlayer";

interface Props {
  trackUri: string;
  durationMs: number;
  artworkUrl: string;
  title: string;
  artist: string;
  initialStartMs?: number;
  initialEndMs?: number;
  onCancel: () => void;
  onConfirm: (startMs: number, endMs: number) => void;
}

const MIN_MS = 5_000;
const MAX_MS = 30_000;
const SNAP_MS = 1_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function snap(v: number): number {
  return Math.round(v / SNAP_MS) * SNAP_MS;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Dual-handle slider over the full song timeline. User picks a 5-30 second
 * window; ▶ Önizle plays it (loops back to start when the window ends).
 */
export function SongTrimmer({
  trackUri,
  durationMs,
  artworkUrl,
  title,
  artist,
  initialStartMs = 0,
  initialEndMs,
  onCancel,
  onConfirm,
}: Props) {
  const safeMaxEnd = Math.min(MAX_MS, durationMs);
  const [startMs, setStartMs] = useState(
    clamp(initialStartMs, 0, durationMs - MIN_MS),
  );
  const [endMs, setEndMs] = useState(
    clamp(initialEndMs ?? Math.min(15_000, durationMs), MIN_MS, durationMs),
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const player = useSpotifyPlayer();
  const previewPollRef = useRef<number | null>(null);

  const widthSpan = Math.max(durationMs, 1);
  const startPct = (startMs / widthSpan) * 100;
  const endPct = (endMs / widthSpan) * 100;
  const lengthMs = endMs - startMs;

  function stopPreview() {
    if (previewPollRef.current !== null) {
      window.clearInterval(previewPollRef.current);
      previewPollRef.current = null;
    }
    void player.pause();
    setPreviewing(false);
  }

  useEffect(() => {
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user moves a handle while previewing, restart preview so they hear
  // the new window — but only after a short debounce.
  useEffect(() => {
    if (!previewing) return;
    const id = window.setTimeout(() => {
      void startPreview();
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs]);

  async function startPreview() {
    if (!player.ready) return;
    try {
      await player.play(trackUri, startMs);
      setPreviewing(true);
      if (previewPollRef.current !== null)
        window.clearInterval(previewPollRef.current);
      previewPollRef.current = window.setInterval(async () => {
        const pos = await player.getPosition();
        if (pos === null) return;
        if (pos >= endMs) {
          await player.pause();
          stopPreview();
        }
      }, 250);
    } catch {
      setPreviewing(false);
    }
  }

  function handlePointer(
    which: "start" | "end",
    clientX: number,
    rect: DOMRect,
  ) {
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawMs = snap(ratio * durationMs);
    if (which === "start") {
      const next = clamp(rawMs, 0, endMs - MIN_MS);
      const upperByMax = endMs - MIN_MS;
      const lowerByMax = Math.max(0, endMs - safeMaxEnd);
      setStartMs(clamp(next, lowerByMax, upperByMax));
    } else {
      const next = clamp(rawMs, startMs + MIN_MS, durationMs);
      const upperByMax = Math.min(durationMs, startMs + safeMaxEnd);
      setEndMs(clamp(next, startMs + MIN_MS, upperByMax));
    }
  }

  function bindHandle(which: "start" | "end") {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = trackRef.current!.getBoundingClientRect();
        handlePointer(which, e.clientX, rect);
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const rect = trackRef.current!.getBoundingClientRect();
        handlePointer(which, e.clientX, rect);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
          Parçayı seç
        </span>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onCancel();
          }}
          className="text-xs text-aphrodite-dark/55"
        >
          Vazgeç
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white/70 border border-peony-light/50 p-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artworkUrl}
          alt=""
          className="h-12 w-12 rounded-lg object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="font-medium text-aphrodite-dark truncate">{title}</p>
          <p className="text-xs text-aphrodite-dark/60 truncate">
            {artist} · {fmt(durationMs)}
          </p>
        </div>
      </div>

      <div>
        <div
          ref={trackRef}
          className="relative h-10 rounded-full bg-peony-light/30 select-none touch-none"
        >
          {/* selected window */}
          <div
            className="absolute top-0 h-full bg-peony-default/55 rounded-full"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
          />
          {/* start handle */}
          <button
            type="button"
            aria-label="Başlangıç"
            {...bindHandle("start")}
            className="absolute top-1/2 -translate-y-1/2 h-7 w-7 -ml-3.5 rounded-full bg-apollo-gold border-2 border-white shadow-petal"
            style={{ left: `${startPct}%` }}
          />
          {/* end handle */}
          <button
            type="button"
            aria-label="Bitiş"
            {...bindHandle("end")}
            className="absolute top-1/2 -translate-y-1/2 h-7 w-7 -ml-3.5 rounded-full bg-apollo-gold border-2 border-white shadow-petal"
            style={{ left: `${endPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-aphrodite-dark/55">
          <span>0:00</span>
          <span className="text-aphrodite-dark/80 font-medium">
            {fmt(startMs)} → {fmt(endMs)} · {Math.round(lengthMs / 1000)} sn
          </span>
          <span>{fmt(durationMs)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => (previewing ? stopPreview() : startPreview())}
          disabled={!player.ready}
          className={clsx(
            "w-full py-2.5 rounded-full font-medium",
            "bg-aphrodite-dark/85 text-white disabled:opacity-50",
          )}
        >
          {previewing
            ? `❚❚ Durdur`
            : `▶ Önizle (${Math.round(lengthMs / 1000)} sn)`}
        </button>
        {player.notPremium && (
          <p className="text-xs text-red-600 text-center">
            Önizleme için Spotify Premium gerekiyor 🌹
          </p>
        )}
        {player.error && (
          <p className="text-xs text-red-600 text-center">{player.error}</p>
        )}
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onConfirm(startMs, endMs);
          }}
          className="w-full py-2.5 rounded-full bg-peony-default text-white font-medium"
        >
          Bu parçayı kullan
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SongTrimmer.tsx
git commit -m "feat(spotify): SongTrimmer dual-handle slider + preview"
```

---

## Task 10: Wire SongTrimmer into SongPicker

**Files:**
- Modify: `src/components/SongPicker.tsx`

- [ ] **Step 1: Update SongPicker to add Trim step**

Open `src/components/SongPicker.tsx`. Replace the imports block and add `mode` state:

Replace the imports (top of file):

```tsx
"use client";

import { useEffect, useState } from "react";
import type { MemorySong } from "@/lib/types";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";
import { pickArtwork, searchTracks, type SpotifyTrack } from "@/lib/spotify/api";
import { PeonyIcon } from "./PeonyIcon";
import { SpotifyConnectCard } from "./SpotifyConnectCard";
import { SongTrimmer } from "./SongTrimmer";
```

Inside `SongPicker` function, after the existing state declarations (right after `const [searchError, …] = useState…`), add:

```tsx
  const [pendingTrack, setPendingTrack] = useState<SpotifyTrack | null>(null);
```

Replace the `selectTrack` function (which currently calls `onChange` directly) with:

```tsx
  function pickTrackForTrim(track: SpotifyTrack) {
    setPendingTrack(track);
  }

  function confirmTrim(startMs: number, endMs: number) {
    if (!pendingTrack) return;
    onChange({
      title: pendingTrack.name,
      artist: pendingTrack.artists.map((a) => a.name).join(", "),
      artworkUrl: pickArtwork(pendingTrack),
      spotifyTrackUri: pendingTrack.uri,
      spotifyTrackId: pendingTrack.id,
      durationMs: pendingTrack.duration_ms,
      startMs,
      endMs,
    });
    setPendingTrack(null);
    setOpen(false);
    setQuery("");
    setResults([]);
  }
```

In the search results list, change the button's `onClick` from `selectTrack(track)` to `pickTrackForTrim(track)`.

Just before the final closing `</div>` of the open-state UI (the one that contains the search input + results), add the trimmer overlay. Wrap the existing search UI so that when `pendingTrack` is set, we show the trimmer instead. Modify the open-state return so its top-level structure is:

```tsx
  // Open: connect CTA, search, or trim
  if (pendingTrack) {
    return (
      <SongTrimmer
        trackUri={pendingTrack.uri}
        durationMs={pendingTrack.duration_ms}
        artworkUrl={pickArtwork(pendingTrack)}
        title={pendingTrack.name}
        artist={pendingTrack.artists.map((a) => a.name).join(", ")}
        onCancel={() => setPendingTrack(null)}
        onConfirm={confirmTrim}
      />
    );
  }

  return (
    <div>
      {/* existing search UI (unchanged) */}
      ...
    </div>
  );
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual integration test — full pick + trim + save**

Restart dev server if needed. Open `http://127.0.0.1:3000/memories/new`.

1. Şarkı ekle → search → click a song.
2. SongTrimmer screen appears with track info + slider at 0s–15s.
3. Drag the right handle to 22 seconds. Counter shows `22 sn`.
4. Tap **▶ Önizle (22 sn)** → music starts. Wait — at ~22s mark, music pauses (loop window ended). Tap again to replay.
5. Drag start handle to 1:08. The window now becomes 0:46→1:30 (depending on song length); counter updates live.
6. Tap **Bu parçayı kullan** → SongPicker shows collapsed card "Şarkı · Sanatçı · 22 sn parça".
7. Fill in title + save the memory.
8. Open Firebase Console → `memories/{newId}` → confirm `song.spotifyTrackUri`, `song.startMs`, `song.endMs` are saved.

- [ ] **Step 4: Commit**

```bash
git add src/components/SongPicker.tsx
git commit -m "feat(spotify): SongPicker'a Trimmer adımı eklendi"
```

---

## Task 11: MemoryMusic — Spotify path with loop

**Files:**
- Modify: `src/components/MemoryMusic.tsx`

- [ ] **Step 1: Rewrite MemoryMusic to support both paths**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { MemorySong } from "@/lib/types";
import { useSpotifyAuth } from "@/lib/useSpotifyAuth";
import { useSpotifyPlayer } from "@/lib/useSpotifyPlayer";
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

  const startMs = song.startMs ?? 0;
  const endMs = song.endMs ?? startMs + 15_000;

  function clearPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function start() {
    if (!song.spotifyTrackUri) return;
    if (starting || playing) return;
    if (!player.ready) return;
    setStarting(true);
    try {
      await player.play(song.spotifyTrackUri, startMs);
      setPlaying(true);
      schedulePoll();
    } catch {
      setPlaying(false);
    } finally {
      setStarting(false);
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

  // Adjust polling cadence when tab hides/shows.
  useEffect(() => {
    function onVisibility() {
      if (pollRef.current !== null) schedulePoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      clearPoll();
      void player.pause().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    if (!playing) {
      await start();
      return;
    }
    await player.pause();
    clearPoll();
    setPlaying(false);
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
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Manual integration test — both paths**

Restart dev server. You need at least one OLD memory (created with previous iTunes flow) and one NEW memory (created in Task 10).

1. Open the **NEW** memory → expect Spotify chip. Tap → music starts at startMs. Wait for the loop point — music should seek back to startMs and continue (no audible click ideally, but a small pause is acceptable). Tap again → pause.
2. Open the **OLD** memory (iTunes path) → music should auto-play the 30s preview loop as before. Tap → pause/play toggle still works.
3. Log out of Spotify (DevTools → Application → Storage → clear sessionStorage, and Firestore field `spotifyRefreshToken: null`). Refresh the NEW memory page → expect the compact connect card with "Bağlan" button. Click → goes through OAuth → returns to memory → music plays.
4. iOS Safari test (if available): open NEW memory → expect chip with PlayIcon. Tap once → music starts (autoplay blocked but user gesture works). Lock screen → audio pauses (expected, documented in spec §12.1).

- [ ] **Step 4: Commit**

```bash
git add src/components/MemoryMusic.tsx
git commit -m "feat(spotify): MemoryMusic — Spotify loop + iTunes fallback"
```

---

## Task 12: README — Spotify Developer App setup section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a new section to README**

Open `README.md`. Find the existing setup section (looking for env-var docs around lines 60–80). After the existing Firebase setup steps and before the "Canlı" or deploy section, add a new section:

```markdown
## 🎵 Spotify Şarkı Kırpma Kurulumu

Anılar modülünde IG Stories tarzı şarkı kırpma için Spotify Web Playback SDK kullanılıyor. Hem sen hem partnerin **Spotify Premium** abonesi olmalı.

### 1. Spotify Developer App oluştur

1. https://developer.spotify.com/dashboard → giriş yap → **Create app**.
2. Form:
   - **App name:** `Paeonia`
   - **App description:** `Love app` (veya istediğin)
   - **Redirect URIs** (iki tane ekle, `Add` butonuyla):
     - `http://127.0.0.1:3000/auth/spotify/callback` (dev — Spotify `localhost`'a izin vermiyor, **127.0.0.1 kullan**)
     - `https://paeoniam.vercel.app/auth/spotify/callback` (prod, kendi domain'in)
   - **Which API/SDKs:** ✅ Web API + ✅ Web Playback SDK
   - Terms onayla → Save.

### 2. User Management

Dashboard → app → **User Management** → hem senin hem partnerinin Spotify e-mail'ini ekle. Development Mode'da Spotify yalnızca eklenmiş kullanıcılara OAuth izni veriyor (25 kullanıcıya kadar bedava).

### 3. Client ID'yi env'lere yaz

App → **Settings** → "Client ID"yi kopyala. **Client Secret'a basma — PKCE kullandığımız için gerekmez ve hiçbir yere yazılmamalı.**

`.env.local`:

```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=...
```

Vercel → Project → Settings → Environment Variables → aynı anahtarı **Production + Preview + Development** üçüne ekle.

### 4. İlk bağlanma

Dev server'ı çalıştır (`npm run dev`), `http://127.0.0.1:3000/memories/new` adresine git (`localhost` değil), **Şarkı ekle → Spotify'a bağlan** → OAuth onayla. Aynı şeyi partnerin de bir kez yapsın.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README — Spotify Developer App kurulum kılavuzu"
```

---

## Final manual end-to-end checklist

Tüm task'lar bittikten sonra senin manuel doğrulaman:

- [ ] `npm run build` başarılı (production build)
- [ ] Senin tarafında: yeni Spotify anısı oluştur, kırp, kaydet, kapat, tekrar aç → çalıyor.
- [ ] Partnerin tarafında: aynı anıyı aç → Spotify bağlı değilse CTA görünüyor, bağlandıktan sonra çalıyor.
- [ ] Eski iTunes anılar bozulmamış.
- [ ] Şarkıyı değiştir (Değiştir butonu) → search'e geri dönüyor → yeni şarkı kırpılabiliyor.
- [ ] Premium iptali simülasyonu yapmadıysan en azından spec §9.1'deki mesaj kodda var (Task 11'de `player.notPremium`).
- [ ] Vercel'e deploy → production'da OAuth çalışıyor (`paeoniam.vercel.app/auth/spotify/callback` Spotify Dashboard'a kayıtlı olduğu için).
