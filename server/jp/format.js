/** JST-locked Japanese formatting for bot copy. Input: epoch ms. */

const TZ = 'Asia/Tokyo';
const F = (opt) => new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, ...opt });

const fmtWd = F({ weekday: 'short' });
const fmtMd = F({ month: 'numeric', day: 'numeric' });
const fmtHm = F({ hour: '2-digit', minute: '2-digit', hour12: false });
const fmtYmd = F({ year: 'numeric', month: 'numeric', day: 'numeric' });

export const fmtTime = (ms) => fmtHm.format(ms);
export const fmtDate = (ms) => `${fmtMd.format(ms)}（${fmtWd.format(ms)}）`;
export const fmtDateFull = (ms) => `${fmtYmd.format(ms)}（${fmtWd.format(ms)}）`;
export const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`;

const dayIndex = (ms) => Math.floor((ms + 9 * 3_600_000) / 86_400_000);

/** きょう / あす / あさって / 6月24日（水） */
export function fmtRelDay(ms, now = Date.now()) {
  const diff = dayIndex(ms) - dayIndex(now);
  if (diff === 0) return 'きょう';
  if (diff === 1) return 'あす';
  if (diff === 2) return 'あさって';
  return fmtDate(ms);
}

/** あす 6/24（水）14:00 — reminder headline */
export function fmtWhen(ms, now = Date.now()) {
  const rel = fmtRelDay(ms, now);
  const abs = `${fmtDate(ms)} ${fmtTime(ms)}`;
  return rel.includes('月') ? abs : `${rel} ${abs}`;
}
