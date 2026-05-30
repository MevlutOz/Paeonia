"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { Message, PhotoVariants } from "@/lib/types";

interface Props {
  messages: Message[];
  currentUserId: string;
  onOpenImage: (url: string, variants?: PhotoVariants | null) => void;
  onOpenVideo: (url: string, poster?: string | null) => void;
}

export function MessageList({
  messages,
  currentUserId,
  onOpenImage,
  onOpenVideo,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 grid place-items-center px-8">
        <div className="text-center text-aphrodite-dark/55 max-w-xs">
          <p className="font-display text-2xl text-aphrodite-dark">Bahçe sessiz…</p>
          <p className="text-sm mt-2">
            İlk tomurcuğu sen aç. Bir kelime, bir çizim, bir mahcubiyet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 chat-scroll overflow-y-auto px-4 py-6 space-y-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          mine={m.senderId === currentUserId}
          onOpenImage={onOpenImage}
          onOpenVideo={onOpenVideo}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
