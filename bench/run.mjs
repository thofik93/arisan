/* Benchmark pemahaman pesan dengan LLM di Cloudflare Workers AI.
   node bench/run.mjs --model @cf/meta/llama-3.1-8b-instruct [--set holdout|dev|all] [--limit 20]
   Butuh env CLOUDFLARE_API_TOKEN (izin Workers AI) dan CLOUDFLARE_ACCOUNT_ID. Tidak menulis apa pun ke repo kecuali bench/results/. */
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM, userPrompt, toLabel, parseJSON } from './prompt.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const model = arg('model', '@cf/meta/llama-3.1-8b-instruct'), which = arg('set', 'holdout'), limit = +arg('limit', 0);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const token = process.env.CLOUDFLARE_API_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) { console.error('CLOUDFLARE_API_TOKEN dan CLOUDFLARE_ACCOUNT_ID wajib diisi'); process.exit(1); }

const PLAYERS = ['Bu Ratna', 'Bu Yuyun', 'Bu Hajjah Siti', 'Bu Lilis', 'Bu Endah', 'Bu Wati', 'Bu Dewi', 'Bu Sri'], ME = 'Bu Tester';
let cases = [];
if (which !== 'dev') cases.push(...(await import(path.join(root, 'tests/nlu-holdout.mjs'))).default.map(c => ({ ...c, set: 'tertutup' })));
if (which !== 'holdout') cases.push(...JSON.parse(fs.readFileSync(path.join(root, 'tests/nlu-corpus.json'), 'utf8')).map(c => ({ ...c, set: 'pengembangan' })));
if (limit) cases = cases.slice(0, limit);

async function ask(c) {
  const t0 = Date.now();
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt({ ...c, players: [...PLAYERS, ME], me: ME }) }], max_tokens: 120, temperature: 0 })
  });
  const j = await r.json();
  const raw = j.result ? (j.result.response ?? j.result) : null;
  return { raw, ms: Date.now() - t0, usage: j.result && j.result.usage, error: j.success ? null : JSON.stringify(j.errors) };
}

const out = [];
let i = 0;
async function worker() { while (i < cases.length) { const c = cases[i++]; const a = await ask(c); out.push({ ...c, ...a, got: toLabel(parseJSON(a.raw)) }); } }
await Promise.all(Array.from({ length: 4 }, worker));

const sum = s => { const r = out.filter(x => !s || x.set === s); const ok = r.filter(x => x.got === x.expect).length; return { ok, n: r.length }; };
const lat = out.map(x => x.ms).sort((a, b) => a - b), med = lat[Math.floor(lat.length / 2)];
const tok = out.reduce((a, x) => a + ((x.usage && (x.usage.prompt_tokens + x.usage.completion_tokens)) || 0), 0);
for (const x of out.filter(x => x.got !== x.expect)) console.log('✗', x.text, '| harap', x.expect, '| dapat', x.got, x.error ? '| ERROR ' + x.error : '');
for (const s of ['tertutup', 'pengembangan']) { const { ok, n } = sum(s); if (n) console.log(`[${model}] ${s}: ${ok}/${n} (${(100 * ok / n).toFixed(1)}%)`); }
console.log(`median ${med} ms · rata-rata token per pesan ${out.length ? Math.round(tok / out.length) : '-'}`);
fs.mkdirSync(path.join(root, 'bench/results'), { recursive: true });
fs.writeFileSync(path.join(root, 'bench/results', model.replace(/[^\w.-]+/g, '_') + '.json'), JSON.stringify({ model, at: new Date().toISOString(), summary: { tertutup: sum('tertutup'), pengembangan: sum('pengembangan'), medianMs: med, avgTokens: out.length ? tok / out.length : null }, rows: out }, null, 1));
