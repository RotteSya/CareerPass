import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createBox } from './lib/crypto.js';
import { realClock } from './lib/clock.js';
import { createApp } from './lib/http.js';
import { logger } from './lib/log.js';
import { createLLM } from './research/llm.js';
import { createResearch } from './research/research.js';
import { createChannels } from './bot/channel.js';
import { createConsoleChannel } from './bot/console.js';
import { createTelegramChannel } from './bot/telegram.js';
import { createLineChannel } from './bot/line.js';
import { createCommands } from './bot/commands.js';
import { createReminders } from './reminders.js';
import { createPipeline } from './pipeline.js';
import { createWatcher } from './mail/watcher.js';
import { registerApi } from './api.js';

const log = logger('goojob');

try { process.loadEnvFile('.env'); } catch { /* no .env is fine */ }

const config = loadConfig();
const clock = realClock();
const db = openDb(config.dbPath);
const box = createBox(config.appSecret);

// intelligence
const llm = createLLM({ apiKey: config.anthropicKey });
const research = createResearch({ llm });

// channels
const channels = createChannels();
const consoleChannel = createConsoleChannel();
channels.register(consoleChannel);

const commands = createCommands({ db, channels, research, config });

let telegramUsername = null;
if (config.telegramToken) {
  const telegram = createTelegramChannel({
    token: config.telegramToken,
    onText: (chatId, text) => commands.handleText('telegram', chatId, text),
    onCallback: (chatId, data) => commands.handleCallback('telegram', chatId, data),
  });
  channels.register(telegram);
  telegram.start()
    .then((username) => { telegramUsername = username; })
    .catch((err) => log.error('telegram start failed:', err.message));
}

let lineChannel = null;
if (config.lineToken) {
  lineChannel = createLineChannel({
    token: config.lineToken,
    secret: config.lineSecret,
    onText: (chatId, text, reply) => commands.handleText('line', chatId, text, reply),
  });
  channels.register(lineChannel);
}

// core machinery
const reminders = createReminders({ db, channels, config, clock });
const pipeline = createPipeline({ db, channels, research, reminders, llm, config, clock });
const watcher = config.demo ? null : createWatcher({ db, box, pipeline });

// http
const app = createApp({ onError: (e) => log.error(e) });
registerApi({
  app, db, box, pipeline, consoleChannel, lineChannel, config, watcher,
  getBotUsername: () => telegramUsername,
});
app.get('/demo', (req, res) => {
  if (!config.demo) {
    res.writeHead(302, { location: '/' });
    return res.end();
  }
  res.writeHead(302, { location: '/demo.html' });
  res.end();
});
app.static('/', 'web');

reminders.start();
watcher?.start();

const server = await app.listen(config.port);
const base = `http://localhost:${config.port}`;

console.log(`
  ◯ GooJob — しずかな、就活。

  web      ${base}${config.demo ? `\n  demo     ${base}/demo` : ''}
  bot      ${config.telegramToken ? 'telegram (long polling)' : 'console'}${config.lineToken ? ' + line (webhook)' : ''}
  claude   ${config.anthropicKey ? 'on — briefs & extraction enhanced' : 'off — rule-based mode'}
  inbox    ${config.demo ? 'demo injection (no real mail)' : `${db.usersWithImap().length} linked via IMAP`}
`);
if (config.ephemeralSecret && !config.demo) {
  log('APP_SECRET not set — using an ephemeral secret; IMAP credentials will not survive a restart.');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log('shutting down…');
    reminders.stop();
    await watcher?.stop();
    await channels.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
}
