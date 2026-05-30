import type { Metadata, Viewport } from "next";
import { Playfair_Display, Quicksand } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { TelemetryBoot } from "./_telemetryBoot";

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
        <TelemetryBoot />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
