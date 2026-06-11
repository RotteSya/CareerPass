import * as M from './messages.js';
import { jstParts } from '../jp/datetime.js';
import { logger } from '../lib/log.js';

const log = logger('commands');
const JST = 9 * 3_600_000;

const dayBounds = (now, days = 1) => {
  const { y, m, d } = jstParts(now);
  const start = Date.UTC(y, m - 1, d) - JST;
  return [start, start + days * 86_400_000];
};

/** Bot command router — shared by telegram (push) and line (reply). */
export function createCommands({ db, channels, research, config }) {
  const companyOf = (ev) =>
    (ev.company_id && db.companyById(ev.company_id)?.name) || '';

  async function ensureResearch(company) {
    if (company.research_json) return JSON.parse(company.research_json);
    const r = await research.research(company);
    db.saveResearch(company.id, r);
    return r;
  }

  async function handleText(channelName, chatId, text, reply) {
    const user = db.userByChat(channelName, chatId);
    const send = (msg) =>
      reply ? reply(msg)
      : user ? channels.send(user, msg)
      : channels.get(channelName)?.send({ chat_id: chatId, email: '(未連携)' }, msg);

    // ── linking ──────────────────────────────────────────
    const startM = text.match(/^\/start(?:\s+(\S+))?$/);
    const bareCode = !user && /^[A-Za-z0-9]{6}$/.test(text) ? text : null;
    if (startM || bareCode) {
      const code = (startM?.[1] || bareCode || '').toUpperCase();
      const account = code && db.userByLinkCode(code);
      if (!account) return send(user ? M.help() : M.linkFailed());
      if (account.chat_id && account.chat_id !== chatId) return send(M.alreadyLinked());
      db.linkChat(account.id, chatId);
      if (account.channel !== channelName) db.setChannel(account.id, channelName);
      log(`linked ${account.email} ↔ ${channelName}:${chatId}`);
      const linked = db.userById(account.id);
      return reply ? reply(M.welcome(linked)) : channels.send(linked, M.welcome(linked));
    }
    if (!user) return send(M.linkFailed());

    // ── commands ─────────────────────────────────────────
    const now = Date.now();
    const cmd = text.replace(/@\w+$/, ''); // strip @botname suffix in groups

    if (/^\/today$|^(きょう|今日)$/.test(cmd)) {
      const [a, b] = dayBounds(now, 1);
      return send(M.todayList(db.eventsBetween(user.id, Math.max(a, now - 3_600_000), b), companyOf, now));
    }
    if (/^\/week$|^今週$/.test(cmd)) {
      return send(M.weekList(db.eventsBetween(user.id, now - 3_600_000, now + 7 * 86_400_000), companyOf, now));
    }
    if (/^\/companies$/.test(cmd)) {
      return send(M.companiesList(db.companiesForUser(user.id)));
    }
    const briefM = cmd.match(/^\/brief(?:\s+(.+))?$/);
    if (briefM) {
      const name = (briefM[1] || '').trim();
      if (!name) return send({ text: '/brief 会社名 の形で送ってください。例：/brief ソラテック' });
      const company = db.findCompanyByName(user.id, name);
      if (!company) return send(M.briefNotFound(name));
      send({ text: `${company.name} を調べています…` });
      const r = await ensureResearch(company);
      return send({ text: M.renderBrief(r) });
    }
    if (/^\/connect$/.test(cmd)) return send(M.connectStatus(user, config.demo));
    if (/^\/settings$/.test(cmd)) return send(M.settingsView(db.getSettings(user)));
    if (/^\/help$|^\/start$/.test(cmd)) return send(M.help());
    return send(M.unknown());
  }

  async function handleCallback(channelName, chatId, data) {
    const user = db.userByChat(channelName, chatId);
    if (!user) return;
    const toggleM = data.match(/^toggle:(day_before|soon)$/);
    if (toggleM) {
      const settings = db.getSettings(user);
      settings.reminders = { day_before: true, soon: true, ...settings.reminders };
      settings.reminders[toggleM[1]] = !settings.reminders[toggleM[1]];
      db.saveSettings(user.id, settings);
      return channels.send(db.userById(user.id), M.settingsView(settings));
    }
  }

  return { handleText, handleCallback };
}
