/* Server pengumpul catatan permainan ARISAN.
   POST /v1/games   dari game (hanya pemain yang setuju), divalidasi ketat, tanpa IP mentah
   GET  /v1/export  untuk pelatihan, wajib token admin
   GET  /v1/stats   ringkasan, wajib token admin */
import { SYSTEM, userPrompt, parseJSON, INTENTS } from '../../bench/prompt.mjs';

const ORIGINS = ['https://thofik93.github.io', 'capacitor://localhost', 'https://localhost', 'http://localhost'];
const MAX_BYTES = 48 * 1024;
const PER_HOUR = 30;
const ROLES = new Set(['bandar', 'bendahara', 'ketua', 'gosip', 'warga']);
const LABELS = /^[a-zA-Z_]{1,20}$/;

const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : null;
const str = (x, max, re) => typeof x === 'string' && x.length <= max && (!re || re.test(x)) ? x : null;
const bool = x => typeof x === 'boolean' ? x : null;
const arr = (x, max) => Array.isArray(x) ? x.slice(0, max) : [];

export function sanitize(g) {
  if (!g || typeof g !== 'object') return null;
  const n = int(g.n, 4, 8);
  if (n == null || !['end', 'quit'].includes(g.result)) return null;
  const pid = x => x == null ? null : int(x, 0, 8);
  return {
    v: int(g.v, 1, 99), brain: int(g.brain, 0, 1e6), n, daily: bool(g.daily),
    result: g.result, day: int(g.day, 1, 9), winner: ['warga', 'bandar'].includes(g.winner) ? g.winner : null,
    dur: int(g.dur, 0, 7200),
    speed: ['santai', 'normal', 'cepat'].includes(g.speed) ? g.speed : null, sc: int(g.sc, 0, 50),
    exp: g.exp && typeof g.exp === 'object' ? Object.fromEntries(['probe', 'callout', 'adaptiveBandar', 'learnedLR'].map(k => [k, typeof g.exp[k] === 'boolean' ? g.exp[k] : null])) : null,
    players: arr(g.players, 9).map(p => ({
      role: ROLES.has(p && p.role) ? p.role : null, bot: str(p && p.bot, 12, /^[a-z]+$/),
      human: bool(p && p.human), alive: bool(p && p.alive), out: int(p && p.out, 1, 9)
    })),
    human: arr(g.human, 60).map(h => ({
      d: int(h && h.d, 1, 9), n: str(h && h.n, 200, /^[\p{L}\p{N}\s<>?,.!;_-]*$/u), l: str(h && h.l, 20, LABELS),
      t: pid(h && h.t), a: pid(h && h.a), x: str(h && h.x, 20, LABELS), xt: pid(h && h.xt),
      g: typeof (h && h.g) === 'number' && h.g >= 0 && h.g <= 1 ? h.g : null,
      c: typeof (h && h.c) === 'number' && h.c >= 0 && h.c <= 1 ? h.c : null,
      ts: int(h && h.ts, 0, 7200), rl: int(h && h.rl, 0, 600),
      cx: arr(h && h.cx, 3).filter(x => Array.isArray(x) && pid(x[0]) != null && str(x[1], 16, /^[a-zA-Z]+$/)).map(x => [x[0], x[1], pid(x[2]), typeof x[3] === 'boolean' ? x[3] : null])
    })).filter(h => h.n != null && h.l != null),
    votes: arr(g.votes, 12).map(v => ({
      d: int(v && v.d, 1, 9), k: pid(v && v.k),
      v: arr(v && v.v, 9).filter(p => Array.isArray(p) && pid(p[0]) != null && pid(p[1]) != null).map(p => [p[0], p[1]])
    })),
    msgs: arr(g.msgs, 400).map(m => ({
      d: int(m && m.d, 1, 9), f: pid(m && m.f), y: str(m && m.y, 16, /^[a-zA-Z]+$/), t: pid(m && m.t),
      v: bool(m && m.v), c: str(m && m.c, 24, /^[a-zA-Z0-9]*$/)
    })).filter(m => m.f != null && m.y != null)
  };
}

/* ---------- guru otomatis ----------
   LLM memberi label hanya pada pesan yang membuat aturan ragu. Nama diganti samaran Bu A, Bu B, …; peran rahasia tidak pernah dikirim.
   Paket gratis Workers membatasi 50 subrequest per pemanggilan, jadi maksimal 40 pesan per jalan (cron per jam). */
const TEACHER_MODELS = ['@cf/qwen/qwen3-30b-a3b-fp8', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const ALIAS = 'ABCDEFGHI';
// audit acak: sekitar 10% pesan yang dibaca aturan dengan yakin juga diperiksa, supaya salah baca yang percaya diri ikut ketahuan
const audit = n => { let x = 7; for (const ch of n) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x % 10 === 0; };
const needsTeacher = h => h && (h.l === 'mention' || h.l === 'chat' || (typeof h.c === 'number' && h.c <= 0.75) || audit(h.n || ''));
async function teach(env, maxCalls = 40) {
  const { results } = await env.DB.prepare('SELECT id, body FROM games WHERE taught = 0 ORDER BY id LIMIT 50').all();
  let calls = 0, labeled = 0;
  for (const row of results) {
    const g = JSON.parse(row.body);
    const hi = (g.players || []).findIndex(p => p.human);
    const name = i => i === hi ? 'Bu Tamu' : 'Bu ' + ALIAS[i];
    const players = (g.players || []).map((_, i) => name(i));
    const todo = (g.human || []).map((h, i) => [h, i]).filter(([h]) => needsTeacher(h));
    if (calls + todo.length > maxCalls) break;
    for (const [h, i] of todo) {
      const text = h.n.replace(/<p(\d)>/g, (_, d) => name(+d)).replace(/<me>/g, 'Bu Tamu');
      const context = (h.cx || []).map(([f, y, t, v]) => [name(f), y, t == null ? null : name(t), v]);
      let label = null, model = null;
      for (const m of TEACHER_MODELS) {
        calls++;
        try {
          const out = await env.AI.run(m, { messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt({ text, context, players, me: 'Bu Tamu' }) + (m.includes('qwen3') ? ' /no_think' : '') }], max_tokens: 400, temperature: 0 });
          const raw = out && (out.response ?? (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content));
          const j = parseJSON(raw);
          if (j && INTENTS.includes(j.intent)) {
            const back = n => { const k = players.indexOf(n); return k >= 0 ? k : null; };
            label = { i: j.intent, a: back(j.about), d: back(j.addressee), v: typeof j.value === 'boolean' ? j.value : null };
            model = m; break;
          }
        } catch { /* coba model cadangan */ }
      }
      if (label) { labeled++; await env.DB.prepare('INSERT OR REPLACE INTO teacher (game_id, idx, label, model) VALUES (?, ?, ?, ?)').bind(row.id, i, JSON.stringify(label), model).run(); }
    }
    await env.DB.prepare('UPDATE games SET taught = 1 WHERE id = ?').bind(row.id).run();
  }
  return { calls, labeled };
}

async function sha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
}
function admin(req, env) {
  const got = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const want = env.ADMIN_TOKEN || '';
  if (!want || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'vary': 'origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/v1/games' && req.method === 'POST') {
      if (origin && !ORIGINS.includes(origin)) return json({ error: 'origin' }, 403, cors);
      if (+(req.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'too large' }, 413, cors);
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413, cors);
      let g; try { g = JSON.parse(text); } catch { return json({ error: 'json' }, 400, cors); }
      const clean = sanitize(g);
      if (!clean) return json({ error: 'invalid' }, 422, cors);
      const hour = new Date().toISOString().slice(0, 13);
      const src = await sha((req.headers.get('cf-connecting-ip') || '') + '|' + (env.SALT || '') + '|' + hour);
      const row = await env.DB.prepare('SELECT count(*) AS c FROM games WHERE src = ? AND hour = ?').bind(src, hour).first();
      if (row && row.c >= PER_HOUR) return json({ error: 'slow down' }, 429, cors);
      await env.DB.prepare('INSERT INTO games (v, brain, n, result, winner, src, hour, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(clean.v, clean.brain, clean.n, clean.result, clean.winner, src, hour, JSON.stringify(clean)).run();
      return json({ ok: true }, 201, cors);
    }

    if (url.pathname === '/v1/export' && req.method === 'GET') {
      if (!admin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
      const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '2000', 10) || 2000));
      const { results } = await env.DB.prepare('SELECT id, at, body FROM games WHERE id > ? ORDER BY id LIMIT ?').bind(after, limit).all();
      const ids = results.map(r => r.id);
      const tl = {};
      if (ids.length) {
        const t = await env.DB.prepare(`SELECT game_id, idx, label FROM teacher WHERE game_id BETWEEN ? AND ?`).bind(ids[0], ids[ids.length - 1]).all();
        for (const r of t.results) (tl[r.game_id] = tl[r.game_id] || {})[r.idx] = JSON.parse(r.label);
      }
      const lines = results.map(r => {
        const g = JSON.parse(r.body);
        for (const [i, l] of Object.entries(tl[r.id] || {})) if (g.human[i]) g.human[i].tl = l;
        return JSON.stringify({ id: r.id, at: r.at, ...g });
      }).join('\n');
      return new Response(lines ? lines + '\n' : '', { headers: { ...cors, 'content-type': 'application/x-ndjson' } });
    }

    if (url.pathname === '/v1/teach' && req.method === 'POST') {
      if (!admin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      return json(await teach(env, Math.min(40, parseInt(url.searchParams.get('max') || '40', 10) || 40)), 200, cors);
    }

    if (url.pathname === '/v1/stats' && req.method === 'GET') {
      if (!admin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      const all = await env.DB.prepare("SELECT count(*) AS games, sum(result = 'end') AS finished, sum(at > datetime('now', '-7 days')) AS week FROM games").first();
      return json(all, 200, cors);
    }

    return new Response('ARISAN brain server', { headers: cors });
  },

  // setiap jam: guru otomatis. Jam 03.00 WIB: hapus jejak hash IP setelah 2 hari dan catatan yang lebih tua dari setahun
  async scheduled(event, env) {
    await teach(env);
    if (new Date(event.scheduledTime).getUTCHours() !== 20) return;
    await env.DB.prepare("UPDATE games SET src = NULL, hour = NULL WHERE at < datetime('now', '-2 days') AND src IS NOT NULL").run();
    await env.DB.prepare("DELETE FROM games WHERE at < datetime('now', '-365 days')").run();
  }
};
