import type { Timestamp } from "firebase/firestore";

export type MessageType = "text" | "drawing" | "photo" | "music" | "video";

export interface PhotoVariants {
  thumb: string;  // 300px
  medium: string; // 800px
  full: string;   // 1800px
}

export interface PaeoniaUser {
  uid: string;
  displayName: string;
  fcmToken?: string | null;
  partnerId?: string | null;
  spotifyRefreshToken?: string | null;
  spotifyConnectedAt?: Timestamp | null;
}

export interface Message {
  id: string;
  senderId: string;
  type: MessageType;
  content: string;
  /** Present for `type === "photo"` uploads from Faz 4 onwards. Legacy photos are null. */
  variants?: PhotoVariants | null;
  /** Present for `type === "video"` uploads. Poster (cover) image URL. Legacy/extraction-failed videos are null. */
  poster?: string | null;
  createdAt: Timestamp | null;
  isRead: boolean;
  isRevealed: boolean;
  isFavorited: boolean;
}

export interface MemoryPhoto {
  url: string;
  path: string;
  /** Present from Faz 4 onwards. Legacy memory photos are undefined. */
  variants?: PhotoVariants | null;
}

export interface CollageCell {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface CollageLayout {
  templateId: string;
  cols: number;
  rows: number;
  cells: CollageCell[];
}

export interface MemorySong {
  title: string;
  artist: string;
  artworkUrl: string;
  // Spotify path — yeni anılar için
  spotifyTrackUri?: string;   // "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"
  spotifyTrackId?: string;
  durationMs?: number;        // tam şarkı süresi (trim UI için)
  startMs?: number;           // kırpma başı
  endMs?: number;             // kırpma sonu (endMs - startMs ∈ [5000, 30000])
  // iTunes path — eski anılar için (yeni anılarda yazılmaz)
  previewUrl?: string;
}

export interface Plan {
  id: string;
  title: string;
  note: string;
  done: boolean;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Memory {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  place: string;
  note: string;
  photos: MemoryPhoto[];
  collage: CollageLayout;
  song: MemorySong | null;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
