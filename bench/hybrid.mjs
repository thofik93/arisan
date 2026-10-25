/* Menghitung akurasi gabungan: aturan dipakai kalau keyakinannya >= ambang, selain itu jawaban LLM.
   node bench/hybrid.mjs   (butuh hasil di bench/results/ dan playwright) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cases = (await import(path.join(root, 'tests/nlu-holdout.mjs'))).default;
const brain = JSON.parse(fs.readFileSync(path.join(root, 'brain.json'), 'utf8'));
const b = await chromium.launch(), p = await b.newPage();
await p.goto('file://' + path.join(root, 'index.html'));
const { runCases } = await import(path.join(root, 'tests/nlu-lib.mjs'));
const rules = await runCases(p, cases, brain);
await b.close();
const byText = Object.fromEntries(rules.map(r => [r.text, r]));
const files = fs.readdirSync(path.join(root, 'bench/results')).filter(f => f.endsWith('.json'));
const lowConf = rules.filter(r => (r.conf ?? 1) < .6 || /^(mention|chat)/.test(r.got)).length;
console.log(`aturan saja: ${rules.filter(r => r.got === r.expect).length}/150 · pesan yang dikirim ke LLM pada ambang 0,6: ${lowConf}/150 (${(100 * lowConf / 150).toFixed(0)}%)\n`);
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(root, 'bench/results', f), 'utf8'));
  const rows = r.rows.filter(x => x.set === 'tertutup' && byText[x.text]);
  if (rows.length < 150) continue;
  const line = [.6, .75, .9].map(th => {
    let ok = 0, sent = 0;
    for (const x of rows) {
      const ru = byText[x.text], weak = (ru.conf ?? 1) < th || /^(mention|chat)/.test(ru.got);
      const got = weak && x.got !== 'invalid' ? x.got : ru.got;
      if (weak) sent++;
      if (got === x.expect) ok++;
    }
    return `ambang ${th}: ${ok}/150 (${(100 * ok / 150).toFixed(1)}%), ${sent} ke LLM`;
  }).join(' | ');
  const fixes = rows.filter(x => byText[x.text].got !== x.expect && x.got === x.expect).length;
  console.log(`${r.model}\n  ${line}\n  benar di ${fixes} dari ${rows.filter(x => byText[x.text].got !== x.expect).length} kalimat yang gagal oleh aturan · median ${r.summary.medianMs} ms\n`);
}
