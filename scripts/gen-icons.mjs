import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), "..");

/* --- Peony geometry (mirrors src/components/PeonyDraw.tsx, final state) --- */
const CX = 120;
const CY = 120;

function petalPath(angleDeg, length, width, axisFrac = 0.54) {
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
  const f = (n) => n.toFixed(1);
  return (
    `M${CX},${CY} Q${f(a1x)},${f(a1y)} ${f(tx)},${f(ty)} ` +
    `Q${f(a2x)},${f(a2y)} ${CX},${CY} Z`
  );
}

const LAYERS = [
  { count: 9, length: 101, width: 43, fill: "#F2A7B3", stroke: "#E06D78", offset: 0 },
  { count: 7, length: 73, width: 37, fill: "#E06D78", stroke: "#A93344", offset: 0.5 },
  { count: 5, length: 47, width: 31, fill: "#A93344", stroke: "#7D2433", offset: 0.3 },
];

let petals = "";
for (const layer of LAYERS) {
  const step = 360 / layer.count;
  for (let i = 0; i < layer.count; i++) {
    const d = petalPath(i * step + layer.offset * step, layer.length, layer.width);
    petals +=
      `\n    <path d="${d}" fill="${layer.fill}" stroke="${layer.stroke}" ` +
      `stroke-width="2" stroke-linejoin="round"/>`;
  }
}

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="78%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="55%" stop-color="#F7FAF9"/>
      <stop offset="100%" stop-color="#F4B0BC"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 264) scale(1.9) translate(-120 -120)">${petals}
    <circle cx="120" cy="120" r="17" fill="#E8B851" stroke="#C9972F" stroke-width="2.2"/>
    <circle cx="120" cy="120" r="6.2" fill="#F7FAF9"/>
  </g>
</svg>
`;

await mkdir(resolve(root, "public/icons"), { recursive: true });
const svgPath = resolve(root, "public/icons/icon.svg");
await writeFile(svgPath, iconSvg, "utf8");
console.log("  ✓ icon.svg (bloomed peony)");

const svg = Buffer.from(iconSvg);
const outputs = [
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" },
  { size: 180, file: "apple-touch-icon.png" },
  { size: 32, file: "favicon-32.png" },
  { size: 16, file: "favicon-16.png" },
];

for (const { size, file } of outputs) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(root, "public/icons", file));
  console.log(`  ✓ ${file} (${size}×${size})`);
}

await sharp(svg).resize(48, 48).png().toFile(resolve(root, "public/favicon.ico"));
console.log("  ✓ favicon.ico (48×48)");
console.log("All icons regenerated from the bloomed peony.");
