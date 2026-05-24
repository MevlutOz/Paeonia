"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuthUser } from "./useAuthUser";
import { firestore } from "./firebase";
import {
  cacheAccessToken,
  clearAccessToken,
  login,
  readAccessToken,
  refresh,
} from "./spotify/auth";

export type SpotifyAuthStatus =
  | "loading"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface State {
  status: SpotifyAuthStatus;
  accessToken: string | null;
  error: string | null;
}

/**
 * Tracks the current user's Spotify connection state.
 * - On mount: reads refresh token from Firestore, refreshes access token if needed.
 * - login(): redirects to Spotify (never returns).
 * - logout(): clears access token + Firestore refresh token field.
 */
export function useSpotifyAuth() {
  const { user, checked } = useAuthUser();
  const [state, setState] = useState<State>({
    status: "loading",
    accessToken: null,
    error: null,
  });

  useEffect(() => {
    if (!checked) return;
    if (!user) {
      setState({ status: "disconnected", accessToken: null, error: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cached = readAccessToken();
        if (cached) {
          if (!cancelled)
            setState({ status: "connected", accessToken: cached, error: null });
          return;
        }
        const snap = await getDoc(doc(firestore(), "users", user.uid));
        const refreshToken = snap.data()?.spotifyRefreshToken as
          | string
          | undefined;
        if (!refreshToken) {
          if (!cancelled)
            setState({
              status: "disconnected",
              accessToken: null,
              error: null,
            });
          return;
        }
        const tokens = await refresh(refreshToken);
        cacheAccessToken(tokens.access_token, tokens.expires_in);
        // Spotify may rotate refresh tokens — persist if changed.
        if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
          await setDoc(
            doc(firestore(), "users", user.uid),
            { spotifyRefreshToken: tokens.refresh_token },
            { merge: true },
          );
        }
        if (!cancelled)
          setState({
            status: "connected",
            accessToken: tokens.access_token,
            error: null,
          });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Spotify bağlanamadı";
        setState({ status: "error", accessToken: null, error: msg });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, checked]);

  const startLogin = useCallback(() => {
    setState((s) => ({ ...s, status: "connecting" }));
    void login(window.location.pathname);
  }, []);

  const logout = useCallback(async () => {
    clearAccessToken();
    if (user) {
      await setDoc(
        doc(firestore(), "users", user.uid),
        { spotifyRefreshToken: null },
        { merge: true },
      );
    }
    setState({ status: "disconnected", accessToken: null, error: null });
  }, [user]);

  return {
    status: state.status,
    accessToken: state.accessToken,
    error: state.error,
    login: startLogin,
    logout,
  };
}
