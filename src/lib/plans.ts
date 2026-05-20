"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { firestore } from "./firebase";
import type { Plan } from "./types";

const PLANS = "plans";

export function subscribePlans(cb: (plans: Plan[]) => void) {
  const q = query(collection(firestore(), PLANS), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: (data.title as string) ?? "",
          note: (data.note as string) ?? "",
          done: !!data.done,
          createdBy: (data.createdBy as string) ?? "",
          createdAt: (data.createdAt as Plan["createdAt"]) ?? null,
          updatedAt: (data.updatedAt as Plan["updatedAt"]) ?? null,
        };
      }),
    );
  });
}

export async function createPlan(title: string, createdBy: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  await addDoc(collection(firestore(), PLANS), {
    title: trimmed,
    note: "",
    done: false,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function setPlanDone(id: string, done: boolean) {
  await updateDoc(doc(firestore(), PLANS, id), {
    done,
    updatedAt: serverTimestamp(),
  });
}

export async function updatePlan(
  id: string,
  fields: { title: string; note: string },
) {
  await updateDoc(doc(firestore(), PLANS, id), {
    title: fields.title.trim(),
    note: fields.note.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlan(id: string) {
  await deleteDoc(doc(firestore(), PLANS, id));
}
