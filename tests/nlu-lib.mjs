/* Menjalankan kalimat uji melalui parseHuman di halaman game. */
export async function runCases(page, cases, brainJson) {
  return page.evaluate(({ cases, brain }) => {
    const d = ArisanSim.debug, out = [];
    for (const { text, expect, context, news } of cases) {
      d.newGame({ mode: 'sim', n: 8 });
      const G = d.G; G.players.push({ ...G.players[0], id: 8, name: 'Bu Tester', human: true, bot: null, alive: true }); G.mode = 'bot';
      d.setBrain(brain);
      const byName = n => n === 'ME' ? 8 : G.players.find(x => x.name === n).id;
      G.msgs = [];
      if (news) { G.news = [{ type: news[0], target: byName(news[1]), text: 'kabar' }]; G.newsLog = G.news.map(n => ({ ...n, day: 1 })); }
      for (const [f, t, tg, v] of (context || [])) G.msgs.push({ from: byName(f), type: t, target: tg != null ? byName(tg) : null, value: v });
      const h = d.parseHuman(text);
      const nm = h.target != null ? '@' + G.players[h.target].name : '';
      let got = h.type + (h.type === 'ask' && h.addressee != null ? '@' + G.players[h.addressee].name : nm) + (h.ask ? '/' + h.ask : '');
      if (/:[+-]$/.test(expect) && (h.type === 'report' || h.type === 'claimBend')) got += h.value ? ':+' : ':-';
      out.push({ text, expect, got, conf: h.conf ?? null });
    }
    return out;
  }, { cases, brain: brainJson });
}
