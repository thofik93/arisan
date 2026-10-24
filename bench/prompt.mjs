/* Prompt pemahaman pesan untuk LLM. Dipakai bersama oleh benchmark dan (nanti) server /v1/understand,
   supaya yang diukur sama persis dengan yang dipasang. LLM tidak pernah diberi peran rahasia. */
export const INTENTS = ['accuse', 'defend', 'deny', 'swear', 'report', 'claimBend', 'claimRole', 'ask_alibi', 'ask_why', 'ask_role',
  'ask_opinion', 'ask_about', 'ask_callRole', 'question', 'greet', 'laugh', 'thanks', 'angry', 'cry', 'chat'];

export const SYSTEM = `Kamu membaca pesan seorang pemain di grup chat permainan "ARISAN" (mirip Werewolf): ibu-ibu mencari "Bandar Bodong" yang menilep uang kas.
Tugasmu hanya MEMAHAMI maksud pesan terakhir pemain, dengan memperhatikan obrolan sebelumnya. Jawab dengan satu objek JSON saja.

Maksud (intent):
- accuse: menyatakan/menyiratkan seseorang bandar, bohong, mencurigakan, atau mengajak mengeluarkannya
- defend: menyatakan seseorang bersih/bisa dipercaya, atau minta dia jangan dituduh/dikeluarkan
- deny: membela diri sendiri dari tuduhan. "about" = orang yang menuduh dan sedang dijawab (null kalau tidak jelas)
- swear: seperti deny tapi bersumpah (demi Allah, sumpah)
- report: mengaku melihat seseorang keluar rumah (value=true) atau di rumah (value=false) semalam
- claimBend: mengaku Bendahara dengan hasil audit seseorang: bandar (value=true) atau bersih (value=false)
- claimRole: mengaku peran tanpa hasil
- ask_alibi / ask_why / ask_role / ask_opinion / ask_about: bertanya ke "addressee": semalam ke mana / kenapa menuduh atau apa buktinya / perannya apa / menurutnya siapa bandarnya / apakah dia sendiri bandar
- ask_callRole: meminta Bendahara atau yang punya info mengaku
- question: bertanya ke semua orang siapa bandarnya
- greet, laugh, thanks (about = yang diterima kasihi), angry, cry
- chat: tidak bermakna untuk permainan

Aturan penting:
- Kalau X baru saja menuduh pemain, lalu pemain membantah tanpa menyebut X bandar/pembohong/Bendahara palsu ("jangan ngarang", "jangan bawa masalah pribadi"), itu deny dengan about=X. Kalau pemain menyebut X bandar, pembohong, atau Bendahara palsu, itu accuse X.
- Nama di awal kalimat yang diikuti teguran ("Bu Sri, jangan ...") berarti Bu Sri ditegur, bukan dibela. "Jangan tuduh Bu Sri" berarti membela Bu Sri.
- "Setuju", "iya bener", "masa sih" merujuk ke pendapat terakhir di grup.
- Kalau ada tuduhan dan pembelaan sekaligus, pilih tuduhan.
- "about" dan "addressee" harus salah satu nama anggota persis seperti di daftar, atau null.

Format: {"intent": "...", "about": "Bu ... atau null", "addressee": "Bu ... atau null", "value": true/false/null}`;

const sayings = {
  accuse: (t) => `Aku curiga sama ${t}. Dari kemarin gelagatnya aneh.`,
  defend: (t) => `Aku yakin ${t} bukan bandar.`,
  claimBend: (t, v) => v ? `Ibu-ibu, aku Bendahara. Semalam aku audit ${t}, hasilnya BANDAR!` : `Aku Bendahara. Semalam aku audit ${t}, bersih.`,
  report: (t, v) => v ? `Semalam aku lihat ${t} keluar rumah jam 1an.` : `Semalam ${t} di rumah aja, lampunya mati dari jam 9.`
};
export function userPrompt({ text, context = [], players, me }) {
  const nm = n => n === 'ME' ? me : n;
  const lines = context.map(([f, t, tg, v]) => `${f}: ${(sayings[t] || sayings.accuse)(nm(tg), v)}`);
  return `Anggota grup: ${players.join(', ')}. Pemain (yang menulis pesan) adalah ${me}.

Obrolan sebelumnya:
${lines.length ? lines.join('\n') : '(belum ada)'}

Pesan pemain: "${text}"`;
}

/* Ubah jawaban LLM ke format label korpus (lihat tests/LABELS.md) */
export function toLabel(j) {
  if (!j || !INTENTS.includes(j.intent)) return 'invalid';
  const ask = j.intent.startsWith('ask_') ? j.intent.slice(4) : null;
  if (ask === 'callRole') return 'ask/callRole';
  if (ask) return `ask${j.addressee ? '@' + j.addressee : ''}/${ask}`;
  let s = j.intent + (j.about ? '@' + j.about : '');
  if ((j.intent === 'report' || j.intent === 'claimBend') && typeof j.value === 'boolean') s += j.value ? ':+' : ':-';
  return s;
}
export function parseJSON(raw) {
  if (raw && typeof raw === 'object') return raw;
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
