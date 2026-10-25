/* Self-play: bot melawan bot ribuan kali untuk mengukur strategi bandar mana yang paling berhasil,
   lalu memberi bobot di brain.json → bandar. Keseimbangan dijaga: warga harus tetap menang 50–68% (6–8 pemain).
   Pakai: node scripts/selfplay.mjs   (butuh playwright + chromium) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const brainPath = path.join(root, 'brain.json'), brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
const GAMES = +(process.env.SELFPLAY_GAMES || 400);

const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + path.join(root, 'index.html'));
const run = (fn, arg) => p.evaluate(fn, arg);
const stats = await run(({ brain, GAMES }) => { const d = ArisanSim.debug; d.setBrain({ ...brain, bandar: null }); return ArisanSim.strategyStats(GAMES, 6); }, { brain, GAMES });
const mean = Object.values(stats).reduce((a, x) => a + x, 0) / Object.keys(stats).length;
let weights = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, +Math.max(.5, Math.min(2, (v / mean) ** 2)).toFixed(2)]));
const balance = async w => run(({ brain, w, GAMES }) => { ArisanSim.debug.setBrain({ ...brain, bandar: w }); return [6, 7, 8].map(n => +ArisanSim.simulate(GAMES, n).wargaWin.toFixed(3)); }, { brain, w, GAMES });
let bal = await balance(weights), tries = 0;
while (bal.some(x => x < .5 || x > .68) && tries < 3) { // terlalu kuat/lemah: dekatkan bobot ke rata
  weights = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, +(1 + (v - 1) / 2).toFixed(2)])); bal = await balance(weights); tries++;
}
await b.close();
const ok = !bal.some(x => x < .5 || x > .68);
if (ok) { brain.bandar = weights; fs.writeFileSync(brainPath, JSON.stringify(brain) + '\n'); }
const report = `\n### Self-play strategi bandar (${GAMES} permainan per strategi, 6 pemain)\n` +
  Object.entries(stats).map(([k, v]) => `- ${k}: bandar menang ${(100 * v).toFixed(1)}% → bobot ${weights[k]}`).join('\n') +
  `\n- Keseimbangan dengan bobot ini (warga menang, 6/7/8 pemain): ${bal.map(x => (100 * x).toFixed(1) + '%').join(' / ')}${ok ? '' : ' — di luar 50–68%, bobot tidak dipakai'}\n`;
fs.appendFileSync(path.join(root, 'learning-report.md'), report);
console.log(report);
