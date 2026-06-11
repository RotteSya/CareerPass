/**
 * Hyper-realistic recruiting mail fixtures, generated relative to `now`
 * so demo and tests always operate on future dates with correct weekdays.
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const JST = 9 * 3_600_000;

/** epoch ms for (today+days) at hh:mm JST */
export function at(now, days, hh, mm = 0) {
  const b = new Date(now + JST);
  return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + days, hh - 9, mm);
}

const jp = (ms) => {
  const t = new Date(ms + JST);
  return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日（${WEEKDAYS[t.getUTCDay()]}）`;
};
const hm = (ms) => {
  const t = new Date(ms + JST);
  return `${t.getUTCHours()}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
};

/** Canned research for demo mode — keeps briefs rich while fully offline. */
export const DEMO_RESEARCH = {
  株式会社ソラテック: {
    name: '株式会社ソラテック',
    domain: 'soratech.co.jp',
    wiki: {
      title: 'ソラテック',
      extract: '株式会社ソラテックは、東京都渋谷区に本社を置く気象データ解析企業。衛星データとAIを用いた予測サービス「ソラミル」を提供する。2015年設立、従業員約230名。',
      url: null,
    },
    news: [
      { title: 'ソラテック、衛星データ解析の新サービスを発表 - 日本経済新聞' },
      { title: 'ソラテック、シリーズCで45億円を調達' },
      { title: '気象データで物流を変える — ソラテックの挑戦' },
    ],
    site: { title: '株式会社ソラテック | 気象データで、未来の判断を。', description: '気象×AIで意思決定を支えるデータカンパニー' },
    brief: {
      overview: '気象×AIのデータ解析企業。設立2015年・約230名、渋谷本社。',
      business: '衛星・観測データをAIで解析し、物流や小売向けに需要予測・リスク予測SaaS「ソラミル」を提供。',
      recent: 'シリーズCで45億円調達、衛星データ解析の新サービスを発表するなど拡大期。',
      likely_questions: ['なぜ気象データに興味を持ったか', 'データを使って何かを判断・改善した経験', 'チームでの開発・分析経験'],
      reverse_questions: ['新サービスで一番難しかった技術課題は何ですか', '入社1年目のデータ職はどんな業務から始めますか'],
    },
    llmUsed: false,
    sources: ['https://www.soratech.co.jp/'],
  },
  株式会社みらいフーズ: {
    name: '株式会社みらいフーズ',
    domain: 'mirai-foods.co.jp',
    wiki: {
      title: 'みらいフーズ',
      extract: '株式会社みらいフーズは、東京都渋谷区に本社を置く食品メーカー。冷凍食品と植物性代替食品の開発・製造を行う。1987年設立、従業員約1,800名。',
      url: null,
    },
    news: [
      { title: 'みらいフーズ、植物性ミールの新ライン稼働 - 食品新聞' },
      { title: 'みらいフーズ、アジア3カ国へ輸出拡大' },
    ],
    site: { title: '株式会社みらいフーズ', description: 'たべるの未来を、まじめにつくる。' },
    brief: {
      overview: '冷凍食品と植物性食品の中堅メーカー。1987年設立・約1,800名。',
      business: '冷凍食品の製造販売に加え、植物性代替食品ブランド「みらいテーブル」を展開。海外輸出も拡大中。',
      recent: '植物性ミール新ライン稼働、アジア3カ国への輸出拡大など攻めの投資が続く。',
      likely_questions: ['食に関わる仕事を選ぶ理由', '商品を一つ選んで改善提案をしてください', '挑戦して失敗した経験'],
      reverse_questions: ['植物性食品事業で新卒が任される領域はどこですか', '商品企画と営業のキャリアはどう交わりますか'],
    },
    llmUsed: false,
    sources: ['https://www.mirai-foods.co.jp/'],
  },
  株式会社ノースリバー: {
    name: '株式会社ノースリバー',
    domain: 'northriver.jp',
    wiki: null,
    news: [{ title: 'ノースリバー、横浜に新オフィス開設' }],
    site: { title: '株式会社ノースリバー | 物流DXのパートナー', description: '物流業界のデジタル化を支援するITコンサルティング会社' },
    brief: {
      overview: '物流DXに特化したITコンサル。みなとみらい本社。',
      business: '物流企業向けに業務システム導入・データ分析・DX伴走支援を提供。',
      recent: '横浜・みなとみらいに新オフィスを開設し採用を拡大中。',
      likely_questions: ['コンサルタントに必要な素質は何だと思うか', '困難な調整をやり切った経験'],
      reverse_questions: ['新卒が最初に入るプロジェクトの規模感を教えてください', '物流の現場に出る機会はどのくらいありますか'],
    },
    llmUsed: false,
    sources: ['https://www.northriver.jp/'],
  },
  株式会社ホシノ精機: {
    name: '株式会社ホシノ精機',
    domain: 'hoshino-seiki.co.jp',
    wiki: {
      title: 'ホシノ精機',
      extract: '株式会社ホシノ精機は、長野県に本社を置く精密機器メーカー。医療機器・半導体製造装置向けの精密部品を製造する。1962年設立。',
      url: null,
    },
    news: [{ title: 'ホシノ精機、医療機器部品の新工場を着工' }],
    site: { title: '株式会社ホシノ精機', description: 'ミクロンの精度で、医療と産業を支える。' },
    brief: {
      overview: '医療・半導体向け精密部品の老舗メーカー。1962年設立、長野本社。',
      business: '医療機器や半導体製造装置に使われる精密部品の設計・製造。高精度加工が強み。',
      recent: '医療機器部品の新工場を着工、生産能力を増強中。',
      likely_questions: ['ものづくりに興味を持ったきっかけ', '地道な作業を続けた経験'],
      reverse_questions: ['若手技術者の育成はどのように行われていますか'],
    },
    llmUsed: false,
    sources: ['https://www.hoshino-seiki.co.jp/'],
  },
};

export function buildSamples(now = Date.now()) {
  const seminarAt = at(now, 13, 14);
  const seminarEnd = at(now, 13, 15, 30);
  const interviewAt = at(now, 20, 10);
  const interviewEnd = at(now, 20, 11);
  const slot1 = at(now, 25, 10);
  const slot2 = at(now, 26, 15);
  const slot3 = at(now, 28, 13);
  const answerBy = at(now, 8, 17);
  const esBy = at(now, 14, 23, 59);

  return [
    {
      key: 'seminar',
      label: '説明会の予約完了メール',
      expect: { startsAt: seminarAt, endsAt: seminarEnd },
      fromName: '株式会社ソラテック 新卒採用事務局',
      fromAddress: 'saiyo@soratech.co.jp',
      messageId: '<seminar-001@soratech.co.jp>',
      subject: '【ご予約完了】会社説明会のご案内（株式会社ソラテック）',
      text: `就活 太郎 様

このたびは、株式会社ソラテックの会社説明会にお申し込みいただき、
誠にありがとうございます。下記の内容でご予約が完了いたしました。

──────────────────────
■ 会社説明会（27卒対象）
日時：${jp(seminarAt)} ${hm(seminarAt)}〜${hm(seminarEnd)}
開催方法：オンライン（Zoom）
参加URL：https://zoom.us/j/98123456701?pwd=soratech
服装：自由
──────────────────────

当日は開始5分前までにご入室ください。
ご不明な点がございましたら、本メールにご返信ください。

━━━━━━━━━━━━━━━━━━━━━━
株式会社ソラテック 新卒採用事務局
〒150-0002 東京都渋谷区渋谷2-21-1
https://www.soratech.co.jp
━━━━━━━━━━━━━━━━━━━━━━`,
    },
    {
      key: 'interview',
      label: '一次面接の確定メール',
      expect: { startsAt: interviewAt, endsAt: interviewEnd },
      fromName: '株式会社みらいフーズ 人事部 新卒採用担当',
      fromAddress: 'recruit@mirai-foods.co.jp',
      messageId: '<interview-002@mirai-foods.co.jp>',
      subject: '【株式会社みらいフーズ】一次面接 日程確定のお知らせ',
      text: `就活 太郎 様

お世話になっております。株式会社みらいフーズ 人事部です。
このたびは一次面接の日程をご調整いただき、ありがとうございます。
下記のとおり確定いたしましたので、ご案内申し上げます。

──────────────────────
■ 一次面接
日時：${jp(interviewAt)} ${hm(interviewAt)}〜${hm(interviewEnd)}
会場：本社 7F 会議室
住所：東京都渋谷区神宮前1-2-3 みらいフーズビル
持ち物：履歴書、筆記用具
服装：スーツ着用
──────────────────────

ご到着されましたら、1F受付にて「新卒採用面接」の旨をお伝えください。
当日お会いできることを楽しみにしております。

━━━━━━━━━━━━━━━━━━━━━━
株式会社みらいフーズ 人事部
〒150-0001 東京都渋谷区神宮前1-2-3
https://www.mirai-foods.co.jp
━━━━━━━━━━━━━━━━━━━━━━`,
    },
    {
      key: 'candidates',
      label: '二次面接の日程候補メール',
      expect: { slots: [slot1, slot2, slot3], answerBy },
      fromName: '株式会社ノースリバー 採用チーム',
      fromAddress: 'hr@northriver.jp',
      messageId: '<candidates-003@northriver.jp>',
      subject: '【二次面接】日程のご調整のお願い（株式会社ノースリバー）',
      text: `就活 太郎 様

お世話になっております。株式会社ノースリバー 採用チームです。
一次面接の結果、ぜひ次の選考にお進みいただきたくご連絡いたしました。

つきましては、二次面接についてご都合のよい日程を
下記の候補よりお選びいただき、ご返信ください。

──────────────────────
① ${jp(slot1)} ${hm(slot1)}〜${hm(at(now, 25, 11))}
② ${jp(slot2)} ${hm(slot2)}〜${hm(at(now, 26, 16))}
③ ${jp(slot3)} ${hm(slot3)}〜${hm(at(now, 28, 14))}

ご回答期限：${jp(answerBy)} ${hm(answerBy)}までにお願いいたします。
──────────────────────

いずれの日程もご都合が合わない場合は、その旨ご相談ください。

━━━━━━━━━━━━━━━━━━━━━━
株式会社ノースリバー 採用チーム
〒220-0012 神奈川県横浜市西区みなとみらい2-3-5
https://www.northriver.jp
━━━━━━━━━━━━━━━━━━━━━━`,
    },
    {
      key: 'rejection',
      label: '選考結果（お祈り）メール',
      fromName: '株式会社アオバ商事 採用担当',
      fromAddress: 'jinji@aoba-shoji.co.jp',
      messageId: '<rejection-004@aoba-shoji.co.jp>',
      subject: '選考結果のお知らせ（株式会社アオバ商事）',
      text: `就活 太郎 様

このたびは、株式会社アオバ商事の採用選考にご応募いただき、
誠にありがとうございました。

慎重に選考を重ねました結果、誠に残念ながら、
今回はご期待に沿いかねる結果となりました。

末筆ながら、就活 太郎様の今後のご活躍を心よりお祈り申し上げます。

株式会社アオバ商事 人事部`,
    },
    {
      key: 'es_deadline',
      label: 'ES提出期限のリマインド（ナビ経由）',
      expect: { deadline: esBy },
      fromName: 'マイナビ2027',
      fromAddress: 'mynavi-member@mynavi.jp',
      messageId: '<es-005@mynavi.jp>',
      subject: '【マイナビ】株式会社ホシノ精機 エントリーシート提出期限が近づいています',
      text: `就活 太郎 さん

エントリー済みの企業から、提出期限のお知らせです。

──────────────────────
■ 株式会社ホシノ精機（精密機器メーカー）
エントリーシート提出
提出期限：${jp(esBy)} ${hm(esBy)}
提出はマイページから：https://job.mynavi.jp/27/pc/search/corp203984/mypage/
企業サイト：https://www.hoshino-seiki.co.jp
──────────────────────

期限を過ぎると提出できなくなります。お早めのご準備をおすすめします。

マイナビ2027 運営事務局`,
    },
    {
      key: 'noise',
      label: '就活と無関係のメール（無視されるべき）',
      fromName: 'サクラカード株式会社',
      fromAddress: 'info@sakura-card.example.co.jp',
      messageId: '<noise-006@sakura-card.example>',
      subject: '【サクラカード】6月のご利用明細が確定しました',
      text: `いつもサクラカードをご利用いただきありがとうございます。

6月のご利用明細が確定いたしました。
ご請求金額：12,480円
お支払い日：${jp(at(now, 16, 0))}

明細の確認はこちら：https://www.sakura-card.example.co.jp/meisai
`,
    },
  ];
}
