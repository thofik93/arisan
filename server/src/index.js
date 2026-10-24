/* Server pengumpul catatan permainan ARISAN.
   POST /v1/games   dari game (hanya pemain yang setuju), divalidasi ketat, tanpa IP mentah
   GET  /v1/export  untuk pelatihan, wajib token admin
   GET  /v1/stats   ringkasan, wajib token admin */
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
    players: arr(g.players, 9).map(p => ({
      role: ROLES.has(p && p.role) ? p.role : null, bot: str(p && p.bot, 12, /^[a-z]+$/),
      human: bool(p && p.human), alive: bool(p && p.alive), out: int(p && p.out, 1, 9)
    })),
    human: arr(g.human, 60).map(h => ({
      d: int(h && h.d, 1, 9), n: str(h && h.n, 200, /^[\p{L}\p{N}\s<>?,.!;_-]*$/u), l: str(h && h.l, 20, LABELS),
      t: pid(h && h.t), a: pid(h && h.a), x: str(h && h.x, 20, LABELS),
      g: typeof (h && h.g) === 'number' && h.g >= 0 && h.g <= 1 ? h.g : null
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
      const lines = results.map(r => JSON.stringify({ id: r.id, at: r.at, ...JSON.parse(r.body) })).join('\n');
      return new Response(lines ? lines + '\n' : '', { headers: { ...cors, 'content-type': 'application/x-ndjson' } });
    }

    if (url.pathname === '/v1/stats' && req.method === 'GET') {
      if (!admin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
      const all = await env.DB.prepare("SELECT count(*) AS games, sum(result = 'end') AS finished, sum(at > datetime('now', '-7 days')) AS week FROM games").first();
      return json(all, 200, cors);
    }

    return new Response('ARISAN brain server', { headers: cors });
  },

  // hapus jejak hash IP setelah 2 hari dan catatan yang lebih tua dari setahun
  async scheduled(_event, env) {
    await env.DB.prepare("UPDATE games SET src = NULL, hour = NULL WHERE at < datetime('now', '-2 days') AND src IS NOT NULL").run();
    await env.DB.prepare("DELETE FROM games WHERE at < datetime('now', '-365 days')").run();
  }
};
