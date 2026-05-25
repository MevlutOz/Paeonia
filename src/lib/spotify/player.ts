/**
 * Lazy loader + singleton wrapper for Spotify's Web Playback SDK.
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §7
 */

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: PlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface PlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: unknown) => void): void;
  removeListener(event: string, cb?: (data: unknown) => void): void;
  getCurrentState(): Promise<PlayerState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  togglePlay(): Promise<void>;
  setVolume(value: number): Promise<void>;
  /**
   * iOS Safari & some mobile browsers require a silent audio element to be
   * "activated" by a user gesture before any playback. Call this synchronously
   * inside an onClick handler to unlock subsequent programmatic plays.
   */
  activateElement?: () => Promise<void>;
}

export interface PlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: { uri: string; id: string };
  };
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

let sdkPromise: Promise<void> | null = null;

/** Load the Spotify Web Playback SDK script exactly once. */
export function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("SDK requires browser"));
      return;
    }
    // If already loaded (HMR reload), resolve immediately.
    if (window.Spotify) {
      resolve();
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => reject(new Error("Spotify SDK script yüklenemedi"));
    document.body.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Create and connect a player instance. Caller provides a function that
 * yields a fresh access token (called by SDK before each privileged action).
 */
export async function createPlayer(
  getToken: () => string | null,
): Promise<SpotifyPlayer> {
  await loadSdk();
  if (!window.Spotify) throw new Error("Spotify SDK hazır değil");
  const player = new window.Spotify.Player({
    name: "Paeonia 🌹",
    volume: 0.85,
    getOAuthToken: (cb) => {
      const t = getToken();
      if (t) cb(t);
    },
  });
  const ok = await player.connect();
  if (!ok) throw new Error("Spotify player connect() false döndü");
  return player;
}

/** REST helper: start playback of a specific URI at a position on a device. */
export async function startPlayback(opts: {
  accessToken: string;
  deviceId: string;
  trackUri: string;
  positionMs: number;
}): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${opts.deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [opts.trackUri],
        position_ms: opts.positionMs,
      }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const txt = await res.text();
    throw new Error(`Spotify play failed ${res.status}: ${txt}`);
  }
}

/** REST helper: silently transfer playback to our device. */
export async function transferPlayback(opts: {
  accessToken: string;
  deviceId: string;
}): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/me/player`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [opts.deviceId], play: false }),
  });
  // 204 = success, 404 = no active device (fine)
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Transfer failed ${res.status}: ${txt}`);
  }
}
