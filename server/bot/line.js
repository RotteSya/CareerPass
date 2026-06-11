import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../lib/log.js';

const log = logger('line');

/**
 * LINE channel — Messaging API. Push needs only the access token; the
 * inbound webhook needs a public URL (deploy first), wired in api.js.
 */
export function createLineChannel({ token, secret, onText }) {
  const api = (path, payload) =>
    fetch(`https://api.line.me/v2/bot/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
      return r.json().catch(() => ({}));
    });

  const render = (msg) => {
    let text = msg.text;
    const urls = (msg.buttons || []).filter((b) => b.url);
    if (urls.length) text += `\n\n${urls.map((b) => `▸ ${b.label}\n${b.url}`).join('\n')}`;
    return [{ type: 'text', text: text.slice(0, 4900) }];
  };

  return {
    name: 'line',
    requiresLink: true,

    async send(user, msg) {
      await api('message/push', { to: user.chat_id, messages: render(msg) });
    },

    verifySignature(rawBody, signature) {
      if (!secret || !signature) return false;
      const mac = createHmac('sha256', secret).update(rawBody).digest();
      const sig = Buffer.from(signature, 'base64');
      return mac.length === sig.length && timingSafeEqual(mac, sig);
    },

    /** Webhook events from api.js. Reply when possible, else push. */
    async handleEvents(events = []) {
      for (const ev of events) {
        try {
          const chatId = ev.source?.userId;
          if (!chatId) continue;
          if (ev.type === 'follow') {
            await api('message/reply', {
              replyToken: ev.replyToken,
              messages: [{ type: 'text', text: 'はじめまして。GooJob です。\nWebの登録画面に表示された6桁のコードを送ってください。' }],
            });
          } else if (ev.type === 'message' && ev.message?.type === 'text') {
            const reply = (msg) =>
              api('message/reply', { replyToken: ev.replyToken, messages: render(msg) });
            await onText(chatId, ev.message.text.trim(), reply);
          }
        } catch (err) {
          log.error('webhook event failed:', err.message);
        }
      }
    },
  };
}
