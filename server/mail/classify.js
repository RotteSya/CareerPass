/**
 * Intent classification for recruiting email — rule-based, score-driven.
 * An optional LLM pass (research/llm.js) can refine these results;
 * everything here works with zero external calls.
 */

export const INTENT = {
  INVITE: 'invite_confirmed', // 確定した説明会・面接などの案内
  CANDIDATES: 'candidates', //   日程候補の打診（学生の返信が必要）
  RESCHEDULE: 'reschedule', //   日程変更
  REJECTION: 'rejection', //     お祈りメール
  DEADLINE: 'deadline', //       提出・回答の締切
  ACK: 'application_ack', //     応募・エントリー受付
  RECRUIT_OTHER: 'recruit_other',
  IGNORE: 'ignore',
};

const RECRUIT_WORDS = [
  [/説明会|会社説明/g, 3], [/面接/g, 3], [/面談/g, 2], [/選考/g, 2],
  [/採用/g, 2], [/内定/g, 3], [/エントリーシート|ES提出/g, 2], [/エントリー|応募/g, 2],
  [/適性検査|webテスト|SPI|筆記試験/gi, 2], [/インターン/g, 2], [/就活|就職活動/g, 1],
  [/履歴書|職務経歴/g, 1], [/新卒/g, 1],
];

const SENDER_HINTS = /saiyo|recruit|jinji|shinsotsu|career|entry|hr@|jobs?@/i;
export const PLATFORM_DOMAINS =
  /mynavi\.jp|rikunabi\.com|recruit\.co\.jp|offerbox\.jp|wantedly\.com|onecareer\.jp|career-tasu|gakujo\.ne\.jp|type\.jp/i;

const RE = {
  rejection: /残念ながら|お祈り申し上げ|ご縁がなかった|不合格|お見送り|今回は見送|ご期待に沿えない/,
  reschedule: /日程(?:の)?変更|変更させていただき|延期|別日程/,
  candidatesAsk: /候補|ご希望(?:の|に)|お選び|ご都合|ご選択|日程調整|予約フォーム|ご予約ください/,
  confirmed: /確定|決定(?:いた)?し|完了|受け付けました|受付いたしました|お待ちしております/,
  deadlineCtx: /提出|締切|締め切り|〆切|期限|ご回答|回答期日/,
  ack: /エントリーありがとう|ご応募ありがとう|応募を受け付け|エントリーを受け付け|プレエントリー/,
  eventCtx: /説明会|面接|面談|セミナー|選考会|インターン|座談会|説明選考会/,
};

/** Recruiting-relatedness score; below 3 the mail is ignored. */
export function recruitScore({ subject = '', text = '', fromAddress = '' }) {
  const hay = `${subject}\n${text}`;
  let score = 0;
  for (const [re, w] of RECRUIT_WORDS) {
    const n = (hay.match(re) || []).length;
    if (n > 0) score += w + Math.min(n - 1, 2) * 0.5;
  }
  if (SENDER_HINTS.test(fromAddress)) score += 2;
  if (PLATFORM_DOMAINS.test(fromAddress)) score += 2;
  return score;
}

/**
 * @param mail   {subject, text, fromAddress}
 * @param dates  output of extractDateTimes()
 * @param now    epoch ms
 */
export function classifyIntent(mail, dates, now = Date.now()) {
  const hay = `${mail.subject || ''}\n${mail.text || ''}`;
  const score = recruitScore(mail);
  if (score < 3) return { intent: INTENT.IGNORE, score };

  const future = dates.filter((d) => d.startsAt > now && d.confidence >= 0.45);
  const timed = future.filter((d) => d.hasTime && !d.isDeadline);

  if (RE.rejection.test(hay)) return { intent: INTENT.REJECTION, score };
  if (RE.reschedule.test(hay) && timed.length >= 1)
    return { intent: INTENT.RESCHEDULE, score };
  if (timed.length >= 2 && RE.candidatesAsk.test(hay) && !RE.confirmed.test(hay))
    return { intent: INTENT.CANDIDATES, score };
  if (timed.length >= 1 && RE.eventCtx.test(hay))
    return { intent: INTENT.INVITE, score };
  if (future.some((d) => d.isDeadline) && RE.deadlineCtx.test(hay))
    return { intent: INTENT.DEADLINE, score };
  if (RE.ack.test(hay)) return { intent: INTENT.ACK, score };
  return { intent: INTENT.RECRUIT_OTHER, score };
}

/** Event type with stage label, e.g. { type: '面接', label: '一次面接' } */
export function detectType(hay) {
  const stage = (hay.match(/(一次|二次|三次|最終|1次|2次|3次)\s*(?:選考)?\s*面接/) || [])[1];
  if (/面接/.test(hay)) return { type: '面接', label: stage ? `${stage.replace(/1次/, '一次').replace(/2次/, '二次').replace(/3次/, '三次')}面接` : '面接' };
  if (/カジュアル面談|面談/.test(hay)) return { type: '面談', label: 'カジュアル面談' };
  if (/説明選考会/.test(hay)) return { type: '説明会', label: '説明選考会' };
  if (/説明会|会社説明/.test(hay)) return { type: '説明会', label: '会社説明会' };
  if (/インターン/.test(hay)) return { type: 'インターン', label: 'インターンシップ' };
  if (/適性検査|webテスト|筆記試験/i.test(hay)) return { type: '選考', label: '適性検査' };
  if (/座談会/.test(hay)) return { type: '説明会', label: '座談会' };
  if (/選考会|選考/.test(hay)) return { type: '選考', label: '選考' };
  return { type: 'その他', label: '予定' };
}
