// Rasteriza public/assets/vertex-ico.svg a los PNG que exige el manifiesto PWA.
// Sin dependencias: relleno por scanline con supermuestreo + codificador PNG sobre zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const VIEWBOX = { w: 860.21, h: 594.45 };

const PURPLE = [0x6d, 0x21, 0xef];
const CYAN = [0x0f, 0xdf, 0xf3];
const BG = [0x0b, 0x0e, 0x19];

const parse = (s) => {
  const n = s.trim().split(/\s+/).map(Number);
  const pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
};

const SHAPES = [
  {
    color: PURPLE,
    pts: parse(
      "488.46 278.81 359.42 502.32 355.11 494.87 320.06 434.17 268.29 344.46 272.72 336.78 289.84 307.13 302.71 284.86 325.24 245.85 353.47 294.74 330.87 333.83 358.47 381.8 381.22 342.82 417.99 279.91 334.83 134.95 216.48 134.95 249.44 192.23 294.28 192.23 322.5 241.12 208.62 241.12 180.4 192.23 112.6 74.81 370.68 74.81 488.46 278.81",
    ),
  },
  {
    color: CYAN,
    pts: parse(
      "747.6 74.81 490.81 519.65 382.65 519.65 436.42 426.52 456.42 461.17 470.27 437.2 644.71 135.07 524.66 135.07 548.54 176.42 534.7 200.42 513.47 237.16 454.52 135.07 489.29 74.81 747.6 74.81",
    ),
  },
];

/** Winding number: las formas del logo tienen orientaciones mixtas. */
function inside(pts, x, y) {
  let winding = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    if (y1 <= y) {
      if (y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) winding++;
    } else if (y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) {
      winding--;
    }
  }
  return winding !== 0;
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Cada scanline lleva su byte de filtro (0 = None) delante.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * @param size    lado del PNG en px
 * @param inset   fracción del lado que ocupa el margen alrededor del logo
 * @param radius  radio de esquina en fracción del lado (0 = cuadrado a sangre)
 * @param opaque  true = fondo sólido (iOS y maskable no admiten transparencia)
 */
function render({ size, inset, radius, opaque }) {
  const SS = 4; // supermuestreo
  const out = Buffer.alloc(size * size * 4);
  const box = size * (1 - 2 * inset);
  const scale = box / Math.max(VIEWBOX.w, VIEWBOX.h);
  const offsetX = (size - VIEWBOX.w * scale) / 2;
  const offsetY = (size - VIEWBOX.h * scale) / 2;
  const r = radius * size;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      const acc = [0, 0, 0];
      let fgHits = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;

          // Máscara de esquinas redondeadas.
          if (r > 0) {
            const cx = Math.min(Math.max(x, r), size - r);
            const cy = Math.min(Math.max(y, r), size - r);
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          }
          bgHits++;

          const vx = (x - offsetX) / scale;
          const vy = (y - offsetY) / scale;
          for (const shape of SHAPES) {
            if (inside(shape.pts, vx, vy)) {
              acc[0] += shape.color[0];
              acc[1] += shape.color[1];
              acc[2] += shape.color[2];
              fgHits++;
              break;
            }
          }
        }
      }

      const total = SS * SS;
      const i = (py * size + px) * 4;
      const bgAlpha = (bgHits / total) * 255;
      const fgAlpha = fgHits / total;

      // Compone el logo sobre el fondo, ambos con su cobertura antialiaseada.
      const fg = fgHits > 0 ? acc.map((c) => c / fgHits) : [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round(BG[c] * (1 - fgAlpha) + fg[c] * fgAlpha);
      }
      out[i + 3] = opaque ? Math.round(bgAlpha) : Math.round(bgAlpha);
    }
  }
  return encodePng(size, size, out);
}

const targets = [
  { file: "public/icon-192.png", size: 192, inset: 0.16, radius: 0.22 },
  { file: "public/icon-512.png", size: 512, inset: 0.16, radius: 0.22 },
  // Maskable: Android recorta hasta el 20% exterior, así que el logo va más chico
  // y el fondo llega a sangre (radius 0).
  { file: "public/icon-maskable-512.png", size: 512, inset: 0.28, radius: 0 },
  // En app/ porque Next genera el <link rel="apple-touch-icon"> desde ahí.
  { file: "app/apple-icon.png", size: 180, inset: 0.16, radius: 0 },
  { file: "app/icon.png", size: 64, inset: 0.1, radius: 0.22 },
];

for (const t of targets) {
  writeFileSync(t.file, render({ ...t, opaque: true }));
  console.log("wrote", t.file);
}
