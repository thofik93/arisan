/* Mengunduh semua catatan permainan dari server ke file JSONL. Butuh env LEARN_API dan ADMIN_TOKEN. */
import fs from 'node:fs';
const out = process.argv[2] || 'data/export.jsonl';
const api = process.env.LEARN_API, token = process.env.ADMIN_TOKEN;
if (!api || !token) { console.error('LEARN_API dan ADMIN_TOKEN wajib diisi'); process.exit(1); }
fs.mkdirSync(out.replace(/\/[^/]*$/, '') || '.', { recursive: true });
let after = 0, total = 0;
fs.writeFileSync(out, '');
for (;;) {
  const r = await fetch(`${api}/v1/export?after=${after}&limit=5000`, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) { console.error('Gagal mengunduh:', r.status); process.exit(1); }
  const lines = (await r.text()).split('\n').filter(Boolean);
  if (!lines.length) break;
  fs.appendFileSync(out, lines.join('\n') + '\n');
  total += lines.length; after = JSON.parse(lines[lines.length - 1]).id;
  if (lines.length < 5000) break;
}
console.log(`${total} permainan diunduh ke ${out}`);
