"use client";

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "./firebase";

export async function uploadDataUrl(
  uid: string,
  dataUrl: string,
  kind: "drawing" | "photo",
): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl);
  return uploadBlob(uid, blob, kind);
}

export async function uploadBlob(
  uid: string,
  blob: Blob,
  kind: "drawing" | "photo",
): Promise<string> {
  const ext = blob.type.includes("png")
    ? "png"
    : blob.type.includes("jpeg") || blob.type.includes("jpg")
      ? "jpg"
      : "png";
  const path = `${kind}s/${uid}/${Date.now()}-${cryptoId()}.${ext}`;
  const ref = storageRef(firebaseStorage(), path);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/png" });
  return getDownloadURL(ref);
}

export async function uploadPhoto(uid: string, file: File): Promise<string> {
  const resized = await resizeImage(file, 1600, 0.85);
  return uploadBlob(uid, resized, "photo");
}

export async function uploadMemoryPhoto(
  uid: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const resized = await resizeImage(file, 1800, 0.85);
  const path = `memories/${uid}/${Date.now()}-${cryptoId()}.jpg`;
  const ref = storageRef(firebaseStorage(), path);
  await uploadBytes(ref, resized, { contentType: resized.type || "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { url, path };
}

async function resizeImage(
  file: File,
  maxDim: number,
  quality: number,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        quality,
      );
    });
  } catch {
    // If anything fails, fall back to uploading the original file.
    return file;
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export interface PhotoVariants {
  thumb: string;  // 300px URL
  medium: string; // 800px URL
  full: string;   // 1800px URL
}

async function uploadVariantsAt(
  basePath: string,
  file: File,
): Promise<PhotoVariants> {
  const [thumbBlob, mediumBlob, fullBlob] = await Promise.all([
    resizeImage(file, 300, 0.78),
    resizeImage(file, 800, 0.82),
    resizeImage(file, 1800, 0.85),
  ]);
  const [thumb, medium, full] = await Promise.all([
    uploadAt(`${basePath}-thumb.jpg`, thumbBlob),
    uploadAt(`${basePath}-medium.jpg`, mediumBlob),
    uploadAt(`${basePath}-full.jpg`, fullBlob),
  ]);
  return { thumb, medium, full };
}

async function uploadAt(path: string, blob: Blob): Promise<string> {
  const ref = storageRef(firebaseStorage(), path);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(ref);
}

/**
 * Upload a chat photo as three resolutions under /photos/{uid}/. Callers
 * store only the `full` URL in Firestore; render code derives thumb/medium
 * via `photoVariantUrl()`.
 */
export async function uploadPhotoVariants(uid: string, file: File): Promise<PhotoVariants> {
  const base = `photos/${uid}/${Date.now()}-${cryptoId()}`;
  return uploadVariantsAt(base, file);
}

/**
 * Upload a memory photo as three resolutions under /memories/{uid}/. Returns
 * the variant URLs plus the `path` of the `full` variant for delete bookkeeping.
 *
 * Known debt: deleting the path only removes the -full.jpg; -thumb.jpg and
 * -medium.jpg become orphans. Tracked in Faz 6 docs.
 */
export async function uploadMemoryPhotoVariants(
  uid: string,
  file: File,
): Promise<{ url: string; path: string; variants: PhotoVariants }> {
  const base = `memories/${uid}/${Date.now()}-${cryptoId()}`;
  const variants = await uploadVariantsAt(base, file);
  return { url: variants.full, path: `${base}-full.jpg`, variants };
}

/**
 * Given any variant URL (or a legacy single-variant URL), return the URL for
 * the requested size. Legacy URLs without the variant suffix are returned
 * unchanged (graceful fallback).
 */
export function photoVariantUrl(url: string, size: "thumb" | "medium" | "full"): string {
  const m = url.match(/(-thumb|-medium|-full)\.jpg/);
  if (!m) return url;
  return url.replace(m[0], `-${size}.jpg`);
}
