import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  grad_year    INTEGER,
  channel      TEXT NOT NULL DEFAULT 'telegram',
  chat_id      TEXT,
  link_code    TEXT UNIQUE,
  token        TEXT NOT NULL,
  imap_host    TEXT,
  imap_port    INTEGER,
  imap_user    TEXT,
  imap_pass_enc TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS companies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  domain       TEXT,
  research_json TEXT,
  researched_at INTEGER,
  created_at   INTEGER NOT NULL,
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  company_id   INTEGER REFERENCES companies(id),
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  starts_at    INTEGER NOT NULL,
  ends_at      INTEGER,
  location     TEXT,
  url          TEXT,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  source       TEXT,
  raw_excerpt  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, starts_at);
CREATE TABLE IF NOT EXISTS reminders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  kind         TEXT NOT NULL,
  fire_at      INTEGER NOT NULL,
  sent_at      INTEGER,
  UNIQUE(event_id, kind)
);
CREATE TABLE IF NOT EXISTS seen_mail (
  user_id      INTEGER NOT NULL,
  message_id   TEXT NOT NULL,
  intent       TEXT,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
`;

const newCode = () => {
  // Unambiguous alphabet (no 0/O/1/I) — the code is typed by humans.
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(6)].map((b) => abc[b % abc.length]).join('');
};

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);

  return {
    raw: db,

    // ── users ──────────────────────────────────────────────
    createUser({ email, name = null, gradYear = null, channel = 'telegram' }, now = Date.now()) {
      const token = randomBytes(24).toString('base64url');
      const code = newCode();
      const r = run(
        `INSERT INTO users (email, name, grad_year, channel, link_code, token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        email, name, gradYear, channel, code, token, now,
      );
      return this.userById(r.lastInsertRowid);
    },
    userById: (id) => get('SELECT * FROM users WHERE id = ?', id),
    userByEmail: (email) => get('SELECT * FROM users WHERE email = ?', email),
    userByToken: (token) => get('SELECT * FROM users WHERE token = ?', token),
    userByLinkCode: (code) => get('SELECT * FROM users WHERE link_code = ?', String(code).toUpperCase()),
    userByChat: (channel, chatId) =>
      get('SELECT * FROM users WHERE channel = ? AND chat_id = ?', channel, String(chatId)),
    listUsers: () => all('SELECT * FROM users'),
    linkChat: (userId, chatId) => run('UPDATE users SET chat_id = ? WHERE id = ?', String(chatId), userId),
    setChannel: (userId, channel) => run('UPDATE users SET channel = ? WHERE id = ?', channel, userId),
    setImap: (userId, { host, port, user, passEnc }) =>
      run(
        'UPDATE users SET imap_host = ?, imap_port = ?, imap_user = ?, imap_pass_enc = ? WHERE id = ?',
        host, port, user, passEnc, userId,
      ),
    usersWithImap: () => all('SELECT * FROM users WHERE imap_host IS NOT NULL'),
    getSettings: (user) => JSON.parse(user.settings_json || '{}'),
    saveSettings: (userId, obj) =>
      run('UPDATE users SET settings_json = ? WHERE id = ?', JSON.stringify(obj), userId),

    // ── companies ──────────────────────────────────────────
    upsertCompany(userId, { name, domain = null }, now = Date.now()) {
      const found = get('SELECT * FROM companies WHERE user_id = ? AND name = ?', userId, name);
      if (found) {
        if (domain && !found.domain) run('UPDATE companies SET domain = ? WHERE id = ?', domain, found.id);
        return get('SELECT * FROM companies WHERE id = ?', found.id);
      }
      const r = run(
        'INSERT INTO companies (user_id, name, domain, created_at) VALUES (?, ?, ?, ?)',
        userId, name, domain, now,
      );
      return get('SELECT * FROM companies WHERE id = ?', r.lastInsertRowid);
    },
    companyById: (id) => get('SELECT * FROM companies WHERE id = ?', id),
    companiesForUser: (userId) =>
      all('SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC', userId),
    findCompanyByName: (userId, name) =>
      get('SELECT * FROM companies WHERE user_id = ? AND name LIKE ?', userId, `%${name}%`),
    saveResearch: (companyId, research, now = Date.now()) =>
      run('UPDATE companies SET research_json = ?, researched_at = ? WHERE id = ?',
        JSON.stringify(research), now, companyId),

    // ── events ─────────────────────────────────────────────
    upsertEvent(userId, ev, now = Date.now()) {
      const found = get(
        `SELECT * FROM events WHERE user_id = ? AND type = ? AND starts_at = ?
           AND company_id IS ?`,
        userId, ev.type, ev.startsAt, ev.companyId ?? null,
      );
      if (found) return { event: found, created: false };
      const r = run(
        `INSERT INTO events (user_id, company_id, type, title, starts_at, ends_at,
           location, url, source, raw_excerpt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, ev.companyId ?? null, ev.type, ev.title, ev.startsAt, ev.endsAt ?? null,
        ev.location ?? null, ev.url ?? null, ev.source ?? null, ev.rawExcerpt ?? null, now, now,
      );
      return { event: get('SELECT * FROM events WHERE id = ?', r.lastInsertRowid), created: true };
    },
    eventById: (id) => get('SELECT * FROM events WHERE id = ?', id),
    eventsBetween: (userId, from, to) =>
      all(
        `SELECT * FROM events WHERE user_id = ? AND status = 'scheduled'
           AND starts_at >= ? AND starts_at < ? ORDER BY starts_at`,
        userId, from, to,
      ),
    futureEvents: (userId, now = Date.now()) =>
      all(
        `SELECT * FROM events WHERE user_id = ? AND status = 'scheduled'
           AND starts_at >= ? ORDER BY starts_at`,
        userId, now,
      ),
    cancelCompanyEvents: (userId, companyId, type) =>
      run(
        `UPDATE events SET status = 'cancelled' WHERE user_id = ? AND company_id = ?
           AND type = ? AND status = 'scheduled'`,
        userId, companyId, type,
      ),

    // ── reminders ──────────────────────────────────────────
    createReminder(eventId, kind, fireAt) {
      run('INSERT OR IGNORE INTO reminders (event_id, kind, fire_at) VALUES (?, ?, ?)',
        eventId, kind, fireAt);
      return get('SELECT * FROM reminders WHERE event_id = ? AND kind = ?', eventId, kind);
    },
    pendingReminders: (now) =>
      all(
        `SELECT r.*, e.user_id FROM reminders r JOIN events e ON e.id = r.event_id
         WHERE r.sent_at IS NULL AND e.status = 'scheduled' AND r.fire_at >= ?
         ORDER BY r.fire_at`,
        now,
      ),
    dueReminders: (now) =>
      all(
        `SELECT r.*, e.user_id FROM reminders r JOIN events e ON e.id = r.event_id
         WHERE r.sent_at IS NULL AND e.status = 'scheduled' AND r.fire_at <= ?
         ORDER BY r.fire_at`,
        now,
      ),
    markReminderSent: (id, now = Date.now()) =>
      run('UPDATE reminders SET sent_at = ? WHERE id = ? AND sent_at IS NULL', now, id),

    // ── seen mail (idempotency) ────────────────────────────
    isSeen: (userId, messageId) =>
      !!get('SELECT 1 AS x FROM seen_mail WHERE user_id = ? AND message_id = ?', userId, messageId),
    markSeen: (userId, messageId, intent, now = Date.now()) =>
      run('INSERT OR IGNORE INTO seen_mail (user_id, message_id, intent, processed_at) VALUES (?, ?, ?, ?)',
        userId, messageId, intent, now),

    close: () => db.close(),
  };
}
