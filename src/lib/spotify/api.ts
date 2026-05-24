/**
 * Thin REST wrapper over the Spotify Web API. Caller passes the access token.
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §5.1
 */

const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  uri: string;             // "spotify:track:..."
  name: string;
  artists: { name: string }[];
  album: { images: { url: string; height: number; width: number }[] };
  duration_ms: number;
  is_playable?: boolean;
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify API ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

export async function searchTracks(
  query: string,
  accessToken: string,
  limit = 20,
): Promise<SpotifyTrack[]> {
  const q = query.trim();
  if (!q) return [];
  // Spotify is picky about the search URL — use URLSearchParams for proper
  // RFC 3986 encoding and put q first (some Spotify SDKs/docs assume that order).
  const params = new URLSearchParams({
    q,
    type: "track",
    limit: String(limit),
  });
  const data = await get<{ tracks: { items: SpotifyTrack[] } }>(
    `/search?${params.toString()}`,
    accessToken,
  );
  return data.tracks?.items ?? [];
}

export async function getTrack(
  trackId: string,
  accessToken: string,
): Promise<SpotifyTrack> {
  return await get<SpotifyTrack>(`/tracks/${trackId}`, accessToken);
}

/** Pick a mid-sized artwork (~300×300) from a track's album images. */
export function pickArtwork(track: SpotifyTrack): string {
  const imgs = track.album.images ?? [];
  if (imgs.length === 0) return "";
  // Spotify returns images sorted largest first; we want middle (~300x300).
  return imgs[Math.min(1, imgs.length - 1)].url;
}
