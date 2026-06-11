import { logger } from '../lib/log.js';

const log = logger('telegram');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Telegram channel — raw Bot API over fetch, long polling.
 * Works on a laptop with zero public exposure; just a token.
 */
export function createTelegramChannel({ token, onText, onCallback }) {
  const api = (method, payload) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(65_000),
    }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!body.ok) throw new Error(`${method}: ${body.description || r.status}`);
      return body.result;
    });

  let running = false;
  let offset = 0;

  async function poll() {
    running = true;
    log('long polling started');
    while (running) {
      try {
        const updates = await api('getUpdates', {
          timeout: 50,
          offset,
          allowed_updates: ['message', 'callback_query'],
        });
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            if (u.message?.text) {
              await onText(String(u.message.chat.id), u.message.text.trim());
            } else if (u.callback_query) {
              await api('answerCallbackQuery', { callback_query_id: u.callback_query.id });
              await onCallback(String(u.callback_query.message.chat.id), u.callback_query.data || '');
            }
          } catch (err) {
            log.error('update handling failed:', err.message);
          }
        }
      } catch (err) {
        if (!running) break;
        log.error('poll error, retrying in 5s:', err.message);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  return {
    name: 'telegram',
    requiresLink: true,

    async send(user, msg) {
      const reply_markup = msg.buttons?.length
        ? {
            inline_keyboard: msg.buttons.map((b) =>
              [b.url ? { text: b.label, url: b.url } : { text: b.label, callback_data: b.data }],
            ),
          }
        : undefined;
      await api('sendMessage', {
        chat_id: user.chat_id,
        text: esc(msg.text),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup,
      });
    },

    async start() {
      const me = await api('getMe', {});
      log(`connected as @${me.username}`);
      poll();
      return me.username;
    },

    stop() {
      running = false;
    },
  };
}
