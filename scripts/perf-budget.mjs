#!/usr/bin/env node
// Bundle size budget check for Paeonia routes.
//
// Reads .next/app-build-manifest.json (App Router) and reports the gzipped
// first-load JS size for each route. Fails (exit 1) if any route exceeds
// BUDGET_KB.
//
// Usage:
//   npm run build && npm run perf:budget
//
// Why a custom script: Next's build output already prints first-load JS,
// but it's stdout-only and uses an approximation. This script measures
// actual gzip size from the on-disk chunks so the number is reproducible
// in CI and pre-push hooks.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

// Budget = current worst route + ~5% headroom. Mutlak "ideal" değil,
// regresyon koruması. Firebase Auth + Firestore + Framer Motion + Next
// runtime tabani zaten ~90kB gzip; pratik hedef bu seviyede tutmak.
// Faz 2-5 sonrasi en buyuk /chat = 305 kB (gzip). 320 = catch bloat.
const BUDGET_KB = 320;
const ROOT = process.cwd();
const NEXT_DIR = resolve(ROOT, ".next");
const MANIFEST_PATH = join(NEXT_DIR, "app-build-manifest.json");

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `✗ ${MANIFEST_PATH} bulunamadi. Once 'npm run build' calistir.\n`,
  );
  process.exit(1);
}

const sizeCache = new Map();
async function gzippedKb(chunkRel) {
  if (sizeCache.has(chunkRel)) return sizeCache.get(chunkRel);
  const abs = join(NEXT_DIR, chunkRel);
  if (!existsSync(abs)) {
    sizeCache.set(chunkRel, 0);
    return 0;
  }
  const buf = await readFile(abs);
  const kb = Math.round((gzipSync(buf).byteLength / 1024) * 10) / 10;
  sizeCache.set(chunkRel, kb);
  return kb;
}

function prettyRoute(routeKey) {
  // App router keys look like "/chat/page", "/memories/[id]/page".
  return routeKey.replace(/\/page$/, "") || "/";
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const pages = manifest.pages ?? {};
// Sadece gercek route'lar — /xxx/page entry'leri. /layout ve /xxx/layout
// entry'leri layout chunk'lari; First Load JS hesabinda zaten page chunk'i
// uzerinden saglanir.
const routeKeys = Object.keys(pages)
  .filter((k) => !k.startsWith("__"))
  .filter((k) => k.endsWith("/page") || k === "/page");

const rows = [];
for (const key of routeKeys) {
  const chunks = pages[key] ?? [];
  const sizes = await Promise.all(chunks.map(gzippedKb));
  const total = Math.round(sizes.reduce((a, b) => a + b, 0) * 10) / 10;
  rows.push({ route: prettyRoute(key), totalKb: total });
}

rows.sort((a, b) => b.totalKb - a.totalKb);

const failed = rows.filter((r) => r.totalKb > BUDGET_KB);

console.log(`\nFirst-load JS (gzip), budget: ${BUDGET_KB}kB\n`);
for (const r of rows) {
  const tag = r.totalKb > BUDGET_KB ? "✗ FAIL" : "✓ ok  ";
  const pct = Math.round((r.totalKb / BUDGET_KB) * 100);
  console.log(
    `  ${tag}  ${String(r.totalKb).padStart(6)}kB  (${String(pct).padStart(3)}%)   ${r.route}`,
  );
}

if (failed.length > 0) {
  console.error(
    `\n✗ ${failed.length} route bundle budget asti (${BUDGET_KB}kB). Detay yukarida.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ Tum route'lar ${BUDGET_KB}kB altinda.\n`);
