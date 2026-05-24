"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotifyAuth } from "./useSpotifyAuth";
import {
  createPlayer,
  startPlayback,
  transferPlayback,
  type SpotifyPlayer,
} from "./spotify/player";

interface State {
  ready: boolean;
  deviceId: string | null;
  error: string | null;
  notPremium: boolean;
}

/**
 * Owns a single Spotify.Player instance for the current tab. Returns a play()
 * helper that starts a track at a specific position. Loop/seek logic is the
 * caller's responsibility (e.g. MemoryMusic polls and calls seek on its own).
 */
export function useSpotifyPlayer() {
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

  useEffect(() => {
    if (status !== "connected" || !accessToken) {
      setState({ ready: false, deviceId: null, error: null, notPremium: false });
      return;
    }

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
          setState({
            ready: true,
            deviceId: d.device_id,
            error: null,
            notPremium: false,
          });
        });
        player.addListener("not_ready", () => {
          setState((s) => ({ ...s, ready: false }));
        });
        player.addListener("initialization_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
        });
        player.addListener("authentication_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: `Auth: ${d.message}` }));
        });
        player.addListener("account_error", () => {
          setState((s) => ({ ...s, notPremium: true }));
        });
        player.addListener("playback_error", (data) => {
          const d = data as { message: string };
          setState((s) => ({ ...s, error: d.message }));
        });
      } catch (e) {
        if (!disposed) {
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e.message : "Player hatası",
          }));
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
    };
  }, [status, accessToken]);

  async function play(trackUri: string, positionMs: number): Promise<void> {
    const token = accessTokenRef.current;
    if (!token || !state.deviceId)
      throw new Error("Player veya token hazır değil");
    await transferPlayback({ accessToken: token, deviceId: state.deviceId });
    await startPlayback({
      accessToken: token,
      deviceId: state.deviceId,
      trackUri,
      positionMs,
    });
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

  return {
    ready: state.ready,
    deviceId: state.deviceId,
    error: state.error,
    notPremium: state.notPremium,
    play,
    pause,
    seek,
    getPosition,
  };
}
