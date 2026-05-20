"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PeonyDraw } from "@/components/PeonyDraw";
import { FallingPetals } from "@/components/FallingPetals";
import { onUser } from "@/lib/auth";
import { isAllowedUid } from "@/lib/firebase";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      const unsub = onUser((user) => {
        if (user && isAllowedUid(user.uid)) router.replace("/home");
        else router.replace("/login");
        unsub();
      });
    }, 3300);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -left-12 w-64 h-64 bg-peony-light/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -right-10 w-72 h-72 bg-apollo-gold/15 rounded-full blur-3xl" />
      </div>

      <FallingPetals count={20} />

      <div className="relative flex flex-col items-center">
        <PeonyDraw size={240} />

        <motion.h1
          className="font-display text-5xl text-aphrodite-dark mt-6 tracking-wide"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.3, duration: 0.9, ease: "easeOut" }}
        >
          Paeoniam
        </motion.h1>
      </div>
    </main>
  );
}
