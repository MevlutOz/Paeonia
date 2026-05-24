# Anılar — Spotify Şarkı Kırpma Tasarım Dokümanı

**Tarih:** 2026-05-24
**Kapsam:** Anılar modülünde şarkı seçimini Spotify'a taşıyıp, IG Stories tarzı parça kırpma özelliği ekleme
**Etkilenen alan:** Sadece anılar (chat'teki `MusicCard` mevcut iTunes davranışıyla kalır)
**Uygulama:** Next.js 14 (App Router) + Firebase, 2 kişilik özel PWA

---

## 1. Motivasyon

Mevcut akışta `SongPicker` iTunes Search API'sinden 30 saniyelik **sabit** önizleme klibi seçtiriyor; `MemoryMusic` anı açıldığında bu 30 sn'yi loop ediyor. Kullanıcı, Instagram Stories'teki gibi şarkının istediği bölümünü seçebilmek istiyor — ama iTunes API tam şarkı vermediği için sadece 30 sn içinde kırpmak yeterli olmaz.

İki kullanıcı da Spotify Premium aboneliğine sahip olduğundan **Spotify Web Playback SDK** ile tam şarkıyı oynatıp istenen segmenti loop'lamak en doğru çözüm. Apple Music ve YouTube Music alternatifleri de değerlendirildi:

- **Apple Music MusicKit** → iki tarafın da Apple Music aboneliği şart, ekstra fayda yok.
- **YouTube Music** → resmi embed yok; pratikte YouTube IFrame Player gerekir, embeddability ve mobil background play sorunları var.
- **iTunes preview içinde kırpma** → 30 sn pencere çok dar, şarkının istenen kısmı genellikle dışarıda.

Karar: **tam Spotify geçişi** (arama + oynatma her ikisi de Spotify), eski iTunes preview'lı anılar geri uyumlu çalmaya devam eder.

---

## 2. Kullanıcı akışları

### 2.1 İlk kez bağlanma (her kullanıcı bir kez)

```
Anılar → Yeni anı → "Şarkı ekle" →
  Spotify bağlı değil → SpotifyConnectCard ("Spotify'a bağlan" CTA) →
  /authorize (PKCE) → kullanıcı Spotify'da onaylar →
  /auth/spotify/callback?code=… → token exchange →
  users/{uid}.spotifyRefreshToken Firestore'a yazılır →
  router.replace(returnTo) → şarkı seçici tekrar açılır
```

### 2.2 Yeni anıda şarkı ekleme

```
[Şarkı ekle] → SongPicker
  ├ Step 1 (Search):
  │    debounce 450ms → Spotify Web API /v1/search?type=track →
  │    liste (kapak + başlık + sanatçı + ▶ önizleme butonu) →
  │    kullanıcı şarkıya tıklar → Step 2
  └ Step 2 (Trim):
       SongTrimmer (5–30 sn pencere) → Önizle → Kullan →
       MemorySong { spotifyTrackUri, startMs, endMs, durationMs, … }
       form'a aktarılır → memory kaydedilir
```

### 2.3 Anıyı açma (her iki taraf)

```
Memory page → MemoryMusic component
  ├ song.spotifyTrackUri var mı?
  │   ├ Yok → eski path: previewUrl ile HTML5 Audio loop (mevcut davranış)
  │   └ Var → Spotify path:
  │        ├ Bu device'da Spotify bağlı + Premium?
  │        │   ├ Hayır → SpotifyConnectCard kompakt mod
  │        │   │        (metadata + "Spotify'a bağlan" CTA)
  │        │   └ Evet → Web Playback SDK:
  │        │            transferPlayback(deviceId) →
  │        │            play(uri, position_ms = startMs) →
  │        │            polling 250ms: pos ≥ endMs → seek(startMs) → loop
  │        └ Tap → toggle play/pause
  └ Unmount → pause + listener detach
```

---

## 3. Mimari kararlar

### 3.1 Auth: Authorization Code with PKCE (server-side gerekmez)

- **Neden PKCE?** SPA için Spotify'ın resmi tavsiyesi. Client secret olmadan refresh dahil tüm flow client-side yapılabilir.
- **Neden Cloud Function değil?** Hem flow client-side mümkün hem de zaten 2 kişilik bir app — bir endpoint daha bakım yükü.
- **Refresh token saklama:** `users/{uid}.spotifyRefreshToken` (Firestore). Mevcut `firestore.rules` zaten `users/{uid}` doc'una sadece sahip okuma izni veriyor; spec yazımında bu doğrulanacak.
- **Access token:** `sessionStorage` (tab kapanınca silinir, XSS yüzeyi sınırlı).

### 3.2 Kaynak: Tam Spotify (iTunes değil)

Arama ve oynatma her ikisi de Spotify'a geçer. Tek kaynak, tek mental model. Eski anılar (`previewUrl` alanı dolu) iTunes path'iyle yaşamaya devam eder ama yeni anılar her zaman Spotify path'iyle kaydedilir.

### 3.3 Redirect URI: window.location.origin'den türetilir

Spotify Dashboard'a iki URI kayıtlı:
- `http://127.0.0.1:3000/auth/spotify/callback` (dev — `localhost` Spotify tarafından Nisan 2025'ten beri yasak)
- `https://paeoniam.vercel.app/auth/spotify/callback` (prod)

Kod `${window.location.origin}/auth/spotify/callback` ile hesaplar, ekstra env değişkenine gerek yok.

### 3.4 Trim parametreleri

- Min uzunluk: **5 sn**
- Max uzunluk: **30 sn**
- Default: `startMs=0`, `endMs=15000` (IG benzeri)
- Snap: 1 sn (`Math.round(ms / 1000) * 1000`)
- İki tutamak (başlangıç + bitiş), birbirlerine min uzunluk kadar yaklaşabilirler

### 3.5 Oynatma davranışı

- **Loop** — segment biter biter `seek(startMs)`. (Polling 250ms; ±0.25 sn kayma kabul edilebilir.)
- İlk açılışta auto-play (iOS Safari'de user gesture restriction nedeniyle ilk tap'ta başlar — UI'da play butonu hep görünür).
- `transferPlayback(deviceId)` sessizce yapılır (kullanıcı zaten başka cihazda Spotify çalıyorsa otomatik bu sekmeye alır — IG ile aynı davranış).

---

## 4. Veri modeli

### 4.1 `MemorySong` (genişletildi — geri uyumlu)

```ts
export interface MemorySong {
  title: string;
  artist: string;
  artworkUrl: string;

  // Yeni — Spotify path (yeni anılar zorunlu)
  spotifyTrackUri?: string;   // "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"
  spotifyTrackId?: string;
  durationMs?: number;        // tam şarkı süresi (trimmer UI için)
  startMs?: number;           // kırpma başı
  endMs?: number;             // kırpma sonu (endMs - startMs ∈ [5000, 30000])

  // Eski — iTunes path (yeni anılarda yazılmaz)
  previewUrl?: string;
}
```

**Karar mantığı:** Tüm yeni alanlar opsiyonel; eski anılar `spotifyTrackUri` olmadığı için `MemoryMusic` iTunes path'ine düşer. Veri migrasyonu gerekmiyor.

### 4.2 `PaeoniaUser` (genişletildi)

```ts
export interface PaeoniaUser {
  uid: string;
  displayName: string;
  fcmToken?: string | null;
  partnerId?: string | null;
  spotifyRefreshToken?: string | null;   // YENİ
  spotifyConnectedAt?: Timestamp | null; // YENİ — UI'da gösterim için
}
```

### 4.3 Firestore rules etkisi

`users/{uid}` doc'una yeni iki alan eklendiği için rules'da değişiklik gerekmez (alan bazında değil doc bazında izinli). Spec implementation aşamasında `firestore.rules` doğrulanır:

- `users/{uid}` doc'una **sadece** sahip kullanıcı (`request.auth.uid == uid`) yazabiliyor olmalı.
- Eğer alan bazında allowlist varsa, `spotifyRefreshToken` ve `spotifyConnectedAt` eklenir.

---

## 5. Komponentler ve dosyalar

### 5.1 Yeni dosyalar

```
src/lib/spotify/
├─ auth.ts          ← PKCE: generatePkce(), buildAuthorizeUrl(),
│                     exchangeCode(), refresh(), logout()
├─ api.ts           ← searchTracks(q), getTrack(id) — Spotify Web API REST
└─ player.ts        ← SDK loader (lazy script tag), Player singleton,
                      play/pause/seek/transferPlayback wrapper

src/hooks/
├─ useSpotifyAuth.ts    ← { status, accessToken, login, logout }
│                         status: 'idle'|'connecting'|'connected'|'error'
└─ useSpotifyPlayer.ts  ← { ready, deviceId, state, play(uri, startMs),
                            pause, seek }

src/components/
├─ SongTrimmer.tsx          ← İki tutamak slider + canlı süre rozeti +
│                             ▶ Önizle + ✓ Kullan
└─ SpotifyConnectCard.tsx   ← "Spotify'a bağlan" CTA;
                              variant: 'full' | 'inline-compact'

src/app/auth/spotify/callback/
└─ page.tsx       ← code+state'i okur, exchangeCode çağırır, returnTo'ya yönlendirir
```

### 5.2 Değişen dosyalar

```
src/lib/types.ts          ← MemorySong + PaeoniaUser genişletmeleri
src/components/SongPicker.tsx
                          ← iTunes search → Spotify search;
                            iki adımlı (Search → Trim);
                            seçili durumda "22 sn parça · 1:08'den"
                            etiketi eklenir
src/components/MemoryMusic.tsx
                          ← Spotify path eklenir; previewUrl path mevcut
                            (geri uyumluluk)
```

### 5.3 Değişmeyenler (önemli)

```
functions/index.js — searchMusic Cloud Function
                     korunur (eski iTunes path'i çalmaya devam eder)
src/components/MusicCard.tsx — chat müzik mesajları korunur
src/lib/music.ts — iTunes searchMusic helper'ı eski anılar için kalır
```

### 5.4 Yeni bağımlılıklar

- **NPM paketi yok** — saf REST + script tag yaklaşımı.
- **Dış script:** `https://sdk.scdn.co/spotify-player.js` — sadece anı sayfası ihtiyacı olduğunda dinamik yüklenir (app-wide değil).

### 5.5 Çevre değişkenleri

| Anahtar | Nereye |
|---|---|
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | `.env.local` (lokal), Vercel (Production + Preview + Development) |

`.env.local` ve `.env.local.example` zaten güncellendi (commit kapsamında).

---

## 6. Trim UI tasarımı

### 6.1 Layout

```
┌───────────────────────────────────────────────────┐
│                                          [Vazgeç]│
│  ┌─────┐                                          │
│  │ 🖼 │  Şarkı Adı                                │
│  │     │  Sanatçı · 3:42                          │
│  └─────┘                                          │
│                                                   │
│  Parçayı seç                                      │
│  ┌───────────────────────────────────────────┐    │
│  │░░░░░░░░░░░░░░██████████████████░░░░░░░░░░│    │
│  │              ●                  ●         │    │
│  └───────────────────────────────────────────┘    │
│  0:00          1:08              1:30        3:42 │
│                ╰──── 22 sn ────╯                  │
│                                                   │
│              [  ▶  Önizle (22s)  ]                │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │            Bu parçayı kullan                │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

### 6.2 Etkileşim kuralları

- Slider implementasyonu: özel div + pointer events (input range x2 vs özel — özel kazandı, çünkü iki handle'lı range native'te yok).
- Touch hit area: 28×28 px (parmak için).
- Sürükleme sırasında diğer handle min uzunluk kadar uzakta dururuyor — daha yakın gelirse durur.
- Süre rozeti (`22 sn`) ortada sabit, sürükleme sırasında büyür (subtle haptic feedback hissi).
- ▶ Önizle: SDK ile `play(uri, startMs)`, polling endMs'e ulaşınca `pause()`. Tekrar basınca tam segment baştan.
- ✓ Kullan: `onChange({ ..., startMs, endMs, durationMs })`, modal kapanır.
- Şarkı değiştirilirse trim sıfırlanır (Step 1'e dönülürse).

### 6.3 Görsel temalama

Mevcut Tailwind palette ile uyumlu:
- Pencere arka planı: `bg-peony-light/30`
- Seçili bölge: `bg-peony-default`
- Handle: `bg-apollo-gold border-2 border-white shadow-petal`
- Tema font'ları: zaten `globals.css`'te tanımlı.

---

## 7. Spotify SDK player davranışı

### 7.1 SDK yüklenmesi (lazy)

`src/lib/spotify/player.ts`:

```ts
let sdkPromise: Promise<typeof window.Spotify> | null = null;

export function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(s);
  });
  return sdkPromise;
}
```

Sadece anı sayfası veya trimmer açıldığında çağrılır.

### 7.2 Player yaşam döngüsü

- Singleton: bir tabda tek bir `Spotify.Player` instance'ı.
- Auth callback'i `useSpotifyAuth`'tan access token döndürür; token yenilenince yeni token verilir.
- `device_ready` event'inde `deviceId` cache'lenir.
- `play(uri, startMs)`:
  - `PUT /v1/me/player/play?device_id={deviceId}` body: `{ uris: [uri], position_ms: startMs }`
  - REST çağrısı; SDK'nın kendi `togglePlay()`'i seek+play kombinasyonunu garanti etmez.
- Loop polling: `setInterval(() => player.getCurrentState() …, 250)`; `state.position >= endMs` ise `seek(startMs)`.

### 7.3 Cleanup

- Komponent unmount: `player.pause()`, interval clear, listener detach.
- Auth kopması: player disconnect.

---

## 8. Auth detayı

### 8.1 PKCE flow

```
login():
  verifier   = randomBase64Url(96)
  challenge  = base64UrlSha256(verifier)
  state      = randomBase64Url(32)
  localStorage:
    sp_pkce_verifier = verifier
    sp_oauth_state   = state
    sp_return_to     = window.location.pathname + search

  redirect to:
    https://accounts.spotify.com/authorize
      ?response_type=code
      &client_id={CLIENT_ID}
      &code_challenge_method=S256
      &code_challenge={challenge}
      &state={state}
      &redirect_uri={origin}/auth/spotify/callback
      &scope=streaming user-read-email user-read-private

callback (/auth/spotify/callback?code=…&state=…):
  if (state !== localStorage.sp_oauth_state) abort
  verifier = localStorage.sp_pkce_verifier
  POST https://accounts.spotify.com/api/token
    grant_type=authorization_code
    code, redirect_uri, client_id, code_verifier
  → { access_token, refresh_token, expires_in }

  Firestore: users/{uid}.spotifyRefreshToken = refresh_token
                     .spotifyConnectedAt = serverTimestamp()
  sessionStorage: sp_access_token = access_token
                  sp_expires_at   = Date.now() + expires_in*1000

  cleanup localStorage (verifier, state)
  router.replace(localStorage.sp_return_to ?? '/memories')

refresh (proactive, expires_at - 60s):
  refresh_token = Firestore'dan oku
  POST https://accounts.spotify.com/api/token
    grant_type=refresh_token, refresh_token, client_id
  → { access_token, refresh_token?, expires_in }
  Eğer yeni refresh_token döndüyse Firestore güncelle (rotation).
  sessionStorage güncelle.
```

### 8.2 Scope gerekçesi

| Scope | Neden |
|---|---|
| `streaming` | Web Playback SDK zorunlu |
| `user-read-email` | Hesap bilgisi (UI'da göstermek için, gerekli olmayabilir ama Spotify'ın önerdiği baseline) |
| `user-read-private` | Premium durumu okumak için (`isPremium` UI mesajı) |

İhtiyaç dışı scope **istemiyoruz** (e.g. playlist okuma, geçmiş okuma).

### 8.3 Güvenlik notları

- PKCE = client secret yok. Repo'da hiçbir secret saklanmıyor.
- Refresh token plaintext Firestore'da; ama:
  - `users/{uid}` doc'u sadece sahibine açık (Firestore rules).
  - Çalınması yalnızca o kullanıcının kendi Spotify hesabına erişim verir.
- Access token sessionStorage'da; tab kapanınca silinir, başka tab'lar paylaşmaz.
- `state` parametresi her login'de yeni random — CSRF koruması.

---

## 9. Hata durumları ve edge case'ler

### 9.1 Kullanıcıya gösterilecek mesajlar

| Durum | Mesaj |
|---|---|
| Premium değil | "Şarkıyı çalmak için Spotify Premium gerekiyor 🌹" |
| Token süresi doldu & refresh fail | "Spotify bağlantın kopmuş — tekrar bağlanır mısın?" + CTA |
| Track o bölgede yok | "Bu şarkı Spotify'da bölgende yok ☹️ — başka bir parça?" |
| SDK script load fail | "Spotify oynatıcısı yüklenemedi, sayfayı yeniler misin?" |
| Network error (search) | Inline toast: "Bağlantı sorunu, tekrar dener misin?" |
| User Management'a eklenmemiş | OAuth ekranında Spotify'ın kendi hatası (kendi başına aşamaz) — manuel kurulum kontrol listesi (§13) bunu önler |

### 9.2 Edge case'ler

- **Aynı kullanıcı farklı device'larda**: Her tab kendi Spotify Connect device'ını yaratır. `transferPlayback` sessizce çalışır, kullanıcının diğer Spotify uygulaması duraklatılır (Spotify default davranışı).
- **Trim sınırı**: `endMs > durationMs` ise endMs `durationMs`'e clamp edilir; `endMs - startMs < 5000` olamaz.
- **Anı düzenleme**: Şu anki spec kapsam dışı (anı düzenleme akışı zaten yok). Eğer eklenirse, Spotify path'i için trim tekrar açılabilir.
- **Hızlı şarkı değiştirme**: Trimmer'da preview çalarken Vazgeç'e basılırsa player.pause() çağrılır.
- **Eski iTunes anıyı düzenleme**: Düzenleme akışı eklenirse, kullanıcı şarkıyı kaldırıp yenisini ekleyince otomatik Spotify path'ine yükseltilir.

### 9.3 Polling kaynak yönetimi

- Memory page unmount → interval clear (zorunlu).
- Tab gizliyken: `document.visibilityState === 'hidden'` polling'i 1 sn'ye yavaşlat (pil tasarrufu).
- Tek instance polling: aynı sayfada birden fazla MemoryMusic olamaz (anı sayfasında 1 tane), risk yok.

---

## 10. Uygulama sırası

Küçük, bağımsız test edilebilir commit'ler. Sıra önemli — her adımın bir önceki üzerine kurulu olduğunu varsay.

```
1. types.ts: MemorySong + PaeoniaUser genişletme
2. lib/spotify/auth.ts (PKCE) + /auth/spotify/callback page + useSpotifyAuth hook
   ✓ Test: login → callback → Firestore'da spotifyRefreshToken görünür
3. lib/spotify/api.ts (search + getTrack)
4. SongPicker'da iTunes search → Spotify search (trim YOK henüz)
   ✓ Test: yeni anı oluştur, Spotify'dan şarkı seçilebilir (eski 30 sn davranışıyla)
5. lib/spotify/player.ts + useSpotifyPlayer hook
6. SongTrimmer component
7. SongPicker'a Trimmer step ekle
   ✓ Test: yeni anı = trimmed segment kaydedilir, Firestore'da startMs/endMs görünür
8. MemoryMusic'i Spotify SDK path'iyle güncelle (iTunes path korunarak)
   ✓ Test: yeni anı = trimmed loop, eski anı = iTunes loop
9. SpotifyConnectCard component + fallback'ler (yeni anı + memory page'de)
10. Hata mesajları + edge case'ler + visibility polling yavaşlatma
11. README güncelleme: Spotify Developer App kurulum kılavuzu
```

---

## 11. Test stratejisi

### 11.1 Manuel (kritik — UX duygusu)

- Senin telefonun + partnerinin telefonunda full akış:
  - Login → search → trim → save → diğer taraf aç → çalıyor mu, loop pürüzsüz mü.
- Edge:
  - Logout → tekrar gir.
  - Eski anı (iTunes path) açıldığında bozulmamış mı.
  - Premium iptali (manuel test).
  - Bölgesel kısıtlı şarkı (rare ama olur).
- iOS Safari'de:
  - Anı açıldığında ilk tap ile mi başlıyor (user gesture).
  - Ekran kilitlenince ne oluyor (beklenen: durur — Spotify uygulamasına geçer).

### 11.2 Otomatik (mevcut test altyapısı yok — küçük başla)

Proje şu anda Vitest/Jest barındırmıyor. Bu spec kapsamında test altyapısı eklemiyoruz. Saf fonksiyonlar (PKCE generation, token expiry hesaplama) gelecekte test edilebilir; şimdilik manuel doğrulama.

### 11.3 Smoke testi (her commit grubunda)

- `npm run build` → TypeScript + next build hata vermez.
- Dev server'da ilgili sayfaya gir, console'a error düşmüyor.

---

## 12. Açık riskler ve gelecek işler

### 12.1 Bilinen kısıtlar

1. **Mobile background play**: Web Playback SDK ekran kilitlenince duraklar. IG Stories'te de aynı.
2. **iOS Safari autoplay**: İlk play user gesture gerektirir; anı açılınca otomatik değil, ilk tap'te başlar. UI play butonu hep görünür.
3. **Spotify Dev App quota**: Development Mode = 25 kullanıcı. 2 kişi için sonsuza dek yeterli. Extended Quota gerekmiyor.
4. **Region availability**: Bazı şarkılar Spotify'da Türkiye'de yok. Fallback mesajı (§9.1) bunu yönetiyor.
5. **Aynı anda iki sekme**: Aynı Spotify hesabı iki sekme açarsa SDK device çakışır, son açılan kazanır. Default Spotify davranışı, müdahale etmiyoruz.

### 12.2 Gelecek genişlemeler (bu spec dışı)

- Şarkıyı anı düzenlerken değiştirme (anı düzenleme akışı eklenirse).
- Chat MusicCard'ın da Spotify'a geçmesi (kapsam dışı — şu anda iTunes'la kalıyor).
- Spotify dışı kaynak desteği (sadece Premium yokken kullanılabilecek bir alternatif).
- Trimmer'da gerçek waveform (Spotify `audio-analysis` endpoint'inden).

---

## 13. Manuel kurulum kontrol listesi

Bu spec implementasyonu **kullanıcı tarafında şu adımların tamamlanmasına bağlı**:

- [x] Spotify Developer App oluşturuldu (`Paeonia`, 2026-05-24)
- [x] Client ID alındı ve `.env.local`'a yazıldı (`NEXT_PUBLIC_SPOTIFY_CLIENT_ID`)
- [x] `.env.local.example` placeholder + talimatlarla güncellendi
- [ ] **Redirect URIs Spotify Dashboard'a kaydedildi:**
  - `http://127.0.0.1:3000/auth/spotify/callback`
  - `https://paeoniam.vercel.app/auth/spotify/callback`
- [ ] **APIs/SDKs seçildi:** Web API + Web Playback SDK
- [ ] **User Management**: hem kullanıcı hem partnerin Spotify e-mail'i eklendi
- [ ] **Vercel env değişkeni**: `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` Production + Preview + Development'a eklendi

İmplementasyona başlamadan önce ilk 3 kontrol kutusu zaten yapıldı; diğer 4 kutu deploy + ilk login öncesi kapatılmalı.

---

## 14. Mevcut Vercel/Firebase entegrasyonu üzerine etkiler

- **Vercel:** Tek yeni env değişkeni (`NEXT_PUBLIC_SPOTIFY_CLIENT_ID`). Build pipeline değişmiyor.
- **Firebase:**
  - Yeni Cloud Function YOK.
  - Yeni Firestore koleksiyonu YOK (`users/{uid}` doc'una iki alan ekleniyor).
  - `firestore.rules`: doğrulama gerekli (alan bazında allowlist varsa genişletilecek).
- **Service Worker / PWA:** Etkilenmez. Spotify SDK script'i runtime'da yükleniyor, precache'e girmiyor.
- **Önbellek:** Yok — tüm Spotify çağrıları HTTPS REST, browser cache yeterli.

---

## 15. Karar özeti

| Karar | Seçim |
|---|---|
| Kaynak | Spotify Web Playback SDK + Web API |
| Auth | Authorization Code with PKCE (server gerekmez) |
| Kapsam | Sadece anılar (chat MusicCard değişmez) |
| Trim | 5–30 sn, 2 tutamak, 1 sn snap, default 15 sn |
| Oynatma | Loop, 250ms polling ile seek-to-start |
| Fallback | Bağlı değilse "Spotify'a bağlan" CTA + metadata görünür |
| Eski anılar | iTunes path korundu, kırılmaz |
| Yeni env | `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` (sadece bu) |
| Manuel kurulum | Spotify Developer App + User Management + Redirect URIs + Vercel env |
| Yeni NPM paketi | Yok |
| Yeni Cloud Function | Yok |
