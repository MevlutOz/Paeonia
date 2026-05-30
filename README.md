# Paeonia · Gizli Bahçe 🌸

İki kişiye özel, uçtan uca mahcup bir mesajlaşma + anlık çizim PWA'sı.
Yunan mitolojisindeki **Şakayık (Paeonia) ve Apollon** efsanesinden ilhamla
"utangaçlık" ve "gizlilik" hisleri üzerine kurgulanmıştır.

🔗 Canlı: **[paeoniam.vercel.app](https://paeoniam.vercel.app)**

## Yığın

- **Next.js 14 (App Router)** + TypeScript + Tailwind CSS + Framer Motion
- **Firebase**: Auth (e-posta+şifre), Firestore (real-time), **Realtime Database**
  (ortak canlı tuval), Cloud Storage (çizim/foto), Cloud Messaging (web push)
- **PWA**: `@ducanh2912/next-pwa` + manifest + service worker
- **Çizim**: HTML5 Canvas (2D context)

## Modüller

### 🌸 Mesajlar — `/chat`
Real-time sohbet: metin, çizim, fotoğraf. Karşıdan gelen görseller **blur'lu**
gelir, dokununca açılır + 2s blush glow. "Görüldü" yerine şakayık ikonu parlar.

### 🍂 Kurutulmuş Yapraklar — `/album`
Sohbetteki herhangi bir çizim veya fotoğraf favorilenerek kalıcı bir anı
albümüne taşınır. Görsele **çift dokun** ya da köşesindeki **şakayık ikonuna**
bas → favori (geri alınabilir). `/album` sayfası favorileri eskitilmiş parşömen
estetiğiyle, "preslenmiş çiçek" hissinde bir grid'de listeler.

### 🌅 Güneş Doğumu — Çevrimiçi Durumu & Ortak Canlı Tuval
İki kullanıcı aynı anda sohbetteyken `/chat` arka planı yumuşak bir **gün doğumu
gradyanına** geçer. Çizim ekranındaki **"Ortak Tuval"** modu (yalnızca karşı
taraf çevrimiçiyken etkin), iki kişinin aynı tuval üzerine **canlı** birlikte
çizmesini sağlar — Realtime Database ile nokta nokta senkron. **"Bahçeye As"**
ile ortak çizim sohbete bir mesaj olarak düşer.

Çevrimiçilik `users` koleksiyonunda heartbeat ile tutulur (`isOnline`,
`lastSeen`); karşı taraf yalnızca `isOnline` **ve** `lastSeen` son ~60 sn içinde
ise çevrimiçi sayılır.

### 🎵 Mırıldanma — Şarkı Kartları
Sohbete bir **Spotify** veya **YouTube** linki yapıştırıldığında mesaj düz metin
değil; yavaşça dönen plak motifli, şakayık çerçeveli, resmi embed'li bir
**müzik kartı** olarak görünür. (API anahtarı gerekmez.)

### 📷 Anılar — `/memories` & 📋 Planlar — `/plans`
Anılar = şablon tabanlı fotoğraf kolajı (Cloud Function ile tek görsel export).
Planlar = birlikte yapılacaklar listesi.

## Kurulum

```bash
npm install
cp .env.local.example .env.local   # Windows: copy .env.local.example .env.local
# .env.local içine Firebase bilgilerini doldur
npm run dev
```

### Firebase'i hazırlama

1. https://console.firebase.google.com/ üzerinden yeni bir proje aç.
2. **Authentication** → Email/Password etkinleştir. **2 kullanıcı** oluştur
   (kendi e-postan + sevgilininki). UID'leri not al.
3. **Firestore Database** → "Production mode" başlat.
4. **Realtime Database** → oluştur (bölge: europe-west1) — ortak canlı tuval için.
5. **Storage** → aç.
6. **Project settings → Your apps → Web** → web uygulaması ekle. `firebaseConfig`
   değerlerini `.env.local`'a yapıştır — **`databaseURL` dahil**
   (`NEXT_PUBLIC_FIREBASE_DATABASE_URL`).
7. **Cloud Messaging → Web configuration** → **VAPID key pair** üret → public
   key'i `NEXT_PUBLIC_FIREBASE_VAPID_KEY` olarak koy.
8. `NEXT_PUBLIC_ALLOWED_UIDS` → 2. adımdaki iki UID'i virgülle ayırarak yaz.

### Güvenlik kuralları

İki davetli UID `firestore.rules` (`allowedUids()` fonksiyonu) ve
`database.rules.json` içinde tanımlıdır. Gerçek UID'lerle güncelleyip deploy et:

```bash
npx firebase login
npx firebase use paeonia-garden
npx firebase deploy --only firestore:rules,database,storage
```

> ⚠️ Firebase kuralları, Vercel deploy'undan **bağımsızdır**. `firestore.rules`,
> `database.rules.json` veya `storage.rules` değişince bu komutu **ayrıca**
> çalıştırman gerekir — `git push` bunu yapmaz.

### Cloud Function (push bildirim trigger'ı)

```bash
cd functions && npm install && cd ..
npx firebase deploy --only functions
```

> Cloud Functions için **Firebase projesi Blaze planında** olmalıdır (cömert
> ücretsiz kotalar dahil).

### Partner eşleştirmesi

Her iki kullanıcı için Firestore'da `users/{uid}.partnerId` alanını karşı
tarafın UID'i olarak güncelle (Console üzerinden veya küçük bir admin betiği ile).

### PWA ikonları

`public/icons/icon.svg`'i düzenleyip PNG sürümleri üret:

```bash
npm run icons
```

## 🎵 Spotify Şarkı Kırpma Kurulumu

Anılar modülünde IG Stories tarzı şarkı kırpma için Spotify Web Playback SDK
kullanılır. Hem sen hem partnerin **Spotify Premium** abonesi olmalı.

### 1. Spotify Developer App oluştur

1. https://developer.spotify.com/dashboard → giriş yap → **Create app**.
2. Form:
   - **App name:** `Paeonia`
   - **App description:** `Love app` (veya istediğin)
   - **Redirect URIs** (iki tane ekle, `Add` butonuyla):
     - `http://127.0.0.1:3000/auth/spotify/callback` (dev — Spotify
       `localhost`'a izin vermiyor, **127.0.0.1 kullan**)
     - `https://paeoniam.vercel.app/auth/spotify/callback` (prod, kendi
       domain'in)
   - **Which API/SDKs:** ✅ Web API + ✅ Web Playback SDK
   - Terms onayla → Save.

### 2. User Management

Dashboard → app → **User Management** → hem senin hem partnerinin Spotify
e-mail'ini ekle. Development Mode'da Spotify yalnızca eklenmiş kullanıcılara
OAuth izni verir (25 kullanıcıya kadar bedava).

### 3. Client ID'yi env'lere yaz

App → **Settings** → "Client ID"yi kopyala. **Client Secret'a basma — PKCE
kullandığımız için gerekmez ve hiçbir yere yazılmamalı.**

`.env.local`:

```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=...
```

Vercel → Project → Settings → Environment Variables → aynı anahtarı
**Production + Preview + Development** üçüne ekle.

### 4. İlk bağlanma

Dev server'ı çalıştır (`npm run dev`), `http://127.0.0.1:3000/memories/new`
adresine git (`localhost` değil), **Şarkı ekle → Spotify'a bağlan** → OAuth
onayla. Aynı şeyi partnerin de bir kez yapsın.

## Deployment

Proje **Vercel** (`paeoniam`) ve **GitHub** (`MevlutOz/Paeonia`) reposuna bağlıdır:

- `main` dalına her `git push` → **otomatik production deploy**.
- Diğer dallara push → otomatik **preview** deploy.
- İlk kurulumda Vercel proje ayarlarına tüm `NEXT_PUBLIC_*` env değişkenlerini
  eklemeyi unutma (`NEXT_PUBLIC_FIREBASE_DATABASE_URL` dahil).

> PWA service worker agresif cache'ler — yeni sürümü göremezsen hard refresh
> (`Ctrl+Shift+R`) ya da DevTools → Application → Service Workers → Unregister.

## Klasör yapısı

```
src/
├─ app/
│  ├─ page.tsx               # Splash (şakayık tomurcuğu açılır)
│  ├─ login/page.tsx         # Davetli girişi
│  ├─ home/page.tsx          # Ana sayfa (4 kart)
│  ├─ chat/page.tsx          # Mesajlar + presence + gün doğumu
│  ├─ album/page.tsx         # Kurutulmuş Yapraklar (favori albümü)
│  ├─ memories/…             # Anılar (kolaj)
│  ├─ plans/page.tsx         # Planlar
│  ├─ firebase-messaging-sw.js/route.ts  # FCM service worker
│  ├─ layout.tsx / globals.css
├─ components/
│  ├─ MessageList / MessageBubble / MessageInput
│  ├─ CanvasBottomSheet.tsx  # tek başına çizim + "Ortak Tuval" modu
│  ├─ LiveCanvas.tsx         # RTDB nokta-nokta ortak canlı tuval
│  ├─ MusicCard.tsx          # Spotify/YouTube müzik kartı
│  ├─ Collage / CollageTemplatePicker / Lightbox / SongPicker
│  ├─ PeonyIcon / PeonyDraw / FallingPetals
├─ lib/
│  ├─ firebase.ts            # Firestore + RTDB + Storage + Auth
│  ├─ auth.ts / messages.ts / storage.ts / memories.ts / plans.ts
│  ├─ usePresence.ts         # heartbeat tabanlı çevrimiçi durumu
│  ├─ liveCanvas.ts          # RTDB ortak çizim katmanı
│  ├─ links.ts               # Spotify/YouTube link tespiti
│  ├─ fcm.ts / music.ts / collage.ts / format.ts / types.ts
functions/                   # Cloud Functions (FCM + kolaj export)
firestore.rules / database.rules.json / storage.rules / firebase.json
docs/superpowers/            # tasarım spec'leri + implementasyon planları
```

## Tasarım kararları

- Saf siyah/gri kullanılmaz → `aphrodite-dark` (#4A2E35) gölgeleri verir.
- Mesaj baloncukları dikdörtgen değil; şakayık taç yapraklarını andıran
  asimetrik radius'lar.
- "Görüldü" yerine küçük bir **şakayık ikonu** parlar.
- Karşıdan gelen drawing/photo varsayılan **blur'lu**; dokununca açılır + 2s
  **blush glow**.
- Splash'te kapalı tomurcuk `animate-bloom` ile açılır.
- Albüm = eskitilmiş **parşömen** tonları, hafif eğik "preslenmiş çiçek" grid'i.
- Ortak tuval koordinatları **0–1 normalize** edilir → farklı ekran boyutlarında
  doğru hizalanır.

## Yol haritası

- [x] Foto gönderme
- [x] Kurutulmuş Yapraklar — favori anı albümü
- [x] Güneş Doğumu — presence + ortak canlı tuval
- [x] Mırıldanma — Spotify/YouTube şarkı kartları
- [x] Video mesajları + native kamera capture
- [ ] Tepki/kalp atışı animasyonu (apollo-gold burst)
- [ ] Sesli not

## Mimari

### 4 katmanlı veri akışı

Saf veri katmanı (`src/lib/*.ts`) dokunulmadı; üstüne üç ince katman eklendi.
Komponentler artık doğrudan veri katmanına değil hook'lara konuşur.

```
KOMPONENT (src/app/*, src/components/*)
   │
   ▼ React hooks
useMessages · useLiveCanvas · useMedia    ← src/lib/hooks/
   │
   ▼ lifecycle + dedup
subscriptionRegistry (30s grace, ref-count)  ← src/lib/registry/
   │
   ▼ gerçek API çağrıları
messages.ts · liveCanvas.ts · storage.ts · memories.ts · plans.ts
   │
   ▼ yan etki: ölçüm
telemetry/trace + vitals + events            ← src/lib/telemetry/
   ↓
Vercel Speed Insights + Vercel Analytics + Firebase Performance
```

### Dosya topolojisi

```
src/lib/
├─ telemetry/      trace() / vitals / events / reportRouteReady
├─ registry/       subscriptionRegistry (ref-counted shared subs)
├─ hooks/          useMessages · useLiveCanvas · useMedia
├─ firebase.ts     Auth + Firestore + RTDB + Storage init + Perf lazy
├─ messages.ts     subscribeMessagesPaginated (50/page) · sendMedia (text/drawing/photo/music/video) · markReadBatch
├─ memories.ts     Memory CRUD + collage
├─ plans.ts        Plan CRUD
├─ liveCanvas.ts   RTDB nokta-nokta ortak çizim (onChildAdded/Changed/Removed)
├─ storage.ts      uploadPhotoVariants · uploadMemoryPhotoVariants · uploadVideo
├─ usePresence.ts  heartbeat tabanlı çevrimiçi durumu
├─ links.ts        Spotify/YouTube link tespiti
├─ fcm.ts          Web push registration
├─ collage.ts      autoLayout · layoutFitsCount
└─ SpotifyPlayerProvider · useSpotifyAuth · spotify/player

src/app/
├─ layout.tsx              TelemetryBoot + SpeedInsights + Analytics (Spotify YOK)
├─ home/                   4 kart + idle messages prewarm
├─ chat/                   mesajlar + canvas + lightbox
├─ memories/
│  ├─ layout.tsx           SpotifyLazyProvider tüm /memories/* alt ağacını sarar
│  ├─ page.tsx · new/ · [id]/
├─ album/                  Kurutulmuş Yapraklar (favori drawing+photo+video)
├─ plans/ · login/ · auth/spotify/callback / diag/

src/components/
├─ MessageInput            kamera + galeri + canvas + text
├─ MessageList → MessageBubble (text | drawing | photo | music | video render)
├─ Lightbox                kind: "image" | "video"
├─ CanvasBottomSheet → LiveCanvas
├─ Collage · CollageTemplatePicker
├─ SongPicker · SongTrimmer · MemoryMusic · SpotifyConnectCard · MusicCard
├─ SpotifyLazyProvider     next/dynamic ssr:false
└─ PeonyIcon · FallingPetals · PeonyDraw
```

### Auth ve "2 kişi" modeli

Firebase Auth e-posta+şifre, **2 sabit UID whitelist** hem client (`isAllowedUid`)
hem rules tarafında (`allowedUids()` fonksiyonu `firestore.rules` + `storage.rules` +
`database.rules.json` üçünde kopyalı) tanımlı. 3. kullanıcı login olsa bile
rules her şeyi reddediyor.

### Real-time katmanlar

- **Firestore onSnapshot** → mesajlar, anılar, planlar, users (presence)
- **RTDB onChildAdded/Changed/Removed** → `liveCanvas/strokes` (ortak çizim)
- **FCM** → mesaj geldiğinde push (Cloud Function `onNewMessage` trigger)
- **subscriptionRegistry** → /home ↔ /chat geçişlerinde 30s grace ile re-subscribe yok

### Storage path stratejisi

```
drawings/{uid}/<ts>-<id>.png                          single file (5 MB)
photos/{uid}/<ts>-<id>-{thumb|medium|full}.jpg       chat foto varyantları (10 MB)
memories/{uid}/<ts>-<id>-{thumb|medium|full}.jpg     anı foto varyantları (12 MB, delete açık)
videos/{uid}/<ts>-<id>.{mp4} + -poster.jpg           video + ilk frame jpeg (25 MB)
```

### Mesaj veri akışı — örnek: video gönderme

```
Kullanıcı kamera butonu
  │
  ▼
MessageInput → handleFile (file.type'a göre route)
  │
  ▼
chat/page.tsx::handleVideo
  ├─ uploadVideo(uid, file)
  │   ├─ size + mime validate (25 MB)
  │   ├─ extractVideoPoster (<video> + canvas → jpeg blob)
  │   ├─ Promise.all → videos/<uid>/<ts>-<id>.mp4 + -poster.jpg
  │   └─ trace("video.upload", ..., {sizeKb}) → Firebase Performance
  │
  ▼
sendMedia(uid, videoUrl, "video", null, posterUrl) → Firestore addDoc
   (rules: type whitelist + senderId == auth.uid)
  │
  ▼ real-time
useMessages hook → subscriptionRegistry shared snapshot
  → docToMessage (poster + variants okur)
  → MessageList → MessageBubble (isVideo branch — poster + ▶ overlay)
  → Tek tap → onOpenVideo → Lightbox kind="video" (<video controls autoPlay>)
```

## Performans

Üretim metrikleri Vercel Speed Insights + Firebase Performance Monitoring
üzerinden izlenir. Lokalde bundle bütçesini kontrol etmek için:

```bash
npm run build
npm run perf:budget
```

Budget: **First-load JS gzip ≤ 320 kB / route** (regresyon koruması; mutlak
ideal değil, mevcut en büyük route + ~5% headroom). Firebase + Next + Framer
runtime tabanı ~90 kB'tan başlıyor, route'lar tipik 250-305 kB aralığında.

### Yapılmış iyileştirmeler (6-fazlı initiative — 2026-05-28→30)

| Faz | Ne yapıldı | Etki |
|-----|-----------|------|
| 1 | Telemetri tabanı (Vercel Speed Insights + Analytics + Firebase Perf + web-vitals) | Ölçüm altyapısı |
| 2 | `subscriptionRegistry` + `useMessages` + paginated subscribe (50/page) + `markReadBatch` | /chat ilk yük 200→50 doc, /home↔/chat re-subscribe yok |
| 3 | `liveCanvas`: `onValue` → `onChildRemoved`, `useLiveCanvas` rAF batching | RTDB subtree-wide payload yok, 30+ peer stroke tek frame |
| 4 | Foto 3 varyant (thumb 300 / medium 800 / full 1800) + `useMedia` srcSet | Mobilde ~30x daha az byte/foto |
| 5 | Spotify SDK root'tan kaldırıldı (`/memories/layout` altında lazy) + /home idle prewarm | /home/chat/album/plans SDK script çekmiyor |
| 6 | `scripts/perf-budget.mjs` + 320 kB/route budget + bu Performans bölümü | Regresyon koruma |

Spec + plan: `docs/superpowers/specs/2026-05-28-performance-architecture-design.md`
+ `docs/superpowers/plans/2026-05-28-performance-architecture.md`.

### Bilinen borçlar

- **Foto/video silme orphan**: silinen `full` varyantın `thumb`/`medium`/`-poster.jpg`
  storage'da kalıyor. Çözüm: silme yollarında 3-4 path'i de sil.
- **Firestore compound index**: `orderBy + where` kombinasyonları compound index
  gerektirebilir. Henüz hata veren sorgu yok; bir audit yapılmalı.
- **Test altyapısı yok**: Vitest + RTL setup yapılmadı; doğrulama `tsc + build + manuel smoke`.
- **3 yerde UID whitelist** (`firestore.rules`, `storage.rules`, `database.rules.json` +
  client `isAllowedUid`) — değiştirmek 4 yerde sync gerekir.
- **Firebase kuralları Vercel deploy'a dahil değil** — `firebase deploy --only firestore:rules,storage`
  ayrıca çalıştırılır.
