import { normalize, squash } from '../jp/textnorm.js';
import { extractDateTimes } from '../jp/datetime.js';
import { classifyIntent, detectType, INTENT, PLATFORM_DOMAINS } from './classify.js';

const CO = '(?:株式会社|有限会社|合同会社|合資会社)';
const NAME_CH = '[ぁ-んァ-ヶー一-龠々〇0-9A-Za-z&・]';
const COMPANY_RE = new RegExp(`${CO}\\s?(${NAME_CH}{2,20})|(${NAME_CH}{2,20})\\s?${CO}`, 'g');

const PLATFORM_NAMES = /マイナビ|リクナビ|リクルート|キャリタス|ワンキャリア|オファーボックス|ウォンテッドリー|学情|あさがく/;

const URL_RE = /https?:\/\/[^\s<>"'」』）)\]】]+/g;
const MEETING_HOST = /zoom\.us|meet\.google\.com|teams\.microsoft|teams\.live|webex\.com/i;
const NOISE_HOST = /unsubscribe|mailmag|twitter\.com|x\.com|facebook|instagram|youtube|line\.me/i;

/** Normalize a company mention to official style: 株式会社◯◯ / ◯◯株式会社 */
function readCompanyMatches(text) {
  const found = [];
  COMPANY_RE.lastIndex = 0;
  let m;
  while ((m = COMPANY_RE.exec(text))) {
    const inner = m[1] || m[2];
    if (!inner || PLATFORM_NAMES.test(inner)) continue;
    found.push({ name: m[0].replace(/\s/g, ''), inner, index: m.index });
  }
  return found;
}

/** Strip recruiter-role suffixes from a From: display name. */
function cleanFromName(name = '') {
  return normalize(name)
    .replace(/[【\[][^】\]]*[】\]]/g, ' ')
    .replace(/(新卒)?採用(担当|チーム|事務局|係|グループ)?|人事部?|広報|運営事務局|総務部?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Company identification, in order of trust:
 *  1. From: display name (株式会社◯◯ 採用担当)
 *  2. Subject 【株式会社◯◯】…
 *  3. Signature block (last lines), then whole body by frequency
 * Platform mails (マイナビ等) skip straight to subject/body.
 */
export function extractCompany({ fromName = '', fromAddress = '', subject = '', text = '' }) {
  const domain = (fromAddress.split('@')[1] || '').toLowerCase();
  const viaPlatform = PLATFORM_DOMAINS.test(fromAddress);
  const subjectN = normalize(subject);
  const textN = normalize(text);

  const pick = (name) => ({ name, domain: viaPlatform ? siteDomain(textN) : domain || null, viaPlatform });

  if (!viaPlatform) {
    const inFrom = readCompanyMatches(normalize(fromName));
    if (inFrom.length) return pick(inFrom[0].name);
  }
  const inSubject = readCompanyMatches(subjectN);
  if (inSubject.length) return pick(inSubject[0].name);

  const lines = textN.split('\n');
  const signature = lines.slice(-12).join('\n');
  const inSig = readCompanyMatches(signature);
  if (inSig.length) return pick(inSig[inSig.length - 1].name);

  const inBody = readCompanyMatches(textN);
  if (inBody.length) {
    const freq = new Map();
    for (const c of inBody) freq.set(c.name, (freq.get(c.name) || 0) + 1);
    const best = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return pick(best);
  }

  // fallback: cleaned display name (e.g. "ソラテック採用チーム" → "ソラテック")
  const cleaned = cleanFromName(fromName);
  if (cleaned.length >= 2 && cleaned.length <= 24) return { ...pick(cleaned), weak: true };
  return null;
}

/** Company website domain mentioned in body (for research), platform mails. */
function siteDomain(textN) {
  for (const url of textN.match(URL_RE) || []) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (PLATFORM_DOMAINS.test(host) || MEETING_HOST.test(host) || NOISE_HOST.test(host)) continue;
      if (/\.(co|or|ne|ac)\.jp$|\.jp$|\.com$|\.io$/.test(host)) return host;
    } catch { /* malformed url in mail body */ }
  }
  return null;
}

export function extractLocation(textN) {
  const online = /オンライン|web開催|ウェブ開催|リモート開催|オンデマンド/i.test(textN) || MEETING_HOST.test(textN);
  const m = textN.match(/^[ \t>*・]{0,4}[【\[]?(?:会場|場所|開催場所|開催方法|実施方法|住所|所在地)[】\]]?[:：]?\s*(.+)$/m);
  let detail = m ? squash(m[1]).slice(0, 80) : null;
  if (online) {
    const tool = (textN.match(/Zoom|Google Meet|Teams|Webex/i) || [])[0];
    if (detail && /オンライン|web|リモート/i.test(detail)) detail = null;
    return { online: true, text: `オンライン${tool ? `（${tool}）` : ''}${detail ? ` ${detail}` : ''}` };
  }
  return detail ? { online: false, text: detail } : null;
}

export function extractUrl(textN) {
  const urls = textN.match(URL_RE) || [];
  return (
    urls.find((u) => MEETING_HOST.test(u)) ||
    urls.find((u) => /予約|reserve|entry|form|schedule|mypage/i.test(u) && !NOISE_HOST.test(u)) ||
    null
  );
}

const lineValue = (textN, re) => {
  const m = textN.match(re);
  return m ? squash(m[1]).slice(0, 60) : null;
};

/**
 * The single entry point: raw mail → structured understanding.
 * @param mail {subject, text, fromAddress, fromName, messageId}
 */
export function understand(mail, { now = Date.now() } = {}) {
  const textN = normalize(mail.text || '');
  const subjectN = normalize(mail.subject || '');
  const hay = `${subjectN}\n${textN}`;

  const dates = extractDateTimes(hay, { now });
  const { intent, score } = classifyIntent(
    { subject: subjectN, text: textN, fromAddress: mail.fromAddress || '' }, dates, now,
  );
  if (intent === INTENT.IGNORE) return { intent, score };

  const { type, label } = detectType(hay);
  const company = extractCompany({ ...mail, subject: subjectN, text: textN });

  const future = dates.filter((d) => d.startsAt > now && d.confidence >= 0.45);
  const timed = future.filter((d) => d.hasTime && !d.isDeadline);
  const deadline = future.find((d) => d.isDeadline) || null;

  let chosen = null;
  let candidates = [];
  if (intent === INTENT.INVITE || intent === INTENT.RESCHEDULE) {
    chosen = timed.sort((a, b) => b.confidence - a.confidence)[0] || future[0] || null;
  } else if (intent === INTENT.CANDIDATES) {
    candidates = timed;
  } else if (intent === INTENT.DEADLINE) {
    chosen = deadline || future[0] || null;
  }

  return {
    intent, score, type, label, company,
    chosen, candidates, deadline,
    location: extractLocation(textN),
    address: lineValue(textN, /^[ \t>*・]{0,4}[【\[]?(?:住所|所在地|会場住所)[】\]]?[:：]?\s*(.+)$/m),
    url: extractUrl(textN),
    items: lineValue(textN, /^[ \t>*・]{0,4}[【\[]?(?:持ち物|ご持参いただくもの|お持ち物)[】\]]?[:：]?\s*(.+)$/m),
    dress: lineValue(textN, /^[ \t>*・]{0,4}[【\[]?(?:服装|ドレスコード)[】\]]?[:：]?\s*(.+)$/m),
    excerpt: squash(textN).slice(0, 240),
  };
}
