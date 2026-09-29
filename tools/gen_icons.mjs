/* Generates the PWA's PNG icons. Deterministic, no dependency: node is
 * enough (zlib is in the standard library).
 *
 *   node tools/gen_icons.mjs
 *
 * Writes icons/icon-192.png, icon-512.png, icon-maskable-512.png and
 * apple-touch-icon-180.png. Rerun only if the drawing changes.
 *
 * The colours come from the dark theme of css/base.css: background #221709,
 * porcelain #f3e8d8, coffee #d98741. The drawing is described in relative
 * coordinates (0 to 1) then sampled 4x4 per pixel for antialiasing.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKGROUND = [0x22, 0x17, 0x09];
const PORCELAIN = [0xf3, 0xe8, 0xd8];
const COFFEE = [0xd9, 0x87, 0x41];
const SUPERSAMPLE = 4;

/* ---------- Drawing ---------- */

const insideEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/* Vertical trapezoid: the half width shrinks linearly from top to bottom. */
function insideCup(x, y, top, bottom, halfTop, halfBottom, cx) {
  if (y < top || y > bottom) return false;
  const t = (y - top) / (bottom - top);
  const half = halfTop + (halfBottom - halfTop) * t;
  return Math.abs(x - cx) <= half;
}

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  if (dx === 0 || dy === 0) return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  return dx * dx + dy * dy <= radius * radius;
}

/* Returns the RGBA colour at a point, or null for transparent.
   scale moves the drawing closer to or away from the edge, for the maskable version. */
function sample(x, y, { cornerRadius, scale }) {
  if (!insideRoundedSquare(x, y, cornerRadius)) return null;

  // Drawing coordinates, recentred then scaled
  const dx = (x - 0.5) / scale + 0.5;
  const dy = (y - 0.5) / scale + 0.5;
  const cx = 0.5;

  // The cup's rim is an ellipse, the body a trapezoid starting from its
  // centre: the two join without a step. The coffee is a smaller ellipse,
  // which leaves the porcelain visible at the cup's rim.
  const RIM_Y = 0.375;
  const rim = insideEllipse(dx, dy, cx, RIM_Y, 0.235, 0.052);
  const brew = insideEllipse(dx, dy, cx, RIM_Y, 0.203, 0.040);
  const body = insideCup(dx, dy, RIM_Y, 0.735, 0.235, 0.163, cx);
  const bodyBottom = insideEllipse(dx, dy, cx, 0.735, 0.163, 0.036);
  const saucer = insideEllipse(dx, dy, cx, 0.778, 0.315, 0.048);

  // Handle: a full ring. Its left part falls inside the cup body, of the
  // same colour, so the join is invisible; its hole does not pierce the
  // body since the body is tested separately.
  const handleDistance = Math.hypot(dx - (cx + 0.245), dy - 0.520);
  const handle = handleDistance <= 0.112 && handleDistance >= 0.058;

  if (brew) return COFFEE;
  if (rim || body || bodyBottom || handle || saucer) return PORCELAIN;
  return BACKGROUND;
}

function render(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px * SUPERSAMPLE + sx + 0.5) * step;
          const y = (py * SUPERSAMPLE + sy + 0.5) * step;
          const colour = sample(x, y, options);
          if (colour) { r += colour[0]; g += colour[1]; b += colour[2]; hits += 1; }
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      if (hits === 0) continue;
      pixels[offset] = Math.round(r / hits);
      pixels[offset + 1] = Math.round(g / hits);
      pixels[offset + 2] = Math.round(b / hits);
      pixels[offset + 3] = Math.round((hits / total) * 255);
    }
  }
  return pixels;
}

/* ---------- PNG encoding ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;   // 8 bits per channel
  header[9] = 6;   // RGBA
  // 10, 11, 12 stay at zero: deflate, adaptive filter, not interlaced

  // Each row is prefixed with its filter byte, here 0 (no filter)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- Output ---------- */

// The maskable version leaves the safe zone: the drawing takes the centre
// and the background runs to the edge, the OS cuts whatever shape it wants.
const TARGETS = [
  { file: "icons/icon-192.png", size: 192, cornerRadius: 0.18, scale: 1 },
  { file: "icons/icon-512.png", size: 512, cornerRadius: 0.18, scale: 1 },
  { file: "icons/icon-maskable-512.png", size: 512, cornerRadius: 0, scale: 0.72 },
  { file: "icons/apple-touch-icon-180.png", size: 180, cornerRadius: 0, scale: 1 },
];

mkdirSync(join(ROOT, "icons"), { recursive: true });
for (const { file, size, cornerRadius, scale } of TARGETS) {
  const png = encodePng(size, render(size, { cornerRadius, scale }));
  writeFileSync(join(ROOT, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
