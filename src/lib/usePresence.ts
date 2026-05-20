"use client";

import { useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { firestore, allowedUids } from "./firebase";

const HEARTBEAT_MS = 25_000;
const STALE_MS = 60_000;

/**
 * Kendi çevrimiçi durumunu yazar (heartbeat + kapanışta offline) ve partnerin
 * çevrimiçi olup olmadığını döndürür. Partner yalnızca isOnline === true VE
 * lastSeen son STALE_MS içinde ise çevrimiçi sayılır.
 *
 * Yalnızca /chat sayfasında mount edilmelidir.
 */
export function usePresence(myUid: string | null): { partnerOnline: boolean } {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const partnerData = useRef<{ isOnline: boolean; lastSeenMs: number } | null>(
    null,
  );

  // Kendi presence'ımı yaz.
  useEffect(() => {
    if (!myUid) return;
    const ref = doc(firestore(), "users", myUid);
    const online = () =>
      void setDoc(
        ref,
        { isOnline: true, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    const offline = () =>
      void setDoc(
        ref,
        { isOnline: false, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});

    online();
    const hb = setInterval(online, HEARTBEAT_MS);
    const onVis = () =>
      document.visibilityState === "hidden" ? offline() : online();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", offline);

    return () => {
      clearInterval(hb);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", offline);
      offline();
    };
  }, [myUid]);

  // Partnerin presence'ını izle + bayatlık denetimi.
  useEffect(() => {
    if (!myUid) return;
    const partnerUid = allowedUids.find((u) => u !== myUid);
    if (!partnerUid) return;

    const evaluate = () => {
      const p = partnerData.current;
      setPartnerOnline(
        !!p && p.isOnline && Date.now() - p.lastSeenMs < STALE_MS,
      );
    };

    const ref = doc(firestore(), "users", partnerUid);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      const last = (d?.lastSeen as Timestamp | null) ?? null;
      partnerData.current = {
        isOnline: !!d?.isOnline,
        lastSeenMs: last ? last.toMillis() : 0,
      };
      evaluate();
    });
    // onSnapshot partner sessizce kapanırsa tetiklenmez; periyodik yeniden değerlendir.
    const ticker = setInterval(evaluate, 20_000);

    return () => {
      unsub();
      clearInterval(ticker);
    };
  }, [myUid]);

  return { partnerOnline };
}
