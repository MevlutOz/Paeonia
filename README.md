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
- [ ] Tepki/kalp atışı animasyonu (apollo-gold burst)
- [ ] Sesli not / kısa video
