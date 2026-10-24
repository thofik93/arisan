// Membuat gambar sumber ikon dan splash tanpa dependensi: gelembung chat bergosip di atas marun batik.
// Hasilnya dipakai `capacitor-assets generate` untuk semua ukuran Android dan iOS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../assets/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel, ss) {
  const stride = size * 4 + 1, raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = pixel((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
      const o = y * stride + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = a / (ss * ss) * 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const MAROON = [75, 20, 36, 1], CREAM = [255, 241, 230, 1], EMAS = [242, 182, 50, 1], LAPIS = [244, 156, 176, 1], NONE = [0, 0, 0, 0];

function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}
function inTri(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const s = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / d;
  const t = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) / d;
  return s >= 0 && t >= 0 && s + t <= 1;
}

/** Gelembung chat dengan tiga titik "sedang mengetik"; `s` = skala relatif kanvas. */
function bubble(u, v, s, bg) {
  const x = (u - 0.5) / s + 0.5, y = (v - 0.5) / s + 0.5;
  // garis kue lapis di bawah
  if (bg !== NONE && s >= 1 && y > 0.86) return y < 0.9 ? LAPIS : y < 0.94 ? EMAS : LAPIS;
  const body = inRound(x, y, 0.14, 0.2, 0.86, 0.66, 0.15);
  const tail = inTri(x, y, [0.28, 0.6], [0.22, 0.82], [0.46, 0.62]);
  if (!body && !tail) return bg;
  for (const dx of [0.33, 0.5, 0.67]) if (Math.hypot(x - dx, y - 0.43) <= 0.065) return EMAS;
  return CREAM;
}

const write = (name, size, fn, ss) => { writeFileSync(new URL(name, OUT), png(size, fn, ss)); console.log('assets/' + name); };
write('icon-only.png', 1024, (u, v) => bubble(u, v, 1.0, MAROON), 2);
write('icon-foreground.png', 1024, (u, v) => bubble(u, v, 0.62, NONE), 2);
write('icon-background.png', 1024, () => MAROON, 1);
write('splash.png', 2732, (u, v) => bubble(u, v, 0.22, MAROON), 1);
write('splash-dark.png', 2732, (u, v) => bubble(u, v, 0.22, MAROON), 1);
