import test from 'node:test';
import assert from 'node:assert/strict';
import { createBox } from '../server/lib/crypto.js';
import { fakeClock } from '../server/lib/clock.js';
import { openDb } from '../server/db.js';
import { createApp, json, readJson } from '../server/lib/http.js';

test('crypto box seals and opens round-trip', () => {
  const box = createBox('test-secret');
  const sealed = box.seal('app-password-1234');
  assert.notEqual(sealed, 'app-password-1234');
  assert.equal(box.open(sealed), 'app-password-1234');
  // tampering breaks authentication
  const parts = sealed.split('.');
  const flipped = Buffer.from(parts[2], 'base64');
  flipped[0] ^= 0xff;
  parts[2] = flipped.toString('base64');
  assert.throws(() => box.open(parts.join('.')));
});

test('fake clock fires timers in order on advance', () => {
  const clock = fakeClock(1000);
  const fired = [];
  clock.setTimeout(() => fired.push('b'), 50);
  clock.setTimeout(() => fired.push('a'), 10);
  const c = clock.setTimeout(() => fired.push('never'), 80);
  clock.clearTimeout(c);
  clock.advance(60);
  assert.deepEqual(fired, ['a', 'b']);
  assert.equal(clock.now(), 1060);
});

test('db: user / company / event / reminder lifecycle', () => {
  const db = openDb(':memory:');
  const u = db.createUser({ email: 'taro@example.com', gradYear: 2027, channel: 'telegram' });
  assert.ok(u.id > 0);
  assert.match(u.link_code, /^[A-Z2-9]{6}$/);
  assert.equal(db.userByLinkCode(u.link_code.toLowerCase()).id, u.id);

  db.linkChat(u.id, 111222);
  assert.equal(db.userByChat('telegram', '111222').id, u.id);

  const c = db.upsertCompany(u.id, { name: '株式会社ソラテック', domain: 'soratech.example' });
  const again = db.upsertCompany(u.id, { name: '株式会社ソラテック' });
  assert.equal(c.id, again.id);

  const t0 = Date.parse('2026-06-24T05:00:00Z');
  const { event, created } = db.upsertEvent(u.id, {
    companyId: c.id, type: '説明会', title: '会社説明会', startsAt: t0,
  });
  assert.ok(created);
  const dup = db.upsertEvent(u.id, { companyId: c.id, type: '説明会', title: 'x', startsAt: t0 });
  assert.equal(dup.created, false);
  assert.equal(dup.event.id, event.id);

  db.createReminder(event.id, 'day_before', t0 - 86_400_000);
  db.createReminder(event.id, 'day_before', t0 - 86_400_000); // idempotent
  const due = db.dueReminders(t0);
  assert.equal(due.length, 1);
  db.markReminderSent(due[0].id);
  assert.equal(db.dueReminders(t0).length, 0);

  assert.equal(db.isSeen(u.id, '<m1@x>'), false);
  db.markSeen(u.id, '<m1@x>', 'invite_confirmed');
  assert.equal(db.isSeen(u.id, '<m1@x>'), true);
  db.close();
});

test('http: routing, params, json body, 404', async () => {
  const app = createApp({ onError: () => {} });
  app.get('/api/ping', (req, res) => json(res, 200, { pong: true }));
  app.get('/api/u/:id', (req, res) => json(res, 200, { id: req.params.id }));
  app.post('/api/echo', async (req, res) => json(res, 200, await readJson(req)));
  const server = await app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.deepEqual(await (await fetch(`${base}/api/ping`)).json(), { pong: true });
  assert.deepEqual(await (await fetch(`${base}/api/u/42`)).json(), { id: '42' });
  const echo = await fetch(`${base}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ こんにちは: '世界' }),
  });
  assert.deepEqual(await echo.json(), { こんにちは: '世界' });
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  server.close();
});
