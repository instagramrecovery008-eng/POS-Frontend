// Generates /public/favicon.svg and /public/favicon.ico (PNG-compressed ICO).
// Design: brand-green rounded square with a white plate + fork glyph.
// Pure Node — no external dependencies (zlib is built in).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
mkdirSync(PUBLIC_DIR, { recursive: true });

// ── CRC32 (PNG chunks) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// ── Minimal PNG encoder (RGBA8) ──
function encodePNG(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Draw the icon: 32×32 RGBA ──
const S = 32;
const px = Buffer.alloc(S * S * 4);
const GREEN = [22, 163, 74];      // #16A34A — app primary
const GREEN_DARK = [21, 128, 61]; // #15803D
const WHITE = [255, 255, 255];

// rounded-square mask (corner radius 7)
const inRoundRect = (x, y, r) => {
  const x0 = r, x1 = S - 1 - r, y0 = r, y1 = S - 1 - r;
  const cx = Math.max(x0, Math.min(x, x1));
  const cy = Math.max(y0, Math.min(y, y1));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= x0 && x <= x1) || (y >= y0 && y <= y1);
};

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (!inRoundRect(x, y, 7)) { px[i + 3] = 0; continue; }
    // subtle vertical gradient
    const t = y / (S - 1);
    px[i] = Math.round(GREEN[0] + (GREEN_DARK[0] - GREEN[0]) * t);
    px[i + 1] = Math.round(GREEN[1] + (GREEN_DARK[1] - GREEN[1]) * t);
    px[i + 2] = Math.round(GREEN[2] + (GREEN_DARK[2] - GREEN[2]) * t);
    px[i + 3] = 255;
  }
}

// white plate: outer ring + inner green circle
const plate = (x, y) => {
  const dx = x - (S / 2 - 0.5), dy = y - (S / 2 + 1.5);
  const d = Math.sqrt(dx * dx + dy * dy);
  return d >= 6.5 && d <= 10.5; // ring
};
// fork tines + handle (simple 3-line glyph above the plate)
const fork = (x, y) => {
  const cx = S / 2 - 0.5;
  // three tines
  for (const tx of [cx - 4.5, cx, cx + 4.5]) {
    if (Math.abs(x - tx) <= 0.8 && y >= 4 && y <= 9) return true;
  }
  // handle merging down
  return Math.abs(x - cx) <= 0.8 && y >= 9 && y <= 13;
};
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (px[i + 3] === 0) continue;
    if (plate(x, y) || fork(x, y)) { px[i] = WHITE[0]; px[i + 1] = WHITE[1]; px[i + 2] = WHITE[2]; }
  }
}

const png = encodePNG(S, S, px);

// ── ICO wrapper (1 image, PNG-compressed) ──
const ico = Buffer.concat([
  Buffer.from([0, 0, 1, 0, 1, 0]),                  // header: reserved, type=icon, count=1
  Buffer.from([S, S, 0, 0, 1, 0, 32, 0]),           // 32×32, 0 colors, 1 plane, 32 bpp
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(png.length); return b; })(),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(22); return b; })(), // offset = 6 + 16
  png,
]);

writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico);
writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="#16A34A"/>
  <rect x="1" y="1" width="30" height="30" rx="7" fill="none" stroke="#15803D" stroke-width="1.5"/>
  <circle cx="16" cy="17" r="8" fill="none" stroke="#fff" stroke-width="3"/>
  <path d="M13.5 4v5.5M16 4v5.5M18.5 4v5.5M16 9.5V13" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
</svg>
`);
console.log('✓ wrote public/favicon.ico (' + ico.length + ' bytes) and public/favicon.svg');
