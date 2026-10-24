/* Melatih otak bot dari catatan permainan pemain (JSONL hasil /v1/export).
   Keluaran: brain.json (dipakai game) dan learning-report.md (ringkasan angka, tanpa teks pemain).
   Pakai: node scripts/train.mjs data/export.jsonl */
import fs from 'node:fs';

const MIN_EXAMPLES = 200;     // di bawah ini model kata tidak dikirim
const MIN_TELL_DAYS = 30;     // minimal hari-pemain per kelompok untuk gelagat
const MIN_TOKEN = 3;          // kata yang muncul kurang dari ini diabaikan
const MIN_TELL_SEEN = 10;     // gelagat yang jarang muncul tidak diberi bobot
const MAX_VOCAB = 3000;
// salam dan tawa sudah ditangani aturan; model kata hanya menebak maksud yang sering lolos dari aturan
const CLASSES = ['accuse', 'defend', 'deny', 'question', 'ask_alibi', 'ask_why', 'ask_role', 'chat'];
const TELL_KEYS = ['acc', 'acc2', 'def', 'deny', 'quiet', 'claim', 'ask'];

const file = process.argv[2] || 'data/export.jsonl';
const recs = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
if (!recs.length) { console.log('Belum ada catatan permainan. brain.json tidak diubah.'); process.exit(0); }
const prev = fs.existsSync('brain.json') ? JSON.parse(fs.readFileSync('brain.json', 'utf8')) : { version: 0 };

// ---------- label untuk model kata ----------
// x = pilihan pemain lewat "Maksudmu?" (paling dipercaya); l = tebakan aturan (lemah)
const WEAK = { accuse: 'accuse', defend: 'defend', deny: 'deny', swear: 'deny', question: 'question', ask_opinion: 'question',
  ask_callRole: 'question', ask_about: 'accuse', ask_alibi: 'ask_alibi', ask_why: 'ask_why', ask_role: 'ask_role',
  greet: 'chat', laugh: 'chat', chat: 'chat' };
const tokens = n => {
  const w = n.split(' ').map(x => /^<p\d+>$/.test(x) ? 'xp' : x).filter(x => x && x !== '<me>' && !/^[,.!;?]$/.test(x));
  const out = [...w]; for (let i = 0; i + 1 < w.length; i++) out.push(w[i] + '_' + w[i + 1]); return out;
};
const ex = [];
for (const r of recs) for (const h of r.human || []) {
  if (!h.n) continue;
  if (h.x && CLASSES.includes(h.x)) ex.push({ t: tokens(h.n), c: h.x, w: 3, explicit: true, rule: h.l });
  else if (!h.g && WEAK[h.l]) ex.push({ t: tokens(h.n), c: WEAK[h.l], w: h.l === 'chat' ? .5 : 1 });
}
// pembagian latih/uji yang stabil
const hash = s => { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };
const test = ex.filter(e => hash(e.t.join(' ')) % 5 === 0), trainSet = ex.filter(e => hash(e.t.join(' ')) % 5 !== 0);

function trainNB(set) {
  const df = {}; for (const e of set) for (const t of new Set(e.t)) df[t] = (df[t] || 0) + 1;
  const vocab = Object.keys(df).filter(t => df[t] >= MIN_TOKEN).sort((a, b) => df[b] - df[a]).slice(0, MAX_VOCAB);
  const V = new Set(vocab), cnt = {}, tot = {}, docs = {};
  for (const c of CLASSES) { cnt[c] = {}; tot[c] = 0; docs[c] = 0; }
  for (const e of set) { docs[e.c] += e.w; for (const t of e.t) if (V.has(t)) { cnt[e.c][t] = (cnt[e.c][t] || 0) + e.w; tot[e.c] += e.w; } }
  const N = Object.values(docs).reduce((a, b) => a + b, 0) || 1;
  const classes = CLASSES.filter(c => docs[c] > 0);
  const prior = {}, w = {};
  for (const c of classes) prior[c] = +Math.log(docs[c] / N).toFixed(3);
  for (const t of vocab) { w[t] = {}; for (const c of classes) w[t][c] = +Math.log(((cnt[c][t] || 0) + 1) / (tot[c] + vocab.length)).toFixed(3); }
  return { classes, prior, w };
}
function guess(nb, t, min) {
  const sc = {}; let known = 0;
  for (const c of nb.classes) sc[c] = nb.prior[c];
  for (const x of t) { const w = nb.w[x]; if (!w) continue; known++; for (const c of nb.classes) sc[c] += w[c] ?? -12; }
  if (!known) return null;
  const mx = Math.max(...Object.values(sc)); let z = 0; for (const c in sc) z += Math.exp(sc[c] - mx);
  const best = nb.classes.reduce((a, b) => sc[b] > sc[a] ? b : a);
  return 1 / z >= min ? best : null;
}
let nb = null, nbNote = '';
const nbEval = {};
if (ex.length >= MIN_EXAMPLES) {
  const m = trainNB(trainSet);
  // ambang keyakinan: yang terendah dengan presisi >= 90% pada data uji
  let min = .95;
  for (const th of [.6, .7, .8, .85, .9, .95]) {
    const out = test.map(e => [guess(m, e.t, th), e.c]).filter(([g]) => g);
    const prec = out.length ? out.filter(([g, c]) => g === c).length / out.length : 0;
    nbEval[th] = { coverage: out.length / Math.max(1, test.length), precision: prec };
    if (prec >= .9 && th < min) min = th;
  }
  nb = { ...trainNB(ex), min };
  nbNote = `dilatih dari ${ex.length} contoh (${ex.filter(e => e.explicit).length} dipilih pemain lewat "Maksudmu?"), ambang ${min}`;
} else nbNote = `belum cukup data (${ex.length}/${MIN_EXAMPLES} contoh), model kata tidak dikirim`;

// ---------- gelagat pemain manusia yang jadi bandar ----------
const tellCount = { b: { n: 0 }, w: { n: 0 } };
for (const r of recs) {
  const hi = (r.players || []).findIndex(p => p.human); if (hi < 0) continue;
  const role = r.players[hi].role, g = role === 'bandar' ? 'b' : 'w';
  for (let d = 1; d <= (r.day || 1); d++) {
    if (r.players[hi].out && r.players[hi].out < d) break;
    const hs = (r.human || []).filter(h => h.d === d), c = l => hs.filter(h => h.l === l).length;
    const f = { acc: c('accuse') >= 1, acc2: c('accuse') >= 2, def: c('defend') >= 1, deny: c('deny') + c('swear') >= 1,
      quiet: hs.length === 0, claim: c('claimBend') >= 1, ask: hs.some(h => /^ask_/.test(h.l)) };
    tellCount[g].n++;
    for (const k of TELL_KEYS) if (f[k]) tellCount[g][k] = (tellCount[g][k] || 0) + 1;
  }
}
let tells = null;
if (tellCount.b.n >= MIN_TELL_DAYS && tellCount.w.n >= MIN_TELL_DAYS) {
  tells = {};
  for (const k of TELL_KEYS) {
    if ((tellCount.b[k] || 0) + (tellCount.w[k] || 0) < MIN_TELL_SEEN) continue;
    const pb = ((tellCount.b[k] || 0) + 1) / (tellCount.b.n + 2), pw = ((tellCount.w[k] || 0) + 1) / (tellCount.w.n + 2);
    tells[k] = +Math.max(.6, Math.min(1.6, pb / pw)).toFixed(3);
  }
}

// ---------- ringkasan permainan ----------
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const ended = recs.filter(r => r.result === 'end'), quits = recs.filter(r => r.result === 'quit');
const humanWin = {}; for (const r of ended) {
  const h = (r.players || []).find(p => p.human); if (!h) continue;
  const team = h.role === 'bandar' ? 'bandar' : 'warga', k = h.role;
  humanWin[k] = humanWin[k] || [0, 0]; humanWin[k][1]++; if (r.winner === team) humanWin[k][0]++;
}
const byN = {}; for (const r of ended) { byN[r.n] = byN[r.n] || [0, 0]; byN[r.n][1]++; if (r.winner === 'warga') byN[r.n][0]++; }
const allH = recs.flatMap(r => r.human || []);
const notUnderstood = allH.filter(h => h.l === 'chat' || h.l === 'mention').length;
const corrected = allH.filter(h => h.x).length;
const fallback = allH.filter(h => h.g).length;
const quitDay = {}; for (const r of quits) quitDay[r.day] = (quitDay[r.day] || 0) + 1;

const brain = { version: (prev.version || 0) + 1, trainedAt: new Date().toISOString().slice(0, 10), games: recs.length,
  slang: prev.slang || [], nb: nb || prev.nb || null, tells: tells || prev.tells || null };
fs.writeFileSync('brain.json', JSON.stringify(brain) + '\n');

const report = `## Latihan otak bot v${brain.version}

Data: **${recs.length} permainan** (${ended.length} selesai, ${quits.length} keluar di tengah jalan), ${allH.length} pesan pemain.

### Pemahaman pesan
- Pesan yang tidak dipahami aturan: **${pct(notUnderstood, allH.length)}**
- Pesan yang diperjelas pemain lewat "Maksudmu?": ${corrected}
- Pesan yang ditebak model kata minggu lalu: ${fallback}
- Model kata: ${nbNote}
${Object.entries(nbEval).map(([th, v]) => `  - ambang ${th}: cakupan ${pct(v.coverage, 1)}, presisi ${pct(v.precision, 1)}`).join('\n')}

### Gelagat pemain (pengali kecurigaan bot terhadap pemain manusia)
${tells ? TELL_KEYS.filter(k => tells[k]).map(k => `- ${k}: ${tells[k]}`).join('\n') : `- belum cukup data (bandar ${tellCount.b.n}, warga ${tellCount.w.n} hari-pemain; perlu ${MIN_TELL_DAYS} per kelompok)`}

### Keseimbangan dengan pemain sungguhan
${Object.entries(byN).map(([n, [w, t]]) => `- ${n} pemain: warga menang ${pct(w, t)} dari ${t} permainan`).join('\n') || '- belum ada'}
${Object.entries(humanWin).map(([k, [w, t]]) => `- pemain sebagai ${k}: menang ${pct(w, t)} (${t})`).join('\n')}
- Keluar di tengah permainan per pertemuan: ${JSON.stringify(quitDay)}

Laporan ini hanya berisi angka gabungan, tanpa teks pesan pemain.
`;
fs.writeFileSync('learning-report.md', report);
console.log(report);
