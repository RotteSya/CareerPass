import { reminder as reminderMsg } from './bot/messages.js';
import { logger } from './lib/log.js';

const log = logger('reminders');
const MAX_CHUNK = 6 * 3_600_000; // re-check long timers every 6h (drift, restarts)

/**
 * Persistent reminder scheduler. Reminders live in sqlite; timers are
 * re-armed on boot, so restarts lose nothing. Demo mode compresses the
 * "day before / soon" offsets to seconds (config.reminderOffsets).
 */
export function createReminders({ db, channels, config, clock }) {
  const timers = new Map(); // reminder id → timer handle

  function arm(rem) {
    if (timers.has(rem.id) || rem.sent_at) return;
    const delay = Math.min(Math.max(0, rem.fire_at - clock.now()), MAX_CHUNK);
    const t = clock.setTimeout(() => {
      timers.delete(rem.id);
      fire(rem.id).catch((e) => log.error('fire failed:', e.message));
    }, delay);
    timers.set(rem.id, t);
  }

  async function fire(remId) {
    const rem = db.reminderById(remId);
    if (!rem || rem.sent_at) return;
    if (rem.fire_at > clock.now()) return arm(rem); // chunked long timer: re-arm
    if (rem.event_status !== 'scheduled') return;   // event cancelled meanwhile

    const ev = db.eventById(rem.event_id);
    const user = db.userById(rem.user_id);
    if (!ev || !user) return;

    const settings = db.getSettings(user);
    const enabled = { day_before: true, soon: true, ...settings.reminders };
    if (!enabled[rem.kind]) {
      db.markReminderSent(rem.id, clock.now()); // user opted out — don't retry forever
      return;
    }

    const company = ev.company_id ? db.companyById(ev.company_id) : null;
    const research = company?.research_json ? JSON.parse(company.research_json) : null;
    await channels.send(user, reminderMsg(rem.kind, ev, company?.name || '', research, { now: clock.now() }));
    db.markReminderSent(rem.id, clock.now());
    log(`sent ${rem.kind} for event#${ev.id} → ${user.email}`);
  }

  return {
    /** Create + arm reminders for a (new) event. */
    scheduleEvent(event) {
      for (const { kind, ms } of config.reminderOffsets) {
        // Demo: fire shortly after detection so the arc is visible live.
        const fireAt = config.demo ? clock.now() + ms : event.starts_at - ms;
        if (!config.demo && fireAt <= clock.now()) continue; // lead time already passed
        const rem = db.createReminder(event.id, kind, fireAt);
        if (rem) arm(rem);
      }
    },

    /** Re-arm everything pending (boot) and catch up missed ones. */
    start() {
      const now = clock.now();
      const missed = db.dueReminders(now);
      const pending = db.pendingReminders(now);
      for (const r of [...missed, ...pending]) arm(r);
      if (missed.length) log(`catching up ${missed.length} missed reminder(s)`);
      log(`armed ${pending.length} pending reminder(s)`);
    },

    stop() {
      for (const t of timers.values()) clock.clearTimeout(t);
      timers.clear();
    },
  };
}
