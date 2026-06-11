import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/log.js';

const log = logger('llm');
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

/**
 * Optional Claude layer. Without an API key every call site falls back to
 * the rule-based path — `enabled()` guards all usage.
 */
export function createLLM({ apiKey } = {}) {
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const BRIEF_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      overview: { type: 'string', description: '会社の一行紹介（〜60字）' },
      business: { type: 'string', description: '事業内容の要約（〜100字）' },
      recent: { type: 'string', description: '直近の動き・ニュースの要約（〜100字、なければ空文字）' },
      likely_questions: {
        type: 'array', items: { type: 'string' },
        description: 'この会社の面接で聞かれそうな質問 2〜3個',
      },
      reverse_questions: {
        type: 'array', items: { type: 'string' },
        description: '学生からの逆質問の例 2個（この会社の文脈に合わせる）',
      },
    },
    required: ['overview', 'business', 'recent', 'likely_questions', 'reverse_questions'],
  };

  const REFINE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      company_name: { type: 'string', description: '正式な会社名（株式会社含む）。不明なら空文字' },
      intent: {
        type: 'string',
        enum: ['invite_confirmed', 'candidates', 'reschedule', 'rejection',
          'deadline', 'application_ack', 'recruit_other', 'ignore'],
      },
      event_label: { type: 'string', description: '予定の名称（例: 一次面接）。不明なら空文字' },
      location: { type: 'string', description: '会場（オンラインなら「オンライン（ツール名）」）。不明なら空文字' },
    },
    required: ['company_name', 'intent', 'event_label', 'location'],
  };

  async function structured(prompt, schema, maxTokens = 1500) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find((b) => b.type === 'text')?.text;
    return text ? JSON.parse(text) : null;
  }

  return {
    enabled: () => !!client,

    /** Distill gathered materials into a Japanese pre-interview brief. */
    async writeBrief(companyName, { wiki, news, site }) {
      const material = [
        wiki ? `Wikipedia: ${wiki.extract}` : null,
        site?.description ? `公式サイト: ${site.title || ''} — ${site.description}` : null,
        news?.length ? `最近のニュース見出し:\n${news.map((n) => `- ${n.title}`).join('\n')}` : null,
      ].filter(Boolean).join('\n\n');
      if (!material) return null;

      const prompt = `あなたは就活生の面接準備を手伝うリサーチャーです。以下の資料から「${companyName}」の30秒ブリーフを作成してください。事実は資料の範囲内で、推測する場合は控えめに。文体は簡潔・中立。

${material}`;
      const brief = await structured(prompt, BRIEF_SCHEMA, 1200);
      log(`brief written for ${companyName}`);
      return brief;
    },

    /** Second opinion on a mail the rules were unsure about. */
    async refineMail({ subject, text }) {
      const prompt = `以下は日本の就活生が受信したメールです。内容を読み、JSON で要約してください。就活と無関係なら intent は "ignore"。

件名: ${subject}

本文:
${String(text).slice(0, 4000)}`;
      return structured(prompt, REFINE_SCHEMA, 600);
    },
  };
}
