const zlib = require('zlib');
const { nativeImage } = require('electron');

const DIGIT_GLYPHS = {
  0: [
    '01110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01110',
  ],
  1: [
    '00100',
    '01100',
    '00100',
    '00100',
    '00100',
    '00100',
    '01110',
  ],
  2: [
    '01110',
    '10001',
    '00001',
    '00010',
    '00100',
    '01000',
    '11111',
  ],
  3: [
    '01110',
    '10001',
    '00001',
    '00110',
    '00001',
    '10001',
    '01110',
  ],
  4: [
    '00010',
    '00110',
    '01010',
    '10010',
    '11111',
    '00010',
    '00010',
  ],
  5: [
    '11111',
    '10000',
    '11110',
    '00001',
    '00001',
    '10001',
    '01110',
  ],
  6: [
    '01110',
    '10001',
    '10000',
    '11110',
    '10001',
    '10001',
    '01110',
  ],
  7: [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '01000',
    '01000',
  ],
  8: [
    '01110',
    '10001',
    '10001',
    '01110',
    '10001',
    '10001',
    '01110',
  ],
  9: [
    '01110',
    '10001',
    '10001',
    '01111',
    '00001',
    '10001',
    '01110',
  ],
};

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function setPixel(rgba, size, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function blendPixel(rgba, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
  const i = (y * size + x) * 4;
  const srcA = a / 255;
  const dstA = rgba[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  rgba[i] = Math.round((r * srcA + rgba[i] * dstA * (1 - srcA)) / outA);
  rgba[i + 1] = Math.round((g * srcA + rgba[i + 1] * dstA * (1 - srcA)) / outA);
  rgba[i + 2] = Math.round((b * srcA + rgba[i + 2] * dstA * (1 - srcA)) / outA);
  rgba[i + 3] = Math.round(outA * 255);
}

function roundedRectCoverage(x, y, size, radius) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  if (cx >= radius && cx < size - radius && cy >= 0 && cy < size) return 1;
  if (cy >= radius && cy < size - radius && cx >= 0 && cx < size) return 1;

  const corners = [
    [radius, radius],
    [size - radius, radius],
    [radius, size - radius],
    [size - radius, size - radius],
  ];
  for (const [ox, oy] of corners) {
    const inCornerX =
      (ox === radius && cx < radius) || (ox === size - radius && cx >= size - radius);
    const inCornerY =
      (oy === radius && cy < radius) || (oy === size - radius && cy >= size - radius);
    if (!inCornerX || !inCornerY) continue;
    const dx = cx - ox;
    const dy = cy - oy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= radius - 0.55) return 1;
    if (d >= radius + 0.55) return 0;
    return Math.max(0, Math.min(1, radius + 0.55 - d));
  }
  if (cx < 0 || cy < 0 || cx >= size || cy >= size) return 0;
  return 1;
}

function drawDigit(rgba, size, digit, originX, originY, scale, r, g, b) {
  const glyph = DIGIT_GLYPHS[digit];
  if (!glyph) return;
  for (let row = 0; row < glyph.length; row += 1) {
    for (let col = 0; col < glyph[row].length; col += 1) {
      if (glyph[row][col] !== '1') continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          setPixel(rgba, size, originX + col * scale + dx, originY + row * scale + dy, r, g, b, 255);
        }
      }
    }
  }
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createDayTrayPng(dayNumber, size = 64) {
  const day = Math.max(1, Math.min(31, Number(dayNumber) || 1));
  const text = String(day);
  const rgba = Buffer.alloc(size * size * 4, 0);
  const radius = Math.max(8, Math.round(size * 0.2));
  const headerH = Math.max(10, Math.round(size * 0.28));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cover = roundedRectCoverage(x, y, size, radius);
      if (cover <= 0) continue;

      let r;
      let g;
      let b;
      if (y < headerH) {
        const t = y / Math.max(1, headerH - 1);
        r = mix(0x14, 0x0f, t);
        g = mix(0xb8, 0x76, t);
        b = mix(0xa6, 0x6e, t);
      } else {
        const t = (y - headerH) / Math.max(1, size - headerH - 1);
        r = mix(0xff, 0xf1, t);
        g = mix(0xff, 0xf5, t);
        b = mix(0xff, 0xf9, t);
      }

      // Soft outer edge for a cleaner tray look when downscaled.
      blendPixel(rgba, size, x, y, r, g, b, Math.round(255 * cover));
    }
  }

  // Binding rings on the header.
  const ringY = Math.round(headerH * 0.45);
  const ringR = Math.max(2, Math.round(size * 0.06));
  const ringXs = [Math.round(size * 0.32), Math.round(size * 0.68)];
  for (const rx of ringXs) {
    for (let y = ringY - ringR - 1; y <= ringY + ringR + 1; y += 1) {
      for (let x = rx - ringR - 1; x <= rx + ringR + 1; x += 1) {
        const dx = x + 0.5 - rx;
        const dy = y + 0.5 - ringY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > ringR + 0.6 || d < ringR - 1.1) continue;
        const a = d > ringR ? Math.round(180 * (ringR + 0.6 - d)) : 230;
        blendPixel(rgba, size, x, y, 236, 253, 245, a);
      }
    }
  }

  const glyphW = 5;
  const glyphH = 7;
  const scale = text.length === 1 ? Math.max(4, Math.round(size / 12)) : Math.max(3, Math.round(size / 16));
  const gap = text.length === 1 ? 0 : Math.max(1, Math.round(scale * 0.35));
  const totalW = text.length * glyphW * scale + (text.length - 1) * gap;
  const totalH = glyphH * scale;
  let x = Math.floor((size - totalW) / 2);
  const y = Math.floor(headerH + (size - headerH - totalH) / 2);

  for (const ch of text) {
    drawDigit(rgba, size, Number(ch), x, y, scale, 15, 42, 58);
    x += glyphW * scale + gap;
  }

  return encodePng(size, rgba);
}

function createDayTrayImage(dayNumber) {
  // Render large, then downscale for a neater Windows notification-area glyph.
  const png = createDayTrayPng(dayNumber, 64);
  const image = nativeImage.createFromBuffer(png);
  if (process.platform === 'win32') {
    return image.resize({ width: 16, height: 16, quality: 'best' });
  }
  return image.resize({ width: 22, height: 22, quality: 'best' });
}

module.exports = { createDayTrayImage, createDayTrayPng };
