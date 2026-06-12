import { logger } from '../lib/log.js';

const log = logger('research');
const UA = 'GooJob/0.1 (calm job-hunt assistant; contact: local)';
const TIMEOUT = 9_000;

/** Strip corporate prefixes for search queries: 株式会社ソラテック → ソラテック */
export const coreName = (name) =>
  String(name).replace(/(株式会社|有限会社|合同会社|合資会社)/g, '').trim() || name;

/**
 * Company research with zero required credentials:
 *   Wikipedia JA summary + Google News headlines + official site meta.
 * An injected `llm` (research/llm.js) optionally distills it into a brief.
 */
export function createResearch({ fetchFn = fetch, llm = null } = {}) {
  const get = async (url, headers = {}) => {
    const res = await fetchFn(url, {
      headers: { 'user-agent': UA, ...headers },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  };

  async function wikiSummary(name) {
    const q = encodeURIComponent(coreName(name));
    const search = await (await get(
      `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=3&namespace=0&format=json`,
    )).json();
    const title = (search?.[1] || [])[0];
    if (!title) return null;
    const sum = await (await get(
      `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    )).json();
    if (!sum?.extract) return null;
    return {
      title: sum.title,
      extract: String(sum.extract).slice(0, 500),
      url: sum.content_urls?.desktop?.page || null,
    };
  }

  async function newsHeadlines(name) {
    const q = encodeURIComponent(`"${coreName(name)}"`);
    const xml = await (await get(
      `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`,
    )).text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 4) {
      const block = m[1];
      const pick = (tag) => {
        const t = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
        return t ? t[1].trim() : null;
      };
      const title = pick('title');
      if (!title) continue;
      items.push({
        title: title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        date: pick('pubDate'),
      });
    }
    return items;
  }

  async function siteMeta(domain) {
    const res = await get(`https://${domain}/`, { accept: 'text/html' });
    const buf = await res.arrayBuffer();
    let html = new TextDecoder('utf-8').decode(buf);
    const charset =
      (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] ||
      html.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
    if (charset && !/utf-?8/i.test(charset)) {
      try { html = new TextDecoder(charset.toLowerCase()).decode(buf); } catch { /* keep utf-8 */ }
    }
    const pick = (re) => {
      const m = html.match(re);
      return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 200) : null;
    };
    return {
      title: pick(/<title[^>]*>([^<]+)<\/title>/i),
      description:
        pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
        pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
    };
  }

  /**
   * @returns research object stored on the company row:
   * { name, domain, wiki, news[], site, brief|null, sources[], llmUsed, generatedAt }
   */
  async function research(company, now = Date.now()) {
    const tasks = {
      wiki: wikiSummary(company.name).catch((e) => (log(`wiki miss: ${e.message}`), null)),
      news: newsHeadlines(company.name).catch((e) => (log(`news miss: ${e.message}`), [])),
      site: company.domain
        ? siteMeta(company.domain).catch((e) => (log(`site miss: ${e.message}`), null))
        : Promise.resolve(null),
    };
    const [wiki, news, site] = await Promise.all([tasks.wiki, tasks.news, tasks.site]);

    let brief = null;
    let llmUsed = false;
    if (llm?.enabled()) {
      brief = await llm.writeBrief(company.name, { wiki, news, site }).catch((e) => {
        log.error('llm brief failed:', e.message);
        return null;
      });
      llmUsed = !!brief;
    }

    return {
      name: company.name,
      domain: company.domain || null,
      wiki, news, site, brief, llmUsed,
      sources: [
        wiki?.url,
        company.domain ? `https://${company.domain}/` : null,
      ].filter(Boolean),
      generatedAt: now,
    };
  }

  return { research, wikiSummary, newsHeadlines, siteMeta };
}
