/* Uji pemahaman pesan bebas.
   node tests/nlu.mjs              korpus pengembangan (nlu-corpus.json), wajib 100%
   node tests/nlu.mjs --holdout    set uji tertutup (nlu-holdout.mjs), dilaporkan sebagai skor
   node tests/nlu.mjs --all        keduanya
   Gerbang: korpus pengembangan harus lolos semua, dan skor set tertutup tidak boleh turun dari tests/holdout-baseline.json.
   Butuh paket playwright dan browser chromium. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = new Set(process.argv.slice(2));
const verbose = args.has('-v');
const brain = JSON.parse(fs.readFileSync(path.join(root, 'brain.json'), 'utf8'));

const sets = [];
if (!args.has('--holdout') || args.has('--all')) sets.push({ name: 'pengembangan', gate: 'all', cases: JSON.parse(fs.readFileSync(path.join(root, 'tests/nlu-corpus.json'), 'utf8')) });
if (args.has('--holdout') || args.has('--all')) sets.push({ name: 'tertutup', gate: 'baseline', cases: (await import(path.join(root, 'tests/nlu-holdout.mjs'))).default });
if (args.has('--holdout') || args.has('--all')) sets.push({ name: 'tertutup-2', gate: 'baseline', key: 'h2', cases: (await import(path.join(root, 'tests/nlu-holdout2.mjs'))).default });

const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + path.join(root, 'index.html'));

import { runCases } from './nlu-lib.mjs';

let fail = false;
const baselinePath = path.join(root, 'tests/holdout-baseline.json');
for (const s of sets) {
  const res = await runCases(p, s.cases, brain);
  const bad = res.filter(r => r.got !== r.expect);
  const score = res.length - bad.length;
  if (s.gate === 'all' || verbose) for (const r of bad) console.log('✗', r.text, '| harap', r.expect, '| dapat', r.got);
  console.log(`[${s.name}] ${score}/${res.length} benar (${(100 * score / res.length).toFixed(1)}%) dengan otak v${brain.version}`);
  if (s.gate === 'all' && bad.length) fail = true;
  if (s.gate === 'baseline') {
    const all = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};
    const key = s.key || 'score', base = all[key] || 0;
    if (score < base) { console.log(`  turun dari baseline ${base}`); fail = true; }
    if (args.has('--save-baseline')) { all[key] = score; all.at = new Date().toISOString().slice(0, 10); fs.writeFileSync(baselinePath, JSON.stringify(all) + '\n'); }
  }
}
await b.close();
if (errs.length) { console.log('error halaman:', errs); fail = true; }
process.exit(fail ? 1 : 0);
