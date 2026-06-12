import { understand } from './mail/extract.js';
import { INTENT } from './mail/classify.js';
import * as M from './bot/messages.js';
import { logger } from './lib/log.js';

const log = logger('pipeline');
const RESEARCH_TTL = 7 * 86_400_000;

/**
 * The product, end to end: raw mail in → understanding → events,
 * company research, immediate notification, scheduled reminders.
 */
export function createPipeline({ db, channels, research, reminders, llm = null, config, clock }) {
  /** Background research; brief is ready by the time reminders fire. */
  async function researchCompany(company) {
    // Demo uses canned research (api.js) — keep it deterministic & offline-safe.
    if (config.demo) return;
    const fresh = company.researched_at && clock.now() - company.researched_at < RESEARCH_TTL;
    if (fresh || !research) return;
    try {
      const r = await research.research(company, clock.now());
      db.saveResearch(company.id, r, clock.now());
      log(`researched ${company.name}`);
    } catch (err) {
      log.error(`research failed for ${company.name}:`, err.message);
    }
  }

  async function processMail(user, mail) {
    const now = clock.now();
    const messageId = mail.messageId || `<gen-${now}@goojob.local>`;
    if (db.isSeen(user.id, messageId)) return { intent: 'duplicate' };

    let u = understand(mail, { now });

    // Claude second opinion when the rules are unsure (optional layer).
    if (llm?.enabled() && u.intent !== INTENT.IGNORE && (!u.company || u.company.weak)) {
      try {
        const fix = await llm.refineMail(mail);
        if (fix?.company_name) u.company = { ...(u.company || {}), name: fix.company_name, weak: false };
        if (fix?.location && !u.location) u.location = { online: /オンライン/.test(fix.location), text: fix.location };
        if (fix?.event_label && u.label === '予定') u.label = fix.event_label;
      } catch (err) {
        log.error('llm refine failed:', err.message);
      }
    }

    db.markSeen(user.id, messageId, u.intent, now);
    if (u.intent === INTENT.IGNORE) return { intent: u.intent };
    log(`${user.email}: ${u.intent}${u.company ? ` (${u.company.name})` : ''}`);

    const company = u.company
      ? db.upsertCompany(user.id, { name: u.company.name, domain: u.company.domain }, now)
      : null;
    const cname = company?.name || '企業';

    const baseEvent = (type, title, when) => ({
      companyId: company?.id ?? null,
      type, title,
      startsAt: when.startsAt,
      endsAt: when.endsAt ?? null,
      location: u.location?.text ?? null,
      url: u.url,
      items: u.items,
      dress: u.dress,
      address: u.address,
      source: messageId,
      rawExcerpt: u.excerpt,
    });

    switch (u.intent) {
      case INTENT.INVITE: {
        if (!u.chosen) return { intent: u.intent };
        const { event, created } = db.upsertEvent(user.id, baseEvent(u.type, u.label, u.chosen), now);
        if (created) {
          reminders.scheduleEvent(event);
          if (company) researchCompany(company); // deliberately not awaited
          await channels.send(user, M.eventDetected(event, cname, { now }));
        }
        return { intent: u.intent, eventId: event.id, created };
      }

      case INTENT.RESCHEDULE: {
        if (!u.chosen) return { intent: u.intent };
        if (company) db.cancelCompanyEvents(user.id, company.id, u.type);
        const { event } = db.upsertEvent(user.id, baseEvent(u.type, u.label, u.chosen), now);
        reminders.scheduleEvent(event);
        await channels.send(user, M.reschedule(event, cname));
        return { intent: u.intent, eventId: event.id };
      }

      case INTENT.CANDIDATES: {
        if (company) researchCompany(company);
        await channels.send(user, M.candidatesDetected(cname, u.label, u.candidates, u.deadline, u.url));
        return { intent: u.intent, slots: u.candidates.length };
      }

      case INTENT.DEADLINE: {
        if (!u.chosen) return { intent: u.intent };
        const what = /エントリーシート|ES/i.test(`${mail.subject}`) ? 'エントリーシート提出'
          : u.label !== '予定' ? u.label : '提出物';
        const { event, created } = db.upsertEvent(user.id, baseEvent('締切', `${what} 締切`, u.chosen), now);
        if (created) {
          reminders.scheduleEvent(event);
          await channels.send(user, M.deadlineDetected(cname, what, event.starts_at, u.url, { now }));
        }
        return { intent: u.intent, eventId: event.id };
      }

      case INTENT.REJECTION:
        await channels.send(user, M.rejectionNotice(cname));
        return { intent: u.intent };

      case INTENT.ACK:
        if (company) researchCompany(company);
        await channels.send(user, M.ackNotice(cname));
        return { intent: u.intent };

      default:
        return { intent: u.intent }; // recruit_other — noted, not noisy
    }
  }

  return { processMail, researchCompany };
}
