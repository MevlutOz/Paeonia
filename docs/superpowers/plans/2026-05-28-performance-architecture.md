# Performance Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel Speed Insights + Vercel Analytics + Firebase Performance Monitoring tabanlı bir telemetri katmanı kurmak, üzerine `src/lib/hooks/` + `src/lib/registry/` katmanları ekleyerek Firestore/RTDB subscription'ları dedup + pagination + grace-period unsubscribe ile yönetmek, medya için responsive varyantlar üretmek ve Spotify provider'ı lazy hale getirmek.

**Architecture:** Mevcut `src/lib/*.ts` veri katmanı dokunulmadan kalır; üstüne ince bir hooks/registry/telemetry katmanı eklenir. Komponentler kademeli olarak yeni hook'lara taşınır. Her faz ayrı PR; her PR sonrası 48 saat metrik gözlenir.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firebase 11 (Firestore + RTDB + Storage + Performance Monitoring), `@vercel/analytics`, `@vercel/speed-insights`, `web-vitals`.

**Spec referansı:** `docs/superpowers/specs/2026-05-28-performance-architecture-design.md`

---

## Önemli notlar (her tasktan önce oku)

- **TDD yok:** Bu proje otomatik test altyapısı kurmuyor. Her task'ın doğrulaması ya `npm run build` (bundle), ya `npm run dev` + tarayıcı (smoke), ya Vercel/Firebase dashboard kontrolüdür. Verifikasyon adımları "test çalıştır" değil "şu komutu çalıştır + şuna bak"dır.
- **Faz sonu 48 saat:** Faz 1-5'in son task'ı "preview deploy + 48 saat metrik gözle". Bu süre boyunca bir sonraki faza geçilmez. Plan'ı subagent-driven execute ediyorsan, faz checkpoint'lerinde **mutlaka** user'a check-in yap.
- **Branch stratejisi:** Her faz için ayrı feature branch (`perf/faz-1-telemetri`, `perf/faz-2-messages`, vb.). Her faz `main`'e merge edildikten sonra deploy otomatik (Vercel `main` push trigger'lı).
- **Geri uyumluluk:** Faz 2-5'te mevcut `src/lib/*.ts` public API'ları KORUNUR. Yeni fonksiyonlar yanına eklenir. Bu sayede her faz bağımsız revert edilebilir.
- **Sıfır gizli sırlar:** `package.json`'da `private: true` zaten var; eklenecek paketlerin tamamı public. `vercel env pull` veya `.env.local` yok.

---

## File Structure

Bu plan sonunda var olacak dosyalar:

```
src/lib/
├── firebase.ts                  (modified: Performance Monitoring init)
├── messages.ts                  (modified: + subscribeMessagesPaginated, + markReadBatch)
├── liveCanvas.ts                (modified: onValue → onChildRemoved)
├── storage.ts                   (modified: + uploadPhotoVariants, + photoVariantUrl)
│
├── hooks/                       ✦ YENİ
│   ├── useMessages.ts
│   ├── useLiveCanvas.ts
│   └── useMedia.ts
│
├── registry/                    ✦ YENİ
│   ├── subscriptionRegistry.ts
│   └── mediaCache.ts
│
└── telemetry/                   ✦ YENİ
    ├── trace.ts
    ├── vitals.ts
    └── events.ts

src/app/
├── layout.tsx                   (modified: + <SpeedInsights/>, + <Analytics/>, + dynamic Spotify)
├── home/page.tsx                (modified: + reportRouteReady + prefetch idle)
└── chat/page.tsx                (modified: useMessages'a geç)

src/components/
├── LiveCanvas.tsx               (modified: useLiveCanvas'a geç)
├── Lightbox.tsx                 (modified: useMedia'ya geç)
├── Collage.tsx                  (modified: useMedia'ya geç)
└── MessageBubble.tsx            (modified: useMedia'ya geç)

scripts/
└── perf-budget.mjs              ✦ YENİ

README.md                         (modified: + Performance section)
```

---

# FAZ 1 — Telemetri Tabanı (~3-4 saat)

**Amaç:** Vercel Speed Insights, Vercel Analytics, web-vitals ve Firebase Performance Monitoring'i devreye al. Bu fazda performans İYİLEŞMİYOR; sadece ölçülüyor.

**Branch:** `perf/faz-1-telemetri`

---

### Task 1.1: Branch oluştur ve paketleri yükle

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Yeni branch aç**

```bash
git checkout main
git pull
git checkout -b perf/faz-1-telemetri
```

- [ ] **Step 2: Paketleri yükle**

```bash
npm install @vercel/analytics @vercel/speed-insights web-vitals
```

- [ ] **Step 3: Yüklendiğini doğrula**

`package.json` dependencies bloğunda şu satırlar görünmeli (versiyon farklı olabilir):

```json
"@vercel/analytics": "^1.x.x",
"@vercel/speed-insights": "^1.x.x",
"web-vitals": "^4.x.x"
```

Komut: `npm list @vercel/analytics @vercel/speed-insights web-vitals` — üçü de "deduped" veya tam versiyon göstermeli.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(perf): install telemetry deps (vercel analytics, speed insights, web-vitals)"
```

---

### Task 1.2: `src/lib/telemetry/trace.ts` oluştur

**Files:**
- Create: `src/lib/telemetry/trace.ts`

- [ ] **Step 1: Dosyayı oluştur**

```ts
"use client";

import type { FirebasePerformance, PerformanceTrace } from "firebase/performance";

let perfPromise: Promise<FirebasePerformance | null> | null = null;

async function getPerf(): Promise<FirebasePerformance | null> {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV !== "production") return null;
  if (perfPromise) return perfPromise;

  perfPromise = (async () => {
    try {
      const [{ getPerformance }, { firebaseApp }] = await Promise.all([
        import("firebase/performance"),
        import("../firebase"),
      ]);
      return getPerformance(firebaseApp());
    } catch {
      return null;
    }
  })();

  return perfPromise;
}

/**
 * Wraps an async/sync function with a Firebase Performance custom trace.
 * In dev mode this is a no-op pass-through.
 *
 *   const messages = await trace("messages.subscribe", () => subscribeMessages(...));
 */
export async function trace<T>(
  name: string,
  fn: () => T | Promise<T>,
  attrs?: Record<string, string>,
): Promise<T> {
  const perf = await getPerf();
  if (!perf) return await fn();

  let t: PerformanceTrace | null = null;
  try {
    const { trace: makeTrace } = await import("firebase/performance");
    t = makeTrace(perf, name);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => t!.putAttribute(k, v));
    }
    t.start();
    const result = await fn();
    return result;
  } finally {
    try {
      t?.stop();
    } catch {}
  }
}

/**
 * Records a one-shot failure. Used by error paths.
 */
export async function traceFail(name: string, attrs?: Record<string, string>): Promise<void> {
  const perf = await getPerf();
  if (!perf) return;
  try {
    const { trace: makeTrace } = await import("firebase/performance");
    const t = makeTrace(perf, name);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => t.putAttribute(k, v));
    t.start();
    t.putAttribute("status", "fail");
    t.stop();
  } catch {}
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata. Hata varsa düzelt, devam etme.

---

### Task 1.3: `src/lib/telemetry/vitals.ts` oluştur

**Files:**
- Create: `src/lib/telemetry/vitals.ts`

- [ ] **Step 1: Dosyayı oluştur**

```ts
"use client";

import { track } from "@vercel/analytics";

let started = false;

/**
 * Lazy-imports web-vitals and forwards CLS/LCP/INP/FCP/TTFB to Vercel Analytics.
 * Safe to call multiple times — only the first call subscribes.
 *
 * Why lazy: web-vitals adds ~1.5kB gzip but we only need it on the client,
 * and only once per page load.
 */
export function startVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  void (async () => {
    try {
      const { onCLS, onLCP, onINP, onFCP, onTTFB } = await import("web-vitals");
      const report = (metric: { name: string; value: number; id: string }) => {
        track("web_vital", {
          name: metric.name,
          value: Math.round(metric.value * 100) / 100,
          id: metric.id,
          pwa: typeof navigator !== "undefined" && "standalone" in navigator
            ? String((navigator as Navigator & { standalone?: boolean }).standalone === true)
            : "false",
        });
      };
      onCLS(report);
      onLCP(report);
      onINP(report);
      onFCP(report);
      onTTFB(report);
    } catch {}
  })();
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

---

### Task 1.4: `src/lib/telemetry/events.ts` oluştur

**Files:**
- Create: `src/lib/telemetry/events.ts`

- [ ] **Step 1: Dosyayı oluştur**

```ts
"use client";

import { track } from "@vercel/analytics";

/**
 * Called from each route's top-level page component when the page has finished
 * its initial render. Used to measure route-to-interactive timing.
 *
 *   useEffect(() => { reportRouteReady("chat") }, []);
 */
export function reportRouteReady(route: string): void {
  if (typeof performance === "undefined") return;
  const t = Math.round(performance.now());
  track("route_ready", { route, ms: t });
}

/**
 * Generic event helper. Use sparingly — Vercel Analytics has a 200 events/sec
 * project-wide budget on the hobby tier.
 */
export function event(
  name: string,
  data?: Record<string, string | number | boolean>,
): void {
  track(name, data ?? {});
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/telemetry/
git commit -m "feat(telemetry): trace + vitals + events helpers"
```

---

### Task 1.5: `src/lib/firebase.ts`'e Performance Monitoring init ekle

**Files:**
- Modify: `src/lib/firebase.ts`

- [ ] **Step 1: Dosyanın son satırına şunu ekle**

`firebase.ts:59` (son satırın altına) ekle:

```ts

/**
 * Initialize Firebase Performance Monitoring. Lazy-imports the SDK so it
 * doesn't ship in non-production builds. Safe to call multiple times.
 *
 * Call this once from the root layout's client boot.
 */
let perfInitStarted = false;
export function initFirebasePerf(): void {
  if (perfInitStarted) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  perfInitStarted = true;
  void import("firebase/performance")
    .then(({ getPerformance }) => {
      getPerformance(firebaseApp());
    })
    .catch(() => {
      perfInitStarted = false; // allow retry on next visit
    });
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

---

### Task 1.6: `src/app/layout.tsx`'e `<SpeedInsights/>` + `<Analytics/>` ekle ve telemetri'yi başlat

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Yeni bir client boot komponenti oluştur**

Create: `src/app/_telemetryBoot.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { startVitals } from "@/lib/telemetry/vitals";
import { initFirebasePerf } from "@/lib/firebase";

/**
 * Mounted once at the root. Boots web-vitals + Firebase Performance Monitoring
 * once the browser is idle (or after 1s as fallback).
 *
 * Idle-deferred so it doesn't compete with LCP-critical work.
 */
export function TelemetryBoot() {
  useEffect(() => {
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
    const run = () => {
      startVitals();
      initFirebasePerf();
    };
    if (typeof idle === "function") {
      idle(run, { timeout: 2000 });
    } else {
      setTimeout(run, 1000);
    }
  }, []);
  return null;
}
```

- [ ] **Step 2: `layout.tsx` import bloğuna ekle**

`src/app/layout.tsx` satır 1-4 arasındaki import bloğunun altına ekle:

```tsx
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { TelemetryBoot } from "./_telemetryBoot";
```

- [ ] **Step 3: `RootLayout` JSX'ini güncelle**

`src/app/layout.tsx:44-58` — `<body>` içindeki içeriği şu hale getir:

```tsx
return (
  <html lang="tr" className={`${playfair.variable} ${quicksand.variable}`}>
    <body className="min-h-dvh">
      <TelemetryBoot />
      <SpotifyPlayerProvider>{children}</SpotifyPlayerProvider>
      <SpeedInsights />
      <Analytics />
    </body>
  </html>
);
```

- [ ] **Step 4: Dev'de smoke test**

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000` aç. Konsolda hata olmamalı. Network sekmesinde `/_vercel/insights/script.js` ve `/_vercel/analytics/script.js` görmemelisin (preview/prod'da görünür).

Console'da `firebase performance` import'undan hata gelmemeli (dev'de zaten no-op).

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit
npm run build
```

Build başarılı olmalı. `next build` çıktısının sonunda `Route (app)` tablosunda `/` için First Load JS değerini not al (Faz 6'da bütçe ile karşılaştıracağız).

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/_telemetryBoot.tsx src/lib/firebase.ts
git commit -m "feat(telemetry): wire SpeedInsights + Analytics + Firebase Perf at root"
```

---

### Task 1.7: PR aç, merge et, 48 saat baseline gözle

- [ ] **Step 1: Push + PR**

```bash
git push -u origin perf/faz-1-telemetri
gh pr create --title "perf: faz 1 — telemetri tabanı" --body "$(cat <<'EOF'
## Summary
- Vercel Speed Insights + Analytics root layout'a eklendi
- Firebase Performance Monitoring init (production-only, lazy)
- web-vitals → Vercel Analytics relay (idle-deferred)
- `trace()`, `traceFail()`, `reportRouteReady()`, `event()` helper'ları

## Etki
Bu PR performansı **iyileştirmiyor**, sadece ölçüyor. Bundle'a ~14kB gzip ekliyor (production-only kısımlar dahil).

## Test plan
- [ ] `npm run dev` → konsol temiz, sayfa açılıyor
- [ ] `npm run build` → başarılı, First Load JS sapması ≤ 20kB
- [ ] Preview deploy → Vercel Speed Insights dashboard'da veri akmaya başlıyor (~15dk)
- [ ] Firebase Console → Performance Monitoring → "Page load" trace'leri görünüyor (1-2 saat sonra)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Review ve merge**

PR review'unu kullanıcıdan iste. Onaylandığında `main`'e merge et. Vercel otomatik prod deploy eder.

- [ ] **Step 3: 48 saat bekle ve baseline'ı spec'e yaz**

48 saat sonra:
1. Vercel Speed Insights dashboard'ı aç (paeoniam projesi)
2. p75 değerlerini oku: LCP, INP, CLS, FCP, TTFB
3. Bundle Analyzer (Vercel Speed Insights → Bundle tab) → `/chat`, `/home`, `/memories`, `/album` First Load JS değerleri
4. Firebase Performance Monitoring → "Network requests" tab → Firestore okuma sayısı/session
5. `docs/superpowers/specs/2026-05-28-performance-architecture-design.md` Section 8 tablosundaki "ölçülecek" hücreleri gerçek sayılarla doldur, commit et:

```bash
git checkout main && git pull
# spec'i düzenle, baseline sayıları yaz
git add docs/superpowers/specs/2026-05-28-performance-architecture-design.md
git commit -m "docs(perf): faz 1 baseline metrikleri spec'e yazıldı"
git push
```

**Bu task tamamlanmadan Faz 2'ye geçme.**

---

# FAZ 2 — Subscription Registry + useMessages (~4-5 saat)

**Amaç:** Mesaj subscription'ını dedup + pagination + 30s grace unsubscribe ile yöneten katmanı kur. /chat ilk yükü 200 → 50 mesaj, ikinci girişte boş ekran yok.

**Branch:** `perf/faz-2-messages`

---

### Task 2.1: Branch + `subscriptionRegistry.ts` oluştur

**Files:**
- Create: `src/lib/registry/subscriptionRegistry.ts`

- [ ] **Step 1: Branch aç**

```bash
git checkout main && git pull
git checkout -b perf/faz-2-messages
```

- [ ] **Step 2: Registry dosyasını oluştur**

```ts
"use client";

type Unsubscribe = () => void;
type Push<T> = (value: T) => void;
type Factory<T> = (push: Push<T>) => Unsubscribe;

interface Entry<T> {
  refCount: number;
  lastValue: T | undefined;
  unsubscribe: Unsubscribe;
  graceTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(v: T) => void>;
}

const GRACE_MS = 30_000;
const registry = new Map<string, Entry<unknown>>();

/**
 * Subscribe to a deduplicated, ref-counted source.
 *
 * If another consumer is already subscribed under the same `key`, this call
 * piggybacks on the existing subscription. When the last consumer unsubscribes,
 * the underlying source is kept alive for GRACE_MS to absorb fast remount
 * cycles (e.g. user bouncing between /home and /chat).
 */
export function subscribeShared<T>(
  key: string,
  factory: Factory<T>,
  listener: (v: T) => void,
): Unsubscribe {
  let entry = registry.get(key) as Entry<T> | undefined;

  if (entry) {
    if (entry.graceTimer) {
      clearTimeout(entry.graceTimer);
      entry.graceTimer = undefined;
    }
    entry.refCount++;
    entry.listeners.add(listener);
    if (entry.lastValue !== undefined) listener(entry.lastValue);
  } else {
    const created: Entry<T> = {
      refCount: 1,
      lastValue: undefined,
      unsubscribe: () => {},
      listeners: new Set([listener]),
    };
    created.unsubscribe = factory((v) => {
      created.lastValue = v;
      created.listeners.forEach((l) => l(v));
    });
    registry.set(key, created as Entry<unknown>);
    entry = created;
  }

  return () => {
    const e = entry!;
    e.refCount--;
    e.listeners.delete(listener);
    if (e.refCount === 0) {
      e.graceTimer = setTimeout(() => {
        e.unsubscribe();
        registry.delete(key);
      }, GRACE_MS);
    }
  };
}

/** Test/dev helper. Drops every entry and unsubscribes from sources. */
export function _clearRegistry(): void {
  registry.forEach((e) => {
    if (e.graceTimer) clearTimeout(e.graceTimer);
    e.unsubscribe();
  });
  registry.clear();
}

/** Read-only snapshot for debugging. */
export function _snapshot(): Array<{ key: string; refCount: number; hasValue: boolean }> {
  return Array.from(registry.entries()).map(([key, e]) => ({
    key,
    refCount: e.refCount,
    hasValue: e.lastValue !== undefined,
  }));
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/subscriptionRegistry.ts
git commit -m "feat(registry): subscriptionRegistry with ref-counting + grace unsubscribe"
```

---

### Task 2.2: `messages.ts`'e paginated subscribe + batch markRead ekle

**Files:**
- Modify: `src/lib/messages.ts`

- [ ] **Step 1: Mevcut import bloğunu güncelle**

`src/lib/messages.ts:1-19` arasındaki import bloğunu şununla değiştir:

```ts
"use client";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  limit,
  writeBatch,
  getDocs,
  where,
  startAfter,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { trace } from "./telemetry/trace";
import type { Message, MessageType } from "./types";
import { detectMusicLink } from "./links";
```

- [ ] **Step 2: Dosyanın sonuna paginated subscribe ekle**

`src/lib/messages.ts`'in sonuna (mevcut `toggleFavorite` fonksiyonundan sonra) ekle:

```ts

function docToMessage(d: QueryDocumentSnapshot | DocumentSnapshot): Message {
  const data = d.data() as Record<string, unknown> | undefined;
  return {
    id: d.id,
    senderId: (data?.senderId as string) ?? "",
    type: (data?.type as MessageType) ?? "text",
    content: (data?.content as string) ?? "",
    createdAt: data?.createdAt ?? null,
    isRead: !!data?.isRead,
    isRevealed: !!data?.isRevealed,
    isFavorited: !!data?.isFavorited,
  };
}

/**
 * Paginated newest-first subscription. Returns an unsubscribe + a `loadMore`
 * fn that extends the window backwards in time. The caller must merge added
 * docs into its own state (we never reorder for them).
 *
 * NOTE: `subscribeMessages` (the legacy fn) is intentionally kept around so
 * older callers don't break during the migration. Delete it once every
 * consumer is on `subscribeMessagesPaginated`.
 */
export function subscribeMessagesPaginated(
  cb: (delta: { added: Message[]; modified: Message[]; removed: string[] }, initial: boolean) => void,
  pageSize = 50,
): { unsubscribe: () => void; loadMore: () => Promise<number> } {
  const baseQ = query(
    collection(firestore(), MESSAGES),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  );

  let oldestCursor: QueryDocumentSnapshot | null = null;
  let firstSnapshot = true;

  const unsubscribe = onSnapshot(baseQ, (snap) => {
    const added: Message[] = [];
    const modified: Message[] = [];
    const removed: string[] = [];
    snap.docChanges().forEach((change) => {
      if (change.type === "added") added.push(docToMessage(change.doc));
      else if (change.type === "modified") modified.push(docToMessage(change.doc));
      else if (change.type === "removed") removed.push(change.doc.id);
    });
    if (!snap.empty) {
      oldestCursor = snap.docs[snap.docs.length - 1];
    }
    cb({ added, modified, removed }, firstSnapshot);
    firstSnapshot = false;
  });

  async function loadMore(): Promise<number> {
    if (!oldestCursor) return 0;
    return trace(
      "messages.loadMore",
      async () => {
        const moreQ = query(
          collection(firestore(), MESSAGES),
          orderBy("createdAt", "desc"),
          startAfter(oldestCursor!),
          limit(pageSize),
        );
        const snap = await getDocs(moreQ);
        if (snap.empty) return 0;
        oldestCursor = snap.docs[snap.docs.length - 1];
        cb(
          { added: snap.docs.map(docToMessage), modified: [], removed: [] },
          false,
        );
        return snap.docs.length;
      },
      { pageSize: String(pageSize) },
    );
  }

  return { unsubscribe, loadMore };
}

/**
 * Batch-mark a list of message IDs as read. Replaces N individual updateDoc
 * calls (which used to fire on every IntersectionObserver hit) with one
 * Firestore batch write.
 */
export async function markReadBatch(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  return trace(
    "messages.markReadBatch",
    async () => {
      const batch = writeBatch(firestore());
      messageIds.forEach((id) => {
        batch.update(doc(firestore(), MESSAGES, id), { isRead: true });
      });
      await batch.commit();
    },
    { count: String(messageIds.length) },
  );
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages.ts
git commit -m "feat(messages): paginated subscribe + batch markRead with traces"
```

---

### Task 2.3: `useMessages` hook'u oluştur

**Files:**
- Create: `src/lib/hooks/useMessages.ts`

- [ ] **Step 1: Hook dosyasını oluştur**

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeShared } from "../registry/subscriptionRegistry";
import { subscribeMessagesPaginated, markReadBatch } from "../messages";
import type { Message } from "../types";

interface UseMessagesState {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
}

interface SharedState {
  messages: Map<string, Message>;
  hasMore: boolean;
  loadMore: () => Promise<number>;
}

const PAGE_SIZE = 50;
const KEY = `messages:page=${PAGE_SIZE}`;

/**
 * Stale-while-revalidate hook around Firestore messages. Multiple components
 * subscribing share a single onSnapshot via subscriptionRegistry.
 */
export function useMessages(): UseMessagesState & {
  loadMore: () => Promise<number>;
  markVisibleAsRead: (ids: string[]) => void;
} {
  const [state, setState] = useState<UseMessagesState>({
    messages: [],
    loading: true,
    hasMore: true,
  });
  const sharedRef = useRef<SharedState | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeShared<SharedState>(
      KEY,
      (push) => {
        const local: SharedState = {
          messages: new Map(),
          hasMore: true,
          loadMore: async () => 0, // overwritten below
        };
        const { unsubscribe: u, loadMore } = subscribeMessagesPaginated((delta, initial) => {
          delta.added.forEach((m) => local.messages.set(m.id, m));
          delta.modified.forEach((m) => local.messages.set(m.id, m));
          delta.removed.forEach((id) => local.messages.delete(id));
          if (initial && delta.added.length < PAGE_SIZE) local.hasMore = false;
          push({ ...local, messages: new Map(local.messages) });
        }, PAGE_SIZE);
        local.loadMore = async () => {
          const got = await loadMore();
          if (got < PAGE_SIZE) {
            local.hasMore = false;
            push({ ...local, messages: new Map(local.messages) });
          }
          return got;
        };
        return u;
      },
      (shared) => {
        sharedRef.current = shared;
        const sorted = Array.from(shared.messages.values()).sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number } | null)?.seconds ?? 0;
          const tb = (b.createdAt as { seconds?: number } | null)?.seconds ?? 0;
          return ta - tb;
        });
        setState({ messages: sorted, loading: false, hasMore: shared.hasMore });
      },
    );
    return unsubscribe;
  }, []);

  const loadMore = useCallback(async () => {
    return sharedRef.current?.loadMore() ?? 0;
  }, []);

  const pendingReadsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markVisibleAsRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    ids.forEach((id) => pendingReadsRef.current.add(id));
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      const batch = Array.from(pendingReadsRef.current);
      pendingReadsRef.current.clear();
      flushTimerRef.current = null;
      void markReadBatch(batch).catch(() => {
        // Rollback: re-add for next attempt.
        batch.forEach((id) => pendingReadsRef.current.add(id));
      });
    }, 400);
  }, []);

  return { ...state, loadMore, markVisibleAsRead };
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata. Eğer `Message.createdAt` türü farklıysa (örn. `Timestamp | FieldValue`), `useMessages.ts` içindeki sort callback'inin `as { seconds?: number }` cast'ini ona göre düzelt — ama o tür `types.ts`'ten geliyor, değiştirme.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useMessages.ts
git commit -m "feat(hooks): useMessages with shared subscription + debounced batch read"
```

---

### Task 2.4: `/chat` sayfasını `useMessages`'a taşı

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/components/MessageList.tsx` (optional: IntersectionObserver hook)

- [ ] **Step 1: `src/app/chat/page.tsx` mevcut halini oku**

```bash
cat src/app/chat/page.tsx
```

Mevcutta büyük olasılıkla `subscribeMessages(...)` çağrısı + lokal `useState` + `messages` prop'unu `<MessageList>`'e geçiriyor. Hangi satırlarda olduğunu not al.

- [ ] **Step 2: Mevcut subscribe çağrısını `useMessages` ile değiştir**

`src/app/chat/page.tsx` içinde `subscribeMessages` import'unu kaldır, `useMessages`'ı ekle. `useState<Message[]>` ve `useEffect` ile yapılan abone-ol/abone-bırak bloğunu kaldır.

İmport bloğuna ekle:

```tsx
import { useMessages } from "@/lib/hooks/useMessages";
import { reportRouteReady } from "@/lib/telemetry/events";
```

Komponent body'sinde önceki:

```tsx
const [messages, setMessages] = useState<Message[]>([]);
useEffect(() => {
  return subscribeMessages(setMessages);
}, []);
```

şununla değiştir:

```tsx
const { messages, loading, hasMore, loadMore, markVisibleAsRead } = useMessages();

useEffect(() => {
  if (!loading) reportRouteReady("chat");
}, [loading]);
```

`<MessageList messages={messages} ... />` çağrısı zaten doğru — değişmiyor.

- [ ] **Step 3: `markAllReadFrom` çağrısını batch versiyonuna geçir**

Eğer `src/app/chat/page.tsx` `markAllReadFrom(otherUid)` çağırıyorsa, **DOKUNMA** — bu farklı bir use case (sayfa odağa gelince hepsini okunmuş işaretle). Sadece per-mesaj `markRead` çağrısı varsa kaldır; `MessageList`'in altında IntersectionObserver-driven batch'i sonraki adımda ekleyeceğiz.

- [ ] **Step 4: Smoke test (dev)**

```bash
npm run dev
```

Tarayıcıda:
1. Login → /chat aç. Mesajların yüklendiğini doğrula.
2. /home'a dön, 10 saniye sonra /chat'e geri dön. Mesajlar **anında** görünmeli (boş ekran yok, grace period 30sn).
3. /home'a dön, 60+ saniye bekle, /chat'e geri dön. Bu sefer ufak bir yükleme olabilir (subscription yeniden kuruldu).
4. DevTools Network → "WS" filtre. Yalnızca 1 Firestore websocket görünmeli (önceki davranış 2-3'tü).
5. Console'da hata yok.

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit
npm run build
```

Build çıktısında `/chat` First Load JS değerini Faz 1'deki ile karşılaştır. ±10kB normaldir.

- [ ] **Step 6: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "feat(chat): migrate /chat to useMessages (pagination + grace unsubscribe)"
```

---

### Task 2.5: PR, merge, 48 saat gözle

- [ ] **Step 1: Push + PR**

```bash
git push -u origin perf/faz-2-messages
gh pr create --title "perf: faz 2 — messages registry + pagination" --body "$(cat <<'EOF'
## Summary
- `subscriptionRegistry` ref-count + 30s grace unsubscribe
- `subscribeMessagesPaginated` (50/sayfa, desc, cursor'lı loadMore)
- `markReadBatch` (400ms debounced)
- `useMessages` hook
- `/chat` sayfası yeni hook'a taşındı

## Etki
- `/chat` ilk Firestore okuması 200 → 50 doc
- /home ↔ /chat hızlı zıplamada Firestore re-subscribe yok (30s grace)
- Aynı subscription 2+ komponent tarafından istense tek listener

## Test plan
- [ ] /chat ilk açılış mesajları gösteriyor
- [ ] /home → /chat (10s içinde) → boş ekran yok
- [ ] /home → /chat (60s+ sonra) → re-subscribe ediyor (normal)
- [ ] DevTools WS → 1 Firestore connection
- [ ] Bundle delta ≤ +5kB

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Review + merge**

Kullanıcıya PR'ı incelet. Onaylandığında `main`'e merge.

- [ ] **Step 3: 48 saat gözle**

48 saat sonra Vercel Speed Insights + Firebase Performance'a bak:
- `/chat` LCP düştü mü? (hedef: baseline'a göre %20+ iyileşme)
- `messages.first-snapshot` trace ortanca süresi?
- Firestore okuma sayısı/session düştü mü?

Bulguları `docs/superpowers/specs/2026-05-28-performance-architecture-design.md` Section 8'e ekle (Faz 2 satırı olarak).

**Bu task tamamlanmadan Faz 3'e geçme.**

---

# FAZ 3 — Live Canvas Konsolidasyonu (~2-3 saat)

**Amaç:** RTDB üzerinde 3 listener'dan 2'ye in, `onValue`'nun tüm subtree'yi getirme sorununu çöz, stroke render'ı `requestAnimationFrame` batching'e al.

**Branch:** `perf/faz-3-live-canvas`

---

### Task 3.1: Branch + `liveCanvas.ts` refactor

**Files:**
- Modify: `src/lib/liveCanvas.ts`

- [ ] **Step 1: Branch aç**

```bash
git checkout main && git pull
git checkout -b perf/faz-3-live-canvas
```

- [ ] **Step 2: `src/lib/liveCanvas.ts` dosyasını tamamen şununla değiştir**

```ts
"use client";

import {
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
} from "firebase/database";
import { realtimeDb } from "./firebase";
import { trace } from "./telemetry/trace";

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

/** Open a new stroke node. */
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

/** Clear the shared canvas for both peers. */
export function clearLiveCanvas(): Promise<void> {
  return trace("liveCanvas.clear", () => remove(ref(realtimeDb(), ROOT)));
}

/**
 * Subscribe to the shared canvas.
 *
 * Changes from the prior implementation:
 *   - onValue removed: previously fired with the ENTIRE subtree on every
 *     stroke update. Now we rely on onChildRemoved to detect node deletions,
 *     including the parent clear (which removes every child individually).
 *   - onChildRemoved added: peer-side clear / undo support.
 */
export function subscribeLiveCanvas(handlers: {
  onAdd: (id: string, s: LiveStroke) => void;
  onChange: (id: string, s: LiveStroke) => void;
  onRemove: (id: string) => void;
}): () => void {
  const r = ref(realtimeDb(), ROOT);
  const u1 = onChildAdded(r, (snap) =>
    handlers.onAdd(snap.key as string, snap.val() as LiveStroke),
  );
  const u2 = onChildChanged(r, (snap) =>
    handlers.onChange(snap.key as string, snap.val() as LiveStroke),
  );
  const u3 = onChildRemoved(r, (snap) =>
    handlers.onRemove(snap.key as string),
  );
  return () => {
    u1();
    u2();
    u3();
  };
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen hata: `src/components/LiveCanvas.tsx` içinde `onClear` artık yok (`onRemove` oldu). Bu hatayı bir sonraki task'ta düzelteceğiz.

Eğer başka bir dosya `subscribeLiveCanvas` kullanıyorsa:

```bash
grep -rn "subscribeLiveCanvas\|onClear" src/
```

Çıkanları not al.

- [ ] **Step 4: Commit**

```bash
git add src/lib/liveCanvas.ts
git commit -m "refactor(liveCanvas): drop onValue, add onChildRemoved + trace"
```

---

### Task 3.2: `useLiveCanvas` hook'u oluştur

**Files:**
- Create: `src/lib/hooks/useLiveCanvas.ts`

- [ ] **Step 1: Hook dosyasını oluştur**

```ts
"use client";

import { useEffect, useRef } from "react";
import { subscribeLiveCanvas, type LiveStroke } from "../liveCanvas";

interface Handlers {
  /** Called on add or modify. Multiple deltas in the same frame are coalesced. */
  onUpsert: (id: string, s: LiveStroke) => void;
  /** Called when a stroke is removed (peer clear/undo). */
  onRemove: (id: string) => void;
  /** Called once when all strokes have been removed (parent cleared). */
  onAllCleared: () => void;
}

/**
 * Shared live-canvas subscription with rAF batching. Multiple deltas arriving
 * in the same animation frame are flushed together as a single callback wave,
 * so the consumer only redraws once per frame.
 */
export function useLiveCanvas(handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const pendingUpserts = new Map<string, LiveStroke>();
    const pendingRemoves = new Set<string>();
    let frameQueued = false;
    let activeStrokeIds = new Set<string>();

    const flush = () => {
      frameQueued = false;
      pendingUpserts.forEach((s, id) => {
        handlersRef.current.onUpsert(id, s);
        activeStrokeIds.add(id);
      });
      pendingRemoves.forEach((id) => {
        handlersRef.current.onRemove(id);
        activeStrokeIds.delete(id);
      });
      pendingUpserts.clear();
      pendingRemoves.clear();
      if (activeStrokeIds.size === 0) {
        handlersRef.current.onAllCleared();
      }
    };

    const schedule = () => {
      if (frameQueued) return;
      frameQueued = true;
      requestAnimationFrame(flush);
    };

    const unsubscribe = subscribeLiveCanvas({
      onAdd: (id, s) => {
        pendingRemoves.delete(id);
        pendingUpserts.set(id, s);
        schedule();
      },
      onChange: (id, s) => {
        pendingRemoves.delete(id);
        pendingUpserts.set(id, s);
        schedule();
      },
      onRemove: (id) => {
        pendingUpserts.delete(id);
        pendingRemoves.add(id);
        schedule();
      },
    });

    return () => unsubscribe();
  }, []);
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Aynı `LiveCanvas.tsx` hatası beklenir; bir sonraki adımda çözülecek.

---

### Task 3.3: `LiveCanvas` komponentini yeni hook'a taşı

**Files:**
- Modify: `src/components/LiveCanvas.tsx`

- [ ] **Step 1: Import bloğunu güncelle**

`src/components/LiveCanvas.tsx:1-10` arasındaki import bloğunu şu hale getir:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  type LiveStroke,
  newStroke,
  clearLiveCanvas,
} from "@/lib/liveCanvas";
import { useLiveCanvas } from "@/lib/hooks/useLiveCanvas";
```

(`subscribeLiveCanvas` import'u kaldırıldı.)

- [ ] **Step 2: `useEffect`'teki subscription bloğunu hook çağrısıyla değiştir**

`src/components/LiveCanvas.tsx:95-111` arasındaki `subscribeLiveCanvas({ onAdd, onChange, onClear })` bloğunu **sil**. Yerine, aynı `useEffect`'in ÜSTÜNDE (canvas kurulum useEffect'inin DIŞINDA, komponent body'sinde) ekle:

```tsx
useLiveCanvas({
  onUpsert: (id, s) => {
    if (id === activeId.current) return; // kendi aktif çizgim — yerelde çiziliyor
    strokesRef.current.set(id, s);
    redraw();
  },
  onRemove: (id) => {
    strokesRef.current.delete(id);
    redraw();
  },
  onAllCleared: () => {
    strokesRef.current.clear();
    redraw();
  },
});
```

Mevcut canvas kurulum `useEffect`'i (DPR + scale + initial redraw) AYNI KALSIN; sadece içerdeki `subscribeLiveCanvas` çağrısını ve dönen `unsub` cleanup'ı sil. `redraw()`'u dependency olarak bırak.

`useEffect`'in son hali:

```tsx
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
}, [redraw]);
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 4: Smoke test — iki cihaz**

```bash
npm run dev
```

İki tarayıcı sekmesi aç (veya bir telefon + bir laptop, ikisi de aynı kullanıcılarla login). Her ikisinde de canvas'ı aç.

1. Sekme A'da çiz → sekme B'de görünmeli (latency < 200ms)
2. Sekme B'de çiz → sekme A'da görünmeli
3. Sekme A "Temizle" → her ikisi de temizlenmeli
4. Her iki sekmede aynı anda 30+ stroke çiz → frame drop yok (canvas akıcı)

DevTools Performance tab → "Live Canvas drawing" sırasında JS execution scriptini görmek istersen profile çek; rAF batching sayesinde tek-frame execute göreceksin.

- [ ] **Step 5: Build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/lib/hooks/useLiveCanvas.ts src/components/LiveCanvas.tsx
git commit -m "feat(live-canvas): rAF-batched useLiveCanvas hook + 2-listener model"
```

---

### Task 3.4: PR, merge, 48 saat gözle

- [ ] **Step 1: Push + PR**

```bash
git push -u origin perf/faz-3-live-canvas
gh pr create --title "perf: faz 3 — live canvas konsolidasyonu" --body "$(cat <<'EOF'
## Summary
- `liveCanvas.ts`: onValue → onChildRemoved (her stroke güncellemesinde tüm subtree gelmiyor artık)
- `useLiveCanvas` hook: rAF-batched stroke deltaları
- `LiveCanvas` komponenti yeni hook'a taşındı

## Etki
- RTDB read bandwidth düşüş (stroke update başına 1 değişiklik vs eski 2)
- 30+ peer stroke aynı anda gelirse tek redraw (frame drop yok)

## Test plan
- [ ] İki cihaz, karşılıklı çizim — latency hissedilir değil
- [ ] Temizle — her ikisinde de sıfırlanıyor
- [ ] 30+ stroke spam — frame drop yok

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Review + merge + 48h gözle**

Faz 2'deki ile aynı: PR review, merge, 48 saat sonra Firebase RTDB usage tab → bandwidth ölçümü; spec'e ekle.

**Bu task tamamlanmadan Faz 4'e geçme.**

---

# FAZ 4 — Medya Responsive Varyantlar (~4 saat)

**Amaç:** Foto yüklemede thumb (300px) + medium (800px) + full (1800px) varyantları üret, `mediaCache` ile lookup, `useMedia` ile `srcSet` builder.

**Branch:** `perf/faz-4-media`

---

### Task 4.1: Branch + `storage.ts` varyant fonksiyonları

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Branch aç**

```bash
git checkout main && git pull
git checkout -b perf/faz-4-media
```

- [ ] **Step 2: `storage.ts`'in sonuna varyant upload fonksiyonu ekle**

`src/lib/storage.ts:88` (son fonksiyonun altına) ekle:

```ts

export interface PhotoVariants {
  thumb: string;  // 300px URL
  medium: string; // 800px URL
  full: string;   // 1800px URL
}

/**
 * Upload a photo as three resolutions: thumb (300px max), medium (800px max),
 * full (1800px max). All variants share the same base path with suffixes;
 * callers store only the `full` URL in Firestore and derive others via
 * `photoVariantUrl()`.
 */
export async function uploadPhotoVariants(uid: string, file: File): Promise<PhotoVariants> {
  const [thumbBlob, mediumBlob, fullBlob] = await Promise.all([
    resizeImage(file, 300, 0.78),
    resizeImage(file, 800, 0.82),
    resizeImage(file, 1800, 0.85),
  ]);
  const base = `photos/${uid}/${Date.now()}-${cryptoId()}`;
  const [thumb, medium, full] = await Promise.all([
    uploadAt(`${base}-thumb.jpg`, thumbBlob),
    uploadAt(`${base}-medium.jpg`, mediumBlob),
    uploadAt(`${base}-full.jpg`, fullBlob),
  ]);
  return { thumb, medium, full };
}

async function uploadAt(path: string, blob: Blob): Promise<string> {
  const ref = storageRef(firebaseStorage(), path);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(ref);
}

/**
 * Given any variant URL (or a legacy single-variant URL), return the URL for
 * the requested size. If the URL doesn't follow the variant naming convention,
 * the input is returned unchanged (graceful fallback for legacy uploads).
 */
export function photoVariantUrl(url: string, size: "thumb" | "medium" | "full"): string {
  // Variant URLs look like ".../photos/<uid>/<ts>-<id>-<variant>.jpg?alt=..."
  const m = url.match(/(-thumb|-medium|-full)\.jpg/);
  if (!m) return url;
  return url.replace(m[0], `-${size}.jpg`);
}
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/storage.ts
git commit -m "feat(storage): photo variants (thumb/medium/full) + url helper"
```

---

### Task 4.2: `mediaCache.ts` oluştur

**Files:**
- Create: `src/lib/registry/mediaCache.ts`

- [ ] **Step 1: Cache dosyasını oluştur**

```ts
"use client";

import { photoVariantUrl } from "../storage";

/**
 * In-memory cache that pre-computes variant URLs for photo strings once. Avoids
 * recomputing the regex on every render. Module-scoped so /memories and
 * /album share the same cache.
 */
const cache = new Map<string, { thumb: string; medium: string; full: string }>();

export function getVariants(url: string) {
  let hit = cache.get(url);
  if (hit) return hit;
  hit = {
    thumb: photoVariantUrl(url, "thumb"),
    medium: photoVariantUrl(url, "medium"),
    full: photoVariantUrl(url, "full"),
  };
  cache.set(url, hit);
  return hit;
}

export function _clearMediaCache(): void {
  cache.clear();
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/registry/mediaCache.ts
git commit -m "feat(media): mediaCache for variant URL lookups"
```

---

### Task 4.3: `useMedia` hook'u oluştur

**Files:**
- Create: `src/lib/hooks/useMedia.ts`

- [ ] **Step 1: Hook dosyasını oluştur**

```ts
"use client";

import { useMemo } from "react";
import { getVariants } from "../registry/mediaCache";

interface MediaSources {
  src: string;       // medium (default render)
  srcSet: string;    // "thumb 300w, medium 800w, full 1800w"
  sizes: string;     // CSS sizes attribute
  placeholderSrc: string; // thumb (used for blur-up)
  fullSrc: string;
}

/**
 * Returns ready-to-use <img>/Image attributes for a photo URL. Falls back
 * cleanly for legacy uploads that don't have variants.
 */
export function useMedia(url: string | undefined, sizes = "(max-width: 768px) 100vw, 800px"): MediaSources | null {
  return useMemo(() => {
    if (!url) return null;
    const v = getVariants(url);
    return {
      src: v.medium,
      srcSet: `${v.thumb} 300w, ${v.medium} 800w, ${v.full} 1800w`,
      sizes,
      placeholderSrc: v.thumb,
      fullSrc: v.full,
    };
  }, [url, sizes]);
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/hooks/useMedia.ts
git commit -m "feat(hooks): useMedia (srcSet + sizes builder)"
```

---

### Task 4.4: Foto upload yollarını yeni varyant fonksiyonuna geçir

**Files:**
- Modify: dosyalar `uploadPhoto` veya `uploadMemoryPhoto` çağıran tüm yerler

- [ ] **Step 1: Çağrı yerlerini bul**

```bash
grep -rn "uploadPhoto\|uploadMemoryPhoto" src/
```

Çıkanları not al. Genelde `src/app/chat/page.tsx`, `src/components/CanvasBottomSheet.tsx`, `src/components/Collage.tsx`, `src/components/MemoryMusic.tsx` gibi yerler.

- [ ] **Step 2: Chat photo upload akışını güncelle**

`src/app/chat/page.tsx`'te (veya `MessageInput.tsx`'te) `uploadPhoto(uid, file)` çağrısını şununla değiştir:

```tsx
const variants = await uploadPhotoVariants(uid, file);
// Mevcut akış URL string bekliyorsa:
await sendMedia(uid, variants.full, "photo");
```

`sendMedia` zaten tek URL alıyor (`content: url`); `full` URL'i yazıyoruz, geri kalan varyantlar `photoVariantUrl()` ile türetilir.

Eski `uploadPhoto` fonksiyonunu KALDIRMA — legacy upload'lar için fallback kullanılabilir.

- [ ] **Step 3: Memory photo upload akışını güncelle**

`uploadMemoryPhoto`'yu çağıran yerlerde (`/memories` create page'i), aynı varyant tabanlı upload'a geçir. `memories` tipindeki `photos[].url` alanına `full` URL'i yaz; `path` alanı (delete için kullanılıyor) `photos/<uid>/<ts>-<id>-full.jpg` olur. Eğer silme kodun her üç varyantı silmesi gerekirse, paths array'ini saklamak isteyebilirsin — ama bu refactor scope dışında. Bu fazda **silme legacy davranışında kalır** (sadece full silinir, thumb+medium orphan kalır). Bunu Faz 6 dokümantasyonuna not düşeceğiz.

- [ ] **Step 4: Foto render eden komponentleri `useMedia`'ya taşı**

`src/components/Lightbox.tsx`, `src/components/Collage.tsx`, `src/components/MessageBubble.tsx` içinde `<img src={url}>` veya benzeri kullanımları bul. Her birinde:

```tsx
import { useMedia } from "@/lib/hooks/useMedia";

// component body içinde:
const media = useMedia(message.content); // veya photo.url, vb.

// JSX:
{media && (
  <img
    src={media.src}
    srcSet={media.srcSet}
    sizes={media.sizes}
    loading="lazy"
    decoding="async"
    alt=""
  />
)}
```

**Önemli:** `Lightbox` (tam ekran görüntüleme) `media.fullSrc`'u kullansın — orada en yüksek çözünürlük gerek. `Collage` ve `MessageBubble` thumbnail görünüm; default `media.src` (medium) yeterli.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

1. Chat'te yeni bir foto yükle. Network tab'de 3 ayrı upload görmeli (`-thumb.jpg`, `-medium.jpg`, `-full.jpg`).
2. Mesaj baloncuğunda foto medium varyant yüklenmeli (Network → request headers'ta `-medium.jpg` görünür).
3. Lightbox aç → full varyant yüklenir (`-full.jpg`).
4. Eski (legacy) bir mesaj fotosu kontrol et — `photoVariantUrl` fallback'i çalışmalı (kötü URL bozulmaz, görsel tek varyantla yüklenir).

- [ ] **Step 6: Build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/chat src/components/Lightbox.tsx src/components/Collage.tsx src/components/MessageBubble.tsx
# (Diğer modifiye dosyaları da ekle.)
git commit -m "feat(media): foto varyantları + useMedia entegrasyonu (chat/memories/album/lightbox)"
```

---

### Task 4.5: PR, merge, 48 saat gözle

Faz 2-3'teki ile aynı süreç. PR mesajında:

```
## Etki
- Foto thumbnail yüklemeleri 1800px → 300px (yaklaşık 30x daha küçük)
- LCP candidate (/album, /memories'te ilk görünür foto) hızlanır
- Mevcut legacy fotolar bozulmaz (fallback URL passthrough)

## Test plan
- [ ] Yeni foto upload → 3 varyant oluşuyor
- [ ] Album thumbnail thumb varyantı kullanıyor
- [ ] Lightbox tam çözünürlük (full) yüklüyor
- [ ] Eski (legacy) foto hala görünüyor
```

48 saat sonra Vercel Speed Insights:
- LCP (/album, /memories) düştü mü?
- Total transferred bytes/page düştü mü?

**Bu task tamamlanmadan Faz 5'e geçme.**

---

# FAZ 5 — Spotify Lazy + Route Prefetch (~2-3 saat)

**Amaç:** `SpotifyPlayerProvider`'ı root'tan çıkar, sadece `/chat` ve `/memories` route'larında lazy mount et. `/home` idle'da son 10 mesajı subscription registry'e prewarm.

**Branch:** `perf/faz-5-spotify-prefetch`

---

### Task 5.1: Branch + `SpotifyPlayerProvider` lazy wrapper

**Files:**
- Create: `src/components/SpotifyLazyProvider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/chat/page.tsx`, `src/app/memories/page.tsx` (Spotify'ı kullanan route'lar)

- [ ] **Step 1: Branch aç**

```bash
git checkout main && git pull
git checkout -b perf/faz-5-spotify-prefetch
```

- [ ] **Step 2: Hangi route'lar SpotifyPlayerProvider'a bağlı bul**

```bash
grep -rn "SpotifyPlayer\|useSpotify\|MemoryMusic\|MusicCard" src/app/
```

Tipik olarak: `/chat` (paylaşılan music message'lar) ve `/memories` (anı sayfasında otomatik oynatma) Spotify provider'ına bağlıdır. `/home`, `/album`, `/plans` bağlı değildir.

- [ ] **Step 3: Yeni lazy wrapper komponenti oluştur**

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const SpotifyPlayerProvider = dynamic(
  () => import("@/lib/SpotifyPlayerProvider").then((m) => m.SpotifyPlayerProvider),
  { ssr: false, loading: () => null },
);

/**
 * Lazy wrapper for SpotifyPlayerProvider. Use this in route layouts/pages
 * that actually need the player (chat, memories) — NOT in the root layout.
 *
 * The provider still pre-warms the SDK once mounted, so first play on the
 * route remains fast (~200-500ms).
 */
export function SpotifyLazyProvider({ children }: { children: ReactNode }) {
  return <SpotifyPlayerProvider>{children}</SpotifyPlayerProvider>;
}
```

- [ ] **Step 4: Root layout'tan `SpotifyPlayerProvider`'ı kaldır**

`src/app/layout.tsx:44-58` mevcut JSX'i şununla değiştir:

```tsx
return (
  <html lang="tr" className={`${playfair.variable} ${quicksand.variable}`}>
    <body className="min-h-dvh">
      <TelemetryBoot />
      {children}
      <SpeedInsights />
      <Analytics />
    </body>
  </html>
);
```

İmport satırından da `SpotifyPlayerProvider`'ı sil.

- [ ] **Step 5: `/chat` ve `/memories` sayfalarına `SpotifyLazyProvider` ekle**

`src/app/chat/page.tsx`'in (veya layout dosyasının) JSX'inin en dış sarmal'ı `<SpotifyLazyProvider>` olsun:

```tsx
import { SpotifyLazyProvider } from "@/components/SpotifyLazyProvider";

export default function ChatPage() {
  return (
    <SpotifyLazyProvider>
      {/* mevcut chat sayfası içeriği */}
    </SpotifyLazyProvider>
  );
}
```

Aynısı `src/app/memories/page.tsx` veya o klasördeki `[id]/page.tsx` için.

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```

1. /home aç → DevTools Network → `spotify-player` veya `sdk.scdn.co` istekleri YOK
2. /chat'e geç → birkaç saniye sonra Spotify SDK script yüklenmeli
3. Bir Spotify track çal → eskisi gibi çalışmalı (~500ms-1s ilk play)
4. /memories anı detay → SDK orada da çalışmalı

- [ ] **Step 7: Build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/components/SpotifyLazyProvider.tsx src/app/layout.tsx src/app/chat src/app/memories
git commit -m "perf(spotify): lazy provider, only on /chat and /memories"
```

`/home` First Load JS bütçesinde belirgin düşüş görmeli (~30-50kB).

---

### Task 5.2: `/home` idle'da messages prewarm

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: `/home` sayfasının mevcut halini oku**

```bash
cat src/app/home/page.tsx
```

- [ ] **Step 2: `useMessages.ts`'i prewarm-friendly yap**

`src/lib/hooks/useMessages.ts`'in en altına ekle:

```ts
import { subscribeShared } from "../registry/subscriptionRegistry";

/**
 * Prewarm the messages subscription without rendering. Returns the registry
 * unsubscribe. Call this from /home's idle callback to keep the registry
 * warm for /chat's first paint.
 */
export function prewarmMessages(): () => void {
  return subscribeShared(
    KEY,
    (push) => {
      // The same factory as inside useMessages — kept identical.
      const local: SharedState = {
        messages: new Map(),
        hasMore: true,
        loadMore: async () => 0,
      };
      const { unsubscribe: u, loadMore } = subscribeMessagesPaginated((delta, initial) => {
        delta.added.forEach((m) => local.messages.set(m.id, m));
        delta.modified.forEach((m) => local.messages.set(m.id, m));
        delta.removed.forEach((id) => local.messages.delete(id));
        if (initial && delta.added.length < PAGE_SIZE) local.hasMore = false;
        push({ ...local, messages: new Map(local.messages) });
      }, PAGE_SIZE);
      local.loadMore = async () => {
        const got = await loadMore();
        if (got < PAGE_SIZE) {
          local.hasMore = false;
          push({ ...local, messages: new Map(local.messages) });
        }
        return got;
      };
      return u;
    },
    () => {
      /* no-op listener: we only want the subscription warm in the registry */
    },
  );
}
```

`KEY`, `PAGE_SIZE` ve `SharedState` zaten dosyada tanımlı; export etmen gerekmez ama bu fonksiyon onlara erişebilir.

- [ ] **Step 3: `/home`'da prewarm'ı çağır**

`src/app/home/page.tsx`'in `useEffect` bloğunu temiz tut:

```tsx
import { prewarmMessages } from "@/lib/hooks/useMessages";

useEffect(() => {
  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  }).requestIdleCallback;
  let unsubscribe: (() => void) | null = null;
  const run = () => {
    unsubscribe = prewarmMessages();
  };
  if (typeof idle === "function") {
    idle(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
  return () => {
    unsubscribe?.();
  };
}, []);
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

1. Login → /home aç. DevTools Network "Firestore" filtrele.
2. ~3 saniye sonra (idle hit) Firestore'a 1 query gitmeli (messages, 50 doc)
3. /chat'e tıkla → boş ekran olmamalı, mesajlar **anında** görünmeli (cache hit)

- [ ] **Step 5: Build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/home/page.tsx src/lib/hooks/useMessages.ts
git commit -m "perf(home): idle-prewarm messages subscription for /chat"
```

---

### Task 5.3: Kalan route'lara `reportRouteReady` ekle

**Files:**
- Modify: `src/app/memories/page.tsx`, `src/app/album/page.tsx`, `src/app/plans/page.tsx`

- [ ] **Step 1: Her bir route page'ine ekle**

Her dosyanın komponent body'sine (mevcut diğer `useEffect`'lerin yanına):

```tsx
import { useEffect } from "react";
import { reportRouteReady } from "@/lib/telemetry/events";

// component body içinde:
useEffect(() => {
  reportRouteReady("memories"); // veya "album", "plans"
}, []);
```

Route adı her dosyaya göre değişir; geri kalan kod aynı.

- [ ] **Step 2: Build + commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/memories src/app/album src/app/plans
git commit -m "feat(telemetry): reportRouteReady on memories/album/plans"
```

---

### Task 5.4: PR, merge, 48 saat gözle

Faz 2-3-4 ile aynı süreç. PR mesajı:

```
## Summary
- SpotifyPlayerProvider root'tan kaldırıldı, /chat + /memories'e lazy
- /home idle'da messages prewarm
- reportRouteReady tüm route'larda (home, chat, memories, album, plans)

## Etki
- /home First Load JS yaklaşık 30-50kB düşüş
- /home → /chat transition'da Firestore boş bekleme kalktı
- Vercel Analytics'te route bazında "route_ready" event'i toplanmaya başlar
```

Smoke matrix doğrula. PR merge, 48 saat metrik gözle.

---

# FAZ 6 — Bundle Budget + Dokümantasyon (~1 saat)

**Amaç:** Regresyonu önle. `npm run build` çıktısını parse eden bir script, route bazında First Load JS > 180kB ise pre-push hook'la fail etsin. README'ye performans bölümü ekle.

**Branch:** `perf/faz-6-budget`

---

### Task 6.1: Branch + bundle budget script

**Files:**
- Create: `scripts/perf-budget.mjs`

- [ ] **Step 1: Branch aç**

```bash
git checkout main && git pull
git checkout -b perf/faz-6-budget
```

- [ ] **Step 2: Script dosyasını oluştur**

```js
// scripts/perf-budget.mjs
// Run after `next build`. Parses .next/build-manifest.json + .next/server output
// and fails (exit 1) if any route's first-load JS exceeds the budget.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BUDGET_KB = 180;
const ROOT = process.cwd();

async function getRoutes() {
  // Next 14 writes route info to .next/app-build-manifest.json (App Router).
  const manifestPath = join(ROOT, ".next", "app-build-manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  // Shape: { pages: { "/chat/page": ["static/chunks/...", ...], ... } }
  const pages = manifest.pages ?? {};
  return Object.entries(pages).map(([route, chunks]) => ({
    route,
    chunks,
  }));
}

async function getChunkSize(chunkPath) {
  const full = join(ROOT, ".next", chunkPath);
  try {
    const buf = await readFile(full);
    // Approximate gzip: 0.32x ratio for typical JS bundles
    return Math.round((buf.byteLength * 0.32) / 1024);
  } catch {
    return 0;
  }
}

async function main() {
  const routes = await getRoutes();
  let failed = false;
  const rows = [];
  for (const { route, chunks } of routes) {
    let total = 0;
    for (const c of chunks) total += await getChunkSize(c);
    rows.push({ route, totalKb: total, status: total > BUDGET_KB ? "FAIL" : "ok" });
    if (total > BUDGET_KB) failed = true;
  }
  console.log(`\nFirst-load JS budget (estimate, gzip), limit: ${BUDGET_KB}kB\n`);
  rows
    .sort((a, b) => b.totalKb - a.totalKb)
    .forEach((r) => {
      const tag = r.status === "FAIL" ? "✗ FAIL" : "✓ ok  ";
      console.log(`  ${tag}  ${String(r.totalKb).padStart(4)}kB   ${r.route}`);
    });
  if (failed) {
    console.error(`\n✗ Bundle budget exceeded on at least one route. Limit: ${BUDGET_KB}kB.\n`);
    process.exit(1);
  } else {
    console.log(`\n✓ All routes under ${BUDGET_KB}kB.\n`);
  }
}

main().catch((err) => {
  console.error("perf-budget: error", err);
  process.exit(2);
});
```

- [ ] **Step 3: `package.json`'a script ekle**

`scripts` bloğuna ekle:

```json
"perf:budget": "node scripts/perf-budget.mjs"
```

- [ ] **Step 4: Lokalde dene**

```bash
npm run build
npm run perf:budget
```

Çıktıyı oku. Hiçbir route 180kB'ı aşmamalı (Faz 5 sonrası). Aşan varsa Faz 5'i debug et (genelde /chat veya /memories sınırda olabilir).

- [ ] **Step 5: Commit**

```bash
git add scripts/perf-budget.mjs package.json
git commit -m "feat(ci): perf-budget script (180kB first-load JS limit)"
```

---

### Task 6.2: Pre-push git hook

**Files:**
- Create: `.git/hooks/pre-push` (lokal, gitignored)
- Create: `scripts/install-hooks.sh`

- [ ] **Step 1: Hook installer script'i oluştur**

Create: `scripts/install-hooks.sh`

```bash
#!/usr/bin/env bash
# Installs project-local git hooks. Run once per clone.
set -euo pipefail

HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/pre-push" <<'EOF'
#!/usr/bin/env bash
# pre-push: ensure bundle budget is met
set -e
echo "→ Running perf budget check..."
npm run build > /dev/null
npm run perf:budget
EOF

chmod +x "$HOOK_DIR/pre-push"
echo "✓ pre-push hook installed at $HOOK_DIR/pre-push"
```

- [ ] **Step 2: Test et**

```bash
bash scripts/install-hooks.sh
# Yapay bir push deneme (push etme — sadece hook tetiklensin)
git push --dry-run origin perf/faz-6-budget
```

Beklenen: pre-push çalışır, build + budget kontrolü yapılır, başarılı çıkar.

- [ ] **Step 3: Commit**

```bash
git add scripts/install-hooks.sh
git commit -m "chore(hooks): pre-push installer for perf budget"
```

---

### Task 6.3: README'ye Performance bölümü ekle

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README'nin sonuna ekle**

```markdown

## Performance

Bu proje üç performans bütçesine bağlı:

- **First-load JS / route:** < 180kB gzip
- **LCP (p75, mobil):** < 2.5s
- **INP (p75):** < 200ms

Lokal kontrol:

```bash
npm run build
npm run perf:budget
```

Production metrikleri Vercel Speed Insights + Firebase Performance Monitoring üzerinden izlenir.

### Performans mimarisi

Veri katmanı (`src/lib/*.ts`) → hooks katmanı (`src/lib/hooks/*`) → registry (`src/lib/registry/*`) → telemetry (`src/lib/telemetry/*`). Detay: `docs/superpowers/specs/2026-05-28-performance-architecture-design.md`.

### Pre-push hook

Yeni clone sonrası bir kez:

```bash
bash scripts/install-hooks.sh
```

### Bilinen borç

- Foto silme legacy davranışta: sadece `full` varyant silinir, `thumb` + `medium` orphan kalır. Düzelt: silme sırasında 3 path'i de sil.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: performance budget + architecture pointers"
```

---

### Task 6.4: PR + merge + son doğrulama

- [ ] **Step 1: Push + PR**

```bash
git push -u origin perf/faz-6-budget
gh pr create --title "perf: faz 6 — bundle budget + docs" --body "$(cat <<'EOF'
## Summary
- `scripts/perf-budget.mjs` (180kB/route first-load JS limit)
- `npm run perf:budget` script
- `bash scripts/install-hooks.sh` ile pre-push hook
- README performance bölümü

## Test plan
- [ ] `npm run build && npm run perf:budget` → tüm route'lar 180kB altında
- [ ] `bash scripts/install-hooks.sh` → hook kuruluyor
- [ ] `git push --dry-run` → hook çalışıyor

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge sonrası: spec'in başarı kriterleri tablosunu doldur**

PR merge edildikten 48 saat sonra Vercel Speed Insights'tan p75 değerleri al, spec Section 8 tablosunun "Hedef (faz 6 sonu)" sütununu **gerçek ulaşılan** değerlerle güncelle:

```bash
git checkout main && git pull
# spec'i düzenle, FINAL satırı ekle
git add docs/superpowers/specs/2026-05-28-performance-architecture-design.md
git commit -m "docs(perf): faz 6 final metrics — başarı kriteri sonuçları"
git push
```

- [ ] **Step 3: Manuel smoke matrix son tur**

Spec Section 6'daki manuel smoke matrix'i baştan çalıştır:

| Senaryo | Beklenen | Geçti? |
|---|---|---|
| Soğuk açılış → /home → /chat → /memories → /album → /home | Hiç beyaz ekran, transition ≤ 500ms | |
| Chat'te 200+ mesaj var, aç | İlk 50 yüklenir, scroll-up'ta 50'şer eklenir | |
| Live canvas iki cihaz 30sn çizim | < 100ms latency, drop yok | |
| Foto yükle (10MB) | Resize ~600KB, 3 varyant, upload < 3s | |
| Çevrimdışı mod | Cache görünür, banner çıkar | |
| /chat → /home → 5sn → /chat | Re-subscribe ETMEZ | |
| /chat → /home → 60sn → /chat | Re-subscribe EDER | |

Tablonun çıktısını bir issue veya PR yorumu olarak paylaş.

---

# Tam Tamamlama Kriterleri

Plan başarıyla tamamlandı sayılır eğer:

- [ ] Faz 1-6 PR'larının tamamı `main`'e merge edildi
- [ ] Vercel Speed Insights'ta p75 LCP < 2.5s, INP < 200ms
- [ ] `npm run perf:budget` çıktısında tüm route'lar 180kB altında
- [ ] Smoke matrix'in tüm satırları geçiyor
- [ ] Spec Section 8 tablosundaki "Hedef" sütunu gerçek ulaşılan değerlerle güncellendi
- [ ] README performance bölümü hazır
- [ ] Pre-push hook kurulu

Bunların biri eksikse plan kapanmadı — eksik task'a geri dön.

---

# Açık Borçlar (sonra ele alınacak)

Plan kapsamında çözülmeyen, ama tespit edilen borçlar:

1. **Foto silme orphan'ları:** `full` silindiğinde `thumb` + `medium` kalıyor. Düzeltme: `memories.ts` ve mesaj silme yollarında 3 path'i de sil. (1-2 saat)
2. **Test altyapısı:** Vitest + RTL kurup `subscriptionRegistry` + `useMessages` için unit testler yaz. (1 gün)
3. **Service Worker "yeni sürüm var" banner'ı:** Spec Section 5.3'te plan edildi, bu plan'a girmedi. (2-3 saat)
4. **Firestore index audit:** Mesaj sorgusu `orderBy("createdAt", "desc") + where("senderId", "==", X)` gibi compound query'ler index gerektirir. Mevcut durumda çalışıyor mu kontrol et. (1 saat)
5. **Eğer p75 INP hala > 200ms ise:** Spec Section 9'da bahsedilen React Query (Yaklaşım B) ikinci dalga olarak değerlendir.

Her biri ayrı spec + plan döngüsü hak ediyor.
