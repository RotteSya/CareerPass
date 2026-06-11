import { initPhone } from './phone.js';
import { initForm } from './form.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── nav scrolled state ─────────────────────────────── */
const nav = document.getElementById('nav');
const onScroll = () => nav.toggleAttribute('data-scrolled', scrollY > 30);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ── reveal on scroll ───────────────────────────────── */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }
}, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ── aurora follows the pointer, lazily ─────────────── */
if (!reduced) {
  const aurora = document.querySelector('.aurora');
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - .5) * 56;
    ty = (e.clientY / innerHeight - .5) * 40;
  }, { passive: true });
  (function drift() {
    cx += (tx - cx) * .035;
    cy += (ty - cy) * .035;
    aurora.style.setProperty('--ax', `${cx.toFixed(2)}px`);
    aurora.style.setProperty('--ay', `${cy.toFixed(2)}px`);
    requestAnimationFrame(drift);
  })();
}

/* ── magnetic buttons ───────────────────────────────── */
if (!reduced && matchMedia('(pointer: fine)').matches) {
  for (const el of document.querySelectorAll('.magnetic')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      el.style.transform = `translate(${(x * 9).toFixed(1)}px, ${(y * 7).toFixed(1)}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

/* ── chaos marquee ──────────────────────────────────── */
const SUBJECTS = [
  '【マイナビ】会社説明会 予約のご案内', '【重要】Web面接URLのお知らせ',
  '<b>ES提出期限</b>が近づいています', '【リクナビ】合同説明会のお知らせ',
  '一次面接 日程確定のお知らせ', '適性検査（SPI）受検のお願い',
  '【締切本日】エントリーシート', 'カジュアル面談のご案内',
  '説明選考会へのご招待', '<b>二次面接</b>のご案内',
  '【日程変更】会社説明会について', 'インターンシップ事前課題のご連絡',
  '選考結果のお知らせ', 'プレエントリー受付開始のお知らせ',
  '【OfferBox】新着オファーが届いています', '志望動機書のご提出について',
  '<b>最終面接</b>のご案内', 'Webテスト受検期限のリマインド',
  '会社見学会のご案内', '採用マイページ登録のお願い',
];
for (const track of document.querySelectorAll('.marquee-track')) {
  const shuffled = [...SUBJECTS].sort(() => Math.random() - .5);
  const pills = shuffled.map((s) => `<span class="mq-pill">${s}</span>`).join('');
  track.innerHTML = pills + pills; // doubled for the seamless -50% loop
  track.style.setProperty('--t', `${track.dataset.speed || 38}s`);
}

/* ── faq: animated open/close on <details> ──────────── */
for (const qa of document.querySelectorAll('.qa')) {
  const summary = qa.querySelector('summary');
  const body = qa.querySelector('.qa-body');
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    if (reduced) { qa.open = !qa.open; return; }
    if (qa.open) {
      const h = body.offsetHeight;
      const anim = body.animate(
        [{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
      anim.onfinish = () => { qa.open = false; };
    } else {
      qa.open = true;
      const h = body.offsetHeight;
      body.animate(
        [{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }],
        { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
  });
}

initPhone();
initForm();
