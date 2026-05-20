# Paeonia · Gizli Bahçe 🌸

İki kişiye özel, uçtan uca mahcup bir mesajlaşma + anlık çizim PWA'sı.
Yunan mitolojisindeki **Şakayık (Paeonia) ve Apollon** efsanesinden ilhamla
"utangaçlık" ve "gizlilik" hisleri üzerine kurgulanmıştır.

## Yığın

- **Next.js 14 (App Router)** + TypeScript + Tailwind CSS
- **Firebase**: Auth (e-posta+şifre), Firestore (real-time), Cloud Storage (çizim/foto), Cloud Messaging (web push)
- **PWA**: `@ducanh2912/next-pwa` + manifest + service worker
- **Çizim**: `react-sketch-canvas`

## Kurulum

```bash
npm install
cp .env.local.example .env.local   # Windows: copy .env.local.example .env.local
# .env.local içine aşağıdaki Firebase bilgilerini doldur
npm run dev
```

### Firebase'i hazırlama

1. https://console.firebase.google.com/ üzerinden yeni bir proje aç (örn. `paeonia`).
2. **Authentication** → Sign-in method → Email/Password etkinleştir. **2 kullanıcı** oluştur
   (kendi e-postan + sevgilininki). Oluşturduğun UID'leri not al.
3. **Firestore Database** → "Production mode" başlat.
4. **Storage** → aç (Production mode).
5. **Project settings → Your apps → Web** → yeni bir web uygulaması ekle (örn. `paeonia-web`).
   Verilen `firebaseConfig` değerlerini `.env.local` içine yapıştır.
6. **Cloud Messaging → Web configuration** sekmesinde bir **VAPID key pair** üret.
   Public key'i `NEXT_PUBLIC_FIREBASE_VAPID_KEY` olarak `.env.local`'a koy.
7. `NEXT_PUBLIC_ALLOWED_UIDS` alanına 2. adımdaki iki UID'i virgülle ayırarak yaz.

### Güvenlik kuralları

`firestore.rules` ve `storage.rules` dosyalarındaki
`REPLACE_WITH_UID_1` / `REPLACE_WITH_UID_2` değerlerini gerçek UID'lerle güncelle, sonra deploy et:

```bash
npx firebase login
npx firebase use --add        # az önce oluşturduğun projeyi seç
npx firebase deploy --only firestore:rules,storage
```

### Cloud Function (push bildirim trigger'ı)

```bash
cd functions
npm install
cd ..
npx firebase deploy --only functions
```

> Cloud Functions için **Firebase projesi Blaze planında** olmalıdır (cömert ücretsiz kotalar dahil).

### Partner eşleştirmesi

İlk girişten sonra her iki kullanıcı için Firestore'da `users/{uid}.partnerId` alanını
karşı tarafın UID'i olarak güncelle (Console üzerinden veya küçük bir admin betiği ile).

### PWA ikonları

`public/icons/icon.svg`'i istediğin gibi düzenleyebilirsin. Sonra:

```bash
npm run icons
```

PNG sürümler (192, 512, apple-touch-icon, favicons) otomatik üretilir.

## Deployment

```bash
# Vercel'e push'la
git init && git add . && git commit -m "Paeonia first bloom"
# Vercel dashboard üzerinden import → env değişkenleri ekle → deploy
```

## Klasör yapısı

```
src/
├─ app/
│  ├─ page.tsx               # Splash (şakayık tomurcuğu açılır)
│  ├─ login/page.tsx         # Davetli girişi
│  ├─ chat/page.tsx          # Gizli Bahçe (real-time sohbet)
│  ├─ firebase-messaging-sw.js/route.ts  # FCM service worker (env templated)
│  ├─ layout.tsx / globals.css
├─ components/
│  ├─ MessageList.tsx
│  ├─ MessageBubble.tsx      # asimetrik baloncuk + blur/blush + şakayık "okundu"
│  ├─ MessageInput.tsx
│  ├─ CanvasBottomSheet.tsx  # şakayık paletli çizim tahtası
│  ├─ PeonyIcon.tsx
├─ lib/
│  ├─ firebase.ts
│  ├─ auth.ts
│  ├─ messages.ts            # subscribeMessages, sendText, sendMedia, mark*
│  ├─ storage.ts
│  ├─ fcm.ts                 # token request + persist
│  ├─ types.ts
functions/                   # Cloud Function (FCM gönderici)
public/
├─ manifest.json
├─ icons/ (icon.svg + üretilen PNG'ler)
firestore.rules / storage.rules / firebase.json
```

## Tasarım kararları

- Saf siyah/gri kullanılmaz → `aphrodite-dark` (#4A2E35) gölgeleri verir.
- Mesaj baloncukları dikdörtgen değil; şakayık taç yapraklarını andıran asimetrik radius'lar.
- "Görüldü" yerine küçük bir **şakayık ikonu** parlar.
- Karşıdan gelen drawing/photo varsayılan **blur'lu**; dokununca açılır + 2s **blush glow**.
- Splash'te kapalı tomurcuk `animate-bloom` ile açılır.

## Sırada ne var?

- [ ] Foto gönderme (mevcut storage altyapısı hazır, sadece UI ekle: `MessageInput` içine bir kamera/galeri butonu).
- [ ] Tepki/kalp atışı animasyonu (apollo-gold burst).
- [ ] Sesli not / kısa video.
