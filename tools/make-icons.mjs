import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BACKGROUND = [20, 97, 79, 255];
const FOREGROUND = [255, 255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const encodePng = (size, pixelAt) => {
  const rowLength = size * 4 + 1;
  const raw = Buffer.alloc(rowLength * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      raw.set(pixelAt((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5), y * rowLength + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// Manubrio centrato; scale riduce il disegno per restare nella safe zone delle icone maskable.
const dumbbell = (scale) => (u, v) => {
  const x = Math.abs(u / scale);
  const y = Math.abs(v / scale);
  const bar = x < 0.42 && y < 0.04;
  const innerPlate = x > 0.18 && x < 0.26 && y < 0.22;
  const outerPlate = x > 0.28 && x < 0.34 && y < 0.15;
  return bar || innerPlate || outerPlate ? FOREGROUND : BACKGROUND;
};

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('icon-192.png', outDir), encodePng(192, dumbbell(0.8)));
writeFileSync(new URL('icon-512.png', outDir), encodePng(512, dumbbell(0.8)));
writeFileSync(new URL('icon-maskable-512.png', outDir), encodePng(512, dumbbell(0.6)));
console.log('Icone generate in icons/');
