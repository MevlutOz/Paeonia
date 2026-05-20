"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";

interface ExportResult {
  url: string;
}

/** Calls the exportCollage Cloud Function and returns the rendered image URL. */
export async function requestCollageExport(memoryId: string): Promise<string> {
  const fns = getFunctions(firebaseApp(), "europe-west1");
  const call = httpsCallable<{ memoryId: string }, ExportResult>(
    fns,
    "exportCollage",
  );
  const res = await call({ memoryId });
  return res.data.url;
}
