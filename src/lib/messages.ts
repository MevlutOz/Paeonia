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
} from "firebase/firestore";
import { firestore } from "./firebase";
import type { Message, MessageType } from "./types";
import { detectMusicLink } from "./links";

const MESSAGES = "messages";

export function subscribeMessages(
  cb: (messages: Message[]) => void,
  pageSize = 200,
) {
  const q = query(
    collection(firestore(), MESSAGES),
    orderBy("createdAt", "asc"),
    limit(pageSize),
  );
  return onSnapshot(q, (snap) => {
    const out: Message[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        senderId: data.senderId,
        type: data.type as MessageType,
        content: data.content,
        createdAt: data.createdAt ?? null,
        isRead: !!data.isRead,
        isRevealed: !!data.isRevealed,
        isFavorited: !!data.isFavorited,
      };
    });
    cb(out);
  });
}

export async function sendText(senderId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const music = detectMusicLink(trimmed);
  await addDoc(collection(firestore(), MESSAGES), {
    senderId,
    type: music ? "music" : "text",
    content: music ? music.originalUrl : trimmed,
    createdAt: serverTimestamp(),
    isRead: false,
    isRevealed: true,
    isFavorited: false,
  });
}

export async function sendMedia(
  senderId: string,
  url: string,
  type: "drawing" | "photo",
) {
  await addDoc(collection(firestore(), MESSAGES), {
    senderId,
    type,
    content: url,
    createdAt: serverTimestamp(),
    isRead: false,
    isRevealed: false,
    isFavorited: false,
  });
}

export async function markRead(messageId: string) {
  await updateDoc(doc(firestore(), MESSAGES, messageId), { isRead: true });
}

export async function markRevealed(messageId: string) {
  await updateDoc(doc(firestore(), MESSAGES, messageId), {
    isRevealed: true,
    isRead: true,
  });
}

export async function markAllReadFrom(otherUserId: string) {
  const q = query(
    collection(firestore(), MESSAGES),
    where("senderId", "==", otherUserId),
    where("isRead", "==", false),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(firestore());
  snap.docs.forEach((d) =>
    batch.update(doc(firestore(), MESSAGES, d.id), { isRead: true }),
  );
  await batch.commit();
}

export async function toggleFavorite(messageId: string, next: boolean) {
  await updateDoc(doc(firestore(), MESSAGES, messageId), {
    isFavorited: next,
  });
}
