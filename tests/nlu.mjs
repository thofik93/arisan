/* Uji pemahaman pesan bebas. Wajib lolos sebelum otak hasil latihan dipakai.
   Pakai: node tests/nlu.mjs   (butuh paket playwright dan browser chromium) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'tests/nlu-corpus.json'), 'utf8'));
const brain = JSON.parse(fs.readFileSync(path.join(root, 'brain.json'), 'utf8'));

const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + path.join(root, 'index.html'));
const res = await p.evaluate(({ corpus, brain }) => {
  const d = ArisanSim.debug, out = [];
  for (const { text, expect, context } of corpus) {
    d.newGame({ mode: 'sim', n: 8 });
    const G = d.G; G.players.push({ ...G.players[0], id: 8, name: 'Bu Tester', human: true, bot: null, alive: true }); G.mode = 'bot';
    d.setBrain(brain);
    const byName = n => n === 'ME' ? 8 : G.players.find(x => x.name === n).id;
    G.msgs = [];
    for (const [f, t, tg, v] of (context || [])) G.msgs.push({ from: byName(f), type: t, target: tg != null ? byName(tg) : null, value: v });
    const h = d.parseHuman(text);
    const nm = h.target != null ? '@' + G.players[h.target].name : '';
    const got = h.type + (h.type === 'ask' && h.addressee != null ? '@' + G.players[h.addressee].name : nm) + (h.ask ? '/' + h.ask : '');
    out.push({ text, expect, got });
  }
  return out;
}, { corpus, brain });
await b.close();
const bad = res.filter(r => r.got !== r.expect);
for (const r of bad) console.log('✗', r.text, '| harap', r.expect, '| dapat', r.got);
console.log(`${res.length - bad.length}/${res.length} benar dengan otak v${brain.version}`);
if (errs.length) console.log('error halaman:', errs);
process.exit(bad.length || errs.length ? 1 : 0);
