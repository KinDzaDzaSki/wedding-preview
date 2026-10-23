/**
 * Локален харнис за Worker-от — без Cloudflare, без мрежа.
 *
 * Го вчитува вистинскиот `worker/src/index.js`, му дава in-memory R2 и
 * го изложува на http://127.0.0.1:8787 за да може фронтендот да го тестира
 * со `?api=http://127.0.0.1:8787`.
 *
 *   node test/mock-worker.mjs
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'gallery', 'worker', 'src', 'index.js');
const { default: worker } = await import(pathToFileURL(ROOT).href);

/** Минимален R2: доволно за put/list/head/get/delete. */
function memoryBucket() {
  const store = new Map();

  return {
    async put(key, value, options = {}) {
      const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
      store.set(key, {
        key,
        bytes,
        customMetadata: options.customMetadata || {},
        httpMetadata: options.httpMetadata || {},
        uploaded: new Date(),
      });
      return { key };
    },
    async get(key) {
      const o = store.get(key);
      if (!o) return null;
      return {
        body: o.bytes,
        customMetadata: o.customMetadata,
        httpMetadata: o.httpMetadata,
        async json() { return JSON.parse(o.bytes.toString('utf8')); },
        async text() { return o.bytes.toString('utf8'); },
        async arrayBuffer() { return o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength); },
      };
    },
    async head(key) {
      const o = store.get(key);
      return o ? { key, size: o.bytes.length, customMetadata: o.customMetadata } : null;
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const all = [...store.values()]
        .filter((o) => o.key.startsWith(prefix))
        .sort((a, b) => a.key.localeCompare(b.key));
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + limit);
      return {
        objects: slice.map((o) => ({
          key: o.key,
          size: o.bytes.length,
          uploaded: o.uploaded,
          customMetadata: o.customMetadata,
        })),
        truncated: start + limit < all.length,
        cursor: String(start + limit),
      };
    },
    __dump: () => [...store.entries()].map(([k, v]) => ({ key: k, meta: v.customMetadata })),
  };
}

const env = {
  PHOTOS: memoryBucket(),
  ADMIN_TOKEN: 'test-admin',
  ALLOWED_ORIGINS: '*',
};

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  const request = new Request(`http://127.0.0.1:8787${req.url}`, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((vv) => [k, vv]) : [[k, v]]),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });

  try {
    const response = await worker.fetch(request, env, {});
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(error) }));
  }

  if (process.env.VERBOSE) {
    console.log(`${req.method} ${req.url} → ${res.statusCode}`);
  }
});

server.listen(8787, '127.0.0.1', () => {
  console.log('worker mock → http://127.0.0.1:8787');
  console.log('R2 се чува во меморија; рестарт = празен бакет.');
});

export { env, server };
