/** /demo playground — drive the real pipeline, watch the real bot. */

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ── samples ────────────────────────────────────────── */
async function loadSamples() {
  const { samples } = await api('/api/demo/samples');
  $('samples').innerHTML = '';
  for (const s of samples) {
    const b = document.createElement('button');
    b.className = 'sample';
    b.innerHTML = `<b>${s.label}</b><span>${s.fromName} — ${s.subject}</span>`;
    b.addEventListener('click', async () => {
      b.dataset.done = '1';
      try {
        await api('/api/demo/inject', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: s.key }),
        });
      } catch {
        delete b.dataset.done;
      }
      refreshEvents();
    });
    $('samples').append(b);
  }
}

/* ── detected events ────────────────────────────────── */
async function refreshEvents() {
  const { events } = await api('/api/demo/state');
  const box = $('events');
  if (!events.length) {
    box.innerHTML = '<p class="ev-empty">まだありません。上のメールを受信させてみてください。</p>';
    return;
  }
  box.innerHTML = events.map((ev) => `
    <div class="ev">
      <time>${fmt.format(ev.starts_at)}</time>
      <span class="t">${ev.company ? `${ev.company} ` : ''}${ev.title}</span>
      <span class="badge">${ev.type}</span>
    </div>`).join('');
}

/* ── live bot feed (SSE from the console channel) ───── */
function connect() {
  const es = new EventSource('/api/demo/stream');
  es.addEventListener('hello', () => $('live').dataset.on = '1');
  es.addEventListener('bot', (e) => {
    const msg = JSON.parse(e.data);
    appendBubble(msg);
    refreshEvents();
  });
  es.onerror = () => {
    delete $('live').dataset.on;
    es.close();
    setTimeout(connect, 2500);
  };
}

function appendBubble({ text, buttons }) {
  const chat = $('chat');
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  if (buttons?.length) {
    const row = document.createElement('span');
    row.className = 'btnrow';
    for (const btn of buttons) {
      const a = document.createElement(btn.url ? 'a' : 'span');
      a.className = 'chip';
      a.textContent = btn.label;
      if (btn.url) { a.href = btn.url; a.target = '_blank'; a.rel = 'noopener'; }
      row.append(a);
    }
    b.append(row);
  }
  chat.append(b);
  chat.scrollTop = chat.scrollHeight;
}

/* ── reset ──────────────────────────────────────────── */
$('reset').addEventListener('click', async () => {
  await api('/api/demo/reset', { method: 'POST' });
  $('chat').innerHTML = '';
  document.querySelectorAll('.sample[data-done]').forEach((b) => delete b.dataset.done);
  refreshEvents();
});

loadSamples();
refreshEvents();
connect();
