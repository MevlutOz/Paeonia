// Pushes every non-empty variable from .env.local to Vercel for
// production / preview / development.
//
// Calls Vercel's JS entry directly with `node` and passes the value via
// spawnSync's `input` as a UTF-8 Buffer (NO BOM). PowerShell pipes were
// prepending a U+FEFF BOM, which corrupted every value.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envFile = resolve(root, ".env.local");
const vercelJs = resolve(root, "node_modules", "vercel", "dist", "vc.js");

const text = readFileSync(envFile, "utf8");
const targets = ["production", "preview", "development"];

function vc(args, input) {
  return spawnSync(process.execPath, [vercelJs, ...args], {
    input: input === undefined ? undefined : Buffer.from(input, "utf8"),
    encoding: "utf8",
  });
}

for (const raw of text.split(/\r?\n/)) {
  // strip any BOM/whitespace from the line itself
  const line = raw.replace(/^﻿/, "").trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 1) continue;
  const name = line.slice(0, eq).trim();
  // strip BOM + surrounding quotes/space from the value
  const value = line
    .slice(eq + 1)
    .replace(/^﻿/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) {
    console.log(`  - skip ${name} (empty)`);
    continue;
  }

  for (const env of targets) {
    process.stdout.write(`  + ${name} -> ${env} ... `);
    vc(["env", "rm", name, env, "--yes"], "");
    const r = vc(["env", "add", name, env], value);
    console.log(r.status === 0 ? "ok" : `FAIL (${(r.stderr || "").trim().slice(0, 200)})`);
  }
}

console.log("\nDone.");
