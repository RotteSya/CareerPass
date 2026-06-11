/** Registration flow: 3 quiet steps, then the linking code. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initForm() {
  const card = document.querySelector('.reg-card');
  if (!card) return;

  const state = { email: '', gradYear: null, channel: null, token: null };
  const steps = [...card.querySelectorAll('.reg-step')];
  const bar = document.getElementById('regBar');
  const emailInput = document.getElementById('regEmail');
  const emailErr = document.getElementById('regEmailErr');
  const submitErr = document.getElementById('regSubmitErr');

  function goto(n) {
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === n));
    bar.style.width = n >= 4 ? '100%' : `${(n / 3) * 100}%`;
    if (n >= 4) bar.style.background = 'var(--accent)';
  }

  card.querySelectorAll('[data-back]').forEach((b) =>
    b.addEventListener('click', () => {
      const cur = Number(card.querySelector('.reg-step.is-active').dataset.step);
      goto(Math.max(1, cur - 1));
    }));

  // step 1 — email
  document.getElementById('regForm1').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = emailInput.value.trim();
    if (!EMAIL_RE.test(v)) {
      emailErr.textContent = 'メールアドレスの形式を確認してください。';
      emailInput.focus();
      return;
    }
    emailErr.textContent = '';
    state.email = v;
    goto(2);
  });

  // step 2 — grad year
  card.querySelectorAll('.pill').forEach((p) =>
    p.addEventListener('click', () => {
      state.gradYear = Number(p.dataset.year);
      goto(3);
    }));

  // step 3 — channel → register
  card.querySelectorAll('.channel').forEach((c) =>
    c.addEventListener('click', async () => {
      state.channel = c.dataset.channel;
      submitErr.textContent = '';
      c.style.opacity = '.6';
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: state.email, gradYear: state.gradYear, channel: state.channel }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'failed');
        if (body.alreadyLinked) {
          submitErr.textContent = 'このアドレスはすでに連携済みです。Botで /today をどうぞ。';
          return;
        }
        state.token = body.token;
        showDone(body);
      } catch {
        submitErr.textContent = '送信できませんでした。少し待って、もう一度お試しください。';
      } finally {
        c.style.opacity = '';
      }
    }));

  function showDone(body) {
    const lead = document.getElementById('doneLead');
    const botLink = document.getElementById('botLink');
    if (state.channel === 'line') {
      lead.textContent = 'LINEは招待制プレビュー中です。友だち追加の案内が届いたら、このコードを送ってください。';
      botLink.style.display = 'none';
    } else if (body.telegramLink) {
      lead.textContent = 'Telegramでこのコードを送ると、連携が完了します。';
      botLink.href = body.telegramLink;
    } else {
      lead.textContent = 'Botにこのコードを送ると、連携が完了します。';
      botLink.style.display = 'none';
    }
    goto(4);
    spellCode(body.linkCode);
  }

  // code appears one glyph at a time — a small ceremony
  function spellCode(code) {
    const el = document.getElementById('linkCode');
    el.textContent = '';
    [...code].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.display = 'inline-block';
      el.append(s);
      s.animate(
        [
          { opacity: 0, transform: 'translateY(12px) rotate(6deg)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 480, delay: 220 + i * 90, easing: 'cubic-bezier(.34,1.45,.56,1)', fill: 'backwards' },
      );
    });
  }

  // copy
  const copyBtn = document.getElementById('copyBtn');
  const copySvg = copyBtn.innerHTML;
  copyBtn.addEventListener('click', async () => {
    const code = document.getElementById('linkCode').textContent;
    try { await navigator.clipboard.writeText(code); } catch { return; }
    copyBtn.innerHTML =
      '<svg viewBox="0 0 20 20"><path d="m4 10.5 4 4L16 6" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    setTimeout(() => { copyBtn.innerHTML = copySvg; }, 1400);
  });

  // optional imap binding
  document.getElementById('imapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = document.getElementById('imapOk');
    const password = document.getElementById('imapPass').value.trim();
    if (!password || !state.token) { ok.textContent = 'パスワードを入力してください。'; return; }
    ok.textContent = '保存しています…';
    try {
      const res = await fetch('/api/imap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: state.token, password }),
      });
      if (!res.ok) throw new Error();
      ok.textContent = '保存しました。受信を見守ります。';
      document.getElementById('imapPass').value = '';
    } catch {
      ok.textContent = '保存できませんでした。もう一度お試しください。';
    }
  });
}
