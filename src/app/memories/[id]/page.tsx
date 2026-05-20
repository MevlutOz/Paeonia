"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  watchMemory,
  updateMemoryMeta,
  updateMemoryPhotos,
  deleteMemory,
} from "@/lib/memories";
import { uploadMemoryPhoto } from "@/lib/storage";
import { autoLayout, layoutFitsCount } from "@/lib/collage";
import { requestCollageExport } from "@/lib/collageExport";
import { formatMemoryDate } from "@/lib/format";
import type { CollageLayout, Memory, MemoryPhoto, MemorySong } from "@/lib/types";
import { Collage } from "@/components/Collage";
import { CollageTemplatePicker } from "@/components/CollageTemplatePicker";
import { SongPicker } from "@/components/SongPicker";
import { MemoryMusic } from "@/components/MemoryMusic";
import { Lightbox } from "@/components/Lightbox";
import { PeonyIcon } from "@/components/PeonyIcon";

export default function MemoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const { user, checked } = useAuthUser();

  const [memory, setMemory] = useState<Memory | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [song, setSong] = useState<MemorySong | null>(null);
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [collage, setCollage] = useState<CollageLayout>(autoLayout(0));
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = watchMemory(id, (m) => {
      setMemory(m);
      setLoaded(true);
    });
    return () => unsub();
  }, [user, id]);

  function startEdit() {
    if (!memory) return;
    setTitle(memory.title);
    setDate(memory.date);
    setPlace(memory.place);
    setNote(memory.note);
    setSong(memory.song);
    setPhotos(memory.photos);
    setCollage(
      layoutFitsCount(memory.collage, memory.photos.length)
        ? memory.collage
        : autoLayout(memory.photos.length),
    );
    setSelectedCell(null);
    setEditing(true);
  }

  function onCellTap(i: number) {
    if (selectedCell === null) {
      setSelectedCell(i);
      return;
    }
    if (selectedCell === i) {
      setSelectedCell(null);
      return;
    }
    setPhotos((prev) => {
      const next = [...prev];
      [next[selectedCell], next[i]] = [next[i], next[selectedCell]];
      return next;
    });
    setSelectedCell(null);
  }

  async function addPhotos(list: FileList | null) {
    if (!list || !user) return;
    const files = Array.from(list);
    setBusy("Fotoğraflar yükleniyor…");
    try {
      const added: MemoryPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy(`Fotoğraflar yükleniyor… ${i + 1}/${files.length}`);
        added.push(await uploadMemoryPhoto(user.uid, files[i]));
      }
      setPhotos((prev) => {
        const next = [...prev, ...added].slice(0, 12);
        setCollage((cur) =>
          layoutFitsCount(cur, next.length) ? cur : autoLayout(next.length),
        );
        return next;
      });
    } catch (e) {
      console.error("[memory] add photo failed:", e);
      alert("Fotoğraf eklenemedi.");
    } finally {
      setBusy("");
    }
  }

  function removePhoto(i: number) {
    setPhotos((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      setCollage((cur) =>
        layoutFitsCount(cur, next.length) ? cur : autoLayout(next.length),
      );
      return next;
    });
    setSelectedCell(null);
  }

  async function saveEdit() {
    if (!memory || saving) return;
    if (!title.trim()) {
      alert("Anıya bir başlık ver.");
      return;
    }
    setSaving(true);
    try {
      await updateMemoryMeta(memory.id, { title, date, place, note, song });
      await updateMemoryPhotos(
        memory.id,
        photos,
        layoutFitsCount(collage, photos.length)
          ? collage
          : autoLayout(photos.length),
      );
      setEditing(false);
    } catch (e) {
      console.error("[memory] save failed:", e);
      alert("Kaydedilemedi. Tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!memory) return;
    if (!confirm("Bu anı silinsin mi? Geri alınamaz.")) return;
    try {
      await deleteMemory(memory.id);
      router.replace("/memories");
    } catch (e) {
      console.error("[memory] delete failed:", e);
      alert("Silinemedi.");
    }
  }

  async function handleExport() {
    if (!memory || busy) return;
    setBusy("Kolaj hazırlanıyor…");
    try {
      const url = await requestCollageExport(memory.id);
      setLightbox(url);
    } catch (e) {
      console.error("[memory] export failed:", e);
      alert("Kolaj oluşturulamadı. Tekrar dene.");
    } finally {
      setBusy("");
    }
  }

  if (!checked || !loaded) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;
  if (!memory) {
    return (
      <main className="min-h-dvh grid place-items-center px-8 text-center">
        <div>
          <p className="font-display text-2xl text-aphrodite-dark">Anı bulunamadı</p>
          <button
            onClick={() => router.replace("/memories")}
            className="btn-petal mt-4"
          >
            Anılara dön
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl min-h-dvh px-4 flex flex-col">
      <header className="pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : router.push("/memories"))}
          aria-label="Geri"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="font-display text-xl text-aphrodite-dark truncate">
          {editing ? "Anıyı Düzenle" : memory.title || "Anı"}
        </h1>
        {editing ? (
          <span className="w-9" />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="h-9 px-3 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/80 text-sm active:scale-95"
          >
            Düzenle
          </button>
        )}
      </header>

      {/* ---------- VIEW MODE ---------- */}
      {!editing && (
        <div className="flex-1 pb-28 space-y-4">
          <div className="relative">
            <Collage
              photos={memory.photos}
              collage={memory.collage}
              onCellOpen={(i) => setLightbox(memory.photos[i]?.url ?? null)}
            />
            {memory.song && (
              <div className="absolute bottom-3 left-3 right-3 flex">
                <MemoryMusic key={memory.song.previewUrl} song={memory.song} />
              </div>
            )}
          </div>

          <div>
            <h2 className="font-display text-3xl text-aphrodite-dark">
              {memory.title || "İsimsiz anı"}
            </h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm">
              {memory.date && (
                <span className="text-aphrodite-dark/70">
                  {formatMemoryDate(memory.date)}
                </span>
              )}
              {memory.place && (
                <span className="text-peony-default">{memory.place}</span>
              )}
            </div>
            {memory.note && (
              <p className="mt-3 text-aphrodite-dark/85 whitespace-pre-wrap leading-relaxed">
                {memory.note}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- EDIT MODE ---------- */}
      {editing && (
        <div className="flex-1 pb-32 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-aphrodite-dark/60">
              Başlık
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              className="input-petal mt-1 resize-none"
            />
          </label>

          <SongPicker value={song} onChange={setSong} />

          {photos.length > 0 && (
            <>
              <div>
                <p className="text-xs uppercase tracking-wider text-aphrodite-dark/60 mb-1.5">
                  Kolaj · yer değiştirmek için iki kareye dokun
                </p>
                <Collage
                  photos={photos}
                  collage={
                    layoutFitsCount(collage, photos.length)
                      ? collage
                      : autoLayout(photos.length)
                  }
                  selecting
                  selectedIndex={selectedCell}
                  onCellTap={onCellTap}
                />
              </div>

              <CollageTemplatePicker
                count={photos.length}
                currentTemplateId={collage.templateId}
                onPick={(layout) => setCollage(layout)}
              />
            </>
          )}

          <div>
            <p className="text-xs uppercase tracking-wider text-aphrodite-dark/60 mb-1.5">
              Fotoğraflar ({photos.length})
            </p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div
                  key={p.url}
                  className="relative aspect-square rounded-lg overflow-hidden border border-peony-light/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="Kaldır"
                    className="absolute top-0.5 right-0.5 h-5 w-5 grid place-items-center rounded-full bg-aphrodite-dark/70 text-white"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
              {photos.length < 12 && (
                <label className="aspect-square rounded-lg border-2 border-dashed border-peony-light/60 grid place-items-center text-peony-default cursor-pointer active:scale-95">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <span className="text-2xl leading-none">+</span>
                </label>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-peony-dark/80 underline underline-offset-2"
          >
            Bu anıyı sil
          </button>
        </div>
      )}

      {/* ---------- BOTTOM BAR ---------- */}
      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-nymph-bg via-nymph-bg to-transparent">
        {busy && (
          <p className="text-center text-xs text-peony-default mb-2">{busy}</p>
        )}
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-ghost flex-1"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="btn-petal flex-1"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleExport}
            disabled={!!busy || memory.photos.length === 0}
            className="btn-petal w-full"
          >
            Kolajı İndir
          </button>
        )}
      </div>

      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </main>
  );
}
