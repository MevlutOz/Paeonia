"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { onUser, signOut } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";
import {
  sendText,
  sendMedia,
  markAllReadFrom,
} from "@/lib/messages";
import { uploadDataUrl, uploadPhoto } from "@/lib/storage";
import { maybeRegisterFcm } from "@/lib/fcm";
import { useMessages } from "@/lib/hooks/useMessages";
import { reportRouteReady } from "@/lib/telemetry/events";
import { MessageList } from "@/components/MessageList";
import { MessageInput } from "@/components/MessageInput";
import { CanvasBottomSheet } from "@/components/CanvasBottomSheet";
import { Lightbox } from "@/components/Lightbox";
import { PeonyIcon } from "@/components/PeonyIcon";
import { usePresence } from "@/lib/usePresence";

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { messages, loading } = useMessages();
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [bootChecked, setBootChecked] = useState(false);
  const fcmAsked = useRef(false);
  const routeReadyFired = useRef(false);
  const { partnerOnline } = usePresence(user?.uid ?? null);

  useEffect(() => {
    const unsub = onUser((u) => {
      setBootChecked(true);
      if (!u || !isAllowedUid(u.uid)) {
        router.replace("/login");
        return;
      }
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!loading && !routeReadyFired.current) {
      routeReadyFired.current = true;
      reportRouteReady("chat");
    }
  }, [loading]);

  // Mark incoming as read whenever new arrives
  useEffect(() => {
    if (!user) return;
    const partner = messages.find((m) => m.senderId !== user.uid && !m.isRead);
    if (partner) void markAllReadFrom(partner.senderId).catch(() => {});
  }, [messages, user]);

  // Ask FCM permission once after login
  useEffect(() => {
    if (!user || fcmAsked.current) return;
    fcmAsked.current = true;
    const t = setTimeout(() => {
      void maybeRegisterFcm(user.uid).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);

  async function handleText(text: string) {
    if (!user) return;
    await sendText(user.uid, text);
  }

  async function handleDrawing(dataUrl: string) {
    if (!user) return;
    const url = await uploadDataUrl(user.uid, dataUrl, "drawing");
    await sendMedia(user.uid, url, "drawing");
  }

  async function handlePhoto(file: File) {
    if (!user) return;
    try {
      const url = await uploadPhoto(user.uid, file);
      await sendMedia(user.uid, url, "photo");
    } catch (e) {
      console.error("[photo] upload failed:", e);
      alert("Fotoğraf gönderilemedi. Tekrar dene.");
    }
  }

  if (!bootChecked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="relative isolate mx-auto max-w-xl flex flex-col h-dvh">
      <div
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-[1500ms]",
          partnerOnline ? "opacity-100" : "opacity-0",
        )}
        style={{
          background:
            "linear-gradient(180deg, #FFE3B0 0%, #FBC79A 34%, #F7A98C 64%, #F2A7B3 100%)",
        }}
      />
      <header className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/home")}
          aria-label="Ana sayfa"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-peony-default">
          <PeonyIcon size={24} glow />
          <h1 className="font-display text-2xl text-aphrodite-dark">Gizli Bahçe</h1>
        </div>
        <button
          type="button"
          onClick={() => signOut().then(() => router.replace("/login"))}
          className="text-xs text-aphrodite-dark/55 hover:text-peony-dark"
        >
          Çık
        </button>
      </header>

      <MessageList
        messages={messages}
        currentUserId={user.uid}
        onOpenImage={setLightboxUrl}
      />

      <MessageInput
        onSend={handleText}
        onOpenCanvas={() => setCanvasOpen(true)}
        onPickPhoto={handlePhoto}
      />

      <CanvasBottomSheet
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        onSend={handleDrawing}
        partnerOnline={partnerOnline}
        uid={user.uid}
      />

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </main>
  );
}
