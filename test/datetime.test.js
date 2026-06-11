import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDateTimes } from '../server/jp/datetime.js';
import { fmtDateTime, fmtRelDay, fmtWhen } from '../server/jp/format.js';

// Frozen "now": 2026-06-11 (木) 12:00 JST
const NOW = Date.parse('2026-06-11T12:00:00+09:00');
const x = (text) => extractDateTimes(text, { now: NOW });
const jst = (s) => Date.parse(s + '+09:00');

test('full date with weekday and time range', () => {
  const [r] = x('2026年6月24日（水）14:00〜15:30にて開催いたします。');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
  assert.equal(r.endsAt, jst('2026-06-24T15:30'));
  assert.ok(r.confidence > 0.9);
  assert.equal(r.weekday, '水');
});

test('year omitted → nearest future year inferred', () => {
  const [r] = x('説明会は6月24日(水) 14:00より');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
  assert.equal(r.yearInferred, true);
});

test('past month/day rolls to next year', () => {
  const [r] = x('1月10日(日) 10:00 開催');
  assert.equal(r.startsAt, jst('2027-01-10T10:00'));
  assert.ok(r.confidence > 0.8); // weekday matches 2027
});

test('zenkaku digits, fullwidth colon and tilde', () => {
  const [r] = x('６月２４日（水）１４：００～１５：３０');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
  assert.equal(r.endsAt, jst('2026-06-24T15:30'));
});

test('reiwa era date', () => {
  const [r] = x('令和8年7月1日（水）10時00分より一次面接');
  assert.equal(r.startsAt, jst('2026-07-01T10:00'));
});

test('slash short form with weekday', () => {
  const [r] = x('次回:6/24(水)14時より');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
});

test('iso-like and dotted forms', () => {
  assert.equal(x('2026-06-24 14:00')[0].startsAt, jst('2026-06-24T14:00'));
  assert.equal(x('2026.6.24 14:00')[0].startsAt, jst('2026-06-24T14:00'));
  assert.equal(x('2026/06/24（水）14:00')[0].startsAt, jst('2026-06-24T14:00'));
});

test('kanji clock: 半 / 分 / 午後 / 午前', () => {
  assert.equal(x('6月24日 13時半')[0].startsAt, jst('2026-06-24T13:30'));
  assert.equal(x('6月24日 9時05分')[0].startsAt, jst('2026-06-24T09:05'));
  assert.equal(x('6月24日 午後2時')[0].startsAt, jst('2026-06-24T14:00'));
  assert.equal(x('6月24日 午前10時')[0].startsAt, jst('2026-06-24T10:00'));
});

test('kanji time range', () => {
  const [r] = x('6月24日（水）14時〜15時半');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
  assert.equal(r.endsAt, jst('2026-06-24T15:30'));
});

test('date-only mention still extracts (low specificity)', () => {
  const [r] = x('6月30日までにエントリーシートをご提出ください。');
  assert.equal(r.hasTime, false);
  assert.equal(r.isDeadline, true);
  assert.equal(r.y, 2026);
});

test('deadline detection with time', () => {
  const [r] = x('ご希望日程を6/20(土)17:00までにご回答ください。');
  assert.equal(r.startsAt, jst('2026-06-20T17:00'));
  assert.equal(r.isDeadline, true);
});

test('まで as destination is not a deadline', () => {
  const [r] = x('6月24日（水）14:00 渋谷駅まで徒歩5分の会場です');
  assert.equal(r.isDeadline, false);
});

test('multiple candidate slots extract separately', () => {
  const rs = x(`下記よりご都合の良い日程をお選びください。
①6月20日（土）10:00〜11:00
②6月21日（日）14:00〜15:00
③6月24日（水）16:00〜17:00`);
  assert.equal(rs.length, 3);
  assert.equal(rs[0].startsAt, jst('2026-06-20T10:00'));
  assert.equal(rs[1].startsAt, jst('2026-06-21T14:00'));
  assert.equal(rs[2].startsAt, jst('2026-06-24T16:00'));
});

test('wrong weekday lowers confidence', () => {
  const right = x('6月24日（水）14:00')[0];
  const wrong = x('6月24日（金）14:00')[0];
  assert.ok(wrong.confidence < right.confidence - 0.3);
});

test('duration and invalid clock values are not times', () => {
  const [r] = x('6月24日（水）所要時間は2時間です。開始は14時間後ではなく14:00です。');
  assert.equal(r.startsAt, jst('2026-06-24T14:00'));
  assert.equal(x('面接は26時から')[0]?.hasTime ?? false, false);
});

test('bare short slash date without corroboration scores low', () => {
  const [r] = x('社員数は3/4が技術職です');
  assert.ok(!r || r.confidence < 0.45);
});

test('invalid calendar dates are rejected', () => {
  assert.equal(x('2月30日 14:00').length, 0);
  assert.equal(x('13月1日 14:00').length, 0);
});

test('no duplicate for full-date inner short match', () => {
  const rs = x('2026/6/24 14:00');
  assert.equal(rs.length, 1);
  assert.equal(rs[0].startsAt, jst('2026-06-24T14:00'));
});

test('formatters render JST japanese', () => {
  const t = jst('2026-06-24T14:00');
  assert.equal(fmtDateTime(t), '6/24（水） 14:00');
  assert.equal(fmtRelDay(jst('2026-06-12T10:00'), NOW), 'あす');
  assert.equal(fmtRelDay(jst('2026-06-11T23:00'), NOW), 'きょう');
  assert.match(fmtWhen(jst('2026-06-12T10:00'), NOW), /^あす 6\/12（金） 10:00$/);
});
