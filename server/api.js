import { json, readJson, readBody, sse } from './lib/http.js';
import { buildSamples, DEMO_RESEARCH } from './mail/samples.js';
import { logger } from './lib/log.js';

const log = logger('api');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEMO_EMAIL = 'demo@goojob.example';

const IMAP_HOSTS = {
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'outlook.jp': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'yahoo.co.jp': 'imap.mail.yahoo.co.jp',
  'icloud.com': 'imap.mail.me.com',
  'me.com': 'imap.mail.me.com',
};

export function registerApi({
  app, db, box, pipeline, consoleChannel, lineChannel, config, watcher, getBotUsername,
}) {
  app.get('/api/health', (req, res) =>
    json(res, 200, { ok: true, demo: config.demo }));

  // ── registration ───────────────────────────────────────
  app.post('/api/register', async (req, res) => {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const gradYear = Number(body.gradYear) || null;
    const channel = ['telegram', 'line'].includes(body.channel) ? body.channel : 'telegram';
    const name = body.name ? String(body.name).slice(0, 60) : null;
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid_email' });

    let user = db.userByEmail(email);
    if (user) {
      if (user.chat_id) return json(res, 200, { ok: true, alreadyLinked: true });
      db.setChannel(user.id, channel);
      user = db.userById(user.id);
    } else {
      user = db.createUser({ email, gradYear, channel, name });
      log(`registered ${email} (${gradYear ?? '?'}卒, ${channel})`);
    }

    const botUsername = getBotUsername?.();
    return json(res, 200, {
      ok: true,
      linkCode: user.link_code,
      token: user.token,
      channel,
      telegramLink: channel === 'telegram' && botUsername
        ? `https://t.me/${botUsername}?start=${user.link_code}`
        : null,
    });
  });

  // ── imap binding (token-gated) ─────────────────────────
  app.post('/api/imap', async (req, res) => {
    const body = await readJson(req);
    const user = db.userByToken(String(body.token || ''));
    if (!user) return json(res, 401, { error: 'bad_token' });
    const password = String(body.password || '');
    if (!password) return json(res, 400, { error: 'password_required' });

    const mailDomain = user.email.split('@')[1];
    const host = String(body.host || IMAP_HOSTS[mailDomain] || `imap.${mailDomain}`);
    const port = Number(body.port) || 993;
    const imapUser = String(body.user || user.email);

    db.setImap(user.id, { host, port, user: imapUser, passEnc: box.seal(password) });
    watcher?.refresh(user.id);
    log(`imap configured for ${user.email} (${host})`);
    return json(res, 200, { ok: true, host, port });
  });

  // ── line webhook (needs public URL; verified) ──────────
  if (lineChannel) {
    app.post('/webhooks/line', async (req, res) => {
      const raw = await readBody(req);
      if (!lineChannel.verifySignature(raw, req.headers['x-line-signature'])) {
        return json(res, 403, { error: 'bad_signature' });
      }
      json(res, 200, { ok: true }); // ack fast, process after
      try {
        const body = JSON.parse(raw.toString('utf8') || '{}');
        await lineChannel.handleEvents(body.events || []);
      } catch (err) {
        log.error('line webhook:', err.message);
      }
    });
  }

  // ── demo mode ──────────────────────────────────────────
  if (!config.demo) return;

  const demoUser = () =>
    db.userByEmail(DEMO_EMAIL) ||
    db.createUser({ email: DEMO_EMAIL, gradYear: 2027, channel: 'console', name: '就活 太郎' });

  app.get('/api/demo/samples', (req, res) => {
    json(res, 200, {
      samples: buildSamples(Date.now()).map(({ key, label, subject, fromName }) =>
        ({ key, label, subject, fromName })),
    });
  });

  app.post('/api/demo/inject', async (req, res) => {
    const { key } = await readJson(req);
    const sample = buildSamples(Date.now()).find((s) => s.key === key);
    if (!sample) return json(res, 404, { error: 'unknown_sample' });
    const user = demoUser();
    const result = await pipeline.processMail(user, sample);
    // canned research so reminders carry a rich brief while offline
    for (const company of db.companiesForUser(user.id)) {
      if (!company.research_json && DEMO_RESEARCH[company.name]) {
        db.saveResearch(company.id, DEMO_RESEARCH[company.name]);
      }
    }
    json(res, 200, { ok: true, label: sample.label, result });
  });

  app.get('/api/demo/state', (req, res) => {
    const user = demoUser();
    const now = Date.now();
    const events = db.eventsBetween(user.id, now - 86_400_000, now + 90 * 86_400_000).map((ev) => ({
      ...ev,
      company: ev.company_id ? db.companyById(ev.company_id)?.name : null,
    }));
    json(res, 200, { events, companies: db.companiesForUser(user.id).map((c) => c.name) });
  });

  app.post('/api/demo/reset', (req, res) => {
    const user = demoUser();
    db.wipeUser(user.id);
    json(res, 200, { ok: true });
  });

  app.get('/api/demo/stream', (req, res) => {
    const stream = sse(res);
    stream.send({ hello: true, at: Date.now() }, 'hello');
    const unsub = consoleChannel.subscribe((msg) => stream.send(msg, 'bot'));
    stream.onClose(unsub);
  });
}
