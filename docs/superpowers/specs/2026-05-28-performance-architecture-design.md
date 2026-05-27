# Performance Architecture — Tasarım Dokümanı

**Tarih:** 2026-05-28
**Durum:** Onaylandı, plan yazımına geçilecek
**Kapsam:** Paeonia (paeoniam) — Next.js 14 App Router + Firebase

---

## 1. Amaç ve kapsam

Mevcut uygulamada performans iki yönden iyileştirilecek:

1. **Gözlemlenebilirlik (ölçüm):** Vercel Speed Insights + Vercel Analytics + Firebase Performance Monitoring ile gerçek kullanıcı metrikleri toplanacak.
2. **Mimari iyileştirme:** Mevcut `src/lib/*` veri dosyalarının üstüne ince bir hook + registry + telemetry katmanı eklenerek dedup, pagination, stale-while-revalidate ve trace eklenecek.

**Hedef ağrı noktaları:** Firestore/RTDB veri akışı, medya yükleme/gösterme, sayfalar arası geçiş.

**Açıkça kapsam dışı:**
- Yeni özellik geliştirme
- Test altyapısı kurulumu (ayrı bir spec'e bırakıldı — bkz. Test stratejisi)
- Cloud Functions optimizasyonu (`functions/` dizini)
- Firestore index yeniden tasarımı
- Service worker / next-pwa yeniden konfigürasyonu (sadece "yeni sürüm var" banner'ı eklenecek)

**Yaklaşım:** "Önce ölç, sonra optimize et." Faz 1'de baseline metrik topla; faz 2-5'te her PR sonrası 48 saat metrik gözle, iyileşmeyi doğrula, sonra ilerle.

---

## 2. Üst düzey mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                      React komponentler                          │
│         (MessageList, LiveCanvas, MemoriesPage, ...)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ kullanırlar →
┌────────────────────────────▼────────────────────────────────────┐
│  HOOKS KATMANI (src/lib/hooks/)                                  │
│  useMessages, useLiveCanvas, useMemories, useMedia, ...          │
│  • dedup (aynı sorgu 2 yerden istense tek subscription)          │
│  • pagination state (cursor, hasMore)                            │
│  • stale-while-revalidate (cache → snapshot)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ çağırırlar →
┌────────────────────────────▼────────────────────────────────────┐
│  DATA KATMANI (src/lib/*.ts — mevcut dosyalar)                   │
│  messages.ts, liveCanvas.ts, memories.ts, storage.ts, ...        │
│  • Firestore/RTDB/Storage SDK çağrıları (DEĞİŞMİYOR)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ her çağrı süresini ölçer →
┌────────────────────────────▼────────────────────────────────────┐
│  TELEMETRY (src/lib/telemetry/)                                  │
│  • Vercel Speed Insights → Web Vitals (otomatik)                 │
│  • Vercel Analytics      → custom events (route timing)          │
│  • Firebase Perf trace   → her Firestore/Storage çağrısı         │
└─────────────────────────────────────────────────────────────────┘
```

### Üç anahtar mimari karar

1. **Mevcut `src/lib/*.ts` dosyaları silinmiyor, üstlerine sarılıyor.** Mevcut public API'ler korunur (mevcut komponentler kırılmaz); küçük internal değişiklikler olabilir (örn. `liveCanvas.ts` `onValue` → `onChildRemoved`, `storage.ts` ek varyant fonksiyonları). Komponentler kademeli olarak `useX()` hook'larına geçer. Sıfır big-bang.
2. **Hooks katmanı module-scoped registry tutar.** Aynı sorgu 2 komponent tarafından istense Firestore'a tek `onSnapshot` gider; ref-count'la unsubscribe yönetilir.
3. **Telemetri pasif yan-etki.** Veri katmanı `trace(name, fn)` helper'ından geçirilir; production dışında runtime maliyeti yok.

---

## 3. Klasör yapısı ve yeni dosyalar

```
src/lib/
├── firebase.ts                  (değişmiyor)
├── messages.ts                  (değişmiyor — alt katman)
├── liveCanvas.ts                (onValue → onChildRemoved değişimi hariç)
├── memories.ts                  (değişmiyor)
├── plans.ts                     (değişmiyor)
├── storage.ts                   (responsive variant eklenir)
│
├── hooks/                       ✦ YENİ
│   ├── useMessages.ts           (pagination + dedup)
│   ├── useLiveCanvas.ts         (tek listener)
│   ├── useMemories.ts
│   ├── usePlans.ts
│   └── useMedia.ts              (responsive image src builder)
│
├── registry/                    ✦ YENİ
│   ├── subscriptionRegistry.ts  (key → {unsubscribe, refCount, lastValue})
│   └── mediaCache.ts            (URL → {thumb, medium, full})
│
└── telemetry/                   ✦ YENİ
    ├── trace.ts                 (Firebase Perf wrapper: trace(name, fn))
    ├── vitals.ts                (web-vitals → Vercel Analytics relay)
    └── events.ts                (route timing, custom events)

src/app/
├── layout.tsx                   (+<SpeedInsights/>, +<Analytics/>)
└── (route)/page.tsx             (her sayfa: useEffect → reportRouteReady())

scripts/
└── perf-budget.mjs              ✦ YENİ — bundle size budget check
```

### Dosya sorumlulukları

| Dosya | Sorumluluk | Bağımlılığı |
|---|---|---|
| `subscriptionRegistry.ts` | Aynı Firestore/RTDB query için tek listener; ref-count 0'a inince unsubscribe (30s grace ile) | Firebase SDK |
| `mediaCache.ts` | Storage URL'lerinin (thumb/medium/full) eşlemesini in-memory tutar | `storage.ts` |
| `trace.ts` | `trace("messages.subscribe", () => …)` → Firebase Perf custom trace + Vercel event | `firebase/performance`, `@vercel/analytics` |
| `vitals.ts` | `onCLS/onLCP/onINP/onFCP/onTTFB` → `track()` ile Vercel'e | `web-vitals`, `@vercel/analytics` |
| `events.ts` | `reportRouteReady(name)`, `event(name, data)` helper'ları | `@vercel/analytics` |
| `useMessages.ts` | Pagination (50/sayfa), cursor, optimistic mark-read | `subscriptionRegistry`, `messages.ts` |
| `useLiveCanvas.ts` | Tek listener + rAF stroke batching | `subscriptionRegistry`, `liveCanvas.ts` |
| `useMedia.ts` | `srcSet` builder (thumb/medium/full) | `mediaCache.ts` |

### Eklenecek bağımlılıklar

| Paket | Boyut (gzip) | Amaç |
|---|---|---|
| `@vercel/analytics` | ~3kB | Custom event tracking |
| `@vercel/speed-insights` | ~2kB | Web Vitals otomatik gönderim |
| `web-vitals` | ~1.5kB | FCP/LCP/CLS/INP/TTFB ölçümü |
| Firebase Performance Monitoring | ~7kB | Custom trace + network trace (mevcut firebase SDK içinde, lazy import) |

Toplam telemetri overhead: ~13-14kB gzip.

### Bütçeler (Faz 6 sonu hedefleri)

- **LCP (mobil, 4G p75):** < 2.5s (/home, /chat)
- **INP (p75):** < 200ms
- **CLS (p75):** < 0.1
- **First-load JS / route:** < 180kB gzip
- **Chat ilk Firestore okuması:** ≤ 50 doc (mevcut 200'den düşüyor)
- **/home → /chat transition:** < 500ms

---

## 4. Veri akışı — üç kritik senaryo

### 4.1 Senaryo A — İlk açılış: kullanıcı `paeoniam.vercel.app` açıyor

```
1. HTML/JS yüklenir
   └─ <SpeedInsights/> + <Analytics/>     ← Vercel otomatik metrik
   └─ web-vitals lazy import (idle'da)    ← FCP/LCP/CLS/INP başlar

2. Auth check (mevcut akış)
   └─ trace("auth.bootstrap", …)          ← Firebase Perf trace

3. /home mount
   └─ useEffect: reportRouteReady("home") ← Vercel custom event
   └─ Firebase Perf otomatik network trace (Firestore okumaları)

4. Idle (300ms sonra)
   └─ Prefetch: /chat (next/link prefetch zaten yapar)
   └─ Prefetch: en son 10 mesajı önbelleğe al → ilk tıkta INP < 100ms
```

**Anahtar değişiklik:** `layout.tsx`'deki `SpotifyPlayerProvider` `dynamic(() => …, { ssr: false })` ile sarılır + `requestIdleCallback` arkasına gizlenir. Chat'e gitmeden Spotify SDK yüklenmez.

### 4.2 Senaryo B — Navigasyon: `/home` → `/chat`

```
TIK
 │
 ├─ next/link prefetch chunk'ı zaten hazır (Next 14 default)
 │
 ├─ useMessages(uid) mount edilir
 │   │
 │   ├─ registry.lookup("messages:default")
 │   │   ├─ HIT  → cached array'i hemen döndür (stale UI)
 │   │   └─ MISS → subscribeMessages(pageSize=50, orderBy desc)
 │   │               + trace("messages.first-snapshot")
 │   │
 │   └─ onSnapshot → kayıt registry'de tutulur, refCount++
 │
 └─ reportRouteReady("chat")   ← LCP candidate fire eder

ÇIKIŞ (/chat unmount)
 │
 └─ useMessages cleanup → refCount--
     └─ refCount === 0 ise: 30s grace period sonra unsubscribe
        (kullanıcı hemen geri dönerse subscription canlı kalır)
```

**Üç davranış değişikliği:**
1. **Stale-while-revalidate:** Önce cache'i göster, sonra fresh snapshot geldikçe güncelle. /chat'e ikinci girişte boş ekran yok.
2. **Pagination:** İlk yük 50 mesaj, scroll-up'ta `loadMore()` cursor ile 50'şer ekler.
3. **30s grace unsubscribe:** /home ↔ /chat zıplamada Firestore connection re-establish maliyeti ödenmez.

### 4.3 Senaryo C — Canlı güncelleme: live canvas + yeni mesaj

```
useLiveCanvas() — tek dosyada konsolide
 │
 ├─ subscribeLiveCanvas() çağrısı bir kez gider
 │   • onChildAdded   → stroke ekle
 │   • onChildChanged → stroke güncelle (throttle 60ms)
 │   • onChildRemoved → stroke sil
 │   • onValue KALDIRILDI (clear, root === null check ile)
 │
 └─ Stroke render: requestAnimationFrame batching
     • Birden fazla peer stroke aynı frame'de gelirse tek draw call

useMessages() yeni mesaj geldi
 │
 ├─ onSnapshot delta = "added"
 │   └─ trace("messages.delta", { count: 1 })
 │
 └─ Optimistic mark-read: kullanıcı baloncuğu görünür alana girince
     IntersectionObserver → markRead(id) → debounce 400ms
     (her mesaj için ayrı write değil, batch update)
```

**Anahtar değişiklik:** `liveCanvas.ts`'deki **3 listener → 2 listener** + `onValue`'nun tüm subtree'yi getirme sorunu çözülür.

### 4.4 Veri akışı invariant'ları

| Invariant | Nasıl korunur |
|---|---|
| Aynı sorgu için tek listener | `subscriptionRegistry` ref-count |
| Hook her zaman `data` döner (cache > null) | Stale-while-revalidate |
| Her Firestore/Storage çağrısı trace'lenir | `trace()` zorunlu wrapper |
| Telemetri kapalıyken (dev) sıfır maliyet | `if (process.env.NODE_ENV === "production")` guard |
| Optimistic write hatada rollback | hook `useTransition` + local override stack |

---

## 5. Hata yönetimi ve edge case'ler

### 5.1 Hata davranış matrisi

| Hata kaynağı | Belirti | Davranış | Telemetri |
|---|---|---|---|
| Firestore offline | `onSnapshot` error | Cache göstermeye devam et + üst banner: "Çevrimdışı — son senkron HH:MM" | `trace.fail("messages.offline")` + event `offline_session_start` |
| RTDB permission denied | Live canvas çizim atılamıyor | Tuval read-only mod + "Bağlantı yok" badge | `event("rtdb.denied", { path })` |
| Storage upload fail | `uploadBytes` reject | 3x retry (0.5s, 2s, 8s exp) → son hata: "Tekrar dene" CTA, blob localStorage'da | `trace.fail("storage.upload", { attempt })` |
| Auth expire mid-session | onSnapshot 401 | Mevcut akış (login redirect), önce cache localStorage'a flush | `event("auth.session_lost")` |
| Firebase Perf SDK init fail | Perf SDK yüklenemiyor | `trace()` no-op'a düşer, app etkilenmez | console.warn (silent) |
| Vercel Analytics blocked (adblock) | `track()` sessizce kaybolur | App etkilenmez | yok (beklenen) |
| Bundle chunk load fail | "ChunkLoadError" | Otomatik bir kez reload + döngü koruması (5dk'da max 1) | `event("chunk.load_fail")` |

### 5.2 Rollback senaryoları (optimistic write'lar)

**Mark-read:** UI opaklaşır → updateDoc → hata olursa local override stack'ten kaldır → UI eski hale + toast.

**Favori toggle:** Yıldız dolu görünür → updateDoc → hata olursa boşalır + toast.

**Mesaj gönderme:** Firestore yerleşik offline queue'su kullanılır, dokunulmaz.

### 5.3 Edge case kontrol listesi

- **Hot reload (dev):** `if (module.hot) module.hot.dispose(() => registry.clear())`
- **Window blur 30+ dk:** `onVisibilityChange` ile re-subscribe, cache snapshot'tan diff
- **2 tab aynı kullanıcı:** her tab kendi registry'si, Firestore multi-tab persistence korunur
- **PWA standalone mod:** Speed Insights `navigator.standalone` flag'ini event'e ekler
- **Service Worker eski cache:** `reloadOnOnline: true` mevcut; ek olarak SW `skipWaiting` + "Yeni sürüm var, yenile" banner'ı
- **PerformanceObserver desteklenmeyen tarayıcı:** `web-vitals` zaten graceful skip
- **Firebase Perf throttling:** ilk 5dk sample'lar; doc'a not düşülür

### 5.4 Mimari rollback planı

| Aşama | Geri alma | Süre |
|---|---|---|
| Telemetri (faz 1) | `<SpeedInsights/>` + `<Analytics/>` kaldır, perf SDK init yorum satırı | 5 dk |
| Hooks katmanı (faz 2-4) | Komponentler direkt `subscribeMessages()`'a geri dönerler | per-komponent 10-15 dk |
| Registry (faz 2-4) | `subscriptionRegistry.lookup` her zaman MISS dön | 2 dk |

Her faz `main`'e ayrı PR olarak gider, bağımsız revert edilebilir.

---

## 6. Test stratejisi

Bu spec **otomatik test altyapısı KURMUYOR**. Performans işi davranış değil ölçüm değiştiriyor; doğrulama gerçek metriklerden gelir. İki minimal güvence:

1. **Manuel smoke matrix** her faz sonu (aşağıda)
2. **Bundle budget script** (`scripts/perf-budget.mjs`): `next build` çıktısını parse eder, route bazında first-load JS > 180kB ise fail. Lokal pre-push hook'una bağlanır (CI'a değil).

Test altyapısı (Vitest + RTL) **ayrı bir spec'e** bırakıldı. Yapılırsa kapsam: `subscriptionRegistry` ref-counting, `useMessages` pagination cursor, optimistic rollback.

### Manuel smoke matrix (her faz sonu)

| Senaryo | Beklenen |
|---|---|
| Soğuk açılış → /home → /chat → /memories → /album → /home | Hiç beyaz ekran yok, her transition ≤ 500ms |
| Chat'te 200+ mesaj geçmişi varken aç | İlk 50 yüklenir, scroll-up'ta 50'şer eklenir |
| Live canvas: iki cihaz 30sn boyunca çizim | Stroke'lar < 100ms latency, drop yok |
| Foto yükle (10MB) | Resize sonrası ~600KB, upload < 3s (4G) |
| Çevrimdışı mod (devtools throttle: offline) | Cache görünür, banner çıkar, online'da senkron |
| /chat → /home → 5sn sonra /chat | Firestore re-subscribe ETMEZ (grace) |
| /chat → /home → 60sn sonra /chat | Firestore re-subscribe EDER (grace expired) |

---

## 7. Rollout faz planı

```
FAZ 1 — Telemetri (1 PR, ~3-4 saat)
  • @vercel/analytics, @vercel/speed-insights, web-vitals install
  • layout.tsx'e <SpeedInsights/> + <Analytics/>
  • src/lib/telemetry/{trace,vitals,events}.ts
  • Firebase Performance Monitoring init (firebase.ts'te)
  ✓ Çıktı: Vercel + Firebase Perf dashboard'da 48 saat baseline veri
  ⚠ Bu fazda performansı İYİLEŞTİRMİYORUZ, sadece ölçüyoruz.

FAZ 2 — Subscription registry + useMessages (1 PR, ~4-5 saat)
  • src/lib/registry/subscriptionRegistry.ts
  • src/lib/hooks/useMessages.ts (pagination 50/sayfa, cursor)
  • messages.ts'e subscribeMessagesPaginated() eklenir (eski subscribeMessages dokunulmaz)
  • MessageList.tsx → useMessages() kullanmaya geç
  ✓ Çıktı: chat ilk yük süresi düşüş, Firestore okuma düşüş

FAZ 3 — Live canvas konsolidasyonu + useLiveCanvas (1 PR, ~2-3 saat)
  • liveCanvas.ts: onValue kaldır, onChildRemoved ekle
  • src/lib/hooks/useLiveCanvas.ts (rAF batching)
  • LiveCanvas.tsx → useLiveCanvas() kullan
  ✓ Çıktı: RTDB bandwidth düşüş, frame drop yok

FAZ 4 — Medya: responsive variants + useMedia (1 PR, ~4 saat)
  • storage.ts: uploadPhoto → thumb (300px) + medium (800px) + full (1800px)
  • src/lib/registry/mediaCache.ts
  • src/lib/hooks/useMedia.ts (srcSet builder)
  • Lightbox + Collage + MessageBubble → useMedia()
  ✓ Çıktı: LCP iyileşmesi (/album, /memories)

FAZ 5 — Spotify lazy + route prefetch tuning (1 PR, ~2-3 saat)
  • SpotifyPlayerProvider → dynamic + requestIdleCallback
  • /chat'te SDK init, diğer route'larda skip
  • next/link prefetch stratejisi: /home → sadece /chat prefetch
  • /home idle'da son 10 mesajı subscriptionRegistry'ye prewarm (4.1 senaryosu)
  ✓ Çıktı: ilk açılış JS budget düşüş, TTI iyileşmesi, /chat ilk tıkta INP < 100ms

FAZ 6 — Bundle budget + dokümantasyon (1 PR, ~1 saat)
  • scripts/perf-budget.mjs
  • pre-push hook (native git hook, husky değil)
  • README'ye "Performance" bölümü
  ✓ Çıktı: regresyon koruması aktif
```

**Toplam:** 6 PR, ~17 saat efor, ~2 hafta takvim (her PR'da 48 saat metrik toplama bekleniyor).

**Kritik kural:** Faz 2-5 arası her PR sonrası 48 saat baseline gözlenir, sonra ileri gidilir. "Bu iyileştirme metrikleri gerçekten oynattı mı?" cevaplanmadan ileri yok.

---

## 8. Başarı kriterleri

Spec başarılı sayılır eğer 6 faz sonunda Vercel Speed Insights'ta:

| Metrik | Baseline (faz 1 sonu) | Hedef (faz 6 sonu) |
|---|---|---|
| **LCP (p75, mobil)** | ölçülecek | **< 2.5s** |
| **INP (p75, mobil)** | ölçülecek | **< 200ms** |
| **CLS (p75)** | ölçülecek | **< 0.1** |
| **/chat first-load JS** | ölçülecek | **< 180kB gzip** |
| **/home → /chat transition** | ölçülecek | **< 500ms** |
| **Firestore reads/session** | ölçülecek | **% 40 düşüş** |
| **Faz başına regresyon** | yok | **hiçbir metrik %5'ten fazla kötüleşmemeli** |

"ölçülecek" hücreleri faz 1 PR'ı merge olduktan 48 saat sonra bu spec'e geri yazılır.

---

## 9. Açık kararlar / ileride bakılacak

- Test altyapısı (Vitest + RTL) ayrı bir spec'e bırakıldı.
- Cloud Functions optimizasyonu (`functions/`) ayrı bir konu.
- Firestore index audit ayrı bir konu.
- Eğer Faz 2-5 sonrası INP hala yüksekse, **React Query'ye geçiş** (Yaklaşım B) ikinci dalga olarak değerlendirilebilir.
