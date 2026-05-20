"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "./firebase";
import type { CollageLayout, Memory, MemoryPhoto, MemorySong } from "./types";
import { autoLayout } from "./collage";

const MEMORIES = "memories";

function fromDoc(id: string, data: Record<string, unknown>): Memory {
  return {
    id,
    title: (data.title as string) ?? "",
    date: (data.date as string) ?? "",
    place: (data.place as string) ?? "",
    note: (data.note as string) ?? "",
    photos: (data.photos as MemoryPhoto[]) ?? [],
    collage:
      (data.collage as CollageLayout) ??
      autoLayout(((data.photos as MemoryPhoto[]) ?? []).length),
    song: (data.song as MemorySong) ?? null,
    createdBy: (data.createdBy as string) ?? "",
    createdAt: (data.createdAt as Memory["createdAt"]) ?? null,
    updatedAt: (data.updatedAt as Memory["updatedAt"]) ?? null,
  };
}

export function subscribeMemories(cb: (memories: Memory[]) => void) {
  const q = query(collection(firestore(), MEMORIES), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => fromDoc(d.id, d.data())));
  });
}

export async function getMemory(id: string): Promise<Memory | null> {
  const snap = await getDoc(doc(firestore(), MEMORIES, id));
  if (!snap.exists()) return null;
  return fromDoc(snap.id, snap.data());
}

export function watchMemory(id: string, cb: (memory: Memory | null) => void) {
  return onSnapshot(doc(firestore(), MEMORIES, id), (snap) => {
    cb(snap.exists() ? fromDoc(snap.id, snap.data()) : null);
  });
}

export interface NewMemoryInput {
  title: string;
  date: string;
  place: string;
  note: string;
  photos: MemoryPhoto[];
  song: MemorySong | null;
  createdBy: string;
}

export async function createMemory(input: NewMemoryInput): Promise<string> {
  const ref = await addDoc(collection(firestore(), MEMORIES), {
    title: input.title.trim(),
    date: input.date,
    place: input.place.trim(),
    note: input.note.trim(),
    photos: input.photos,
    collage: autoLayout(input.photos.length),
    song: input.song ?? null,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMemoryMeta(
  id: string,
  meta: {
    title: string;
    date: string;
    place: string;
    note: string;
    song: MemorySong | null;
  },
) {
  await updateDoc(doc(firestore(), MEMORIES, id), {
    title: meta.title.trim(),
    date: meta.date,
    place: meta.place.trim(),
    note: meta.note.trim(),
    song: meta.song ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function updateMemoryPhotos(
  id: string,
  photos: MemoryPhoto[],
  collage: CollageLayout,
) {
  await updateDoc(doc(firestore(), MEMORIES, id), {
    photos,
    collage,
    updatedAt: serverTimestamp(),
  });
}

export async function updateMemoryCollage(id: string, collage: CollageLayout) {
  await updateDoc(doc(firestore(), MEMORIES, id), {
    collage,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMemory(id: string) {
  await deleteDoc(doc(firestore(), MEMORIES, id));
}
