// Run once: node generate-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([t, data]));
  return Buffer.concat([u32(data.length), t, data, u32(crc)]);
}

function createPNG(size, draw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  // bytes 10-12 remain 0 (compression, filter, interlace)

  // Raw RGBA pixels
  const pixels = new Uint8Array(size * size * 4);
  draw(pixels, size);

  // Build filtered scanlines (filter byte 0 = None, then RGB per pixel — no alpha in output)
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 3) + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(pixels, size) {
  const cx = size / 2, cy = size / 2;

  // Fill transparent
  pixels.fill(0);

  // Background circle — dark navy
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r <= cx - 0.5) {
        const i = (y * size + x) * 4;
        pixels[i] = 30; pixels[i + 1] = 35; pixels[i + 2] = 60; pixels[i + 3] = 255;
      }
    }
  }

  function line(x1, y1, x2, y2, thickness, rr, gg, bb) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len * 3);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x1 + dx * t, py = y1 + dy * t;
      for (let oy = -Math.ceil(thickness); oy <= Math.ceil(thickness); oy++) {
        for (let ox = -Math.ceil(thickness); ox <= Math.ceil(thickness); ox++) {
          const dist = Math.sqrt(ox * ox + oy * oy);
          if (dist > thickness) continue;
          const fx = Math.round(px + ox), fy = Math.round(py + oy);
          if (fx < 0 || fy < 0 || fx >= size || fy >= size) continue;
          const i = (fy * size + fx) * 4;
          const alpha = dist < thickness - 0.5 ? 1 : (thickness + 0.5 - dist);
          pixels[i]     = Math.round(pixels[i]     * (1 - alpha) + rr * alpha);
          pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + gg * alpha);
          pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + bb * alpha);
          pixels[i + 3] = 255;
        }
      }
    }
  }

  const s = size / 16;
  const lw = Math.max(1, s * 1.4);
  const margin = size * 0.18;
  const right = size - margin;

  // Three horizontal lines (header rows)
  const rows = [size * 0.32, size * 0.5, size * 0.68];
  for (let i = 0; i < rows.length; i++) {
    const endX = i === 2 ? right - size * 0.25 : right;
    line(margin, rows[i], endX, rows[i], lw, 79, 129, 247);
  }

  // Plus circle on bottom-right
  const bx = right - size * 0.04, by = rows[2];
  const cr = size * 0.16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - bx + 0.5, dy = y - by + 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r <= cr) {
        const i = (y * size + x) * 4;
        pixels[i] = 79; pixels[i + 1] = 129; pixels[i + 2] = 247; pixels[i + 3] = 255;
      }
    }
  }
  const pw = Math.max(1, size * 0.065);
  const pa = cr * 0.52;
  line(bx, by - pa, bx, by + pa, pw, 255, 255, 255);
  line(bx - pa, by, bx + pa, by, pw, 255, 255, 255);
}

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

for (const size of [16, 48, 128]) {
  const buf = createPNG(size, drawIcon);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`✓ icon${size}.png`);
}
