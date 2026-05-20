/**
 * Creates the two user docs in Firestore and links them as partners.
 * Run AFTER the two Firebase Auth users exist.
 *
 *   node scripts/bootstrap-partners.mjs
 *
 * Requires a service-account JSON: place at scripts/service-account.json
 * (Console → Project settings → Service accounts → Generate new private key)
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = resolve(__dirname, "service-account.json");

const USERS = [
  { uid: "WOOetHE8NbhBjoYKiW5VDW17Ufu1", displayName: "Sen" },
  { uid: "CgZyp1HrxQOKC2MqHTKxsI0wVN83", displayName: "O" },
];

const sa = JSON.parse(await readFile(SERVICE_ACCOUNT_PATH, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const [a, b] = USERS;
await db.collection("users").doc(a.uid).set(
  {
    uid: a.uid,
    displayName: a.displayName,
    partnerId: b.uid,
    fcmToken: null,
  },
  { merge: true },
);
await db.collection("users").doc(b.uid).set(
  {
    uid: b.uid,
    displayName: b.displayName,
    partnerId: a.uid,
    fcmToken: null,
  },
  { merge: true },
);

console.log("✅ Partner eşleştirmesi tamam:");
console.log(`   ${a.displayName} (${a.uid}) ⟷ ${b.displayName} (${b.uid})`);
