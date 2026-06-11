import test from 'node:test';
import assert from 'node:assert/strict';
import { understand, extractCompany } from '../server/mail/extract.js';
import { INTENT } from '../server/mail/classify.js';
import { buildSamples } from '../server/mail/samples.js';

const NOW = Date.parse('2026-06-11T12:00:00+09:00');
const samples = Object.fromEntries(buildSamples(NOW).map((s) => [s.key, s]));
const u = (s) => understand(s, { now: NOW });

test('seminar confirmation → invite with full details', () => {
  const s = samples.seminar;
  const r = u(s);
  assert.equal(r.intent, INTENT.INVITE);
  assert.equal(r.type, '説明会');
  assert.equal(r.company.name, '株式会社ソラテック');
  assert.equal(r.company.domain, 'soratech.co.jp');
  assert.equal(r.chosen.startsAt, s.expect.startsAt);
  assert.equal(r.chosen.endsAt, s.expect.endsAt);
  assert.ok(r.location.online);
  assert.match(r.location.text, /オンライン（Zoom）/);
  assert.match(r.url, /^https:\/\/zoom\.us\//);
  assert.equal(r.dress, '自由');
});

test('interview confirmation → invite, onsite, stage label', () => {
  const s = samples.interview;
  const r = u(s);
  assert.equal(r.intent, INTENT.INVITE);
  assert.equal(r.type, '面接');
  assert.equal(r.label, '一次面接');
  assert.equal(r.company.name, '株式会社みらいフーズ');
  assert.equal(r.chosen.startsAt, s.expect.startsAt);
  assert.equal(r.location.online, false);
  assert.match(r.location.text, /本社 7F 会議室/);
  assert.equal(r.items, '履歴書、筆記用具');
  assert.equal(r.dress, 'スーツ着用');
});

test('schedule candidates → all slots + answer deadline', () => {
  const s = samples.candidates;
  const r = u(s);
  assert.equal(r.intent, INTENT.CANDIDATES);
  assert.equal(r.label, '二次面接');
  assert.equal(r.company.name, '株式会社ノースリバー');
  assert.deepEqual(r.candidates.map((c) => c.startsAt), s.expect.slots);
  assert.equal(r.deadline.startsAt, s.expect.answerBy);
});

test('rejection is recognized and carries the company', () => {
  const r = u(samples.rejection);
  assert.equal(r.intent, INTENT.REJECTION);
  assert.equal(r.company.name, '株式会社アオバ商事');
});

test('platform ES deadline → deadline intent, company from subject, site domain from body', () => {
  const s = samples.es_deadline;
  const r = u(s);
  assert.equal(r.intent, INTENT.DEADLINE);
  assert.equal(r.company.name, '株式会社ホシノ精機');
  assert.equal(r.company.viaPlatform, true);
  assert.equal(r.company.domain, 'hoshino-seiki.co.jp');
  assert.equal(r.chosen.startsAt, s.expect.deadline);
  assert.equal(r.chosen.isDeadline, true);
});

test('unrelated mail is ignored', () => {
  const r = u(samples.noise);
  assert.equal(r.intent, INTENT.IGNORE);
});

test('company name forms', () => {
  assert.equal(
    extractCompany({ fromName: 'トヨタ自動車株式会社 新卒採用担当', fromAddress: 'x@toyota.example.co.jp' }).name,
    'トヨタ自動車株式会社',
  );
  // platform display name is never the company
  const viaNav = extractCompany({
    fromName: 'マイナビ2027', fromAddress: 'm@mynavi.jp',
    subject: '【株式会社テスト】のご案内', text: '',
  });
  assert.equal(viaNav.name, '株式会社テスト');
  // weak fallback from cleaned display name
  const weak = extractCompany({ fromName: 'ソラテック採用チーム', fromAddress: 'hr@soratech.co.jp', subject: 'ご案内', text: '' });
  assert.equal(weak.name, 'ソラテック');
  assert.equal(weak.weak, true);
});
