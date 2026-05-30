# Video Messages + Camera Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat'e video mesajları (poster + tap-to-play) ve native sistem kamerasıyla foto+video çekme yeteneği eklemek.

**Architecture:** `MessageType` union'a `"video"` eklenir; Firebase Storage'a yeni `/videos/{uid}/` path açılır; client-side poster image extraction ile her video upload'unda 2 dosya (video + poster.jpg) yazılır; MessageInput'a yeni kamera butonu (`<input capture>`) eklenir, mevcut foto butonu galeri olarak yeniden adlandırılır ve foto+video accept'i kabul eder; Lightbox `kind` prop ile foto veya video render eder.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firebase Storage + Firestore, HTML5 `<video>` + `<canvas>` (poster extraction), mevcut telemetry `trace()` helper'ı.

**Spec referansı:** `docs/superpowers/specs/2026-05-30-video-messages-and-camera-design.md`

---

## Önemli notlar (her tasktan önce oku)

- **TDD yok:** Bu proje otomatik test altyapısı kurmuyor. Her task'ın doğrulaması `npx tsc --noEmit` + `npm run build` + manuel smoke. Plan'da "test çalıştır" yerine "şu komutu çalıştır + bekle".
- **Mevcut branch:** `spec/video-messages-camera` (spec doc commit'li). İlk task bu branch'i `feat/video-messages-camera`'ya rename edip implementation'a başlar. Tek PR (spec + implementation).
- **Storage rules deploy:** `storage.rules` değişikliği Vercel auto-deploy'a dahil değil. Plan'ın sonunda kullanıcıya `firebase deploy --only storage` komutu hatırlatılır.
- **Geri uyumluluk:** Eski mesajlar (`type !== "video"`) etkilenmez. `Message.poster` opsiyonel; eski mesajlarda `undefined`, render fallback `<video>`'nun default frame'idir.
- **Native kamera limit:** `<input capture>` OS kamerasının kalite/duration ayarını override edemez. 25 MB client-side limit dolaylı duration sınırı verir (1080p ~12 sn, 720p ~30 sn).

---

## File Structure

Bu plan sonunda etkilenecek dosyalar:

```
storage.rules                       (modified: + /videos/{uid}/ block)

src/lib/
├── types.ts                        (modified: MessageType += "video", Message.poster?)
├── storage.ts                      (modified: + extractVideoPoster, + uploadVideo)
└── messages.ts                     (modified: sendMedia signature + isRevealed video,
                                     docToMessage poster oku)

src/app/
├── chat/page.tsx                   (modified: + handleVideo, lightbox state genişler)
└── album/page.tsx                  (modified: favorites filter + FavoriteThumb video)

src/components/
├── MessageInput.tsx                (modified: + kamera buton, galeri accept güncelle,
                                     + onPickVideo prop)
├── MessageList.tsx                 (modified: + onOpenVideo prop drilling)
├── MessageBubble.tsx               (modified: + video render branch, + onOpenVideo prop)
└── Lightbox.tsx                    (modified: + kind prop, + video render branch)
```

Tüm değişiklikler mevcut public API'lara opsiyonel ekleme (geri uyumlu). Hiçbir mevcut komponent silinmiyor.

---

### Task 1: Branch hazırlığı + Storage rules

**Files:**
- Modify: `storage.rules`

- [ ] **Step 1: Branch'i rename et**

Mevcut branch `spec/video-messages-camera`. Implementation ekleneceği için `feat/`'e taşı:

```bash
git branch -m spec/video-messages-camera feat/video-messages-camera
```

(Remote'a henüz push edilmediği için sade `branch -m` yeterli.)

- [ ] **Step 2: `storage.rules` dosyasına `/videos/` block ekle**

`storage.rules` içinde `match /memories/{uid}/{file=**} { ... }` block'undan SONRA, `match /{path=**}` (catch-all) block'undan ÖNCE ekle:

```
    match /videos/{uid}/{file=**} {
      allow read: if isInvited();
      allow write: if isInvited()
        && request.auth.uid == uid
        && request.resource.size < 25 * 1024 * 1024
        && (
          request.resource.contentType.matches('video/.*')
          || request.resource.contentType == 'image/jpeg'
        );
      allow delete: if false;
    }
```

Notlar:
- `image/jpeg` izni poster dosyası için (`-poster.jpg`)
- `25 * 1024 * 1024` = 26214400 bytes; hem video hem poster aynı limite tabi (poster ~50-200 KB olur, sorun değil)
- `allow delete: if false` mevcut `photos/` paterniyle aynı

- [ ] **Step 3: Commit**

```bash
git add storage.rules
git commit -m "feat(storage): add /videos/{uid}/ rule (25MB, video + poster jpeg)"
```

> ⚠️ `storage.rules` değişikliği `git push` ile Vercel'e gitmez — Firebase ayrı. Deploy plan'ın sonunda (Task 11).

---

### Task 2: `types.ts` — MessageType + Message.poster

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: `MessageType` union'a `"video"` ekle**

`src/lib/types.ts:3` satırını şununla değiştir:

```ts
export type MessageType = "text" | "drawing" | "photo" | "music" | "video";
```

- [ ] **Step 2: `Message` interface'ine `poster` field ekle**

`src/lib/types.ts:14-23` arasındaki `Message` interface'inde, `variants?` satırının ALTINA ekle:

```ts
export interface Message {
  id: string;
  senderId: string;
  type: MessageType;
  content: string;
  /** Present for `type === "photo"` uploads from Faz 4 onwards. Legacy photos are null. */
  variants?: PhotoVariants | null;
  /** Present for `type === "video"` uploads. Poster (cover) image URL. Legacy/extraction-failed videos are null. */
  poster?: string | null;
  createdAt: Timestamp | null;
  isRead: boolean;
  isRevealed: boolean;
  isFavorited: boolean;
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata. Tip uyumluluk korunuyor (yeni field opsiyonel).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): MessageType += video, Message.poster field"
```

---

### Task 3: `storage.ts` — `extractVideoPoster` + `uploadVideo`

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: `import` bloğuna `trace` ekle**

`src/lib/storage.ts:1-7` import bloğunu kontrol et — `trace` zaten yoksa ekle:

```ts
"use client";

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "./firebase";
import { trace } from "./telemetry/trace";
import type { PhotoVariants } from "./types";

export type { PhotoVariants };
```

(`trace` mevcut Faz 1'den itibaren var, sadece storage.ts'e import edilmemiş olabilir.)

- [ ] **Step 2: Dosyanın sonuna `extractVideoPoster` helper'ı ekle**

`src/lib/storage.ts`'in en sonuna (mevcut `cryptoId` fonksiyonundan veya en son ne varsa, ondan SONRA) ekle:

```ts

/**
 * Extract the first frame of a video file as a JPEG blob using a hidden
 * <video> element + canvas drawing. Returns null on any failure (caller
 * uploads the video without a poster — the <video> tag will fall back to
 * its own default frame).
 *
 * Why client-side: avoids a Cloud Function + ffmpeg deploy. Works for all
 * common iOS/Android camera codecs (H.264/HEVC); failures are rare and
 * gracefully fall back.
 */
async function extractVideoPoster(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        reject(new Error("video metadata load failed"));
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    // Bazı tarayıcılarda 0 saniyede frame henüz hazır değil — 0.1s daha güvenilir.
    video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("video seek failed"));
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.src = "";
  }
}
```

- [ ] **Step 3: `uploadVideo` fonksiyonunu ekle**

`extractVideoPoster`'in ALTINA ekle:

```ts

const MAX_VIDEO_MB = 25;

/**
 * Upload a video file (chat) under /videos/{uid}/. Extracts the first frame
 * as a poster JPEG client-side and uploads both in parallel.
 *
 * Throws on validation failure (not a video MIME, or size > 25 MB) so the
 * caller can show a user-facing alert.
 */
export async function uploadVideo(
  uid: string,
  file: File,
): Promise<{ videoUrl: string; posterUrl: string | null }> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Sadece video dosyaları yüklenebilir.");
  }
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Video ${MAX_VIDEO_MB} MB'tan büyük olamaz.`);
  }

  return trace(
    "video.upload",
    async () => {
      const ext =
        file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "mp4";
      const base = `videos/${uid}/${Date.now()}-${cryptoId()}`;

      const posterBlob = await extractVideoPoster(file);

      const videoUploadP = uploadAt(`${base}.${ext}`, file);
      const posterUploadP = posterBlob
        ? uploadAt(`${base}-poster.jpg`, posterBlob)
        : Promise.resolve<string | null>(null);

      const [videoUrl, posterUrl] = await Promise.all([
        videoUploadP,
        posterUploadP,
      ]);

      return { videoUrl, posterUrl };
    },
    { sizeKb: String(Math.round(file.size / 1024)) },
  );
}
```

Not: `uploadAt` zaten Faz 4'te eklenmiş private helper (`async function uploadAt(path, blob)` — `Blob` parametresi alır, `File` ⊆ `Blob` olduğu için `file` direkt geçirilebilir). `cryptoId` da mevcut. Yeni dependency yok.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(storage): uploadVideo + client-side poster extraction"
```

---

### Task 4: `messages.ts` — `sendMedia` signature + `docToMessage` poster

**Files:**
- Modify: `src/lib/messages.ts`

- [ ] **Step 1: `sendMedia` signature'ı genişlet**

`src/lib/messages.ts` içinde mevcut `sendMedia` fonksiyonunu şununla değiştir:

```ts
export async function sendMedia(
  senderId: string,
  url: string,
  type: "drawing" | "photo" | "video",
  variants?: PhotoVariants | null,
  poster?: string | null,
) {
  await addDoc(collection(firestore(), MESSAGES), {
    senderId,
    type,
    content: url,
    ...(variants ? { variants } : {}),
    ...(poster ? { poster } : {}),
    createdAt: serverTimestamp(),
    isRead: false,
    // Videolar reveal pattern kullanmaz — alıcı tarafta direkt görünür.
    isRevealed: type === "video",
    isFavorited: false,
  });
}
```

Değişiklikler:
- `type` union'a `"video"` eklendi
- `poster?` parametresi eklendi
- Firestore'a yazılırken `poster` undefined ise atlanır (Firestore undefined fields'i atlar)
- `isRevealed: type === "video"` — videolarda blur reveal yok

- [ ] **Step 2: `docToMessage` `poster` field okusun**

`docToMessage` fonksiyonunu şununla değiştir:

```ts
function docToMessage(d: QueryDocumentSnapshot | DocumentSnapshot): Message {
  const data = d.data() as Record<string, unknown> | undefined;
  return {
    id: d.id,
    senderId: (data?.senderId as string) ?? "",
    type: (data?.type as MessageType) ?? "text",
    content: (data?.content as string) ?? "",
    variants: (data?.variants as PhotoVariants | undefined) ?? null,
    poster: (data?.poster as string | undefined) ?? null,
    createdAt: (data?.createdAt as Message["createdAt"]) ?? null,
    isRead: !!data?.isRead,
    isRevealed: !!data?.isRevealed,
    isFavorited: !!data?.isFavorited,
  };
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata. `sendMedia`'nın mevcut çağıranı (`chat/page.tsx:handlePhoto`) `variants` 4. parametre olarak geçiyor, `poster` 5. parametre opsiyonel — kırılmaz.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages.ts
git commit -m "feat(messages): sendMedia + docToMessage video + poster support"
```

---

### Task 5: `MessageInput` — Kamera + Galeri butonları

**Files:**
- Modify: `src/components/MessageInput.tsx`

- [ ] **Step 1: Props genişlet, 2 ayrı file input ekle**

`src/components/MessageInput.tsx`'i şununla değiştir (tam dosya):

```tsx
"use client";

import { useRef, useState } from "react";
import { PeonyIcon } from "./PeonyIcon";

interface Props {
  onSend: (text: string) => void | Promise<void>;
  onOpenCanvas: () => void;
  onPickPhoto: (file: File) => void | Promise<void>;
  onPickVideo: (file: File) => void | Promise<void>;
}

export function MessageInput({
  onSend,
  onOpenCanvas,
  onPickPhoto,
  onPickVideo,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setValue("");
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || mediaBusy) return;
    setMediaBusy(true);
    try {
      if (file.type.startsWith("video/")) {
        await onPickVideo(file);
      } else {
        await onPickPhoto(file);
      }
    } finally {
      setMediaBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 bg-gradient-to-t from-nymph-bg via-nymph-bg/95 to-transparent"
    >
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={mediaBusy}
          aria-label="Kameradan çek"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition disabled:opacity-50"
        >
          {mediaBusy ? (
            <span className="animate-sway">
              <PeonyIcon size={20} glow />
            </span>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm8 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
                fill="currentColor"
              />
              <circle cx="18.5" cy="9.5" r="1" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={mediaBusy}
          aria-label="Galeriden foto veya video seç"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition disabled:opacity-50"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3l-2 3-2-3H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 5h8M8 12h6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M9 6h6v2H9zM6 10h2v2H6zm10 2h2v2h-2z"
              fill="currentColor"
              opacity="0.3"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={onOpenCanvas}
          aria-label="Çizim tahtasını aç"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-9.96a1 1 0 0 0 0-1.41l-2.59-2.59a1 1 0 0 0-1.41 0l-2 2 4 4 2-2Z"
              fill="currentColor"
            />
          </svg>
        </button>

        <div className="flex-1 relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder="Fısılda…"
            className="input-petal resize-none max-h-32 py-3 pr-12"
          />
          <button
            type="submit"
            disabled={!value.trim() || sending}
            aria-label="Gönder"
            className="absolute right-1.5 bottom-1.5 h-9 w-9 grid place-items-center rounded-full bg-peony-default text-white shadow-petal disabled:opacity-40 active:scale-95"
          >
            <PeonyIcon size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
```

Önemli değişiklikler:
- 2 input ref (`galleryRef`, `cameraRef`) — sadece `capture` flag'leri farklı
- Tek `handleFile` her ikisinden de tetiklenir; `file.type` ile foto/video pipeline'a yönlendirir
- Mevcut "photoBusy" yerine "mediaBusy" (foto ve video aynı state)
- 3 buton sırası: Kamera, Galeri, Çizim (mevcut çizim butonu korunur, sırada en sağ)
- Kamera ikonu: lens çizgisi belirgin objektif (galerin "fotograf çekme" varyantı)
- Galeri ikonu: çoklu medya/grid hissi

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen hata: `chat/page.tsx`'de `MessageInput` çağrılırken `onPickVideo` prop'u eksik. Bir sonraki task'ta düzeltilecek.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageInput.tsx
git commit -m "feat(input): kamera + galeri butonlari (native capture, foto+video)"
```

---

### Task 6: `chat/page.tsx` — `handleVideo` + Lightbox state genişler

**Files:**
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Import bloğuna `uploadVideo` ekle**

`src/app/chat/page.tsx` üstündeki import:

```tsx
import { uploadDataUrl, uploadPhotoVariants, uploadVideo } from "@/lib/storage";
```

- [ ] **Step 2: Lightbox state'i genişlet (kind field)**

`src/app/chat/page.tsx` içinde mevcut state satırını şununla değiştir:

```tsx
const [lightbox, setLightbox] = useState<{
  kind: "image" | "video";
  url: string;
  variants?: PhotoVariants | null;
  poster?: string | null;
} | null>(null);
```

- [ ] **Step 3: `handleVideo` fonksiyonunu ekle**

`handlePhoto` fonksiyonunun ALTINA ekle:

```tsx
async function handleVideo(file: File) {
  if (!user) return;
  try {
    const { videoUrl, posterUrl } = await uploadVideo(user.uid, file);
    await sendMedia(user.uid, videoUrl, "video", null, posterUrl);
  } catch (e) {
    console.error("[video] upload failed:", e);
    const msg =
      e instanceof Error ? e.message : "Video gönderilemedi. Tekrar dene.";
    alert(msg);
  }
}
```

- [ ] **Step 4: `MessageInput` ve `MessageList` çağrılarını güncelle**

`MessageInput` çağrısına `onPickVideo` ekle:

```tsx
<MessageInput
  onSend={handleText}
  onOpenCanvas={() => setCanvasOpen(true)}
  onPickPhoto={handlePhoto}
  onPickVideo={handleVideo}
/>
```

`MessageList` çağrısına `onOpenVideo` ekle (foto handler'ını mevcut formda bırak, video için yeni handler):

```tsx
<MessageList
  messages={messages}
  currentUserId={user.uid}
  onOpenImage={(url, variants) =>
    setLightbox({ kind: "image", url, variants })
  }
  onOpenVideo={(url, poster) =>
    setLightbox({ kind: "video", url, poster })
  }
/>
```

`Lightbox` çağrısını güncelle:

```tsx
<Lightbox
  url={lightbox?.url ?? null}
  kind={lightbox?.kind ?? "image"}
  variants={lightbox?.variants ?? null}
  poster={lightbox?.poster ?? null}
  onClose={() => setLightbox(null)}
/>
```

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Beklenen hatalar: `MessageList` `onOpenVideo` prop'unu henüz tanımıyor + `Lightbox` `kind`/`poster` prop'larını henüz tanımıyor. Sonraki task'larda düzelecek.

- [ ] **Step 6: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "feat(chat): handleVideo + lightbox state extend (kind/video/poster)"
```

---

### Task 7: `MessageList` — `onOpenVideo` prop drilling

**Files:**
- Modify: `src/components/MessageList.tsx`

- [ ] **Step 1: Props'a `onOpenVideo` ekle ve MessageBubble'a aktar**

`src/components/MessageList.tsx`'i şununla değiştir (tam dosya):

```tsx
"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { Message, PhotoVariants } from "@/lib/types";

interface Props {
  messages: Message[];
  currentUserId: string;
  onOpenImage: (url: string, variants?: PhotoVariants | null) => void;
  onOpenVideo: (url: string, poster?: string | null) => void;
}

export function MessageList({
  messages,
  currentUserId,
  onOpenImage,
  onOpenVideo,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 grid place-items-center px-8">
        <div className="text-center text-aphrodite-dark/55 max-w-xs">
          <p className="font-display text-2xl text-aphrodite-dark">Bahçe sessiz…</p>
          <p className="text-sm mt-2">
            İlk tomurcuğu sen aç. Bir kelime, bir çizim, bir mahcubiyet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 chat-scroll overflow-y-auto px-4 py-6 space-y-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          mine={m.senderId === currentUserId}
          onOpenImage={onOpenImage}
          onOpenVideo={onOpenVideo}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen hata: `MessageBubble` `onOpenVideo` prop'unu henüz tanımıyor. Bir sonraki task'ta düzelecek.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageList.tsx
git commit -m "feat(list): onOpenVideo prop drilling"
```

---

### Task 8: `MessageBubble` — Video render branch

**Files:**
- Modify: `src/components/MessageBubble.tsx`

- [ ] **Step 1: Props'a `onOpenVideo` ekle + video render branch**

`src/components/MessageBubble.tsx`'i şununla değiştir (tam dosya):

```tsx
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
```

Önemli değişiklikler:
- `onOpenVideo` prop eklendi
- `isVideo` flag
- `revealed` initial value `isVideo` ise direkt true (videolar her zaman görünür)
- `handleVideoTap` ayrı (reveal yok, sadece tek/çift tap)
- Yeni `isVideo` branch'i poster + ▶ overlay render eder
- Favori butonu hem image hem video için aynı pattern (image'de `revealed && ...` koşullu, video'da koşulsuz)

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen hata: `Lightbox` `kind` ve `poster` prop'larını henüz tanımıyor. Bir sonraki task'ta düzelecek.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageBubble.tsx
git commit -m "feat(bubble): video render branch (poster + play overlay, no blur reveal)"
```

---

### Task 9: `Lightbox` — `kind` prop + video render

**Files:**
- Modify: `src/components/Lightbox.tsx`

- [ ] **Step 1: Props genişlet, video branch ekle**

`src/components/Lightbox.tsx`'i şununla değiştir (tam dosya):

```tsx
"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PhotoVariants } from "@/lib/types";
import { useMedia } from "@/lib/hooks/useMedia";
import { PeonyIcon } from "./PeonyIcon";

interface Props {
  url: string | null;
  kind?: "image" | "video";
  variants?: PhotoVariants | null;
  poster?: string | null;
  onClose: () => void;
}

export function Lightbox({
  url,
  kind = "image",
  variants,
  poster,
  onClose,
}: Props) {
  const media = useMedia(
    kind === "image" ? (url ?? undefined) : undefined,
    variants,
  );

  useEffect(() => {
    if (!url) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [url, onClose]);

  const isOpen = !!url && (kind === "video" || !!media);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center p-4 bg-aphrodite-dark/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 h-11 w-11 grid place-items-center rounded-full bg-white/90 text-peony-dark shadow-petal active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <motion.div
            className="relative"
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            {kind === "video" ? (
              <video
                src={url ?? undefined}
                poster={poster ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-w-[94vw] max-h-[82vh] rounded-3xl shadow-blush bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media!.fullSrc}
                alt=""
                className="max-w-[94vw] max-h-[82vh] object-contain rounded-3xl shadow-blush"
              />
            )}
          </motion.div>

          <div className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-0 right-0 flex justify-center">
            <span className="flex items-center gap-1.5 text-white/70 text-xs">
              <PeonyIcon size={13} />
              kapatmak için dokun
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Önemli değişiklikler:
- `kind` prop default `"image"` (geri uyumlu)
- `useMedia` sadece image kind için çağrılır (video için anlamsız)
- `isOpen` koşulu video için sadece `url`'e bakar (media yok), image için media'ya
- `<video>` `controls autoPlay playsInline` — mobile'da inline play (Safari fullscreen'e atmaz)
- Video container `bg-black` (siyah letterbox)
- Esc/dış-click kapatma davranışı aynı

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata. `chat/page.tsx` zaten yeni `kind`/`poster` prop'larını geçiriyor (Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/components/Lightbox.tsx
git commit -m "feat(lightbox): video kind branch (controls + autoplay)"
```

---

### Task 10: `album/page.tsx` — Favori video + thumb

**Files:**
- Modify: `src/app/album/page.tsx`

- [ ] **Step 1: Favori filter'a `video` ekle, FavoriteThumb video branch, Lightbox routing**

`src/app/album/page.tsx`'i şununla değiştir (tam dosya):

```tsx
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
```

Önemli değişiklikler:
- `FavoriteThumb` `isVideo` branch'i: poster image (varsa) + sağ alt köşede küçük ▶ ikonu
- `favorites` filter: drawing | photo | **video** üçü
- `openFavorite(m)` helper: tip-bazlı setLightbox routing
- Lightbox çağrısı `kind`/`poster` ile aynı pattern (chat'teki gibi)
- Boş album metni güncellendi ("çizime, fotoğrafa **veya videoya** çift dokun")

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 3: Commit**

```bash
git add src/app/album/page.tsx
git commit -m "feat(album): favori video destegi (poster thumb + play icon)"
```

---

### Task 11: Build doğrulama + perf budget + push + PR

**Files:** (none — verification + git)

- [ ] **Step 1: Tam type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Beklenen: başarılı build. Çıktıdaki "Route (app)" tablosunda `/chat` ve `/album` First Load JS değerlerini not al. Beklenen artış: `/chat` ~+1-2 kB, `/album` ~+0.3-0.5 kB (`<video>` browser native, ek runtime yok).

- [ ] **Step 3: Bundle budget**

```bash
npm run perf:budget
```

Beklenen: tüm route'lar 320 kB altında. `/chat` muhtemelen 95% civarında kalır.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/video-messages-camera
```

PR oluştur:

```bash
gh pr create --title "feat: video mesajlari + kamera capture" --body "$(cat <<'EOF'
## Summary
- Video mesajlari: chat'e poster + tap-to-play patterni ile video. Tek tap → Lightbox tam ekran controls + autoplay. Cift tap → favori (mevcut pattern).
- Native kamera butonu: MessageInput'a yeni buton, `<input capture>` ile OS kameraya gider (foto + video record OS UI'da secilir).
- Galeri butonu (mevcut foto butonu guncellendi): foto+video accept eder; secilen dosya tipine gore foto veya video pipeline'ina route eder.
- /album favori filter video'yu da gosterir; poster thumb + sag alt kosede ▶ ikon.

## Detaylar

**Storage:**
- Yeni rule: `/videos/{uid}/{file=**}` — 25 MB limit, video/* veya image/jpeg (poster icin)
- `uploadVideo(uid, file)`: size+type validate, client-side poster extraction (`<video>` + canvas), Promise.all paralel upload (video + poster)
- Poster extraction codec-dependent — basarisiz olursa `posterUrl: null`, render fallback `<video>` default frame

**Veri:**
- `MessageType += "video"`, `Message.poster?: string | null` field
- `sendMedia` signature: yeni `poster?` parametresi + `isRevealed: type === \"video\"` (videolar reveal pattern kullanmaz)
- `docToMessage` poster field okur

**UI:**
- `MessageInput`: 2 input ref (galleryRef + cameraRef, sadece capture flag farkli), tek `handleFile` `file.type` ile foto/video pipeline'a yonlendirir
- `MessageBubble`: yeni `isVideo` branch — poster image + ▶ overlay, tek/cift tap (reveal yok)
- `Lightbox`: yeni `kind: \"image\" | \"video\"` prop (default \"image\" — backwards compat); video icin `<video controls autoPlay playsInline>`
- `MessageList` + `chat/page.tsx`: `onOpenVideo` callback drilling, lightbox state {kind, url, variants?, poster?}
- `album/page.tsx`: favorites filter + FavoriteThumb video branch + openFavorite tip-bazli routing

## Etki
- Bundle: /chat +1-2 kB, /album +0.3-0.5 kB (`<video>` browser native)
- Yeni storage path: `videos/{uid}/<ts>-<id>.<ext>` + `-poster.jpg`
- Gerek uyumluluk: eski mesajlar (poster yok) etkilenmez — `<video>` default frame fallback

## ⚠️ Storage rules deploy
`storage.rules` Vercel auto-deploy'a dahil DEGIL. Merge sonrasi calistir:
```
firebase deploy --only storage
```

## Test plan (preview deploy manuel, iki cihaz)
- [ ] Kamera butonu → OS kamera (telefon) → foto cek → chat'e duser
- [ ] Kamera butonu → OS kamera → video record → chat'e duser, poster + ▶ overlay
- [ ] Galeri butonu → video sec → upload + render
- [ ] Galeri butonu → foto sec → mevcut foto pipeline (regresyon yok)
- [ ] Video baloncuga tek tap → Lightbox autoplay sesli oynar
- [ ] Lightbox Esc / dis-tikla kapanir, video durur
- [ ] Video cift tap → favori (sakayik parlar)
- [ ] /album → favori video poster + ▶ ikon grid'de → tikla → Lightbox'ta oynar
- [ ] 30 MB+ video → \"video 25 MB'tan buyuk olamaz\" alert
- [ ] Video MIME olmayan dosya kamera/galeriden gelirse \"sadece video\" alert
- [ ] Firebase Console → Storage → Rules → `/videos/` block deploy edildi mi
- [ ] Eski (poster yok) video mesaji acilirsa default frame fallback gosterir (gercek edge case, test edilemeyebilir)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Kullaniciya bilgilendirme**

Merge'den ÖNCE kullaniciya hatırlat: storage.rules degisikligi Vercel'e gitmez. `firebase deploy --only storage` PR merge sonrasi (veya öncesi de olur) calistirilmali — aksi halde video upload `permission-denied` hatasi alir.

---

## Tam Tamamlama Kriterleri

- [ ] Tasks 1-11 tamamlandi
- [ ] `npx tsc --noEmit` 0 hata
- [ ] `npm run build` basarili
- [ ] `npm run perf:budget` tum route'lar 320 kB altinda
- [ ] PR acildi (gh pr create)
- [ ] storage.rules deploy edildi (`firebase deploy --only storage`) — bu kullanici task'i
- [ ] Manuel smoke matrix tum satirlari preview deploy'da gecti
