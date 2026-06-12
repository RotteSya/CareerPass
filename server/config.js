import { randomBytes } from 'node:crypto';

/** Parse environment into a frozen config object. */
export function loadConfig(env = process.env) {
  const demo = env.DEMO === '1' || env.DEMO === 'true';
  let appSecret = env.APP_SECRET || '';
  let ephemeralSecret = false;
  if (!appSecret) {
    // Without a stable secret, IMAP credentials saved now won't decrypt
    // after a restart. Fine for demo / first run; warned at boot.
    appSecret = randomBytes(32).toString('hex');
    ephemeralSecret = true;
  }
  return Object.freeze({
    port: Number(env.PORT || 3000),
    appSecret,
    ephemeralSecret,
    telegramToken: env.TELEGRAM_BOT_TOKEN || '',
    lineToken: env.LINE_CHANNEL_ACCESS_TOKEN || '',
    lineSecret: env.LINE_CHANNEL_SECRET || '',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    demo,
    dbPath: env.DB_PATH || (demo ? 'data/goojob-demo.db' : 'data/goojob.db'),
    // Reminder lead times before an event. Demo compresses them to seconds
    // so the whole arc is visible in one sitting.
    reminderOffsets: demo
      ? [
          { kind: 'day_before', ms: 14_000 },
          { kind: 'soon', ms: 30_000 },
        ]
      : [
          { kind: 'day_before', ms: 24 * 3_600_000 },
          { kind: 'soon', ms: 60 * 60_000 },
        ],
  });
}
