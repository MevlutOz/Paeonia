/**
 * Spotify Authorization Code with PKCE flow.
 *
 * Public Spotify API ile birlikte client-side PKCE flow yürütür. Server-side
 * client secret gerekmez. Refresh token'lar Firestore users/{uid} doc'una
 * yazılır; access token'lar sessionStorage'da yaşar (tab kapanınca silinir).
 *
 * Spec: docs/superpowers/specs/2026-05-24-anilar-sarki-trim-design.md §8
 */

const SCOPE = "streaming user-read-email user-read-private";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

const STORAGE_KEY = {
  verifier: "sp_pkce_verifier",
  state: "sp_oauth_state",
  returnTo: "sp_return_to",
  accessToken: "sp_access_token",
  expiresAt: "sp_expires_at",
} as const;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: "Bearer";
  scope: string;
}

/** Base64url encode a byte array (no padding, URL-safe alphabet). */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Generate a PKCE verifier + S256 challenge pair. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64url(new Uint8Array(hash));
  return { verifier, challenge };
}

function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function redirectUri(): string {
  return `${window.location.origin}/auth/spotify/callback`;
}

function clientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID tanımlı değil");
  return id;
}

/**
 * Begin the OAuth flow. Saves verifier/state/returnTo to localStorage
 * then redirects to Spotify's authorize endpoint. Never returns.
 */
export async function login(returnTo: string = window.location.pathname): Promise<void> {
  const { verifier, challenge } = await generatePkce();
  const state = randomState();
  localStorage.setItem(STORAGE_KEY.verifier, verifier);
  localStorage.setItem(STORAGE_KEY.state, state);
  localStorage.setItem(STORAGE_KEY.returnTo, returnTo);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    redirect_uri: redirectUri(),
    scope: SCOPE,
  });
  window.location.assign(`${AUTHORIZE_ENDPOINT}?${params}`);
}

/**
 * Exchange the authorization code for tokens. Throws on failure.
 * Called only from /auth/spotify/callback.
 */
export async function exchangeCode(params: {
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: params.verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Refresh an access token using a stored refresh token. Spotify may rotate
 * the refresh_token; caller must persist the new one if present.
 */
export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Cache an access token + its expiry in sessionStorage. */
export function cacheAccessToken(token: string, expiresInSec: number): void {
  sessionStorage.setItem(STORAGE_KEY.accessToken, token);
  sessionStorage.setItem(
    STORAGE_KEY.expiresAt,
    String(Date.now() + expiresInSec * 1000),
  );
}

/** Read the cached access token if still valid (≥60s remaining). */
export function readAccessToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY.accessToken);
  const expiresAt = Number(sessionStorage.getItem(STORAGE_KEY.expiresAt) ?? 0);
  if (!token) return null;
  if (Date.now() > expiresAt - 60_000) return null;
  return token;
}

/** Clear access token cache (refresh token stays in Firestore). */
export function clearAccessToken(): void {
  sessionStorage.removeItem(STORAGE_KEY.accessToken);
  sessionStorage.removeItem(STORAGE_KEY.expiresAt);
}

/** Storage keys used by callback page to pop the saved verifier/state. */
export const authStorageKeys = STORAGE_KEY;
