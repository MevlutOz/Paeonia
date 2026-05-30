"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { createMemory } from "@/lib/memories";
import { uploadMemoryPhotoVariants } from "@/lib/storage";
import { todayIso } from "@/lib/format";
import type { MemorySong } from "@/lib/types";
import { SongPicker } from "@/components/SongPicker";
import { PeonyIcon } from "@/components/PeonyIcon";

interface PhotoItem {
  file: File;
  url: string;
}

export default function NewMemoryPage() {
  const router = useRouter();
  const { user, checked } = useAuthUser();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [song, setSong] = useState<MemorySong | null>(null);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");

  // Revoke any object URLs still alive when the page unmounts.
  const itemsRef = useRef<PhotoItem[]>([]);
  itemsRef.current = items;
  useEffect(() => {
    return () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
  }, []);

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Copy the FileList into real objects NOW — the input is cleared right after.
    const incoming: PhotoItem[] = Array.from(list).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setItems((prev) => {
      const next = [...prev, ...incoming];
      if (next.length > 12) {
        next.slice(12).forEach((it) => URL.revokeObjectURL(it.url));
        return next.slice(0, 12);
      }
      return next;
    });
  }

  function removeFile(idx: number) {
    setItems((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSave() {
    if (!user || saving) return;
    if (!title.trim()) {
      alert("Anıya bir başlık ver.");
      return;
    }
    setSaving(true);
    try {
      const photos: { url: string; path: string; variants: Awaited<ReturnType<typeof uploadMemoryPhotoVariants>>["variants"] }[] = [];
      for (let i = 0; i < items.length; i++) {
        setProgress(`Fotoğraflar yükleniyor… ${i + 1}/${items.length}`);
        const { url, path, variants } = await uploadMemoryPhotoVariants(user.uid, items[i].file);
        photos.push({ url, path, variants });
      }
      setProgress("Anı kaydediliyor…");
      const id = await createMemory({
        title,
        date,
        place,
        note,
        photos,
        song,
        createdBy: user.uid,
      });
      router.replace(`/memories/${id}`);
    } catch (e) {
      console.error("[memory] create failed:", e);
      alert("Anı kaydedilemedi. Tekrar dene.");
      setSaving(false);
      setProgress("");
    }
  }

  return (
    <main className="mx-auto max-w-xl min-h-dvh px-4 flex flex-col">
      <header className="pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Geri"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="font-display text-2xl text-aphrodite-dark">Yeni Anı</h1>
      </header>

      <div className="flex-1 space-y-4 pb-28">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
            Başlık
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="İlk buluşmamız"
            className="input-petal mt-1"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
              Tarih
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-petal mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
              Mekan
            </span>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Kordon, İzmir"
              className="input-petal mt-1"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
            Not
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="O gün neler hissettin?"
            className="input-petal mt-1 resize-none"
          />
        </label>

        <SongPicker value={song} onChange={setSong} />

        <div>
          <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
            Fotoğraflar ({items.length})
          </span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {items.map((it, i) => (
              <div
                key={it.url}
                className="relative aspect-square rounded-xl overflow-hidden border border-peony-light/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label="Kaldır"
                  className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-aphrodite-dark/70 text-white"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            {items.length < 12 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-peony-light/60 grid place-items-center text-peony-default cursor-pointer active:scale-95">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <span className="text-3xl leading-none">+</span>
              </label>
            )}
          </div>
          <p className="text-xs text-aphrodite-dark/45 mt-2">
            Birden fazla seçebilir veya + ile tek tek ekleyebilirsin. En fazla 12
            fotoğraf.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-nymph-bg via-nymph-bg to-transparent">
        {progress && (
          <p className="text-center text-xs text-peony-default mb-2">{progress}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-petal w-full"
        >
          {saving ? "Kaydediliyor…" : "Anıyı Kaydet"}
        </button>
      </div>
    </main>
  );
}
