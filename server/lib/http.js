import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** '/api/u/:id' → { regex, keys } */
function compile(path) {
  const keys = [];
  const pattern = path.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

/**
 * Minimal zero-dependency app: routes, params, static mounts.
 * Routes are checked first, so a route can shadow a static file.
 */
export function createApp({ onError = console.error } = {}) {
  const routes = [];
  const mounts = [];

  const add = (method, path, handler) => routes.push({ method, ...compile(path), handler });

  async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://local');
      const path = decodeURIComponent(url.pathname);
      req.query = url.searchParams;
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.regex.exec(path);
        if (!m) continue;
        req.params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
        await r.handler(req, res);
        return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(path, res)) return;
      json(res, 404, { error: 'not_found' });
    } catch (err) {
      onError(err);
      if (!res.headersSent) json(res, 500, { error: 'internal' });
      else res.end();
    }
  }

  function serveStatic(path, res) {
    for (const { prefix, dir } of mounts) {
      if (!path.startsWith(prefix)) continue;
      let rel = path.slice(prefix.length) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = normalize(join(dir, rel));
      if (!file.startsWith(dir + sep) && file !== dir) continue; // path traversal guard
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const ext = extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      createReadStream(file).pipe(res);
      return true;
    }
    return false;
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    static: (prefix, dir) => mounts.push({ prefix, dir: resolve(dir) }),
    handle,
    listen(port) {
      const server = http.createServer(handle);
      return new Promise((ok) => server.listen(port, () => ok(server)));
    },
  };
}

export function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

export function readBody(req, { limit = 256 * 1024 } = {}) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        fail(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

export async function readJson(req, opts) {
  const raw = await readBody(req, opts);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 });
  }
}

/** Server-sent events helper. Returns { send, close }; handles keep-alive. */
export function sse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(':ok\n\n');
  const ping = setInterval(() => res.write(':ping\n\n'), 25_000);
  return {
    send(data, event) {
      if (event) res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(ping);
      res.end();
    },
    onClose(fn) {
      res.on('close', () => {
        clearInterval(ping);
        fn();
      });
    },
  };
}
