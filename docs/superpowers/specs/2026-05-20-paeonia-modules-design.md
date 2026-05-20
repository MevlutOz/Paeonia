# Paeonia — Üç Modül Tasarım Dokümanı

**Tarih:** 2026-05-20
**Kapsam:** Kurutulmuş Yapraklar (anı albümü), Güneş Doğumu (çevrimiçi durumu + ortak canlı tuval), Mırıldanma (şarkı kartları)
**Uygulama:** Next.js 14 (App Router) + Firebase, 2 kişilik özel PWA

---

## 1. Genel bakış

Mevcut Paeonia uygulamasına üç bağımsız modül eklenir. Üçü de tek bir spec'te
toplanır; uygulama sırası: **Modül 1 → Modül 3 → Modül 2** (Modül 2 en ağırı ve
Realtime Database kurulumunu gerektirdiği için sona bırakılır).

Mevcut mimari özetleri:

- `messages` koleksiyonu: `type: text|drawing|photo`, `onSnapshot` ile gerçek
  zamanlı; `content` metin ya da Storage URL'i.
- Çizim: istemci tarafı `<canvas>` (`CanvasBottomSheet`), PNG dataURL → Storage →
  `drawing` tipi mesaj.
- `users/{uid}`: `uid, displayName, fcmToken, partnerId, createdAt`.
- Firestore kuralları alan bazında kilitli; her modül kural güncellemesi gerektirir.
- Tema token'ları: `peony-light/default/dark`, `apollo-gold`, `nymph-bg`,
  `aphrodite-dark`; fontlar `font-display` (Playfair) / `font-sans` (Quicksand).

---

## 2. Modül 1 — "Kurutulmuş Yapraklar" (Anı Albümü)

### 2.1 Veri modeli

- `messages` dokümanlarına `isFavorited: boolean` alanı eklenir.
- Eski mesajlarda alan bulunmaz; kodda `!!data.isFavorited` ile `false` kabul
  edilir. **Geriye dönük migration gerekmez.**
- `Message` arayüzüne (`src/lib/types.ts`) `isFavorited: boolean` eklenir.

### 2.2 Davranış

- Favorilenebilen mesajlar yalnızca görsel mesajlardır (`drawing`, `photo`).
- Favori **geri alınabilir** (toggle): `isFavorited` `true ↔ false`.
- Hem sohbetteki baloncuktan hem de albüm sayfasından yönetilebilir.

### 2.3 Kod değişiklikleri

- `src/lib/types.ts`: `Message.isFavorited` eklenir.
- `src/lib/messages.ts`:
  - `subscribeMessages` mapper'ına `isFavorited: !!data.isFavorited`.
  - Yeni `toggleFavorite(messageId: string, next: boolean)` →
    `updateDoc(doc(messages, id), { isFavorited: next })`.
- Albüm sayfası **ayrı sorgu/index açmaz**: mevcut `subscribeMessages`'a abone
  olur, istemci tarafında `isFavorited && (type === 'drawing' || 'photo')`
  filtreler. 2 kişilik uygulamada en sade yol; Firestore composite index
  gerektirmez.

### 2.4 UI/UX

- `MessageBubble` (görsel mesajlar): köşeye şakayık ikon butonu. Favori iken
  ikon dolu/parlak.
- **Çift tıklama davranışı:**
  - Açılmamış (blur'lu) görsel → ilk dokunuş her zaman görseli açar
    (gecikmesiz). Çift tık ayrımı uygulanmaz.
  - Açılmış görsel → tek tık = Lightbox; çift tık = favori toggle. Bu ayrım
    açılmış görselde tek-tık'a ~280ms gecikme ekler (kabul edilebilir).
- Yeni `/album` rotası (`src/app/album/page.tsx`):
  - Sayfa başlığı: "Kurutulmuş Yapraklar". URL sade tutulur (`/album`).
  - Eskitilmiş parşömen tonlu arka plan; sıcak, eski kitap estetiği.
  - Favori görseller `createdAt` artan sırada grid'de; her görsel hafif eğik /
    bantlı "preslenmiş çiçek" hissinde.
  - Görsele dokununca mevcut `Lightbox` açılır; albümden de favoriden çıkarılır.
  - Boş durum: şakayık temalı zarif bir boş-durum mesajı.
- `src/app/home/page.tsx`: dördüncü kart — **Kurutulmuş Yapraklar** → `/album`.

### 2.5 Kural değişikliği

`firestore.rules`, `messages` update kuralı:

```
allow update: if isInvited()
  && request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['isRead', 'isRevealed', 'isFavorited']);
```

---

## 3. Modül 2 — "Güneş Doğumu" (Çevrimiçi Durumu + Ortak Canlı Tuval)

### 3.1 Çevrimiçi durumu (Firestore)

- `users/{uid}` dokümanına `isOnline: boolean` ve `lastSeen: timestamp` eklenir.
- Mevcut kural `allow update: if isInvited() && request.auth.uid == userId`
  kendi dokümanını güncellemeyi zaten kapsar — **Firestore kuralı değişmez.**
- Yeni `usePresence` hook'u (`src/lib/usePresence.ts`):
  - Mount'ta `isOnline: true` + `lastSeen: serverTimestamp()`.
  - ~25 sn'de bir heartbeat ile `lastSeen` güncellenir.
  - Cleanup + `visibilitychange` (hidden) + `beforeunload` → `isOnline: false`.
  - Tarayıcı kapanış olayları güvenilmez olduğundan, **okuyan taraf** karşı
    kullanıcıyı yalnızca `isOnline === true` **ve** `lastSeen` son ~60 sn içinde
    ise çevrimiçi sayar.
  - Hook `{ partnerOnline: boolean }` döndürür. Partner UID = `allowedUids`
    içindeki "ben olmayan" UID (env'de iki UID hazır; `partnerId` alanına
    bağımlılık yok).
  - **Kapsam:** Hook yalnızca `/chat` sayfasında mount edilir. Çevrimiçi durumu
    "sohbet sayfasında aktif olmak" anlamına gelir — gün doğumu arka planı ve
    ortak tuval zaten `/chat`'te yaşadığı için kapsam dar tutulur.

### 3.2 Gün doğumu arka planı

- İki taraf da çevrimiçiyken **sohbet sayfası** (`/chat`) arka planı yumuşak bir
  animasyonla gün doğumu gradyanına (altın / şeftali / gül tonları) geçer.
- framer-motion ile arka plan katmanı; geçiş ~1.5 sn yumuşak.

### 3.3 Ortak canlı tuval (Realtime Database)

- Senkronizasyon **Firebase Realtime Database** ile, nokta nokta (seçilen
  yaklaşım).
- RTDB yapısı — tek paylaşılan oda:
  ```
  liveCanvas/
    strokes/
      {pushId}: {
        by: uid,
        color: "#hex",
        size: number,
        pts: [ { x, y }, ... ],   // koordinatlar 0–1 normalize
        done: boolean
      }
  ```
- Koordinatlar **0–1 normalize** edilir; iki cihazda ekran boyutu farklı olsa da
  doğru hizalanır.
- Çizen taraf `pointerdown`'da stroke düğümü açar, çizerken noktaları throttle'lı
  (~60 ms) akıtır, `pointerup`'ta `done: true` yazar.
- Karşı taraf `onChildAdded` / `onChildChanged` dinler, çizgiyi artımlı çizer.
- Temizle: `liveCanvas/strokes` düğümü silinir (iki tarafta da temizlenir).

### 3.4 Tuval UI mimarisi

- Mevcut `CanvasBottomSheet` korunur (tek başına çizim: flood fill, undo).
- Üstüne **[Tek Başına | Ortak Tuval]** mod anahtarı eklenir.
- "Ortak Tuval" modu **yalnızca karşı taraf çevrimiçiyken** etkin.
- Ortak tuval ayrı, sade bir bileşendir (`src/components/LiveCanvas.tsx`):
  fırça, renk, kalınlık, temizle. Flood fill ve undo **yoktur** — streaming'i
  basit tutmak için.
- **"Bahçeye As" butonu:** o anki ortak tuval bir offscreen `<canvas>`'a
  düzleştirilir → PNG → mevcut `uploadDataUrl` + `sendMedia(uid, url, 'drawing')`
  ile sohbete `drawing` mesajı olarak düşer (favorilenebilir). Ardından oda
  (`liveCanvas/strokes`) temizlenir.

### 3.5 RTDB altyapısı

- `src/lib/firebase.ts`: `getDatabase` import'u + `realtimeDb()` getter'ı;
  `firebaseConfig`'e `databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL`.
- `firebase.json`'a `database` bloğu eklenir:
  ```json
  "database": { "rules": "database.rules.json" }
  ```
- Yeni `database.rules.json` — `liveCanvas` düğümüne yalnızca iki davetli UID
  okuma/yazma yetkisi:
  ```json
  {
    "rules": {
      "liveCanvas": {
        ".read":  "auth != null && (auth.uid === 'WOOetHE8NbhBjoYKiW5VDW17Ufu1' || auth.uid === 'CgZyp1HrxQOKC2MqHTKxsI0wVN83')",
        ".write": "auth != null && (auth.uid === 'WOOetHE8NbhBjoYKiW5VDW17Ufu1' || auth.uid === 'CgZyp1HrxQOKC2MqHTKxsI0wVN83')"
      }
    }
  }
  ```

---

## 4. Modül 3 — "Mırıldanma" (Şarkı Kartları)

### 4.1 Veri modeli

- `MessageType`'a (`src/lib/types.ts`) `'music'` eklenir →
  `"text" | "drawing" | "photo" | "music"`.
- `music` mesajında `content` = tespit edilen şarkı URL'i.

### 4.2 Kod değişiklikleri

- Yeni `src/lib/links.ts` → `detectMusicLink(text: string)`:
  - Regex ile `open.spotify.com`, `youtube.com`, `youtu.be` linki arar.
  - Bulursa `{ provider: 'spotify' | 'youtube', embedUrl, originalUrl }` döner;
    yoksa `null`.
  - Spotify: `open.spotify.com/{track|album|playlist}/{id}` →
    `open.spotify.com/embed/{type}/{id}`.
  - YouTube: `watch?v={id}` / `youtu.be/{id}` → `youtube.com/embed/{id}`.
- `src/lib/messages.ts` `sendText`: metinde müzik linki tespit edilirse mesaj
  `type: 'music'`, `content: URL` olarak oluşturulur; aksi halde mevcut `text`
  davranışı.

### 4.3 UI/UX

- Yeni `src/components/MusicCard.tsx`; `MessageBubble`, `type === 'music'` için
  bunu render eder.
- Resmi embed iframe (Spotify `/embed`, YouTube `/embed`) — **API anahtarı
  gerekmez.**
- Embed, şakayık temalı parşömen kart içinde; kenarda yavaşça dönen plak /
  şakayık motifi.
- Tailwind config'e `spin-slow` animasyonu eklenir (yavaş, sonsuz dönüş).

### 4.4 Kural değişikliği

`firestore.rules`, `messages` create kuralı:

```
&& request.resource.data.type in ['text', 'drawing', 'photo', 'music']
```

---

## 5. Ortak değişiklikler özeti

### 5.1 Firestore kuralları (`firestore.rules`)

- `messages` update: `hasOnly(['isRead', 'isRevealed', 'isFavorited'])`.
- `messages` create: `type in ['text', 'drawing', 'photo', 'music']`.
- `users` ve presence: kural değişikliği **yok** (kendi dokümanını güncelleme
  zaten izinli).

### 5.2 RTDB

- `firebase.json` → `database` bloğu.
- Yeni `database.rules.json`.
- `src/lib/firebase.ts` → `realtimeDb()` + `databaseURL` config.

### 5.3 Dokunulan / yeni dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/types.ts` | `Message.isFavorited`, `MessageType += 'music'` |
| `src/lib/messages.ts` | `toggleFavorite`, mapper, `sendText` müzik dalı |
| `src/lib/firebase.ts` | `realtimeDb()`, `databaseURL` |
| `src/lib/usePresence.ts` | **yeni** — çevrimiçi durumu hook'u |
| `src/lib/links.ts` | **yeni** — müzik linki tespiti |
| `src/components/MessageBubble.tsx` | favori butonu, çift tık, müzik render |
| `src/components/LiveCanvas.tsx` | **yeni** — ortak canlı tuval |
| `src/components/CanvasBottomSheet.tsx` | mod anahtarı [Tek Başına/Ortak] |
| `src/components/MusicCard.tsx` | **yeni** — şarkı kartı |
| `src/app/album/page.tsx` | **yeni** — Kurutulmuş Yapraklar sayfası |
| `src/app/home/page.tsx` | 4. kart |
| `src/app/chat/page.tsx` | presence + gün doğumu arka planı |
| `firestore.rules` | update + create kuralları |
| `firebase.json` | `database` bloğu |
| `database.rules.json` | **yeni** |
| `tailwind.config.ts` | `spin-slow` animasyonu |

---

## 6. Kullanıcının (manuel) yapması gerekenler

1. **Firebase Console → Realtime Database oluştur** (konum: europe-west1,
   locked mode).
2. **`.env.local` ve Vercel'e** `NEXT_PUBLIC_FIREBASE_DATABASE_URL` ekle.
   `.env.local.example`'a da örnek satır eklenir.
3. Kod hazır olunca kuralları deploy et:
   `npx firebase use paeonia-garden` ardından
   `npx firebase deploy --only firestore:rules,database`.

---

## 7. Uygulama sırası

1. **Modül 1** — Favoriler + albüm (en az altyapı; RTDB gerektirmez).
2. **Modül 3** — Şarkı kartları (RTDB gerektirmez).
3. **Modül 2** — Presence + ortak canlı tuval (RTDB kurulumuna bağlı; sona).

Her modül bağımsız test edilebilir; Modül 2 öncesi kullanıcının RTDB kurulumunu
tamamlamış olması gerekir.
