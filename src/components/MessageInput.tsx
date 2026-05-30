"use client";

import { useRef, useState } from "react";
import { PeonyIcon } from "./PeonyIcon";

interface Props {
  onSend: (text: string) => void | Promise<void>;
  onOpenCanvas: () => void;
  onPickPhoto: (file: File) => void | Promise<void>;
  onPickVideo: (file: File) => void | Promise<void>;
}

export function MessageInput({
  onSend,
  onOpenCanvas,
  onPickPhoto,
  onPickVideo,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setValue("");
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || mediaBusy) return;
    setMediaBusy(true);
    try {
      if (file.type.startsWith("video/")) {
        await onPickVideo(file);
      } else {
        await onPickPhoto(file);
      }
    } finally {
      setMediaBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 bg-gradient-to-t from-nymph-bg via-nymph-bg/95 to-transparent"
    >
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={mediaBusy}
          aria-label="Kameradan çek"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition disabled:opacity-50"
        >
          {mediaBusy ? (
            <span className="animate-sway">
              <PeonyIcon size={20} glow />
            </span>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm8 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
                fill="currentColor"
              />
              <circle cx="18.5" cy="9.5" r="1" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={mediaBusy}
          aria-label="Galeriden foto veya video seç"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition disabled:opacity-50"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3l-2 3-2-3H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 5h8M8 12h6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M9 6h6v2H9zM6 10h2v2H6zm10 2h2v2h-2z"
              fill="currentColor"
              opacity="0.3"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={onOpenCanvas}
          aria-label="Çizim tahtasını aç"
          className="h-11 w-11 grid place-items-center rounded-full bg-white/80 border border-peony-light/50 text-peony-default shadow-petal active:scale-95 transition"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-9.96a1 1 0 0 0 0-1.41l-2.59-2.59a1 1 0 0 0-1.41 0l-2 2 4 4 2-2Z"
              fill="currentColor"
            />
          </svg>
        </button>

        <div className="flex-1 relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder="Fısılda…"
            className="input-petal resize-none max-h-32 py-3 pr-12"
          />
          <button
            type="submit"
            disabled={!value.trim() || sending}
            aria-label="Gönder"
            className="absolute right-1.5 bottom-1.5 h-9 w-9 grid place-items-center rounded-full bg-peony-default text-white shadow-petal disabled:opacity-40 active:scale-95"
          >
            <PeonyIcon size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
