"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSpotifyAuth } from "./useSpotifyAuth";
import {
  createPlayer,
  startPlayback,
  transferPlayback,
  type SpotifyPlayer,
} from "./spotify/player";

interface PlayerCtx {
  ready: boolean;
  deviceId: string | null;
  error: string | null;
  notPremium: boolean;
  play: (trackUri: string, positionMs: number) => Promise<void>;
  pause: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  getPosition: () => Promise<number | null>;
  activateElement: () => void;
}

/**
 * Singleton wrapper around the Spotify Web Playback SDK. Mounted once at the
 * app root so the SDK loads and connects as soon as the user has a Spotify
 * refresh token — by the time they open a memory page, the player is ready
 * and pre-warmed. Previously each consumer created its own player instance,
 * causing 1–2s of "waiting for SDK + connect + transfer" on every memory open.
 */

interface State {
  ready: boolean;
  deviceId: string | null;
  error: string | null;
  notPremium: boolean;
}

const Ctx = createContext<PlayerCtx | null>(null);

export function SpotifyPlayerProvider({ children }: { children: ReactNode }) {
  const { accessToken, status } = useSpotifyAuth();
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  const [state, setState] = useState<State>({
    ready: false,
    deviceId: null,
    error: null,
    notPremium: false,
  });
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const readyResolveRef = useRef<(() => void) | null>(null);
  const readyRejectRef = useRef<((e: Error) => void) | null>(null);

  useEffect(() => {
    if (status !== "connected" || !accessToken) {
      setState({ ready: false, deviceId: null, error: null, notPremium: false });
      readyPromiseRef.current = null;
      readyResolveRef.current = null;
      readyRejectRef.current = null;
      return;
    }

    readyPromiseRef.current = new Promise<void>((resolve, reject) => {
      readyResolveRef.current = resolve;
      readyRejectRef.current = reject;
    });

    let disposed = false;
    let player: SpotifyPlayer | null = null;

    (async () => {
      try {
        player = await createPlayer(() => accessTokenRef.current);
        if (disposed) {
          player.disconnect();
          return;
        }
        playerRef.current = player;

        player.addListener("ready", (data) => {
          const d = data as { device_id: string };
          deviceIdRef.current = d.device_id;
          setState({
            ready: true,
            deviceId: d.device_id,
            error: null,
            notPremium: false,
          });
          readyResolveRef.current?.();
          // Pre-warm: silently transfer so Spotify treats us as active device.
          const token = accessTokenRef.current;
          if (token) {
            void transferPlayback({
              accessToken: token,
              deviceId: d.device_id,
            }).catch(() => {
              /* play() has a 404 fallback */
            });
          }
        });
        player.addListener("not_ready", () => {
          deviceIdRef.current = null;
          setState((s) => ({ ...s, ready: false, deviceId: null }));
        });
        player.addListener("initialization_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
          readyRejectRef.current?.(new Error(d.message));
        });
        player.addListener("authentication_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: `Auth: ${d.message}` }));
          readyRejectRef.current?.(new Error(d.message));
        });
        player.addListener("account_error", () => {
          setState((s) => ({ ...s, notPremium: true }));
          readyRejectRef.current?.(new Error("Premium gerekli"));
        });
        player.addListener("playback_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
        });
      } catch (e) {
        if (!disposed) {
          const err = e instanceof Error ? e : new Error("Player hatası");
          setState((s) => ({ ...s, error: err.message }));
          readyRejectRef.current?.(err);
        }
      }
    })();

    return () => {
      disposed = true;
      if (player) {
        try {
          player.disconnect();
        } catch {
          /* ignore */
        }
      }
      playerRef.current = null;
      deviceIdRef.current = null;
    };
  }, [status, accessToken]);

  async function waitReady(): Promise<void> {
    if (!readyPromiseRef.current)
      throw new Error("Spotify bağlantısı yok");
    await readyPromiseRef.current;
  }

  async function play(trackUri: string, positionMs: number): Promise<void> {
    await waitReady();
    const token = accessTokenRef.current;
    const deviceId = deviceIdRef.current;
    const sdk = playerRef.current;
    if (!token || !deviceId || !sdk) throw new Error("Player hazır değil");

    // Fast path: same URI already loaded → SDK seek + resume (no REST).
    try {
      const cs = await sdk.getCurrentState();
      if (cs && cs.track_window?.current_track?.uri === trackUri) {
        await sdk.seek(positionMs);
        if (cs.paused) await sdk.resume();
        return;
      }
    } catch {
      /* fall through to slow path */
    }

    const doPlay = () =>
      startPlayback({ accessToken: token, deviceId, trackUri, positionMs });

    try {
      await doPlay();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b404\b/.test(msg) || /NO_ACTIVE_DEVICE/.test(msg)) {
        await transferPlayback({ accessToken: token, deviceId });
        await new Promise((r) => setTimeout(r, 200));
        await doPlay();
      } else {
        throw e;
      }
    }
  }

  function activateElement(): void {
    const sdk = playerRef.current;
    if (sdk?.activateElement) {
      void sdk.activateElement().catch(() => {
        /* ignore */
      });
    }
  }

  async function pause(): Promise<void> {
    await playerRef.current?.pause();
  }

  async function seek(positionMs: number): Promise<void> {
    await playerRef.current?.seek(positionMs);
  }

  async function getPosition(): Promise<number | null> {
    const s = await playerRef.current?.getCurrentState();
    return s?.position ?? null;
  }

  const value: PlayerCtx = {
    ready: state.ready,
    deviceId: state.deviceId,
    error: state.error,
    notPremium: state.notPremium,
    play,
    pause,
    seek,
    getPosition,
    activateElement,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the shared Spotify player. Must be used under SpotifyPlayerProvider. */
export function useSpotifyPlayer(): PlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useSpotifyPlayer() must be used inside <SpotifyPlayerProvider>",
    );
  }
  return ctx;
}
