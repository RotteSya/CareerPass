import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { logger } from '../lib/log.js';

const log = logger('mail');

/**
 * IMAP watcher — one IDLE connection per linked inbox.
 * Read-only: fetches message source, never flags or moves anything.
 */
export function createWatcher({ db, box, pipeline }) {
  const conns = new Map(); // user.id → { client, stopped }

  async function handleMessage(user, source) {
    try {
      const parsed = await simpleParser(source);
      await pipeline.processMail(user, {
        subject: parsed.subject || '',
        text: parsed.text || '',
        fromAddress: parsed.from?.value?.[0]?.address || '',
        fromName: parsed.from?.value?.[0]?.name || '',
        messageId: parsed.messageId || null,
      });
    } catch (err) {
      log.error(`${user.email}: parse/process failed:`, err.message);
    }
  }

  async function connectLoop(user) {
    const state = { stopped: false, client: null };
    conns.set(user.id, state);
    let backoff = 5_000;

    while (!state.stopped) {
      try {
        const client = new ImapFlow({
          host: user.imap_host,
          port: user.imap_port || 993,
          secure: (user.imap_port || 993) === 993,
          auth: { user: user.imap_user, pass: box.open(user.imap_pass_enc) },
          logger: false,
        });
        state.client = client;
        await client.connect();
        const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
        log(`${user.email}: watching INBOX (${mailbox.exists} messages)`);
        backoff = 5_000;

        let known = mailbox.exists;
        client.on('exists', async (data) => {
          const from = known + 1;
          known = data.count;
          try {
            for await (const msg of client.fetch(`${from}:*`, { source: true })) {
              await handleMessage(user, msg.source);
            }
          } catch (err) {
            log.error(`${user.email}: fetch failed:`, err.message);
          }
        });

        // hold the connection; imapflow idles automatically
        await new Promise((resolve) => {
          client.on('close', resolve);
          client.on('error', resolve);
        });
        log(`${user.email}: connection closed`);
      } catch (err) {
        log.error(`${user.email}: imap error:`, err.message);
      }
      if (state.stopped) break;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 5 * 60_000);
    }
  }

  return {
    start() {
      const users = db.usersWithImap();
      for (const user of users) connectLoop(user);
      if (users.length) log(`watching ${users.length} inbox(es)`);
      else log('no inboxes linked yet');
    },

    /** (Re)start watching after a user saves IMAP settings. */
    refresh(userId) {
      const existing = conns.get(userId);
      if (existing) {
        existing.stopped = true;
        existing.client?.close();
        conns.delete(userId);
      }
      const user = db.userById(userId);
      if (user?.imap_host) connectLoop(user);
    },

    async stop() {
      for (const state of conns.values()) {
        state.stopped = true;
        try { await state.client?.logout(); } catch { /* closing anyway */ }
      }
      conns.clear();
    },
  };
}
