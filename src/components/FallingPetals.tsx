"use client";

import { useMemo } from "react";

const COLORS = ["#F2A7B3", "#E06D78", "#E8B851", "#F7C9D0", "#EFB8C4"];
const PETAL_D = "M12 2 C 7 8, 6 16, 12 22 C 18 16, 17 8, 12 2 Z";

/** Deterministic PRNG so server and client render the same petals. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PetalCfg {
  left: number;
  size: number;
  color: string;
  fall: number;
  fallDelay: number;
  sway: number;
  swayDur: number;
  swayDelay: number;
  r0: number;
  r1: number;
  opacity: number;
}

function makePetals(count: number): PetalCfg[] {
  const rnd = mulberry32(0x70656f6e);
  const out: PetalCfg[] = [];
  for (let i = 0; i < count; i++) {
    const fall = 8 + rnd() * 9;
    const swayDur = 2.6 + rnd() * 3.2;
    out.push({
      left: rnd() * 96,
      size: 13 + rnd() * 21,
      color: COLORS[Math.floor(rnd() * COLORS.length)],
      fall,
      fallDelay: -(rnd() * fall), // negative => already mid-fall at load
      sway: 16 + rnd() * 48,
      swayDur,
      swayDelay: -(rnd() * swayDur),
      r0: rnd() * 200,
      r1: rnd() * 200 + (rnd() > 0.5 ? 360 : -360),
      opacity: 0.4 + rnd() * 0.45,
    });
  }
  return out;
}

export function FallingPetals({ count = 18 }: { count?: number }) {
  const petals = useMemo(() => makePetals(count), [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {petals.map((p, i) => (
        <div
          key={i}
          className="absolute top-0"
          style={
            {
              left: `${p.left}%`,
              animation: `petalFall ${p.fall}s linear ${p.fallDelay}s infinite`,
              "--r0": `${p.r0}deg`,
              "--r1": `${p.r1}deg`,
            } as React.CSSProperties
          }
        >
          <div
            style={
              {
                animation: `petalSway ${p.swayDur}s ease-in-out ${p.swayDelay}s infinite alternate`,
                "--sway": `${p.sway}px`,
              } as React.CSSProperties
            }
          >
            <svg
              viewBox="0 0 24 24"
              width={p.size}
              height={p.size}
              style={{ opacity: p.opacity, display: "block" }}
            >
              <path d={PETAL_D} fill={p.color} />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
