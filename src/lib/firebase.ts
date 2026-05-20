import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let rtdb: Database | null = null;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) auth = getAuth(firebaseApp());
  return auth;
}

export function firestore(): Firestore {
  if (!db) db = getFirestore(firebaseApp());
  return db;
}

export function firebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(firebaseApp());
  return storage;
}

export function realtimeDb(): Database {
  if (!rtdb) rtdb = getDatabase(firebaseApp());
  return rtdb;
}

export const allowedUids = (process.env.NEXT_PUBLIC_ALLOWED_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAllowedUid(uid: string | undefined | null): boolean {
  if (!uid) return false;
  if (allowedUids.length === 0) return true;
  return allowedUids.includes(uid);
}
