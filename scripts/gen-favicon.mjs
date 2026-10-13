// Generates /public/favicon.svg and /public/favicon.ico (PNG-compressed ICO)
// from /public/klargo-icon.png (the KlarGo cart glyph).
// Requires sharp — resolved from the sibling backend package (dev-only script).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const SRC = join(PUBLIC_DIR, 'klargo-icon.png');

let sharp;
try {
  const require = createRequire(join(__dirname, '..', '..', 'backend', 'package.json'));
  sharp = require('sharp');
} catch {
  console.error('✗ sharp not found. Run `npm install` in backend/ first (dev-only dependency).');
  process.exit(1);
}

// ── Rasterize the cart glyph at favicon sizes (white tile, like the app logo) ──
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const png32 = await sharp(SRC).resize(32, 32, { fit: 'contain', background: WHITE }).png().toBuffer();
const png16 = await sharp(SRC).resize(16, 16, { fit: 'contain', background: WHITE }).png().toBuffer();
const png64 = await sharp(SRC).resize(64, 64, { fit: 'contain', background: WHITE }).png().toBuffer();

// ── ICO wrapper: 2 PNG-compressed entries (32×32, 16×16) ──
const entries = [
  { size: 32, data: png32 },
  { size: 16, data: png16 },
];
const headerSize = 6 + 16 * entries.length;
let offset = headerSize;
const dir = entries.map(({ size, data }) => {
  const b = Buffer.alloc(16);
  b[0] = size === 256 ? 0 : size;   // width (0 = 256)
  b[1] = size === 256 ? 0 : size;   // height
  b[2] = 0;                          // palette colors
  b[3] = 0;                          // reserved
  b.writeUInt16LE(1, 4);             // color planes
  b.writeUInt16LE(32, 6);            // bpp
  b.writeUInt32LE(data.length, 8);   // image size
  b.writeUInt32LE(offset, 12);       // image offset
  offset += data.length;
  return b;
});
const ico = Buffer.concat([
  Buffer.from([0, 0, 1, 0, entries.length, 0]),  // header: reserved, type=icon, count
  ...dir,
  ...entries.map((e) => e.data),
]);

// ── SVG favicon: same glyph embedded as a base64 PNG (data URIs are allowed
//    inside SVG favicons; external references are blocked by browsers) ──
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <image href="data:image/png;base64,${png64.toString('base64')}" width="64" height="64"/>
</svg>
`;

import { writeFileSync } from 'node:fs';
writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico);
writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), svg);
console.log('✓ wrote public/favicon.ico (' + ico.length + ' bytes) and public/favicon.svg (' + svg.length + ' bytes)');
