/** The hero phone: a looping, typed-out conversation with the bot. */

const SCRIPT = [
  { who: 'bot', typing: 1100, text: '🔔 あす 6/24（水）14:00\n<span class="b-strong">ソラテック 会社説明会</span>（オンライン）' },
  { who: 'bot', typing: 1300, text: '▼ 30秒ブリーフ — ソラテック\n◎ 気象×AIのデータ解析企業\n・直近：シリーズCで45億円を調達\n・想定質問：データで判断した経験' },
  { who: 'bot', typing: 800, text: '参加リンクは前日にもう一度。\n<span class="b-strong">準備は、できています。</span>' },
  { who: 'me', wait: 1400, text: '/today' },
  { who: 'bot', typing: 900, text: 'きょうの予定\n・14:00 ソラテック 会社説明会\n\nそれだけです。ゆっくりどうぞ。' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function initPhone() {
  const chat = document.getElementById('phoneChat');
  if (!chat) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let visible = false;
  let running = false;
  const maybeStart = () => { if (visible && !running) loop(); };
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    maybeStart();
  }, { threshold: .25 }).observe(chat);
  // IO delivery can stall in embedded views — kick off if already on screen
  const r = chat.getBoundingClientRect();
  if (r.top < innerHeight && r.bottom > 0) { visible = true; maybeStart(); }

  async function loop() {
    running = true;
    for (;;) {
      chat.innerHTML = '';
      await sleep(700);
      for (const m of SCRIPT) {
        if (!visible) { running = false; return; }
        if (m.who === 'bot') {
          const t = el('div', 'typing', '<i></i><i></i><i></i>');
          chat.append(t);
          await sleep(reduced ? 60 : m.typing);
          t.remove();
        } else {
          await sleep(reduced ? 60 : m.wait || 900);
        }
        chat.append(el('div', `bubble${m.who === 'me' ? ' me' : ''}`, m.text));
        await sleep(reduced ? 120 : 1500);
      }
      await sleep(4200);
      // gentle clear
      await chat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).finished;
      chat.innerHTML = '';
      chat.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, fill: 'forwards' });
    }
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    n.className = cls;
    n.innerHTML = html;
    return n;
  }
}
