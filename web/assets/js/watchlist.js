/** ウォッチリスト board — tab filter with FLIP, staggered entrance. */

const EASE = 'cubic-bezier(.22,1,.36,1)';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initWatchlist() {
  const board = document.getElementById('wlBoard');
  if (!board) return;
  const cards = [...board.querySelectorAll('.wl-card')];
  const tabs = [...document.querySelectorAll('.wl-tab')];

  // tab counts (kept in sync with the DOM, never hardcoded)
  for (const tab of tabs) {
    const f = tab.dataset.filter;
    const n = f === 'all' ? cards.length : cards.filter((c) => c.dataset.type === f).length;
    tab.querySelector('span').textContent = n;
  }

  // entrance: add .is-in when the board scrolls into view (IO + rect fallback)
  const reveal = () => board.classList.add('is-in');
  const inView = () => {
    const r = board.getBoundingClientRect();
    return r.top < innerHeight * .92 && r.bottom > 0;
  };
  if (inView()) reveal();
  else {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { reveal(); io.disconnect(); }
    }, { threshold: .14 });
    io.observe(board);
    const onScroll = () => { if (inView()) { reveal(); removeEventListener('scroll', onScroll); io.disconnect(); } };
    addEventListener('scroll', onScroll, { passive: true });
  }

  // filter with FLIP — survivors glide, newcomers fade in
  function filterTo(type) {
    const wasVisible = new Map(cards.map((c) => [c, !c.hasAttribute('data-off')]));
    const firsts = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));

    for (const c of cards) c.toggleAttribute('data-off', !(type === 'all' || c.dataset.type === type));
    if (reduced) return;

    requestAnimationFrame(() => {
      for (const c of cards) {
        if (c.hasAttribute('data-off')) continue;
        if (wasVisible.get(c)) {
          const a = firsts.get(c);
          const b = c.getBoundingClientRect();
          const dx = a.left - b.left;
          const dy = a.top - b.top;
          if (dx || dy) {
            c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
              { duration: 460, easing: EASE });
          }
        } else {
          c.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
            { duration: 380, easing: EASE });
        }
      }
    });
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      filterTo(tab.dataset.filter);
    });
  }
}
