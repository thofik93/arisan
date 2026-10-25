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

// ---------- label untuk model kata: bot belajar tanpa koreksi manual ----------
// Setiap pesan diberi label dari sumber paling tepercaya yang tersedia:
//   x       pilihan pemain (dari versi lama "Maksudmu?")                      bobot 3
//   tl      guru otomatis: LLM di server memberi label pesan yang membuat aturan ragu   bobot 2
//   susulan pesan berikutnya soal orang yang sama, yang dipahami dengan yakin       bobot 1,5
//   voting  pemain menyebut X lalu memilih X: pesannya bermusuhan dengan X          bobot 1,5
//   aturan  tebakan aturan yang yakin (keyakinan >= 0,8)                          bobot 1
const WEAK = { accuse: 'accuse', defend: 'defend', deny: 'deny', swear: 'deny', question: 'question', ask_opinion: 'question',
  ask_callRole: 'question', ask_about: 'accuse', ask_alibi: 'ask_alibi', ask_why: 'ask_why', ask_role: 'ask_role',
  greet: 'chat', laugh: 'chat', chat: 'chat', thanks: 'chat', angry: 'chat', cry: 'chat' };
const tokens = n => {
  const w = n.split(' ').map(x => /^<p\d+>$/.test(x) ? 'xp' : x).filter(x => x && x !== '<me>' && !/^[,.!;?]$/.test(x));
  const out = [...w]; for (let i = 0; i + 1 < w.length; i++) out.push(w[i] + '_' + w[i + 1]); return out;
};
const ex = [], judged = [];
for (const r of recs) {
  const hi = (r.players || []).findIndex(p => p.human);
  const vote = {}; for (const v of r.votes || []) for (const [voter, t] of v.v || []) if (voter === hi) vote[v.d] = t;
  const hs = r.human || [];
  hs.forEach((h, i) => {
    if (!h.n) return;
    const rule = WEAK[h.l] || null, unsure = h.l === 'mention' || (typeof h.c === 'number' && h.c <= .75);
    let strong = null, src = null, w = 0;
    if (h.x && CLASSES.includes(h.x)) { strong = h.x; src = 'pemain'; w = 3; }
    else if (h.tl && h.tl.i) { strong = WEAK[h.tl.i] || null; src = strong ? 'guru' : null; w = 2; }
    if (!strong && unsure) {
      const nx = hs[i + 1];
      if (nx && nx.d === h.d && (h.ts == null || nx.ts == null || nx.ts - h.ts <= 60) && WEAK[nx.l] && (nx.c ?? .85) >= .8 &&
          ((h.t != null && (nx.t === h.t || nx.a === h.t)) || (h.t == null && nx.t != null))) { strong = WEAK[nx.l]; src = 'susulan'; w = 1.5; }
    }
    if (!strong && h.t != null && vote[h.d] === h.t && ['mention', 'defend', 'chat'].includes(h.l)) { strong = 'accuse'; src = 'voting'; w = 1.5; }
    if (strong) { ex.push({ t: tokens(h.n), c: strong, w, src, rule, c0: h.c ?? .85 }); judged.push({ d: r.at, miss: rule !== strong, src }); }
    else {
      if (!h.g && rule && (h.c == null || h.c >= .8)) ex.push({ t: tokens(h.n), c: rule, w: rule === 'chat' ? .5 : 1, src: 'aturan', rule, c0: h.c ?? .85 });
      judged.push({ d: r.at, miss: h.l === 'mention', src: null });
    }
  });
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
let nb = null, nbNote = '', overrideNote = '';
const nbEval = {};
const strongN = ex.filter(e => e.src !== 'aturan').length;
if (ex.length >= MIN_EXAMPLES) {
  const m = trainNB(trainSet);
  // ambang cadangan: yang terendah dengan presisi >= 90% pada data uji
  let min = .95;
  for (const th of [.6, .7, .8, .85, .9, .95]) {
    const out = test.map(e => [guess(m, e.t, th), e.c]).filter(([g]) => g);
    const prec = out.length ? out.filter(([g, c]) => g === c).length / out.length : 0;
    nbEval[th] = { coverage: out.length / Math.max(1, test.length), precision: prec };
    if (prec >= .9 && th < min) min = th;
  }
  // ambang "boleh mengalahkan aturan": hanya kalau, pada pesan uji yang membuat aturan ragu, model terbukti lebih tepat dari aturan
  let override = null;
  const doubt = test.filter(e => e.src !== 'aturan' && e.c0 <= .75);
  const ruleAcc = doubt.length ? doubt.filter(e => e.rule === e.c).length / doubt.length : 1;
  for (const th of [.75, .8, .85, .9, .95]) {
    const out = doubt.map(e => [guess(m, e.t, th), e.c]).filter(([g]) => g);
    const prec = out.length ? out.filter(([g, c]) => g === c).length / out.length : 0;
    if (out.length >= 10 && prec >= Math.max(.85, ruleAcc + .05)) { override = th; break; }
  }
  nb = { ...trainNB(ex), min, override };
  nbNote = `dilatih dari ${ex.length} contoh (${strongN} berlabel dari guru, voting, atau pesan susulan), ambang cadangan ${min}`;
  overrideNote = override ? `boleh mengalahkan aturan yang ragu pada keyakinan >= ${override} (aturan hanya benar ${(100 * ruleAcc).toFixed(0)}% pada pesan seperti itu)` : `belum boleh mengalahkan aturan (belum terbukti lebih tepat pada ${doubt.length} pesan uji yang meragukan)`;
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

// ---------- tingkat salah paham, terdeteksi otomatis ----------
// salah paham = pesan yang tidak dipahami aturan (mention), atau yang tebakan aturannya dibantah guru, voting, atau pesan susulan.
const missOf = js => ({ n: js.length, miss: js.filter(j => j.miss).length, rate: js.length ? js.filter(j => j.miss).length / js.length : null });
const DAY = 864e5, now = Date.now();
const inWeek = (at, k) => { const t = Date.parse((at || '').replace(' ', 'T') + 'Z'); return isFinite(t) && t <= now - k * 7 * DAY && t > now - (k + 1) * 7 * DAY; };
const hasDates = judged.some(j => j.d);
const thisWeek = missOf(hasDates ? judged.filter(j => inWeek(j.d, 0)) : judged);
const lastWeek = missOf(judged.filter(j => inWeek(j.d, 1)));
const bySrc = {}; for (const j of judged.filter(j => j.miss)) { const k = j.src || 'tidak dipahami'; bySrc[k] = (bySrc[k] || 0) + 1; }
const history = (prev.history || []).slice(-11);
if (thisWeek.rate != null) history.push({ at: new Date().toISOString().slice(0, 10), rate: +thisWeek.rate.toFixed(4), n: thisWeek.n });
const TARGET = .10;
const fmt = x => x == null ? '-' : (100 * x).toFixed(1) + '%';
const trend = thisWeek.rate != null && lastWeek.rate != null ? (thisWeek.rate < lastWeek.rate ? `turun ${((lastWeek.rate - thisWeek.rate) * 100).toFixed(1)} poin dari minggu lalu (${fmt(lastWeek.rate)}), bot makin paham` : thisWeek.rate > lastWeek.rate ? `naik ${((thisWeek.rate - lastWeek.rate) * 100).toFixed(1)} poin dari minggu lalu (${fmt(lastWeek.rate)}), perlu dicek` : 'sama dengan minggu lalu') : 'belum ada pembanding minggu lalu';
// kata yang sering muncul di pesan yang gagal dipahami; hanya kata yang dipakai minimal 10 kali (tanpa teks utuh)
const STOP = new Set(['aku', 'kamu', 'dia', 'bu', 'yang', 'itu', 'ini', 'sama', 'ya', 'sih', 'deh', 'dong', 'aja', 'kok', 'lah', 'nih', 'di', 'ke', 'dan', 'gak', 'udah', 'sudah', 'juga', 'tapi', 'kalau', 'kan', 'ada', 'mau', 'jadi', 'ibu', 'kalian']);
const wc = {};
for (const h of allH.filter(h => h.x || h.l === 'mention' || (h.tl && WEAK[h.tl.i] && WEAK[h.tl.i] !== WEAK[h.l]))) for (const w of new Set(h.n.split(' '))) if (/^[a-z-]{3,}$/.test(w) && !STOP.has(w)) wc[w] = (wc[w] || 0) + 1;
const topWords = Object.entries(wc).filter(([, c]) => c >= 10).sort((a, b) => b[1] - a[1]).slice(0, 20);
const corrections = {}; for (const h of allH) { const fix = h.x || (h.tl && WEAK[h.tl.i]); if (fix && WEAK[fix] !== WEAK[h.l]) { const k = `${h.l} → ${fix}`; corrections[k] = (corrections[k] || 0) + 1; } }

// ---------- tempo: kecepatan yang dipilih pemain dan jeda sebelum mereka membalas ----------
const med = a => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
const tempoRows = ['santai', 'normal', 'cepat'].map(sp => {
  const rs = recs.filter(r => r.speed === sp);
  if (!rs.length) return null;
  const rl = rs.flatMap(r => (r.human || []).map(h => h.rl).filter(x => typeof x === 'number'));
  const quit = rs.filter(r => r.result === 'quit').length;
  return `- ${sp}: ${rs.length} permainan (${pct(rs.length, recs.filter(r => r.speed).length)}), keluar di tengah ${pct(quit, rs.length)}, jeda sebelum membalas median ${med(rl) ?? '-'} detik`;
}).filter(Boolean);
const changed = recs.filter(r => r.sc > 0).length;
const tempoReport = tempoRows.length ? tempoRows.join('\n') + `\n- Pemain yang mengganti kecepatan di tengah permainan: ${pct(changed, recs.filter(r => r.speed).length)}` : '- belum ada data tempo';

const brain = { version: (prev.version || 0) + 1, trainedAt: new Date().toISOString().slice(0, 10), games: recs.length,
  slang: prev.slang || [], nb: nb || prev.nb || null, tells: tells || prev.tells || null,
  history };
fs.writeFileSync('brain.json', JSON.stringify(brain) + '\n');

const report = `## Latihan otak bot v${brain.version}

Data: **${recs.length} permainan** (${ended.length} selesai, ${quits.length} keluar di tengah jalan), ${allH.length} pesan pemain.

### Tingkat salah paham ${thisWeek.rate == null ? '' : thisWeek.rate <= TARGET ? '✅' : '⚠️'}
**${fmt(thisWeek.rate)}** dari ${thisWeek.n} pesan ${hasDates ? 'minggu ini' : ''} (patokan: di bawah ${fmt(TARGET)}). Tren: ${trend}.
Terdeteksi otomatis, tanpa koreksi pemain: ${Object.entries(bySrc).map(([k, c]) => `${k} ${c}`).join(', ') || '-'}.
${history.length > 1 ? 'Riwayat: ' + history.map(h => `${h.at} ${fmt(h.rate)}`).join(' · ') : ''}

Salah tangkap terbanyak (tebakan aturan → maksud sebenarnya): ${Object.entries(corrections).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k} (${c})`).join(', ') || '-'}

Kata yang sering muncul di pesan yang gagal dipahami (bahan aturan baru): ${topWords.map(([w, c]) => `${w} (${c})`).join(', ') || '- (belum ada kata yang dipakai 10 kali atau lebih)'}

### Pemahaman pesan
- Pesan yang tidak dipahami aturan: **${pct(notUnderstood, allH.length)}**
- Label otomatis: ${['guru', 'voting', 'susulan', 'pemain'].map(k => `${k} ${ex.filter(e => e.src === k).length}`).join(', ')}
- Pesan yang ditebak model kata minggu lalu: ${fallback}
- Model kata: ${nbNote}
- Mengalahkan aturan: ${overrideNote || '-'}
${Object.entries(nbEval).map(([th, v]) => `  - ambang ${th}: cakupan ${pct(v.coverage, 1)}, presisi ${pct(v.precision, 1)}`).join('\n')}

### Tempo obrolan
${tempoReport}

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
