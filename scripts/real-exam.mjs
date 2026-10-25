/* Ujian dari dunia nyata: ambil sampel pesan pemain sungguhan (sudah tersamar) beserta tebakan aturan dan label guru,
   untuk diperiksa manusia. Hasilnya PRIVAT di data/ (tidak pernah di-commit; repo ini publik).
   Pakai: node scripts/real-exam.mjs data/export.jsonl [jumlah]   → data/real-exam.jsonl
   Setelah diperiksa (kolom "benar" diisi), kalimat yang representatif bisa dijadikan kasus uji baru. */
import fs from 'node:fs';
const [file = 'data/export.jsonl', nArg = '80'] = process.argv.slice(2);
const recs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const rows = recs.flatMap(r => (r.human || []).map(h => ({ game: r.id, n: h.n, aturan: h.l, keyakinan: h.c ?? null, guru: h.tl ? h.tl.i : null, konfirmasi: h.x || null, konteks: h.cx || [], benar: null })));
let s = 13; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = rows.map(r => [R(), r]).sort((a, b) => a[0] - b[0]).slice(0, +nArg).map(x => x[1]);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/real-exam.jsonl', pick.map(x => JSON.stringify(x)).join('\n') + '\n');
const dis = pick.filter(x => x.guru && x.guru !== x.aturan).length;
console.log(`${pick.length} pesan ke data/real-exam.jsonl · aturan berbeda dengan guru pada ${dis} pesan`);
