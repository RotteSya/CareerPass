import { fmtDate, fmtTime, fmtDateTime, fmtWhen, fmtRelDay } from '../jp/format.js';

/**
 * Every word the bot says lives here — the brand voice in one file.
 * Voice: 静かで、簡潔で、頼れる。決して騒がない。
 * Messages are { text, buttons?: [{label, url} | {label, data}] }.
 */

const SIGN = '準備は、できています。';

const mapsUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const eventLine = (ev, companyName) =>
  `${companyName ? `${companyName} ` : ''}${ev.title}`;

const placeLine = (ev) =>
  ev.location
    ? `場所：${ev.location}${ev.address && ev.address !== ev.location ? `（${ev.address}）` : ''}`
    : null;

/** ── briefs ─────────────────────────────────────────────── */

export function renderBrief(research) {
  if (!research) return null;
  const L = [`▼ 30秒ブリーフ — ${research.name}`];
  if (research.brief) {
    const b = research.brief;
    L.push(`◎ ${b.overview}`);
    if (b.business) L.push(`・事業：${b.business}`);
    if (b.recent) L.push(`・直近の動き：${b.recent}`);
    if (b.likely_questions?.length) {
      L.push('', '▼ 聞かれそうなこと');
      b.likely_questions.slice(0, 3).forEach((q) => L.push(`・${q}`));
    }
    if (b.reverse_questions?.length) {
      L.push('', '▼ 逆質問のたね');
      b.reverse_questions.slice(0, 2).forEach((q) => L.push(`・${q}`));
    }
  } else {
    if (research.wiki?.extract) L.push(`・概要：${research.wiki.extract.slice(0, 140)}`);
    if (research.site?.description) L.push(`・公式より：${research.site.description.slice(0, 100)}`);
    if (research.news?.length) {
      L.push('・直近の動き：');
      research.news.slice(0, 3).forEach((n) => L.push(`　・${n.title}`));
    }
    if (L.length === 1) L.push('・公開情報が見つかりませんでした。企業サイトをご確認ください。');
  }
  return L.join('\n');
}

const CHECKLIST = {
  面接_onsite: ['会場までの経路と所要時間を確認', '10分前に到着できる出発時刻を決める', '志望動機をひとことで言えるように'],
  面接_online: ['開始5分前に接続テスト（カメラ・マイク）', '静かな場所と安定した回線を確保', '志望動機をひとことで言えるように'],
  説明会_onsite: ['筆記用具とメモを用意', '逆質問をひとつ準備しておく'],
  説明会_online: ['開始5分前に入室できるよう準備', '逆質問をひとつ準備しておく'],
  面談: ['聞きたいことを3つメモしておく', '肩の力を抜いて、会話を楽しむ準備を'],
};

function checklist(ev, online) {
  const key = `${ev.type}_${online ? 'online' : 'onsite'}`;
  return CHECKLIST[key] || CHECKLIST[ev.type] || ['内容をメールで確認しておく'];
}

/** ── pipeline notifications ─────────────────────────────── */

export function eventDetected(ev, companyName, { now = Date.now() } = {}) {
  const L = [
    '📌 予定を見つけました',
    '',
    eventLine(ev, companyName),
    `${fmtDate(ev.starts_at)} ${fmtTime(ev.starts_at)}${ev.ends_at ? `〜${fmtTime(ev.ends_at)}` : ''}`,
  ];
  const place = placeLine(ev);
  if (place) L.push(place);
  L.push('', 'メールから自動で読み取りました。', '前日と直前に、こちらからお知らせします。');
  const buttons = [];
  if (ev.url) buttons.push({ label: '詳細リンク', url: ev.url });
  return { text: L.join('\n'), buttons };
}

export function candidatesDetected(companyName, label, slots, deadline, url) {
  const marks = ['①', '②', '③', '④', '⑤'];
  const L = [
    `🗓 日程の選択が必要です — ${companyName} ${label}`,
    '',
    ...slots.slice(0, 5).map((s, i) => `${marks[i]} ${fmtDate(s.startsAt)} ${fmtTime(s.startsAt)}〜`),
  ];
  if (deadline) L.push('', `回答期限：${fmtDateTime(deadline.startsAt)}`);
  L.push('', '早い回答ほど、希望の枠が取りやすくなります。');
  const buttons = url ? [{ label: '回答ページを開く', url }] : [];
  return { text: L.join('\n'), buttons };
}

export function deadlineDetected(companyName, what, deadlineMs, url, { now = Date.now() } = {}) {
  const L = [
    `⏳ 締切があります — ${companyName}`,
    '',
    `${what}`,
    `期限：${fmtDate(deadlineMs)} ${fmtTime(deadlineMs)}（${fmtRelDay(deadlineMs, now)}）`,
  ];
  const buttons = url ? [{ label: '提出ページを開く', url }] : [];
  return { text: L.join('\n'), buttons };
}

export function rejectionNotice(companyName) {
  return {
    text: [
      `📮 ${companyName} から選考結果のお知らせが届きました。`,
      '',
      '内容はメールでご確認ください。',
      'どんな結果でも、ここまでの準備は次に活きます。',
    ].join('\n'),
  };
}

export function ackNotice(companyName) {
  return {
    text: `✉️ ${companyName} への応募を受け付けたという連絡が届きました。\n動きがあれば、こちらでお知らせします。`,
  };
}

export function reschedule(ev, companyName) {
  return {
    text: [
      `🔁 日程が変更されました — ${eventLine(ev, companyName)}`,
      '',
      `新しい日時：${fmtDate(ev.starts_at)} ${fmtTime(ev.starts_at)}`,
      ev.location ? `場所：${ev.location}` : null,
      '',
      'リマインドも新しい日時に合わせ直しました。',
    ].filter((x) => x !== null).join('\n'),
  };
}

/** ── reminders (the heart of the product) ───────────────── */

export function reminder(kind, ev, companyName, research, { now = Date.now() } = {}) {
  const online = /オンライン|Zoom|Meet|Teams|Webex/i.test(ev.location || '');
  const head = kind === 'day_before'
    ? `🔔 ${fmtWhen(ev.starts_at, now)}`
    : `⏰ まもなく ${fmtTime(ev.starts_at)}`;

  const L = [
    `${head} — ${eventLine(ev, companyName)}`,
  ];
  const place = placeLine(ev);
  if (place) L.push(place);
  if (ev.items) L.push(`持ち物：${ev.items}`);
  if (ev.dress) L.push(`服装：${ev.dress}`);

  const brief = renderBrief(research);
  if (brief && kind === 'day_before') L.push('', brief);

  L.push('', '▼ いまできる準備');
  checklist(ev, online).forEach((c) => L.push(`・${c}`));
  L.push('', SIGN);

  const buttons = [];
  if (ev.url) buttons.push({ label: online ? '参加リンクを開く' : '詳細を開く', url: ev.url });
  if (!online && (ev.address || ev.location)) {
    buttons.push({ label: '地図を開く', url: mapsUrl(ev.address || ev.location) });
  }
  return { text: L.join('\n'), buttons };
}

/** ── linking & commands ─────────────────────────────────── */

export function welcome(user) {
  return {
    text: [
      'はじめまして。GooJob です。',
      '',
      'これからは、就活の大事なお知らせをここでお伝えします。',
      'メールを連携すると、説明会や面接の予定を自動で見つけて、',
      'ちょうどいいタイミングでお知らせします。',
      '',
      'つかえるコマンド：',
      '/today — きょうの予定',
      '/week — 今週の予定',
      '/companies — 企業リスト',
      '/brief 会社名 — 企業ブリーフ',
      '/connect — メール連携の状態',
      '/settings — リマインド設定',
      '',
      SIGN,
    ].join('\n'),
  };
}

export const linkFailed = () => ({
  text: 'コードが見つかりませんでした。\nWebの登録画面に表示された6桁のコードを送ってください（例：K7M2QX）。',
});

export const alreadyLinked = () => ({
  text: 'このアカウントはすでに連携済みです。/today で予定を確認できます。',
});

export function todayList(events, companyOf, now = Date.now()) {
  if (!events.length) {
    return { text: 'きょうは、なにもありません。\nゆっくりどうぞ。' };
  }
  const L = ['きょうの予定', ''];
  events.forEach((ev) => {
    L.push(`・${fmtTime(ev.starts_at)} ${eventLine(ev, companyOf(ev))}`);
    if (ev.location) L.push(`　${ev.location}`);
  });
  L.push('', SIGN);
  return { text: L.join('\n') };
}

export function weekList(events, companyOf, now = Date.now()) {
  if (!events.length) {
    return { text: '今週の予定はありません。\nメールが届けば、自動で見つけます。' };
  }
  const L = ['今週の予定', ''];
  let lastDay = '';
  events.forEach((ev) => {
    const day = fmtDate(ev.starts_at);
    if (day !== lastDay) {
      L.push(`${day === fmtDate(now) ? `きょう ${day}` : day}`);
      lastDay = day;
    }
    L.push(`　${fmtTime(ev.starts_at)} ${eventLine(ev, companyOf(ev))}`);
  });
  return { text: L.join('\n') };
}

export function companiesList(companies) {
  if (!companies.length) {
    return { text: 'まだ企業がありません。\n応募や予約のメールが届くと、自動でここに並びます。' };
  }
  const L = ['いま追いかけている企業', ''];
  companies.forEach((c) => L.push(`・${c.name}${c.researched_at ? '（ブリーフあり）' : ''}`));
  L.push('', '/brief 会社名 で詳しく見られます。');
  return { text: L.join('\n') };
}

export function briefNotFound(name) {
  return { text: `「${name}」は見つかりませんでした。\n/companies で企業リストを確認できます。` };
}

export function connectStatus(user, demo) {
  if (demo) {
    return { text: 'いまはデモモードです。\nWebの /demo ページからサンプルメールを送って、流れを体験できます。' };
  }
  if (user.imap_host) {
    return { text: `メール連携：設定済み（${user.imap_user}）\n新しいメールを自動で見ています。` };
  }
  return {
    text: [
      'メール連携：未設定',
      '',
      'Webの登録ページ下部「メール連携」から設定できます。',
      'Gmailの場合は2段階認証を有効にして、アプリパスワードを発行してください。',
      '読み取りは受信トレイのみ・着信の確認だけに使います。',
    ].join('\n'),
  };
}

export function settingsView(settings) {
  const r = settings.reminders || { day_before: true, soon: true };
  const onoff = (b) => (b ? 'オン' : 'オフ');
  return {
    text: [
      'リマインド設定',
      '',
      `・前日のお知らせ：${onoff(r.day_before)}`,
      `・直前のお知らせ：${onoff(r.soon)}`,
    ].join('\n'),
    buttons: [
      { label: `前日 → ${onoff(!r.day_before)}にする`, data: 'toggle:day_before' },
      { label: `直前 → ${onoff(!r.soon)}にする`, data: 'toggle:soon' },
    ],
  };
}

export const help = () => ({
  text: [
    'GooJob — しずかな、就活。',
    '',
    'メールを見て、予定を見つけて、企業を調べて、',
    'ちょうどいいときに、ここでお知らせします。',
    '',
    '/today — きょうの予定',
    '/week — 今週の予定',
    '/companies — 企業リスト',
    '/brief 会社名 — 企業ブリーフ',
    '/connect — メール連携の状態',
    '/settings — リマインド設定',
  ].join('\n'),
});

export const unknown = () => ({
  text: 'すみません、わかりませんでした。/help で一覧を見られます。',
});
