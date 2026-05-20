"use client";

import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { firebaseApp, firestore } from "./firebase";

export async function maybeRegisterFcm(uid: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const vapid = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapid) {
    console.warn("[fcm] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing — skipping token registration.");
    return null;
  }

  const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/firebase-cloud-messaging-push-scope",
  });

  const messaging = getMessaging(firebaseApp());
  const token = await getToken(messaging, {
    vapidKey: vapid,
    serviceWorkerRegistration: swReg,
  }).catch((e) => {
    console.warn("[fcm] getToken failed:", e);
    return null;
  });

  if (!token) return null;

  try {
    await updateDoc(doc(firestore(), "users", uid), { fcmToken: token });
  } catch (e) {
    console.warn("[fcm] failed to persist token:", e);
  }

  onMessage(messaging, (payload) => {
    // Foreground push — could show in-app toast, but keep silent for now.
    console.log("[fcm] foreground message:", payload);
  });

  return token;
}
