import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Generates a crisp 256x256 PNG-backed Windows .ico for MargeX (rounded blue-indigo gradient + layered diamond mark)
const W = 256;
const H = 256;
const rgba = Buffer.alloc(W * H * 4);

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = (y * W + x) * 4;
  const alpha = a / 255;
  const inv = 1 - alpha;
  rgba[idx] = Math.round(r * alpha + rgba[idx] * inv);
  rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * inv);
  rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * inv);
  rgba[idx + 3] = Math.min(255, Math.round(a + rgba[idx + 3] * inv));
}

function insideRoundedRect(x, y, rx, ry, rw, rh, radius) {
  const cx = Math.max(rx + radius, Math.min(x, rx + rw - radius));
  const cy = Math.max(ry + radius, Math.min(y, ry + rh - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

// 1. Rounded square background with blue -> indigo gradient
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (insideRoundedRect(x, y, 12, 12, 232, 232, 52)) {
      const t = (x + y) / (W + H);
      const r = Math.round(37 + (79 - 37) * t);
      const g = Math.round(99 + (70 - 99) * t);
      const b = Math.round(235 + (229 - 235) * t);
      setPixel(x, y, r, g, b, 255);
    }
  }
}

// 2. Crisp white "M / Layers" stacked diamond motif in center
function drawDiamond(cy, rx, ry, alpha) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(128 - rx); x <= Math.ceil(128 + rx); x++) {
      const d = Math.abs(x - 128) / rx + Math.abs(y - cy) / ry;
      if (d <= 1.0) {
        const edge = d > 0.92 ? Math.round(((1.0 - d) / 0.08) * alpha) : alpha;
        setPixel(x, y, 255, 255, 255, edge);
      }
    }
  }
}

drawDiamond(164, 72, 28, 150);
drawDiamond(130, 72, 28, 200);
drawDiamond(96, 72, 28, 255);

// Encode PNG
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const rawRows = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  rawRows[y * (W * 4 + 1)] = 0;
  rgba.copy(rawRows, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', zlib.deflateSync(rawRows)),
  makeChunk('IEND', Buffer.alloc(0)),
]);

// Wrap PNG in ICO container (Windows Vista+ / electron-builder standard)
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2); // ICO
icoHeader.writeUInt16LE(1, 4); // 1 image

const dirEntry = Buffer.alloc(16);
dirEntry[0] = 0; // 256px
dirEntry[1] = 0; // 256px
dirEntry[2] = 0;
dirEntry[3] = 0;
dirEntry.writeUInt16LE(1, 4);
dirEntry.writeUInt16LE(32, 6);
dirEntry.writeUInt32LE(png.length, 8);
dirEntry.writeUInt32LE(22, 12); // offset = 6 + 16

const ico = Buffer.concat([icoHeader, dirEntry, png]);

const outDir = path.resolve(process.argv[2] || 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('Generated icon.ico and icon.png in', outDir);
