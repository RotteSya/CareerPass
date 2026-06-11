import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fakeClock } from '../server/lib/clock.js';
import { createChannels } from '../server/bot/channel.js';
import { createReminders } from '../server/reminders.js';
import { createPipeline } from '../server/pipeline.js';
import { createCommands } from '../server/bot/commands.js';
import { buildSamples, DEMO_RESEARCH } from '../server/mail/samples.js';

const NOW = Date.parse('2026-06-11T12:00:00+09:00');
const DAY = 86_400_000;
const HOUR = 3_600_000;
const tick = () => new Promise((r) => setImmediate(r));

function harness() {
  const db = openDb(':memory:');
  const clock = fakeClock(NOW);
  const sent = [];
  const channels = createChannels();
  channels.register({
    name: 'console',
    requiresLink: false,
    send: (user, msg) => sent.push({ to: user.email, ...msg }),
  });
  const research = {
    research: async (c) =>
      DEMO_RESEARCH[c.name] ||
      { name: c.name, wiki: null, news: [], site: null, brief: null, sources: [], generatedAt: clock.now() },
  };
  const config = {
    demo: false,
    reminderOffsets: [
      { kind: 'day_before', ms: 24 * HOUR },
      { kind: 'soon', ms: HOUR },
    ],
  };
  const reminders = createReminders({ db, channels, config, clock });
  const pipeline = createPipeline({ db, channels, research, reminders, config, clock });
  const commands = createCommands({ db, channels, research, config });
  const samples = Object.fromEntries(buildSamples(NOW).map((s) => [s.key, s]));
  return { db, clock, sent, channels, pipeline, commands, samples };
}

test('invite arc: detect → research → day-before brief → soon nudge → dedupe', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', gradYear: 2027, channel: 'telegram' });

  const r = await h.pipeline.processMail(user, h.samples.seminar);
  assert.equal(r.intent, 'invite_confirmed');
  assert.ok(r.created);

  const [ev] = h.db.futureEvents(user.id, NOW);
  assert.equal(ev.starts_at, h.samples.seminar.expect.startsAt);
  assert.equal(ev.ends_at, h.samples.seminar.expect.endsAt);
  assert.match(ev.location, /オンライン（Zoom）/);
  assert.match(ev.url, /zoom\.us/);

  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /予定を見つけました/);
  assert.match(h.sent[0].text, /株式会社ソラテック 会社説明会/);

  await tick(); // let background research persist

  // day before: rich reminder with the brief
  h.clock.advance(ev.starts_at - 24 * HOUR - NOW + 1000);
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1].text, /🔔/);
  assert.match(h.sent[1].text, /30秒ブリーフ — 株式会社ソラテック/);
  assert.match(h.sent[1].text, /気象×AI/);
  assert.match(h.sent[1].text, /準備は、できています。/);
  assert.ok(h.sent[1].buttons.some((b) => /zoom\.us/.test(b.url)));

  // one hour before: short nudge
  h.clock.advance(23 * HOUR);
  assert.equal(h.sent.length, 3);
  assert.match(h.sent[2].text, /⏰ まもなく 14:00/);

  // same mail again: idempotent
  const dup = await h.pipeline.processMail(user, h.samples.seminar);
  assert.equal(dup.intent, 'duplicate');
  assert.equal(h.sent.length, 3);
});

test('onsite interview reminder carries items, dress and a map button', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  await h.pipeline.processMail(user, h.samples.interview);
  await tick();

  const [ev] = h.db.futureEvents(user.id, NOW);
  assert.equal(ev.type, '面接');
  assert.equal(ev.title, '一次面接');
  assert.equal(ev.items, '履歴書、筆記用具');

  h.clock.advance(ev.starts_at - 24 * HOUR - NOW + 1000);
  const msg = h.sent.at(-1);
  assert.match(msg.text, /場所：本社 7F 会議室（東京都渋谷区神宮前1-2-3 みらいフーズビル）/);
  assert.match(msg.text, /持ち物：履歴書、筆記用具/);
  assert.match(msg.text, /服装：スーツ着用/);
  const map = msg.buttons.find((b) => /google\.com\/maps/.test(b.url));
  assert.ok(map && map.url.includes(encodeURIComponent('東京都渋谷区神宮前1-2-3')));
});

test('reminder settings: day_before off → only soon fires', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  await h.pipeline.processMail(user, h.samples.interview);
  h.db.saveSettings(user.id, { reminders: { day_before: false, soon: true } });

  const [ev] = h.db.futureEvents(user.id, NOW);
  const before = h.sent.length;
  h.clock.advance(ev.starts_at - 24 * HOUR - NOW + 1000);
  assert.equal(h.sent.length, before); // suppressed
  h.clock.advance(23 * HOUR);
  assert.equal(h.sent.length, before + 1);
  assert.match(h.sent.at(-1).text, /まもなく/);
});

test('candidates mail → slot list with deadline, no calendar event', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  const r = await h.pipeline.processMail(user, h.samples.candidates);
  assert.equal(r.intent, 'candidates');
  assert.equal(r.slots, 3);
  assert.equal(h.db.futureEvents(user.id, NOW).length, 0);
  const msg = h.sent.at(-1);
  assert.match(msg.text, /日程の選択が必要です/);
  assert.match(msg.text, /①/);
  assert.match(msg.text, /回答期限：/);
});

test('ES deadline mail → 締切 event + notification', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  const r = await h.pipeline.processMail(user, h.samples.es_deadline);
  assert.equal(r.intent, 'deadline');
  const [ev] = h.db.futureEvents(user.id, NOW);
  assert.equal(ev.type, '締切');
  assert.match(ev.title, /エントリーシート提出/);
  assert.equal(ev.starts_at, h.samples.es_deadline.expect.deadline);
  assert.match(h.sent.at(-1).text, /⏳ 締切があります — 株式会社ホシノ精機/);
});

test('rejection is acknowledged quietly; noise is ignored', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  await h.pipeline.processMail(user, h.samples.rejection);
  assert.match(h.sent.at(-1).text, /選考結果のお知らせが届きました/);
  const n = h.sent.length;
  const r = await h.pipeline.processMail(user, h.samples.noise);
  assert.equal(r.intent, 'ignore');
  assert.equal(h.sent.length, n);
});

test('bot commands: /start link, /today, /companies, /brief', async () => {
  const h = harness();
  const user = h.db.createUser({ email: 'taro@example.com', channel: 'telegram' });
  await h.pipeline.processMail(user, h.samples.seminar);
  await tick();
  h.sent.length = 0;

  // wrong code, then correct code
  await h.commands.handleText('console', 'chat-1', '/start NOPE99');
  assert.match(h.sent.at(-1).text, /コードが見つかりません/);
  await h.commands.handleText('console', 'chat-1', `/start ${user.link_code}`);
  assert.match(h.sent.at(-1).text, /はじめまして。GooJob です/);
  assert.equal(h.db.userByChat('console', 'chat-1').email, 'taro@example.com');

  await h.commands.handleText('console', 'chat-1', '/today');
  assert.match(h.sent.at(-1).text, /きょうは、なにもありません/);

  await h.commands.handleText('console', 'chat-1', '/week');
  assert.match(h.sent.at(-1).text, /今週の予定はありません/);

  await h.commands.handleText('console', 'chat-1', '/companies');
  assert.match(h.sent.at(-1).text, /株式会社ソラテック/);

  await h.commands.handleText('console', 'chat-1', '/brief ソラテック');
  assert.match(h.sent.at(-1).text, /30秒ブリーフ — 株式会社ソラテック/);

  await h.commands.handleText('console', 'chat-1', '/settings');
  assert.match(h.sent.at(-1).text, /前日のお知らせ：オン/);
  await h.commands.handleCallback('console', 'chat-1', 'toggle:day_before');
  assert.match(h.sent.at(-1).text, /前日のお知らせ：オフ/);
});
