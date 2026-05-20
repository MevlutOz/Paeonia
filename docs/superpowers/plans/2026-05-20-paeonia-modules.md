# Paeonia Üç Modül — Implementasyon Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paeonia PWA'sına üç modül eklemek — Kurutulmuş Yapraklar (favori anı albümü), Mırıldanma (şarkı kartları) ve Güneş Doğumu (çevrimiçi durumu + ortak canlı tuval).

**Architecture:** Modül 1 ve 3 yalnızca Firestore + UI değişikliği. Modül 2 yeni bir Firebase Realtime Database bağımlılığı ekler (nokta nokta canlı çizim) ve `users` koleksiyonunda heartbeat tabanlı presence kullanır. Sıra: Modül 1 → Modül 3 → Modül 2 (en hafiften en ağıra).

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Firebase (Firestore, Storage, **Realtime Database**), framer-motion.

**Spec:** `docs/superpowers/specs/2026-05-20-paeonia-modules-design.md`

---

## Test stratejisi (önemli)

Bu projede otomatik test koşucusu (Jest/Vitest) **yoktur** ve bu plan biri kurmaz.
Her görevin doğrulaması:

- **Tip kontrolü:** `npx tsc --noEmit` → "0 errors" beklenir.
- **Lint:** `npm run lint` → "No ESLint warnings or errors" beklenir.
- **Sayfa duman testi:** dev sunucusu (`npm run dev`, http://localhost:3000)
  açıkken `curl -s -o /dev/null -w '%{http_code}' <route>` → `200` beklenir.
- **Manuel kabul:** her fazın sonunda tarayıcıda gözle doğrulama adımları.

Faz sonlarında ek olarak `npm run build` çalıştırılır (tam derleme + tip kontrolü).

Tüm commit'ler şu satırla biter:
`Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

---

## Task 0: Özellik dalı oluştur

**Files:** yok (git işlemi)

- [ ] **Step 1: main güncel mi kontrol et ve dal aç**

Run:
```bash
git checkout -b feat/paeonia-modules
git status
```
Expected: "On branch feat/paeonia-modules", temiz çalışma ağacı.

---

# FAZ 1 — Modül 1: Kurutulmuş Yapraklar

## Task 1: Favori veri katmanı (`isFavorited`)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/messages.ts`

- [ ] **Step 1: `Message` arayüzüne `isFavorited` ekle**

`src/lib/types.ts` — `Message` arayüzünü şununla değiştir:

```ts
export interface Message {
  id: string;
  senderId: string;
  type: MessageType;
  content: string;
  createdAt: Timestamp | null;
  isRead: boolean;
  isRevealed: boolean;
  isFavorited: boolean;
}
```

- [ ] **Step 2: `subscribeMessages` mapper'ına `isFavorited` ekle**

`src/lib/messages.ts` içinde `subscribeMessages`'taki dönen nesneye satır ekle.
Eski:
```ts
        isRead: !!data.isRead,
        isRevealed: !!data.isRevealed,
      };
```
Yeni:
```ts
        isRead: !!data.isRead,
        isRevealed: !!data.isRevealed,
        isFavorited: !!data.isFavorited,
      };
```

- [ ] **Step 3: `sendText` ve `sendMedia`'ya `isFavorited: false` yaz**

`src/lib/messages.ts` — `sendText` içindeki `addDoc` çağrısında
`isRevealed: true,` satırından sonra `isFavorited: false,` ekle.
`sendMedia` içindeki `addDoc` çağrısında `isRevealed: false,` satırından sonra
`isFavorited: false,` ekle.

- [ ] **Step 4: `toggleFavorite` fonksiyonunu ekle**

`src/lib/messages.ts` sonuna ekle:

```ts
export async function toggleFavorite(messageId: string, next: boolean) {
  await updateDoc(doc(firestore(), MESSAGES, messageId), {
    isFavorited: next,
  });
}
```
(`updateDoc` ve `doc` zaten dosyanın başında import edilmiş.)

- [ ] **Step 5: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/messages.ts
git commit -m "feat: mesajlara isFavorited alanı + toggleFavorite" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Firestore update kuralı — `isFavorited`

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: `messages` update kuralına `isFavorited` ekle**

`firestore.rules` içinde eski:
```
      allow update: if isInvited()
        && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['isRead', 'isRevealed']);
```
Yeni:
```
      allow update: if isInvited()
        && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['isRead', 'isRevealed', 'isFavorited']);
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: firestore kuralı — messages.isFavorited güncellemesine izin" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> Not: Kural deploy'u Faz 3 sonundaki tek deploy adımında yapılacak. O ana
> kadar sohbette favori toggle'ı kural reddi verebilir — bu beklenen durumdur,
> deploy sonrası çalışır.

---

## Task 3: Parşömen arka plan stili

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: `.album-parchment` sınıfını ekle**

`src/app/globals.css` **sonuna** ekle:

```css
/* Kurutulmuş Yapraklar albümü — eskitilmiş parşömen */
.album-parchment {
  background-color: #F1E2C9;
  background-image:
    radial-gradient(circle at 18% 12%, rgba(232, 184, 81, 0.18), transparent 42%),
    radial-gradient(circle at 84% 86%, rgba(169, 51, 68, 0.10), transparent 46%),
    radial-gradient(circle at 60% 50%, rgba(255, 255, 255, 0.35), transparent 60%);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: album-parchment arka plan stili" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: MessageBubble — favori butonu + çift dokunma

**Files:**
- Modify: `src/components/MessageBubble.tsx` (tam dosya yeniden yazımı)

- [ ] **Step 1: `MessageBubble.tsx`'i şu içerikle değiştir**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import type { Message } from "@/lib/types";
import { PeonyIcon } from "./PeonyIcon";
import { markRevealed, toggleFavorite } from "@/lib/messages";

interface Props {
  message: Message;
  mine: boolean;
  onOpenImage: (url: string) => void;
}

export function MessageBubble({ message, mine, onOpenImage }: Props) {
  const isMedia = message.type === "drawing" || message.type === "photo";
  const [revealed, setRevealed] = useState(message.isRevealed || mine);
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

  function handleMediaTap() {
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
      onOpenImage(message.content);
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

        {isMedia && (
          <div className="relative">
            <button
              type="button"
              onClick={handleMediaTap}
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
              <Image
                src={message.content}
                alt=""
                fill
                sizes="280px"
                className={clsx(
                  "object-cover transition-[filter] duration-500",
                  !revealed && "blur-xl scale-110 saturate-[0.85]",
                )}
                unoptimized
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
```

> Not: `message.type === "music"` dalı bilerek eklenmedi — `MusicCard` Task 11'de
> oluşturulunca eklenecek. O ana kadar `music` tipli mesaj üretilemez.

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageBubble.tsx
git commit -m "feat: görsel mesajlara favori butonu + çift dokunma" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: `/album` sayfası — Kurutulmuş Yapraklar

**Files:**
- Create: `src/app/album/page.tsx`

- [ ] **Step 1: `src/app/album/page.tsx` dosyasını oluştur**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User } from "firebase/auth";
import { onUser } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";
import { subscribeMessages, toggleFavorite } from "@/lib/messages";
import type { Message } from "@/lib/types";
import { PeonyIcon } from "@/components/PeonyIcon";
import { Lightbox } from "@/components/Lightbox";

export default function AlbumPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  const favorites = messages.filter(
    (m) => m.isFavorited && (m.type === "drawing" || m.type === "photo"),
  );

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
              Sohbette bir çizime ya da fotoğrafa çift dokun — burada preslensin.
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
                  onClick={() => setLightboxUrl(m.content)}
                  className="relative block w-full overflow-hidden"
                  style={{ aspectRatio: "1 / 1" }}
                  aria-label="Büyüt"
                >
                  <Image
                    src={m.content}
                    alt=""
                    fill
                    sizes="200px"
                    className="object-cover"
                    unoptimized
                  />
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

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </main>
  );
}
```

- [ ] **Step 2: Tip kontrolü + duman testi**

Run: `npx tsc --noEmit`
Expected: 0 hata.

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/album`
Expected: `200` (dev sunucusu çalışıyor olmalı).

- [ ] **Step 3: Commit**

```bash
git add src/app/album/page.tsx
git commit -m "feat: /album — Kurutulmuş Yapraklar favori sayfası" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Ana sayfaya albüm kartı

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: 4. kartı ekle**

`src/app/home/page.tsx` içinde `/plans` Link'ini kapatan `</Link>` satırından
sonra (ve `</div>` flex container'ından önce) şu Link'i ekle:

```tsx
        <Link
          href="/album"
          className="group glass-card rounded-3xl p-5 flex items-center gap-4 transition active:scale-[0.98] hover:shadow-blush-soft"
        >
          <div className="h-14 w-14 shrink-0 grid place-items-center rounded-2xl bg-peony-light/30 text-peony-dark p-3">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 3h9l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v5h5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="11.5" cy="14.5" r="3.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl text-aphrodite-dark">
              Kurutulmuş Yapraklar
            </h2>
            <p className="text-sm text-aphrodite-dark/60">
              Favori çizimler ve fotoğraflar
            </p>
          </div>
        </Link>
```

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz.

- [ ] **Step 3: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat: ana sayfaya Kurutulmuş Yapraklar kartı" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## FAZ 1 — Kabul

- [ ] `npm run build` → derleme başarılı.
- [ ] Manuel (deploy sonrası, Faz 3'ten sonra tam çalışır): sohbette bir
      görsele çift dokun → köşedeki şakayık dolup parlar; `/album`'de görünür;
      albümden köşedeki ikonla çıkarınca listeden düşer.

---

# FAZ 2 — Modül 3: Mırıldanma (Şarkı Kartları)

## Task 7: `music` tipi + link tespiti

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/links.ts`

- [ ] **Step 1: `MessageType`'a `music` ekle**

`src/lib/types.ts` — eski:
```ts
export type MessageType = "text" | "drawing" | "photo";
```
Yeni:
```ts
export type MessageType = "text" | "drawing" | "photo" | "music";
```

- [ ] **Step 2: `src/lib/links.ts` dosyasını oluştur**

```ts
export type MusicProvider = "spotify" | "youtube";

export interface MusicLink {
  provider: MusicProvider;
  /** Sağlayıcının resmi embed iframe URL'i. */
  embedUrl: string;
  /** Tespit edilen ham link (mesaj içeriği olarak saklanır). */
  originalUrl: string;
}

const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/i;

const YOUTUBE_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

/**
 * Verilen metinde Spotify veya YouTube linki arar.
 * İlk eşleşeni döndürür; yoksa null.
 */
export function detectMusicLink(text: string): MusicLink | null {
  const sp = text.match(SPOTIFY_RE);
  if (sp) {
    const [originalUrl, kind, id] = sp;
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}`,
      originalUrl,
    };
  }
  const yt = text.match(YOUTUBE_RE);
  if (yt) {
    const [originalUrl, id] = yt;
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${id}`,
      originalUrl,
    };
  }
  return null;
}
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/links.ts
git commit -m "feat: music mesaj tipi + Spotify/YouTube link tespiti" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: `sendText` — müzik linki dalı

**Files:**
- Modify: `src/lib/messages.ts`

- [ ] **Step 1: `links` import'unu ekle**

`src/lib/messages.ts` başında `import type { Message, MessageType } from "./types";`
satırından sonra ekle:
```ts
import { detectMusicLink } from "./links";
```

- [ ] **Step 2: `sendText`'i müzik tespiti yapacak şekilde değiştir**

Eski `sendText` fonksiyonunu şununla değiştir:

```ts
export async function sendText(senderId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const music = detectMusicLink(trimmed);
  await addDoc(collection(firestore(), MESSAGES), {
    senderId,
    type: music ? "music" : "text",
    content: music ? music.originalUrl : trimmed,
    createdAt: serverTimestamp(),
    isRead: false,
    isRevealed: true,
    isFavorited: false,
  });
}
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages.ts
git commit -m "feat: müzik linki içeren mesajları music tipiyle gönder" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Firestore create kuralı — `music` tipi

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: `messages` create kuralındaki tip listesine `music` ekle**

`firestore.rules` içinde eski:
```
        && request.resource.data.type in ['text', 'drawing', 'photo']
```
Yeni:
```
        && request.resource.data.type in ['text', 'drawing', 'photo', 'music']
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: firestore kuralı — music mesaj tipine izin" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Tailwind — `spin-slow` animasyonu

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: `animation` nesnesine `spin-slow` ekle**

`tailwind.config.ts` içinde eski:
```ts
      animation: {
        bloom: "bloom 1.6s ease-out forwards",
        blush: "blush 2s ease-out",
        sway: "sway 5s ease-in-out infinite",
        floatUp: "floatUp 0.35s ease-out",
      },
```
Yeni:
```ts
      animation: {
        bloom: "bloom 1.6s ease-out forwards",
        blush: "blush 2s ease-out",
        sway: "sway 5s ease-in-out infinite",
        floatUp: "floatUp 0.35s ease-out",
        "spin-slow": "spin 7s linear infinite",
      },
```
(`spin` keyframe'i Tailwind çekirdeğinde hazır gelir; ayrıca tanımlamaya gerek yok.)

- [ ] **Step 2: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: spin-slow animasyonu (dönen plak motifi)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: MusicCard bileşeni + MessageBubble entegrasyonu

**Files:**
- Create: `src/components/MusicCard.tsx`
- Modify: `src/components/MessageBubble.tsx`

- [ ] **Step 1: `src/components/MusicCard.tsx` dosyasını oluştur**

```tsx
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
```

- [ ] **Step 2: MessageBubble'a `music` dalını ekle**

`src/components/MessageBubble.tsx` import bloğuna ekle (PeonyIcon import'undan
sonra):
```tsx
import { MusicCard } from "./MusicCard";
```

Ardından `text` dalını kapatan bloktan sonra, `{isMedia && (` satırından önce
şunu ekle:
```tsx
        {message.type === "music" && (
          <MusicCard url={message.content} mine={mine} />
        )}

```

- [ ] **Step 3: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz.

- [ ] **Step 4: Commit**

```bash
git add src/components/MusicCard.tsx src/components/MessageBubble.tsx
git commit -m "feat: MusicCard — şakayık çerçeveli Spotify/YouTube kartı" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## FAZ 2 — Kabul

- [ ] `npm run build` → derleme başarılı.
- [ ] Manuel (deploy sonrası): sohbete bir Spotify/YouTube linki yapıştırıp
      gönder → mesaj düz metin değil, dönen plak motifli embed kartı olarak
      görünür ve çalınabilir.

---

# FAZ 3 — Modül 2: Güneş Doğumu

> **ÖN KOŞUL:** Kullanıcı, Firebase Console'da Realtime Database'i oluşturmuş ve
> `.env.local`'a `NEXT_PUBLIC_FIREBASE_DATABASE_URL` eklemiş olmalı. (Tamamlandı.)
> Bu faza başlarken dev sunucusu yeni env değişkenini alması için **yeniden
> başlatılmalıdır** — bkz. Task 12 Step 4.

## Task 12: RTDB altyapısı — firebase.ts

**Files:**
- Modify: `src/lib/firebase.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: `firebase/database` import'unu ekle**

`src/lib/firebase.ts` — eski import bloğunda:
```ts
import { getStorage, type FirebaseStorage } from "firebase/storage";
```
satırından sonra ekle:
```ts
import { getDatabase, type Database } from "firebase/database";
```

- [ ] **Step 2: config'e `databaseURL` ekle**

`firebaseConfig` nesnesinde `storageBucket` satırından sonra ekle:
```ts
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
```

- [ ] **Step 3: `realtimeDb()` getter'ını ekle**

`let storage: FirebaseStorage | null = null;` satırından sonra ekle:
```ts
let rtdb: Database | null = null;
```
`firebaseStorage()` fonksiyonundan sonra ekle:
```ts
export function realtimeDb(): Database {
  if (!rtdb) rtdb = getDatabase(firebaseApp());
  return rtdb;
}
```

- [ ] **Step 4: `.env.local.example`'a satır ekle**

`.env.local.example` içinde `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=` satırından
sonra ekle:
```
# Firebase Realtime Database URL (ortak canlı tuval için)
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
```

- [ ] **Step 5: Dev sunucusunu yeniden başlat (env değişikliği için)**

Çalışan `npm run dev` sürecini durdur ve yeniden başlat — Next.js `NEXT_PUBLIC_*`
değişkenlerini yalnızca başlangıçta okur.

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase.ts .env.local.example
git commit -m "feat: Firebase Realtime Database bağlantısı (realtimeDb)" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: RTDB güvenlik kuralları + firebase.json

**Files:**
- Create: `database.rules.json`
- Modify: `firebase.json`

- [ ] **Step 1: `database.rules.json` dosyasını oluştur**

```json
{
  "rules": {
    "liveCanvas": {
      ".read": "auth != null && (auth.uid === 'WOOetHE8NbhBjoYKiW5VDW17Ufu1' || auth.uid === 'CgZyp1HrxQOKC2MqHTKxsI0wVN83')",
      ".write": "auth != null && (auth.uid === 'WOOetHE8NbhBjoYKiW5VDW17Ufu1' || auth.uid === 'CgZyp1HrxQOKC2MqHTKxsI0wVN83')"
    },
    "$other": {
      ".read": false,
      ".write": false
    }
  }
}
```
(UID'ler `firestore.rules`'taki `allowedUids()` ile aynıdır.)

- [ ] **Step 2: `firebase.json`'a `database` bloğu ekle**

`firebase.json` içinde eski:
```json
  "firestore": {
    "database": "(default)",
    "location": "eur3",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
```
Yeni (hemen ardına `database` bloğu):
```json
  "firestore": {
    "database": "(default)",
    "location": "eur3",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "database": {
    "rules": "database.rules.json"
  },
```

- [ ] **Step 3: Commit**

```bash
git add database.rules.json firebase.json
git commit -m "feat: RTDB güvenlik kuralları — liveCanvas yalnızca 2 davetli" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: `usePresence` hook'u

**Files:**
- Create: `src/lib/usePresence.ts`

- [ ] **Step 1: `src/lib/usePresence.ts` dosyasını oluştur**

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { firestore, allowedUids } from "./firebase";

const HEARTBEAT_MS = 25_000;
const STALE_MS = 60_000;

/**
 * Kendi çevrimiçi durumunu yazar (heartbeat + kapanışta offline) ve partnerin
 * çevrimiçi olup olmadığını döndürür. Partner yalnızca isOnline === true VE
 * lastSeen son STALE_MS içinde ise çevrimiçi sayılır.
 *
 * Yalnızca /chat sayfasında mount edilmelidir.
 */
export function usePresence(myUid: string | null): { partnerOnline: boolean } {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const partnerData = useRef<{ isOnline: boolean; lastSeenMs: number } | null>(
    null,
  );

  // Kendi presence'ımı yaz.
  useEffect(() => {
    if (!myUid) return;
    const ref = doc(firestore(), "users", myUid);
    const online = () =>
      void setDoc(
        ref,
        { isOnline: true, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    const offline = () =>
      void setDoc(
        ref,
        { isOnline: false, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});

    online();
    const hb = setInterval(online, HEARTBEAT_MS);
    const onVis = () =>
      document.visibilityState === "hidden" ? offline() : online();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", offline);

    return () => {
      clearInterval(hb);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", offline);
      offline();
    };
  }, [myUid]);

  // Partnerin presence'ını izle + bayatlık denetimi.
  useEffect(() => {
    if (!myUid) return;
    const partnerUid = allowedUids.find((u) => u !== myUid);
    if (!partnerUid) return;

    const evaluate = () => {
      const p = partnerData.current;
      setPartnerOnline(
        !!p && p.isOnline && Date.now() - p.lastSeenMs < STALE_MS,
      );
    };

    const ref = doc(firestore(), "users", partnerUid);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      const last = (d?.lastSeen as Timestamp | null) ?? null;
      partnerData.current = {
        isOnline: !!d?.isOnline,
        lastSeenMs: last ? last.toMillis() : 0,
      };
      evaluate();
    });
    // onSnapshot partner sessizce kapanırsa tetiklenmez; periyodik yeniden değerlendir.
    const ticker = setInterval(evaluate, 20_000);

    return () => {
      unsub();
      clearInterval(ticker);
    };
  }, [myUid]);

  return { partnerOnline };
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add src/lib/usePresence.ts
git commit -m "feat: usePresence — heartbeat tabanlı çevrimiçi durumu" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: `liveCanvas.ts` — RTDB çizim katmanı

**Files:**
- Create: `src/lib/liveCanvas.ts`

- [ ] **Step 1: `src/lib/liveCanvas.ts` dosyasını oluştur**

```ts
"use client";

import {
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onChildChanged,
  onValue,
} from "firebase/database";
import { realtimeDb } from "./firebase";

export interface LivePoint {
  x: number; // 0–1 normalize
  y: number; // 0–1 normalize
}

export interface LiveStroke {
  by: string;
  color: string;
  size: number;
  pts: LivePoint[];
  done: boolean;
}

const ROOT = "liveCanvas/strokes";

/**
 * Yeni bir çizgi düğümü açar. Senkron olarak id döner; `write` ile düğüm
 * istenildiği kadar güncellenebilir (akış için throttle'lı çağrılır).
 */
export function newStroke(stroke: LiveStroke): {
  id: string;
  write: (s: LiveStroke) => void;
} {
  const r = push(ref(realtimeDb(), ROOT));
  void set(r, stroke);
  return {
    id: r.key as string,
    write: (s) => void set(r, s),
  };
}

/** Tüm ortak tuvali temizler (iki tarafta da). */
export function clearLiveCanvas(): Promise<void> {
  return remove(ref(realtimeDb(), ROOT));
}

/**
 * Ortak tuvali dinler. onAdd/onChange çizgi geldikçe/değiştikçe, onClear ise
 * tüm düğüm silindiğinde tetiklenir. Aboneliği iptal eden fonksiyon döner.
 */
export function subscribeLiveCanvas(handlers: {
  onAdd: (id: string, s: LiveStroke) => void;
  onChange: (id: string, s: LiveStroke) => void;
  onClear: () => void;
}): () => void {
  const r = ref(realtimeDb(), ROOT);
  const u1 = onChildAdded(r, (snap) =>
    handlers.onAdd(snap.key as string, snap.val() as LiveStroke),
  );
  const u2 = onChildChanged(r, (snap) =>
    handlers.onChange(snap.key as string, snap.val() as LiveStroke),
  );
  const u3 = onValue(r, (snap) => {
    if (!snap.exists()) handlers.onClear();
  });
  return () => {
    u1();
    u2();
    u3();
  };
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add src/lib/liveCanvas.ts
git commit -m "feat: liveCanvas — RTDB ortak çizim katmanı" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: `LiveCanvas` bileşeni

**Files:**
- Create: `src/components/LiveCanvas.tsx`

- [ ] **Step 1: `src/components/LiveCanvas.tsx` dosyasını oluştur**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  type LiveStroke,
  newStroke,
  clearLiveCanvas,
  subscribeLiveCanvas,
} from "@/lib/liveCanvas";

interface Props {
  uid: string;
  onSend: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

const COLORS = [
  "#A93344",
  "#E06D78",
  "#E8B851",
  "#6FA663",
  "#5B82C9",
  "#9061B8",
  "#4A2E35",
];
const SIZES = [3, 6, 11];
const WRITE_THROTTLE_MS = 60;

export function LiveCanvas({ uid, onSend, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });

  // Tüm çizgiler RTDB id'sine göre (kendi + partner).
  const strokesRef = useRef<Map<string, LiveStroke>>(new Map());

  // Yerel çizim durumu.
  const drawing = useRef(false);
  const activeId = useRef<string | null>(null);
  const activeWrite = useRef<((s: LiveStroke) => void) | null>(null);
  const lastWrite = useRef(0);

  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(6);
  const [sending, setSending] = useState(false);

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const { w, h } = sizeRef.current;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokesRef.current.forEach((s) => {
      if (!s.pts || s.pts.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      if (s.pts.length === 1) {
        const p = s.pts[0];
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x * w, s.pts[0].y * h);
      for (let i = 1; i < s.pts.length; i++) {
        ctx.lineTo(s.pts[i].x * w, s.pts[i].y * h);
      }
      ctx.stroke();
    });
  }, []);

  // Canvas kurulumu + RTDB aboneliği.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    sizeRef.current = { w: rect.width, h: rect.height };
    redraw();

    const unsub = subscribeLiveCanvas({
      onAdd: (id, s) => {
        if (id === activeId.current) return; // kendi aktif çizgim — yerelde çiziliyor
        strokesRef.current.set(id, s);
        redraw();
      },
      onChange: (id, s) => {
        if (id === activeId.current) return;
        strokesRef.current.set(id, s);
        redraw();
      },
      onClear: () => {
        strokesRef.current.clear();
        redraw();
      },
    });
    return () => unsub();
  }, [redraw]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const stroke: LiveStroke = {
      by: uid,
      color,
      size,
      pts: [pos(e)],
      done: false,
    };
    const handle = newStroke(stroke);
    activeId.current = handle.id;
    activeWrite.current = handle.write;
    lastWrite.current = Date.now();
    strokesRef.current.set(handle.id, stroke);
    redraw();
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !activeId.current) return;
    const stroke = strokesRef.current.get(activeId.current);
    if (!stroke) return;
    stroke.pts.push(pos(e));
    redraw();
    const now = Date.now();
    if (now - lastWrite.current >= WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      activeWrite.current?.(stroke);
    }
  }

  function onPointerUp() {
    if (!drawing.current || !activeId.current) return;
    drawing.current = false;
    const stroke = strokesRef.current.get(activeId.current);
    if (stroke) {
      stroke.done = true;
      activeWrite.current?.(stroke);
    }
    activeId.current = null;
    activeWrite.current = null;
  }

  async function handleAttach() {
    const canvas = canvasRef.current;
    if (!canvas || sending || strokesRef.current.size === 0) return;
    setSending(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSend(dataUrl);
      await clearLiveCanvas();
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="px-5">
        <div className="rounded-2xl overflow-hidden border border-peony-light/40 bg-white">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: "42vh", touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      </div>

      <div className="px-5 pt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={clsx(
                "h-9 w-9 rounded-full border-2 shrink-0 transition",
                color === c ? "border-aphrodite-dark scale-110" : "border-white",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-label={`Kalınlık ${s}`}
              className={clsx(
                "h-10 w-10 grid place-items-center rounded-xl border transition",
                size === s
                  ? "bg-peony-light/30 border-peony-default"
                  : "bg-white border-peony-light/50",
              )}
            >
              <span
                className="block rounded-full bg-aphrodite-dark"
                style={{ width: s + 4, height: s + 4 }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] flex gap-2">
        <button
          onClick={() => void clearLiveCanvas().catch(() => {})}
          type="button"
          className="btn-ghost flex-1"
        >
          Temizle
        </button>
        <button
          onClick={handleAttach}
          disabled={sending}
          type="button"
          className="btn-petal flex-1"
        >
          {sending ? "Asılıyor…" : "Bahçeye As"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz.

- [ ] **Step 3: Commit**

```bash
git add src/components/LiveCanvas.tsx
git commit -m "feat: LiveCanvas — RTDB ile nokta nokta ortak tuval" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 17: CanvasBottomSheet — mod anahtarı

**Files:**
- Modify: `src/components/CanvasBottomSheet.tsx`

- [ ] **Step 1: `LiveCanvas` import'unu ekle**

`src/components/CanvasBottomSheet.tsx` — eski:
```ts
import { PeonyIcon } from "./PeonyIcon";
```
Yeni:
```ts
import { PeonyIcon } from "./PeonyIcon";
import { LiveCanvas } from "./LiveCanvas";
```

- [ ] **Step 2: Props arayüzüne `partnerOnline` ve `uid` ekle**

Eski:
```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onSend: (dataUrl: string) => Promise<void>;
}
```
Yeni:
```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onSend: (dataUrl: string) => Promise<void>;
  partnerOnline: boolean;
  uid: string;
}
```

- [ ] **Step 3: Bileşen imzasını güncelle**

Eski:
```ts
export function CanvasBottomSheet({ open, onClose, onSend }: Props) {
```
Yeni:
```ts
export function CanvasBottomSheet({
  open,
  onClose,
  onSend,
  partnerOnline,
  uid,
}: Props) {
```

- [ ] **Step 4: `mode` state'i + offline guard ekle**

`const [hasDrawn, setHasDrawn] = useState(false);` satırından sonra ekle:
```ts
  const [mode, setMode] = useState<"solo" | "live">("solo");

  // Partner çevrimdışı olursa tek-başına moda geri dön.
  useEffect(() => {
    if (!partnerOnline && mode === "live") setMode("solo");
  }, [partnerOnline, mode]);
```

- [ ] **Step 5: Mod anahtarını ekle + solo içeriği sar (açılış)**

Eski:
```tsx
          <div className="pt-3">
            <span className="block h-1.5 w-12 rounded-full bg-peony-light/60 mx-auto" />
          </div>

          <div className="px-5 pt-2 pb-2 flex items-center justify-between">
```
Yeni:
```tsx
          <div className="pt-3">
            <span className="block h-1.5 w-12 rounded-full bg-peony-light/60 mx-auto" />
          </div>

          <div className="px-5 pt-2">
            <div className="flex rounded-xl bg-peony-light/20 p-1">
              <button
                type="button"
                onClick={() => setMode("solo")}
                className={clsx(
                  "flex-1 h-9 rounded-lg text-sm font-medium transition",
                  mode === "solo"
                    ? "bg-white text-aphrodite-dark shadow-petal"
                    : "text-aphrodite-dark/55",
                )}
              >
                Tek Başına
              </button>
              <button
                type="button"
                onClick={() => partnerOnline && setMode("live")}
                disabled={!partnerOnline}
                className={clsx(
                  "flex-1 h-9 rounded-lg text-sm font-medium transition",
                  mode === "live"
                    ? "bg-white text-aphrodite-dark shadow-petal"
                    : "text-aphrodite-dark/55",
                  !partnerOnline && "opacity-40",
                )}
              >
                {partnerOnline ? "Ortak Tuval 🌅" : "Ortak Tuval · çevrimdışı"}
              </button>
            </div>
          </div>

          {mode === "solo" && (
            <>
          <div className="px-5 pt-2 pb-2 flex items-center justify-between">
```

- [ ] **Step 6: Solo içeriği kapat + live modu ekle (kapanış)**

Eski:
```tsx
              {sending ? "Açılıyor…" : "Gönder"}
            </button>
          </div>
        </div>
```
Yeni:
```tsx
              {sending ? "Açılıyor…" : "Gönder"}
            </button>
          </div>
            </>
          )}

          {mode === "live" && (
            <LiveCanvas uid={uid} onSend={onSend} onClose={onClose} />
          )}
        </div>
```

- [ ] **Step 7: Tip kontrolü + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz. (Bu noktada `chat/page.tsx` henüz
`partnerOnline`/`uid` geçmediği için **tsc hatası beklenir** — Task 18 bunu
düzeltir. Step 7'yi Task 18'den sonra çalıştır; commit'i yine de şimdi yap.)

- [ ] **Step 8: Commit**

```bash
git add src/components/CanvasBottomSheet.tsx
git commit -m "feat: CanvasBottomSheet — Tek Başına/Ortak Tuval mod anahtarı" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 18: Chat sayfası — presence + gün doğumu + CanvasBottomSheet propları

**Files:**
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Import'ları ekle**

`src/app/chat/page.tsx` — `import { useEffect, useRef, useState } from "react";`
satırından sonra ekle:
```ts
import clsx from "clsx";
```
`import { PeonyIcon } from "@/components/PeonyIcon";` satırından sonra ekle:
```ts
import { usePresence } from "@/lib/usePresence";
```

- [ ] **Step 2: `usePresence` hook'unu çağır**

`const fcmAsked = useRef(false);` satırından sonra ekle:
```ts
  const { partnerOnline } = usePresence(user?.uid ?? null);
```

- [ ] **Step 3: `<main>`'e `isolate` ekle ve gün doğumu katmanı koy**

Eski:
```tsx
  return (
    <main className="relative mx-auto max-w-xl flex flex-col h-dvh">
      <header className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between">
```
Yeni:
```tsx
  return (
    <main className="relative isolate mx-auto max-w-xl flex flex-col h-dvh">
      <div
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-[1500ms]",
          partnerOnline ? "opacity-100" : "opacity-0",
        )}
        style={{
          background:
            "linear-gradient(180deg, #FFE3B0 0%, #FBC79A 34%, #F7A98C 64%, #F2A7B3 100%)",
        }}
      />
      <header className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between">
```

- [ ] **Step 4: `CanvasBottomSheet`'e yeni propları geç**

Eski:
```tsx
      <CanvasBottomSheet
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        onSend={handleDrawing}
      />
```
Yeni:
```tsx
      <CanvasBottomSheet
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        onSend={handleDrawing}
        partnerOnline={partnerOnline}
        uid={user.uid}
      />
```

- [ ] **Step 5: Tip kontrolü + lint + duman testi**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 hata, lint temiz (Task 17 + Task 18 birlikte tutarlı).

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/chat`
Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "feat: chat — presence, gün doğumu arka planı, ortak tuval propları" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 19: Kurallar deploy + tam derleme (KULLANICI ADIMI)

**Files:** yok

- [ ] **Step 1: Tam derleme**

Run: `npm run build`
Expected: derleme hatasız tamamlanır.

- [ ] **Step 2: KULLANICI — Firebase kurallarını deploy et**

Kullanıcı bu oturumda `!` ile çalıştırır:
```
! npx firebase login
! npx firebase use paeonia-garden
! npx firebase deploy --only firestore:rules,database
```
Expected: "Deploy complete!" — hem `firestore:rules` hem `database` rules.

> Bu adım olmadan: favori toggle ve ortak tuval kural reddi alır.

- [ ] **Step 3: Commit (varsa kalan değişiklik)**

```bash
git add -A
git commit -m "chore: Paeonia üç modül — derleme doğrulandı" -m "Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" || echo "commit edilecek değişiklik yok"
```

---

## FAZ 3 — Kabul (iki cihaz/iki tarayıcı gerekir)

- [ ] İki davetli hesapla iki tarayıcıda `/chat` aç → kısa süre sonra her iki
      ekranın arka planı gün doğumu gradyanına geçer.
- [ ] Çizim sayfasını aç → "Ortak Tuval" sekmesi etkin; birine geç.
- [ ] Bir tarafta çiz → çizgi diğer ekranda nokta nokta canlı belirir.
- [ ] "Bahçeye As" → ortak çizim sohbete `drawing` mesajı olarak düşer, tuval
      iki tarafta da temizlenir.
- [ ] Bir tarafı kapat → ~1 dk içinde diğer tarafta gün doğumu söner, "Ortak
      Tuval" sekmesi pasifleşir.

---

## Bitirme

Tüm fazlar bitince `superpowers:finishing-a-development-branch` skill'i ile
`feat/paeonia-modules` dalını `main`'e birleştir ve GitHub'a push et.

---

## Öz-inceleme notları (plan yazarı)

- **Spec kapsamı:** Spec'teki üç modülün her gereksinimi bir task'a bağlandı —
  Modül 1: Task 1–6; Modül 3: Task 7–11; Modül 2: Task 12–19.
- **MessageBubble iki kez dokunuluyor** (Task 4 favori, Task 11 müzik) — bilerek;
  her ikisi de derlenebilir ara durum bırakır.
- **`isFavorited` her create'te yazılır** (sendText/sendMedia) — şema tutarlılığı.
- **Tip tutarlılığı:** `LiveStroke`, `LivePoint`, `MusicLink`, `usePresence`
  dönüş tipi `{ partnerOnline }`, `CanvasBottomSheet` propları (`partnerOnline`,
  `uid`) tüm task'larda aynı imzayla kullanıldı.
- **Placeholder yok:** her kod adımı tam içerik taşıyor.
