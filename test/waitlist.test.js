import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBox } from '../server/lib/crypto.js';
import { createApp } from '../server/lib/http.js';
import { registerApi } from '../server/api.js';

async function startServer() {
  const db = openDb(':memory:');
  const app = createApp({ onError: () => {} });
  registerApi({
    app, db, box: createBox('t'), pipeline: null, consoleChannel: null,
    lineChannel: null, config: { demo: false }, watcher: { refresh() {} },
    getBotUsername: () => null,
  });
  const server = await app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const join = async (payload) => {
    const res = await fetch(`${base}/api/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: await res.json() };
  };
  return { db, server, join };
}

test('waitlist: join returns sequential positions', async () => {
  const s = await startServer();
  const a = await s.join({ email: 'a@example.com', gradYear: 2027 });
  const b = await s.join({ email: 'b@example.com' });
  assert.equal(a.body.position, 1);
  assert.equal(a.body.total, 1);
  assert.match(a.body.refCode, /^[A-Z2-9]{6}$/);
  assert.equal(b.body.position, 2);
  assert.equal(b.body.total, 2);
  s.server.close();
});

test('waitlist: re-joining the same email is idempotent', async () => {
  const s = await startServer();
  const first = await s.join({ email: 'taro@example.com' });
  const again = await s.join({ email: 'TARO@example.com' }); // case-normalized
  assert.equal(again.body.alreadyJoined, true);
  assert.equal(again.body.refCode, first.body.refCode);
  assert.equal(again.body.total, 1);
  s.server.close();
});

test('waitlist: a referral moves the referrer up the queue', async () => {
  const s = await startServer();
  const a = await s.join({ email: 'a@example.com' }); // pos 1
  await s.join({ email: 'b@example.com' });           // pos 2
  const c = await s.join({ email: 'c@example.com' });  // pos 3, no referral yet
  assert.equal(c.body.position, 3);

  // d and e both join using c's invite code → c outranks everyone
  await s.join({ email: 'd@example.com', ref: c.body.refCode });
  await s.join({ email: 'e@example.com', ref: c.body.refCode });

  const cNow = await s.join({ email: 'c@example.com' });
  assert.equal(cNow.body.referrals, 2);
  assert.equal(cNow.body.position, 1); // 2 referrals beats a's 0, despite joining later

  const aNow = await s.join({ email: 'a@example.com' });
  assert.equal(aNow.body.position, 2); // earliest among the zero-referral rest
  s.server.close();
});

test('waitlist: invalid email is rejected', async () => {
  const s = await startServer();
  const r = await s.join({ email: 'not-an-email' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_email');
  s.server.close();
});

test('waitlist: an unknown referral code is ignored, not fatal', async () => {
  const s = await startServer();
  const r = await s.join({ email: 'x@example.com', ref: 'ZZZZZZ' });
  assert.equal(r.status, 200);
  assert.equal(r.body.position, 1);
  s.server.close();
});
