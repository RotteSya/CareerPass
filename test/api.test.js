import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fakeClock } from '../server/lib/clock.js';
import { createBox } from '../server/lib/crypto.js';
import { createApp } from '../server/lib/http.js';
import { createChannels } from '../server/bot/channel.js';
import { createConsoleChannel } from '../server/bot/console.js';
import { createReminders } from '../server/reminders.js';
import { createPipeline } from '../server/pipeline.js';
import { registerApi } from '../server/api.js';

const NOW = Date.parse('2026-06-11T12:00:00+09:00');

async function startServer() {
  const db = openDb(':memory:');
  const clock = fakeClock(NOW);
  const box = createBox('test');
  const channels = createChannels();
  const consoleChannel = createConsoleChannel();
  channels.register(consoleChannel);
  const config = {
    demo: true,
    reminderOffsets: [{ kind: 'day_before', ms: 14_000 }, { kind: 'soon', ms: 30_000 }],
  };
  const reminders = createReminders({ db, channels, config, clock });
  const pipeline = createPipeline({ db, channels, research: null, reminders, config, clock });
  const app = createApp({ onError: () => {} });
  const refreshed = [];
  registerApi({
    app, db, box, pipeline, consoleChannel, lineChannel: null, config,
    watcher: { refresh: (id) => refreshed.push(id) },
    getBotUsername: () => 'goojob_test_bot',
  });
  const server = await app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { db, box, server, call, refreshed };
}

test('api: register → imap bind → demo inject → state → reset', async () => {
  const s = await startServer();

  // invalid email rejected
  assert.equal((await s.call('POST', '/api/register', { email: 'nope' })).status, 400);

  // register
  const reg = await s.call('POST', '/api/register', {
    email: 'hanako@example.com', gradYear: 2027, channel: 'telegram',
  });
  assert.equal(reg.status, 200);
  assert.match(reg.body.linkCode, /^[A-Z0-9]{6}$/);
  assert.ok(reg.body.token.length > 20);
  assert.equal(reg.body.telegramLink, `https://t.me/goojob_test_bot?start=${reg.body.linkCode}`);

  // re-register before linking returns a code again (recovery)
  const reg2 = await s.call('POST', '/api/register', {
    email: 'hanako@example.com', gradYear: 2027, channel: 'telegram',
  });
  assert.equal(reg2.body.linkCode, reg.body.linkCode);

  // once linked, registration stops leaking the code
  s.db.linkChat(s.db.userByEmail('hanako@example.com').id, 'chat-9');
  const reg3 = await s.call('POST', '/api/register', { email: 'hanako@example.com' });
  assert.equal(reg3.body.alreadyLinked, true);
  assert.equal(reg3.body.linkCode, undefined);

  // imap binding: bad token rejected; good token stores encrypted password
  assert.equal((await s.call('POST', '/api/imap', { token: 'x', password: 'p' })).status, 401);
  const imap = await s.call('POST', '/api/imap', { token: reg.body.token, password: 'app-pass-123' });
  assert.equal(imap.status, 200);
  assert.equal(imap.body.host, 'imap.example.com'); // derived from mail domain
  const u = s.db.userByEmail('hanako@example.com');
  assert.notEqual(u.imap_pass_enc, 'app-pass-123');
  assert.equal(s.box.open(u.imap_pass_enc), 'app-pass-123');
  assert.deepEqual(s.refreshed, [u.id]);

  // demo: list samples, inject one, read state
  const samples = await s.call('GET', '/api/demo/samples');
  assert.ok(samples.body.samples.length >= 5);

  const inj = await s.call('POST', '/api/demo/inject', { key: 'seminar' });
  assert.equal(inj.body.result.intent, 'invite_confirmed');

  const state = await s.call('GET', '/api/demo/state');
  assert.equal(state.body.events.length, 1);
  assert.equal(state.body.events[0].company, '株式会社ソラテック');
  assert.deepEqual(state.body.companies, ['株式会社ソラテック']);

  // canned research attached for rich demo briefs
  const demoUser = s.db.userByEmail('demo@goojob.example');
  const [company] = s.db.companiesForUser(demoUser.id);
  assert.ok(company.research_json.includes('気象'));

  // unknown sample 404s; reset clears state
  assert.equal((await s.call('POST', '/api/demo/inject', { key: 'nope' })).status, 404);
  await s.call('POST', '/api/demo/reset');
  assert.equal((await s.call('GET', '/api/demo/state')).body.events.length, 0);

  s.server.close();
});
