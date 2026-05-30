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
import type { Message, MessageType, PhotoVariants } from "./types";
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
  type: "drawing" | "photo" | "video",
  variants?: PhotoVariants | null,
  poster?: string | null,
) {
  await addDoc(collection(firestore(), MESSAGES), {
    senderId,
    type,
    content: url,
    ...(variants ? { variants } : {}),
    ...(poster ? { poster } : {}),
    createdAt: serverTimestamp(),
    isRead: false,
    // Videolar reveal pattern kullanmaz — alıcı tarafta direkt görünür.
    isRevealed: type === "video",
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

function docToMessage(d: QueryDocumentSnapshot | DocumentSnapshot): Message {
  const data = d.data() as Record<string, unknown> | undefined;
  return {
    id: d.id,
    senderId: (data?.senderId as string) ?? "",
    type: (data?.type as MessageType) ?? "text",
    content: (data?.content as string) ?? "",
    variants: (data?.variants as PhotoVariants | undefined) ?? null,
    poster: (data?.poster as string | undefined) ?? null,
    createdAt: (data?.createdAt as Message["createdAt"]) ?? null,
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
