"use client";

import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore, isAllowedUid } from "./firebase";

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
  if (!isAllowedUid(cred.user.uid)) {
    await fbSignOut(firebaseAuth());
    throw new Error("Bu hesap bu Gizli Bahçe'ye davetli değil.");
  }
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

export function onUser(cb: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth(), cb);
}

export async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(firestore(), "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "Sevgili",
      fcmToken: null,
      partnerId: null,
      createdAt: serverTimestamp(),
    });
  }
}

export async function getPartnerId(uid: string): Promise<string | null> {
  const ref = doc(firestore(), "users", uid);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (data?.partnerId) return data.partnerId as string;
  return null;
}
