import { normalize } from './textnorm.js';

/**
 * Japanese date/time extraction.
 *
 * Handles, after normalization:
 *   2026年6月24日(水) 14:00〜15:30      6/24(水) 14時半より
 *   令和8年7月1日 10時00分              2026-06-24 14:00
 *   午後2時 / 午前10時 / 13時半          6月20日(土)17:00まで (deadline)
 *
 * All instants are JST (UTC+9, no DST): epoch = Date.UTC(y, m-1, d, hh-9, mm).
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const JST_MS = 9 * 3_600_000;

const jstEpoch = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm) - JST_MS;

const realDate = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

const weekdayOf = (y, m, d) => WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];

/** Current date parts in JST. */
export function jstParts(now) {
  const t = new Date(now + JST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// ── date patterns (on normalized text) ──────────────────────
const WD = '(?:\\(\\s*([日月火水木金土])(?:曜日?)?\\s*\\))?';
const DATE_PATTERNS = [
  // 2026年6月24日 / 6月24日(水) — year optional
  { re: new RegExp(`(?:(\\d{4})年\\s*)?(\\d{1,2})月\\s*(\\d{1,2})日\\s*${WD}`, 'g'),
    pick: (m) => ({ y: m[1] ? +m[1] : null, mo: +m[2], d: +m[3], wd: m[4] || null }), base: 0.7 },
  // 令和8年7月1日
  { re: new RegExp(`令和\\s*(元|\\d{1,2})年\\s*(\\d{1,2})月\\s*(\\d{1,2})日\\s*${WD}`, 'g'),
    pick: (m) => ({ y: 2018 + (m[1] === '元' ? 1 : +m[1]), mo: +m[2], d: +m[3], wd: m[4] || null }), base: 0.7 },
  // 2026/6/24, 2026-06-24, 2026.6.24
  { re: new RegExp(`(\\d{4})[/.-](\\d{1,2})[/.-](\\d{1,2})\\s*${WD}`, 'g'),
    pick: (m) => ({ y: +m[1], mo: +m[2], d: +m[3], wd: m[4] || null }), base: 0.7 },
  // 6/24(水) — short form; needs weekday or nearby time to be trusted
  { re: new RegExp(`(?<![\\d/.-])(\\d{1,2})/(\\d{1,2})\\s*${WD}`, 'g'),
    pick: (m) => ({ y: null, mo: +m[1], d: +m[2], wd: m[3] || null }), base: 0.4, weak: true },
];

// ── time patterns ───────────────────────────────────────────
const SEP = '[〜\\-ー]'; // range separators incl. katakana long bar used as dash
const T_COLON = '(\\d{1,2}):(\\d{2})';
const T_KANJI = '(\\d{1,2})時(?:\\s*(\\d{1,2})\\s*分|(半))?';
const AMPM = '(午前|午後|AM|PM|am|pm)?\\s*';
const TIME_RE = new RegExp(`${AMPM}(?:${T_COLON}|${T_KANJI})`, 'g');

function readTime(m) {
  const ampm = m[1] || null;
  let hh, mm;
  if (m[2] !== undefined && m[2] !== '' && m[2] != null) {
    hh = +m[2]; mm = +m[3];
  } else {
    hh = +m[4]; mm = m[6] ? 30 : m[5] ? +m[5] : 0;
  }
  if (/午後|pm/i.test(ampm || '') && hh < 12) hh += 12;
  if (/午前|am/i.test(ampm || '') && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

/** First valid time (or range) found in a window of text. */
function findTimes(window) {
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(window))) {
    const after = window[m.index + m[0].length];
    if (after === '間' || after === '点') continue; // 14時間/14時点 are not clock times
    const start = readTime(m);
    if (!start) continue;
    // range? look immediately after for separator + second time
    const rest = window.slice(m.index + m[0].length);
    const rangeM = new RegExp(`^\\s*${SEP}\\s*${AMPM}(?:${T_COLON}|${T_KANJI})`).exec(rest);
    let end = null;
    if (rangeM) {
      end = readTime(rangeM);
      // 「13時〜2時」 style pm rollover when the end lacks its own 午前/午後
      if (end && end.hh < start.hh && !rangeM[1] && end.hh + 12 < 24 && start.hh > 12) end.hh += 12;
    }
    return { start, end, index: m.index };
  }
  return null;
}

const DEADLINE_NEAR = /締切|締め切り|〆切|期限|期日|まで(?:に|と)?[^\S\n]*(?:$|[にはでお。、\n)])|までに/;

/**
 * Extract all date(+time) mentions.
 * @returns Array<{startsAt, endsAt, y,m,d, hasTime, confidence, isDeadline, raw, index}>
 */
export function extractDateTimes(text, { now = Date.now() } = {}) {
  const norm = normalize(text);
  const today = jstParts(now);
  const hits = [];

  for (const { re, pick, base, weak } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(norm))) {
      const p = pick(m);
      if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31) continue;
      hits.push({ ...p, index: m.index, len: m[0].length, base, weak: !!weak });
    }
  }
  // overlapping matches (the 6/24 pattern also fires inside 2026/6/24): keep longest per position
  hits.sort((a, b) => a.index - b.index || b.len - a.len);
  const dates = [];
  for (const h of hits) {
    const prev = dates[dates.length - 1];
    if (prev && h.index < prev.index + prev.len) continue;
    dates.push(h);
  }

  const out = [];
  for (let i = 0; i < dates.length; i++) {
    const h = dates[i];
    let { y, mo, d } = h;
    let confidence = h.base;
    let yearInferred = false;

    if (y == null) {
      // nearest future: this year, unless that already passed (3-day grace)
      y = today.y;
      const candidate = jstEpoch(y, mo, d, 23, 59);
      if (candidate < now - 3 * 86_400_000) { y += 1; }
      yearInferred = true;
    }
    if (!realDate(y, mo, d)) continue;

    if (h.wd) {
      if (weekdayOf(y, mo, d) === h.wd) confidence += 0.2;
      else if (yearInferred && weekdayOf(y + 1, mo, d) === h.wd) { y += 1; confidence += 0.1; }
      else confidence -= 0.3;
    }

    // time window: up to the next date mention or 80 chars
    const next = dates[i + 1];
    const winEnd = Math.min(next ? next.index : norm.length, h.index + h.len + 80);
    const window = norm.slice(h.index + h.len, winEnd);
    const times = findTimes(window);

    let startsAt, endsAt = null, hasTime = false;
    if (times) {
      hasTime = true;
      confidence += 0.15;
      startsAt = jstEpoch(y, mo, d, times.start.hh, times.start.mm);
      if (times.end) endsAt = jstEpoch(y, mo, d, times.end.hh, times.end.mm);
    } else {
      startsAt = jstEpoch(y, mo, d, 9, 0); // date-only: assume morning for sorting
      if (h.weak) confidence -= 0.15;      // bare 6/24 with no weekday & no time: likely noise
    }

    // Deadline words live on the same line: before (提出期限：…) or after
    // (…までに) the date. Never let context bleed across newlines, or a
    // neighbouring 「ご回答期限」 line would mark ordinary slots as deadlines.
    const back = norm.slice(Math.max(0, h.index - 12), h.index);
    const backCtx = back.slice(back.lastIndexOf('\n') + 1);
    const fwdRaw = norm.slice(h.index, Math.min(norm.length, winEnd + 14));
    const searchFrom = h.len + (times ? times.index : 0);
    const nl = fwdRaw.indexOf('\n', searchFrom);
    const ctx = backCtx + fwdRaw.slice(0, nl === -1 ? fwdRaw.length : nl);
    out.push({
      y, m: mo, d, startsAt, endsAt, hasTime,
      weekday: weekdayOf(y, mo, d),
      confidence: Math.max(0, Math.min(1, confidence)),
      isDeadline: DEADLINE_NEAR.test(ctx),
      yearInferred,
      index: h.index,
      raw: norm.slice(h.index, winEnd).split('\n')[0].trim(),
    });
  }

  // dedupe identical instants, keep highest confidence
  const seen = new Map();
  for (const r of out) {
    const k = `${r.startsAt}`;
    if (!seen.has(k) || seen.get(k).confidence < r.confidence) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => a.index - b.index);
}
