/** Waitlist: one quiet screen → a confirmed seat with a live queue number. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n) => String(n).padStart(4, '0');

export function initForm() {
  const card = document.querySelector('.join-card');
  if (!card) return;

  const panes = {
    form: card.querySelector('[data-pane="form"]'),
    done: card.querySelector('[data-pane="done"]'),
  };
  const emailInput = document.getElementById('joinEmail');
  const err = document.getElementById('joinErr');
  const years = [...card.querySelectorAll('.yr')];

  // a referral code rides in on ?wl=CODE
  const ref = new URLSearchParams(location.search).get('wl');
  let gradYear = null;

  function showPane(name) {
    for (const [key, el] of Object.entries(panes)) {
      const on = key === name;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
  }

  // year chips: single-select, click again to clear
  years.forEach((y) =>
    y.addEventListener('click', () => {
      const was = y.classList.contains('is-on');
      years.forEach((o) => o.classList.remove('is-on'));
      if (!was) { y.classList.add('is-on'); gradYear = Number(y.dataset.year); }
      else gradYear = null;
    }));

  document.getElementById('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!EMAIL_RE.test(email)) {
      err.textContent = 'メールアドレスの形式を確認してください。';
      emailInput.focus();
      return;
    }
    err.textContent = '';
    const submit = card.querySelector('.join-submit');
    submit.style.opacity = '.6';
    submit.style.pointerEvents = 'none';
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, gradYear, ref }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'failed');
      confirmSeat(body);
    } catch {
      err.textContent = '送信できませんでした。少し待って、もう一度お試しください。';
      submit.style.opacity = '';
      submit.style.pointerEvents = '';
    }
  });

  function confirmSeat({ position, alreadyJoined, refCode }) {
    const headline = document.getElementById('joinHeadline');
    const lead = document.getElementById('joinLead');
    const rankLabel = document.getElementById('joinRankLabel');

    if (alreadyJoined) {
      rankLabel.textContent = 'あなたの順番';
      headline.textContent = 'すでに、お席があります。';
      lead.textContent = 'ご登録済みです。準備ができ次第、メールでご案内します。';
    } else if (position === 1) {
      headline.textContent = 'いちばん乗りです。';
      lead.textContent = '準備ができ次第、あなたへ最初にご案内します。';
    } else {
      headline.textContent = 'お席を、お取りしました。';
      lead.textContent = '準備ができ次第、メールでそっとご案内します。';
    }

    // invite link + share targets
    const url = `${location.origin}/?wl=${refCode}`;
    document.getElementById('inviteUrl').textContent = `${location.host}/?wl=${refCode}`;
    setupInvite(url);

    showPane('done');
    panes.done.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    countTo(document.getElementById('joinNum'), position);
  }

  function setupInvite(url) {
    const text = 'しずかな就活、GooJob のウェイトリストに登録しました。';
    document.getElementById('shareX').href =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    document.getElementById('shareLine').href =
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;

    const btn = document.getElementById('inviteCopy');
    const original = btn.innerHTML;
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(url); } catch { return; }
      btn.innerHTML =
        '<svg viewBox="0 0 20 20"><path d="m4 10.5 4 4L16 6" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      setTimeout(() => { btn.innerHTML = original; }, 1400);
    };
  }

  // count-up: 0 → position, eased — the small ceremony of a saved seat.
  // A timeout guarantees the final value even if rAF is throttled
  // (backgrounded tab / headless), so the number never sticks mid-count.
  function countTo(el, target) {
    if (reduced || target <= 1) { el.textContent = pad(target); return; }
    const dur = 1100;
    let start = null;
    let done = false;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const finish = () => { done = true; el.textContent = pad(target); };
    function step(ts) {
      if (done) return;
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      el.textContent = pad(Math.round(ease(p) * target));
      if (p < 1) requestAnimationFrame(step); else done = true;
    }
    requestAnimationFrame(step);
    setTimeout(finish, dur + 150);
  }
}
