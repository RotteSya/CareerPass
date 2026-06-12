import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearch, coreName } from '../server/research/research.js';

const FIXTURES = {
  opensearch: JSON.stringify([
    'ソラテック', ['ソラテック'], [''], ['https://ja.wikipedia.org/wiki/%E3%82%BD%E3%83%A9'],
  ]),
  summary: JSON.stringify({
    title: 'ソラテック',
    extract: '株式会社ソラテックは、東京都渋谷区に本社を置く気象データ解析企業。2015年設立。',
    content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/ソラテック' } },
  }),
  rss: `<?xml version="1.0"?><rss><channel>
    <item><title>ソラテック、衛星データ解析の新サービスを発表 - 日経新聞</title><pubDate>Mon, 08 Jun 2026 01:00:00 GMT</pubDate><link>https://x</link></item>
    <item><title><![CDATA[ソラテックが27卒採用を拡大]]></title><pubDate>Fri, 05 Jun 2026 01:00:00 GMT</pubDate></item>
  </channel></rss>`,
  homepage: '<html><head><meta charset="utf-8"><title>株式会社ソラテック | 気象データで未来をつくる</title><meta name="description" content="ソラテックは気象データ解析のリーディングカンパニーです。"></head></html>',
};

function fakeFetch(url) {
  const body =
    url.includes('action=opensearch') ? FIXTURES.opensearch
    : url.includes('rest_v1/page/summary') ? FIXTURES.summary
    : url.includes('news.google.com') ? FIXTURES.rss
    : url.startsWith('https://soratech.co.jp') ? FIXTURES.homepage
    : null;
  if (body === null) return Promise.reject(new Error('offline'));
  return Promise.resolve(new Response(body, {
    status: 200,
    headers: { 'content-type': url.includes('soratech') ? 'text/html; charset=utf-8' : 'application/json' },
  }));
}

test('coreName strips corporate prefixes', () => {
  assert.equal(coreName('株式会社ソラテック'), 'ソラテック');
  assert.equal(coreName('トヨタ自動車株式会社'), 'トヨタ自動車');
});

test('research assembles wiki + news + site without llm', async () => {
  const r = createResearch({ fetchFn: fakeFetch });
  const out = await r.research({ name: '株式会社ソラテック', domain: 'soratech.co.jp' });
  assert.match(out.wiki.extract, /気象データ解析/);
  assert.equal(out.news.length, 2);
  assert.match(out.news[0].title, /新サービス/);
  assert.match(out.news[1].title, /27卒採用/); // CDATA handled
  assert.match(out.site.title, /ソラテック/);
  assert.equal(out.brief, null);
  assert.equal(out.llmUsed, false);
  assert.ok(out.sources.length >= 1);
});

test('research degrades gracefully when everything is offline', async () => {
  const r = createResearch({ fetchFn: () => Promise.reject(new Error('offline')) });
  const out = await r.research({ name: '株式会社ノーネット', domain: 'nonet.example' });
  assert.equal(out.wiki, null);
  assert.deepEqual(out.news, []);
  assert.equal(out.site, null);
  assert.equal(out.name, '株式会社ノーネット');
});
