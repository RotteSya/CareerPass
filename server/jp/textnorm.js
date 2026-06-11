/**
 * Text normalization for Japanese email bodies.
 * Every replacement is single-char → single-char, so indexes into the
 * normalized string remain valid for the original.
 */

const ZEN_DIGITS = '０１２３４５６７８９';
const ZEN_UPPER = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ';
const ZEN_LOWER = 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ';

const MAP = new Map();
for (let i = 0; i < 10; i++) MAP.set(ZEN_DIGITS[i], String(i));
for (let i = 0; i < 26; i++) {
  MAP.set(ZEN_UPPER[i], String.fromCharCode(65 + i));
  MAP.set(ZEN_LOWER[i], String.fromCharCode(97 + i));
}
// Punctuation that matters for date/time parsing.
// NOTE: katakana long vowel 'ー' is deliberately NOT mapped — it is part of
// words (ノースリバー). The datetime range separator class handles it locally.
Object.entries({
  '：': ':', '／': '/', '－': '-', '−': '-', '–': '-', '―': '-',
  '～': '〜', '　': ' ', '（': '(', '）': ')', '．': '.', '，': ',', '＠': '@',
}).forEach(([k, v]) => MAP.set(k, v));

export function normalize(text) {
  let out = '';
  for (const ch of String(text)) out += MAP.get(ch) ?? ch;
  return out;
}

/** Collapse runs of spaces/tabs (not newlines) — for excerpts and matching. */
export function squash(text) {
  return String(text).replace(/[^\S\n]+/g, ' ').trim();
}
