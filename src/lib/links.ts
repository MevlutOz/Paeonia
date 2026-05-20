export type MusicProvider = "spotify" | "youtube";

export interface MusicLink {
  provider: MusicProvider;
  /** Sağlayıcının resmi embed iframe URL'i. */
  embedUrl: string;
  /** Tespit edilen ham link (mesaj içeriği olarak saklanır). */
  originalUrl: string;
}

const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/i;

const YOUTUBE_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

/**
 * Verilen metinde Spotify veya YouTube linki arar.
 * İlk eşleşeni döndürür; yoksa null.
 */
export function detectMusicLink(text: string): MusicLink | null {
  const sp = text.match(SPOTIFY_RE);
  if (sp) {
    const [originalUrl, kind, id] = sp;
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}`,
      originalUrl,
    };
  }
  const yt = text.match(YOUTUBE_RE);
  if (yt) {
    const [originalUrl, id] = yt;
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${id}`,
      originalUrl,
    };
  }
  return null;
}
