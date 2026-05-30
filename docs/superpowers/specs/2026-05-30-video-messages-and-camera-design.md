# Video Mesajları + Kamera Capture — Design

**Tarih:** 2026-05-30
**Durum:** Spec — implementation plan henüz yazılmadı

## Amaç

Chat'e iki yeni yetenek eklemek:

1. **Video mesajları** — kullanıcı galeriden veya kameradan video gönderebilir. Mevcut foto pipeline'ına paralel ama ayrı (poster image + ayrı message type).
2. **Native kamera capture** — input area'ya yeni bir "kamera" butonu eklenir; basınca OS kamerası açılır (foto + video record, kullanıcı seçer), çekilen medya doğrudan chat'e düşer.

## Kapsam dışı

- Custom in-app kamera UI (getUserMedia + canlı preview + custom shutter). Native sistem kamerası tercih edildi — mobile-native his, sıfır yeni UI complexity.
- Video transcoding/compression. Native OS kamera default ayarda kayıt eder; client-side 25MB size limit duration'ı dolaylı sınırlar.
- Video silme. Mevcut chat'te delete yok; eklenmeyecek. İleride eklenirse hem video hem poster silinmeli (bilinen borç).
- Server-side poster extraction (ffmpeg / Cloud Function). Client-side first-frame extraction kullanılacak.

## Tasarım

### Veri katmanı

**`src/lib/types.ts`** — değişiklikler:

```ts
export type MessageType = "text" | "drawing" | "photo" | "music" | "video";

export interface Message {
  id: string;
  senderId: string;
  type: MessageType;
  content: string;          // photo: full URL, video: video URL, drawing: png URL, music/text: payload
  variants?: PhotoVariants | null;  // photo'ya özel, mevcut
  poster?: string | null;   // YENİ — sadece video için kapak frame URL'i
  createdAt: Timestamp | null;
  isRead: boolean;
  isRevealed: boolean;
  isFavorited: boolean;
}
```

Eski mesajlarda `poster` field undefined olarak gelir — fallback `<video>`'nun default frame'idir.

**`src/lib/storage.ts`** — yeni fonksiyon:

```ts
export async function uploadVideo(
  uid: string,
  file: File,
): Promise<{ videoUrl: string; posterUrl: string | null }>
```

Akış:
1. **Validation**: `file.size <= 25 * 1024 * 1024`, `file.type.startsWith("video/")`. Aksi halde throw.
2. **Poster extraction** (client-side):
   - `<video>` element oluştur, `URL.createObjectURL(file)` ile yükle
   - `loadedmetadata` event'inde `currentTime = 0` set et, `seeked` event'ini bekle
   - `<canvas>` üzerine `drawImage(video, 0, 0)` çiz
   - `canvas.toBlob` ile jpeg (quality 0.82) al
   - Hata olursa `posterUrl = null` döner (video silently fallback)
3. **Parallel upload** (`Promise.all`):
   - Video → `videos/{uid}/<ts>-<id>.<ext>` (ext = file.name extension veya `mp4` default)
   - Poster (var ise) → `videos/{uid}/<ts>-<id>-poster.jpg`
4. Return URL'ler.

**`src/lib/messages.ts`** — `sendMedia` signature genişletilir:

```ts
export async function sendMedia(
  senderId: string,
  url: string,
  type: "drawing" | "photo" | "video",
  variants?: PhotoVariants | null,
  poster?: string | null,
)
```

- `poster` yalnızca `type === "video"` durumunda yazılır (Firestore undefined alanları atlar)
- `docToMessage` `data.poster` okur

### Storage rules

`storage.rules` dosyasına yeni block:

```
match /videos/{uid}/{file=**} {
  allow read: if isInvited();
  allow write: if isInvited()
    && request.auth.uid == uid
    && request.resource.size < 25 * 1024 * 1024;
  allow delete: if false;
}
```

Mevcut `photos/` ve `memories/` block'larıyla aynı yapı. Deploy: `firebase deploy --only storage`.

### UI katmanı

**`src/components/MessageInput.tsx`** — 2 değişiklik:

1. Mevcut "foto" butonu artık **galeri** anlamında — `accept="image/*,video/*"` (capture yok, OS galeri/picker açar).
2. Yeni **kamera** butonu — `<input type="file" accept="image/*,video/*" capture="environment">` (capture flag native OS kamerasını zorlar).

Tek dosya input ref kullanılabilir veya iki ayrı — iki ayrı daha temiz çünkü butonların accept değerleri aynı ama capture farklı. Her ikisi de aynı `handleMedia(file)` callback'ine yönlendirir.

```tsx
async function handleMedia(file: File) {
  if (file.type.startsWith("video/")) {
    await onPickVideo(file);
  } else {
    await onPickPhoto(file);
  }
}
```

Yeni prop: `onPickVideo(file: File): Promise<void>`. `MessageInput` API genişler.

İkon önerisi: kamera butonu için `📷`-benzeri (objektif simgesi), galeri butonu için mevcut foto ikonu kalır. Konum: input area'nın solunda, mevcut butonların yanı (3 buton: kamera, galeri, çizim).

**`src/app/chat/page.tsx`** — yeni handler:

```ts
async function handleVideo(file: File) {
  if (!user) return;
  try {
    const { videoUrl, posterUrl } = await uploadVideo(user.uid, file);
    await sendMedia(user.uid, videoUrl, "video", null, posterUrl);
  } catch (e) {
    console.error("[video] upload failed:", e);
    alert(/* boyut hatası vs */);
  }
}
```

Lightbox state genişler:

```ts
const [lightbox, setLightbox] = useState<{
  kind: "image" | "video";
  url: string;
  variants?: PhotoVariants | null;
  poster?: string | null;
} | null>(null);
```

**`src/components/MessageBubble.tsx`** — `type === "video"`:

- Bubble içinde `<img src={poster}>` (poster varsa) `object-cover`, yoksa siyah arka plan
- Üzerinde ortada büyük yarı-saydam beyaz daire içinde ▶ ikonu (play overlay)
- Sağ üst köşede favorile butonu (mevcut pattern korunur, revealed kontrolü yok — video her zaman görünür)
- **Blur reveal pattern uygulanmaz** (videoda anlamsız; videolarda `isRevealed` true varsayılır)
- Tap → `onOpenVideo(content, posterUrl)` — Lightbox açar
- Çift tap → favori (mevcut pattern)

`MessageList` props'a yeni callback eklenir (mevcut `onOpenImage` aynen kalır, sadece foto/çizim için):
```ts
interface Props {
  messages: Message[];
  currentUserId: string;
  onOpenImage: (url: string, variants?: PhotoVariants | null) => void;
  onOpenVideo: (url: string, poster?: string | null) => void;
}
```

İki ayrı callback (overloaded tek callback yerine) çünkü:
- Mevcut `onOpenImage` API'sini bozmaz — backwards compat
- Tip güvenliği daha net (video için variants? alanı, foto için poster? alanı anlamsız olmaz)
- MessageBubble içinde tip-bazlı routing zaten var, parent state'e aktarmak daha temiz

**`src/components/Lightbox.tsx`** — yeni `kind` prop:

```tsx
interface Props {
  url: string | null;
  kind?: "image" | "video";
  variants?: PhotoVariants | null;
  poster?: string | null;
  onClose: () => void;
}
```

- `kind === "video"`: `<video controls autoPlay playsInline src={url} poster={poster}>` tam ekran (max-w/max-h container içinde)
- `kind === "image"` (default, backwards compat): mevcut `<img srcSet>` render
- Esc / outside-click kapatma davranışı aynı

**`src/app/album/page.tsx`** — favori filter genişler:

```tsx
const favorites = messages.filter(
  (m) => m.isFavorited && (m.type === "drawing" || m.type === "photo" || m.type === "video"),
);
```

`FavoriteThumb` komponenti video'yu da render eder:
- `m.type === "video"`: poster image (var ise) + sağ üst köşede ▶ ikon overlay
- `m.type` "photo" / "drawing": mevcut useMedia + `<img>` render
- Click → setLightbox `kind="video"` ile video için, `kind="image"` diğerleri için

### Telemetry

Mevcut `trace()` helper'ı `uploadVideo`'yu sarmalar:
```ts
return trace("video.upload", async () => { ... }, { sizeKb: ... });
```

Yeni event: `event("video_sent", { sizeKb })` `chat/page.tsx` handler'ında.

## Mimari diyagram

```
[MessageInput]
  ├─ Kamera btn → <input capture> → file → handleMedia → onPickVideo|onPickPhoto
  └─ Galeri btn → <input> → file → handleMedia → onPickVideo|onPickPhoto
                                          │
                                          ▼
                                   [chat/page.tsx]
                                          │
                            ┌─────────────┴────────────┐
                            ▼                          ▼
                    handlePhoto                 handleVideo
                            │                          │
                            ▼                          ▼
                  uploadPhotoVariants          uploadVideo
                  (3x resize+upload)           (poster extract + 2x upload)
                            │                          │
                            └────────────┬─────────────┘
                                         ▼
                                    sendMedia
                                  (Firestore write)
                                         │
                                         ▼
                              [docToMessage → Message]
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
          MessageBubble            Lightbox             AlbumPage
        (poster + play             (video               (poster thumb
         overlay; tap →             controls             + play icon;
         Lightbox)                  autoplay)            tap → Lightbox)
```

## Test stratejisi

Bu proje otomatik test altyapısı kurmuyor (mevcut karar). Doğrulama:

- `npm run build` — bundle delta kontrolü (yeni Lightbox `<video>` Next.js'in default render'ı, minimal artış beklenir)
- `npx tsc --noEmit` — tip kontrolü
- **Manuel smoke matrix** preview deploy'da iki cihaz:
  1. Chat'te kamera butonuna bas → OS kamera açılır → foto çek → chat'e düşer (mevcut foto pipeline çalışır)
  2. Chat'te kamera butonuna bas → video record → chat'e düşer → poster + ▶ overlay görünür
  3. Galeri butonu → video seç → upload → render aynı
  4. Galeri butonu → foto seç → mevcut foto pipeline (regresyon yok)
  5. Video baloncuğa tek tap → Lightbox açılır, autoplay başlar (sesli)
  6. Lightbox dışına tıkla / Esc → kapanır, video durur
  7. Video çift tap → favori (şakayık ikonu parlar)
  8. /album → favori video poster + ▶ ikon thumb'ı görünür → tıkla → Lightbox'ta oynar
  9. 30MB+ video seç → "video çok büyük" alert (silently fail değil)
  10. Storage rule deploy edildi mi: Firebase Console → Storage → Rules → `/videos/...` block görünmeli

## Bundle bütçesi etkisi

Beklenen ekleme:
- `uploadVideo` + poster extraction: ~1-2 kB
- `MessageBubble` video branch: ~0.5 kB
- `Lightbox` video branch: ~0.3 kB (`<video>` zaten browser native)

Toplam tahmin: `/chat` +2 kB, `/album` +0.5 kB. 320 kB budget içinde rahat.

## Sıralı uygulama (özet — detay plan'da)

1. **Storage rules** + `firebase deploy --only storage` (preview deploy'da test edilemez; ya local emulator ya direkt deploy)
2. **types.ts** — MessageType genişlet, `poster` field ekle
3. **storage.ts** — `uploadVideo` + poster extract helper
4. **messages.ts** — `sendMedia` signature + `docToMessage` poster oku
5. **MessageInput** — 2 buton + handleMedia routing + onPickVideo prop
6. **chat/page.tsx** — handleVideo + lightbox state genişlet
7. **MessageList** — onOpenImage signature genişlet
8. **MessageBubble** — video render branch
9. **Lightbox** — video render branch (kind prop)
10. **album/page.tsx** — favori filter + FavoriteThumb video branch
11. `npx tsc --noEmit` + `npm run build` + `npm run perf:budget` + smoke matrix

## Bilinen borçlar (kapsam dışı, ileride)

- Video silme — eklenirse poster da silinmeli
- Server-side poster extraction (codec issue fallback için Cloud Function ffmpeg)
- Video duration/quality kontrol (native kamera default'unu override edemiyoruz; UX feedback için duration display eklenebilir)
- Subtitle/caption desteği
- Storage usage monitoring — bu app'in Firebase Storage Spark plan kotasının ne kadarını yiyeceği önceden hesaplanmadı; aylık usage spike'larda Blaze upgrade gerekebilir
