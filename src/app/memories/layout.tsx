import type { ReactNode } from "react";
import { SpotifyLazyProvider } from "@/components/SpotifyLazyProvider";

/**
 * Wraps every /memories/* route with the lazy Spotify provider. Keeping the
 * provider at this layout level (not on each page) means the SDK stays warm
 * as the user navigates list ↔ detail ↔ edit ↔ new — no reconnect on every
 * transition.
 */
export default function MemoriesLayout({ children }: { children: ReactNode }) {
  return <SpotifyLazyProvider>{children}</SpotifyLazyProvider>;
}
