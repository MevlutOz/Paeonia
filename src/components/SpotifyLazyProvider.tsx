"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const SpotifyPlayerProvider = dynamic(
  () =>
    import("@/lib/SpotifyPlayerProvider").then((m) => m.SpotifyPlayerProvider),
  { ssr: false, loading: () => null },
);

/**
 * Lazy wrapper for SpotifyPlayerProvider. Use in route layouts that actually
 * need the Web Playback SDK (currently /memories/*). NOT in the root layout —
 * /home, /chat, /album, /plans don't need the player and shouldn't pay the
 * SDK load cost.
 *
 * The wrapped provider still pre-warms the SDK once mounted, so first play
 * inside the route remains fast.
 */
export function SpotifyLazyProvider({ children }: { children: ReactNode }) {
  return <SpotifyPlayerProvider>{children}</SpotifyPlayerProvider>;
}
