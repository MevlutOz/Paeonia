"use client";

import { motion } from "framer-motion";

const CX = 120;
const CY = 120;

function petalPath(
  angleDeg: number,
  length: number,
  width: number,
  axisFrac = 0.54,
): string {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const tx = CX + length * dx;
  const ty = CY + length * dy;
  const mx = CX + length * axisFrac * dx;
  const my = CY + length * axisFrac * dy;
  const px = -dy;
  const py = dx;
  const a1x = mx + width * px;
  const a1y = my + width * py;
  const a2x = mx - width * px;
  const a2y = my - width * py;
  const f = (n: number) => n.toFixed(1);
  return (
    `M${CX},${CY} Q${f(a1x)},${f(a1y)} ${f(tx)},${f(ty)} ` +
    `Q${f(a2x)},${f(a2y)} ${CX},${CY} Z`
  );
}

interface Layer {
  count: number;
  length: number;
  width: number;
  fill: string;
  stroke: string;
  offset: number;
  start: number;
}

const LAYERS: Layer[] = [
  { count: 9, length: 101, width: 43, fill: "#F2A7B3", stroke: "#E06D78", offset: 0, start: 0.0 },
  { count: 7, length: 73, width: 37, fill: "#E06D78", stroke: "#A93344", offset: 0.5, start: 0.6 },
  { count: 5, length: 47, width: 31, fill: "#A93344", stroke: "#7D2433", offset: 0.3, start: 1.15 },
];

interface Petal {
  d: string;
  fill: string;
  stroke: string;
  delay: number;
}

const PETALS: Petal[] = [];
for (const layer of LAYERS) {
  const step = 360 / layer.count;
  for (let i = 0; i < layer.count; i++) {
    PETALS.push({
      d: petalPath(i * step + layer.offset * step, layer.length, layer.width),
      fill: layer.fill,
      stroke: layer.stroke,
      delay: layer.start + i * 0.05,
    });
  }
}

const DRAW = 0.62;

export function PeonyDraw({ size = 200 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full bg-peony-light/40 blur-2xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.8, scale: 1 }}
        transition={{ delay: 1.7, duration: 1.1, ease: "easeOut" }}
      />
      <motion.svg
        viewBox="0 0 240 240"
        width={size}
        height={size}
        className="relative"
        initial={{ scale: 0.92, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {PETALS.map((p, i) => (
          <motion.path
            key={i}
            d={p.d}
            fill={p.fill}
            stroke={p.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            initial={{ pathLength: 0, fillOpacity: 0 }}
            animate={{ pathLength: 1, fillOpacity: 1 }}
            transition={{
              pathLength: { delay: p.delay, duration: DRAW, ease: "easeInOut" },
              fillOpacity: { delay: p.delay + DRAW * 0.65, duration: 0.5 },
            }}
          />
        ))}

        {/* golden heart of the peony */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={17}
          fill="#E8B851"
          stroke="#C9972F"
          strokeWidth={2}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.7, duration: 0.5, ease: "backOut" }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />
        <motion.circle
          cx={CX}
          cy={CY}
          r={6}
          fill="#F7FAF9"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.9 }}
          transition={{ delay: 1.95, duration: 0.4, ease: "backOut" }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />
      </motion.svg>
    </div>
  );
}
