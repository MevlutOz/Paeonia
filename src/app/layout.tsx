import type { Metadata, Viewport } from "next";
import { Playfair_Display, Quicksand } from "next/font/google";
import "./globals.css";
import { SpotifyPlayerProvider } from "@/lib/SpotifyPlayerProvider";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Paeonia · Gizli Bahçe",
  description: "Sadece ikimize ait, mahcup bir bahçe.",
  manifest: "/manifest.json",
  applicationName: "Paeonia",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Paeonia",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#E06D78",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${playfair.variable} ${quicksand.variable}`}>
      <body className="min-h-dvh">
        {/*
          Spotify player provider mounted at the root: the SDK loads + connects
          + pre-warms as soon as the user has a Spotify refresh token, so by
          the time they open a memory the player is already ready and playback
          starts in ~200-500ms instead of 1-3s.
        */}
        <SpotifyPlayerProvider>{children}</SpotifyPlayerProvider>
      </body>
    </html>
  );
}
