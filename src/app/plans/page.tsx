"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  subscribePlans,
  createPlan,
  setPlanDone,
  updatePlan,
  deletePlan,
} from "@/lib/plans";
import type { Plan } from "@/lib/types";
import { PeonyIcon } from "@/components/PeonyIcon";

function PlanRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(plan.title);
  const [note, setNote] = useState(plan.note);

  function openEdit() {
    setTitle(plan.title);
    setNote(plan.note);
    setEditing(true);
  }

  async function save() {
    if (!title.trim()) return;
    await updatePlan(plan.id, { title, note });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="glass-card rounded-2xl p-3 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-petal"
          placeholder="Aktivite"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input-petal resize-none"
          placeholder="Not (isteğe bağlı)"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => deletePlan(plan.id)}
            className="text-sm text-peony-dark/80 underline underline-offset-2 mr-auto"
          >
            Sil
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn-ghost text-sm px-3 py-1.5"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-petal text-sm px-4 py-1.5"
          >
            Kaydet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "glass-card rounded-2xl p-3 flex items-start gap-3 transition",
        plan.done && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => setPlanDone(plan.id, !plan.done)}
        aria-label={plan.done ? "Yapılmadı işaretle" : "Yapıldı işaretle"}
        className={clsx(
          "shrink-0 h-7 w-7 grid place-items-center rounded-full border-2 transition",
          plan.done
            ? "bg-peony-default border-peony-default text-white"
            : "border-peony-light bg-white",
        )}
      >
        {plan.done && <PeonyIcon size={16} />}
      </button>
      <button
        type="button"
        onClick={openEdit}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={clsx(
            "text-aphrodite-dark leading-snug break-words",
            plan.done && "line-through",
          )}
        >
          {plan.title}
        </p>
        {plan.note && (
          <p className="text-xs text-aphrodite-dark/55 mt-0.5 whitespace-pre-wrap break-words">
            {plan.note}
          </p>
        )}
      </button>
    </div>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const { user, checked } = useAuthUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribePlans((p) => {
      setPlans(p);
      setLoaded(true);
    });
    return () => unsub();
  }, [user]);

  const { pending, done } = useMemo(() => {
    return {
      pending: plans.filter((p) => !p.done),
      done: plans.filter((p) => p.done),
    };
  }, [plans]);

  async function add() {
    if (!user || !draft.trim() || adding) return;
    setAdding(true);
    const text = draft;
    setDraft("");
    try {
      await createPlan(text, user.uid);
    } finally {
      setAdding(false);
    }
  }

  if (!checked) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <PeonyIcon size={48} glow />
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="relative mx-auto max-w-xl min-h-dvh px-4 flex flex-col">
      <header className="pt-[max(env(safe-area-inset-top),12px)] pb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push("/home")}
          aria-label="Ana sayfa"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/70 border border-peony-light/50 text-aphrodite-dark/70 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-peony-default">
          <PeonyIcon size={24} glow />
          <h1 className="font-display text-2xl text-aphrodite-dark">Planlar</h1>
        </div>
        <span className="w-9 text-right text-xs text-aphrodite-dark/55">
          {plans.length > 0 ? `${done.length}/${plans.length}` : ""}
        </span>
      </header>

      <div className="flex items-end gap-2 pb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Birlikte yapmak istediğiniz bir şey…"
          className="input-petal"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || adding}
          className="btn-petal px-5 shrink-0"
        >
          Ekle
        </button>
      </div>

      {!loaded ? (
        <div className="flex-1 grid place-items-center">
          <PeonyIcon size={40} glow />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex-1 grid place-items-center px-8">
          <div className="text-center text-aphrodite-dark/60 max-w-xs">
            <div className="text-peony-light flex justify-center mb-3">
              <PeonyIcon size={56} />
            </div>
            <p className="font-display text-2xl text-aphrodite-dark">
              Liste boş
            </p>
            <p className="text-sm mt-2">
              Birlikte yapmak istediğiniz aktiviteleri buraya ekleyin.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto chat-scroll pb-8 space-y-2.5">
          {pending.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}

          {done.length > 0 && (
            <p className="text-xs uppercase tracking-wider text-aphrodite-dark/45 pt-3 pb-1">
              Yapıldı · {done.length}
            </p>
          )}
          {done.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </div>
      )}
    </main>
  );
}
