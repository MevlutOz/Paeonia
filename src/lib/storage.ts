"use client";

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "./firebase";
import { trace } from "./telemetry/trace";
import type { PhotoVariants } from "./types";

export type { PhotoVariants };

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
 * Extract the first frame of a video file as a JPEG blob using a hidden
 * <video> element + canvas drawing. Returns null on any failure (caller
 * uploads the video without a poster — the <video> tag will fall back to
 * its own default frame).
 *
 * Client-side: avoids a Cloud Function + ffmpeg deploy. Works for common
 * iOS/Android camera codecs (H.264/HEVC); failures fall back gracefully.
 */
async function extractVideoPoster(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        reject(new Error("video metadata load failed"));
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    // Bazı tarayıcılarda 0 saniyede frame henüz hazır değil — 0.1s daha güvenilir.
    video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("seeked", onSeeked);
        reject(new Error("video seek failed"));
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.src = "";
  }
}

const MAX_VIDEO_MB = 25;

/**
 * Upload a video file (chat) under /videos/{uid}/. Extracts the first frame
 * as a poster JPEG client-side and uploads both in parallel.
 *
 * Throws on validation failure (not a video MIME, or size > 25 MB) so the
 * caller can show a user-facing alert.
 */
export async function uploadVideo(
  uid: string,
  file: File,
): Promise<{ videoUrl: string; posterUrl: string | null }> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Sadece video dosyaları yüklenebilir.");
  }
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Video ${MAX_VIDEO_MB} MB'tan büyük olamaz.`);
  }

  return trace(
    "video.upload",
    async () => {
      const ext =
        file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "mp4";
      const base = `videos/${uid}/${Date.now()}-${cryptoId()}`;

      const posterBlob = await extractVideoPoster(file);

      const videoUploadP = uploadAt(`${base}.${ext}`, file);
      const posterUploadP = posterBlob
        ? uploadAt(`${base}-poster.jpg`, posterBlob)
        : Promise.resolve<string | null>(null);

      const [videoUrl, posterUrl] = await Promise.all([
        videoUploadP,
        posterUploadP,
      ]);

      return { videoUrl, posterUrl };
    },
    { sizeKb: String(Math.round(file.size / 1024)) },
  );
}
