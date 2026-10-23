/**
 * Wedding gallery API — Cloudflare Worker + R2.
 *
 * Routes
 *   POST   /api/photos          upload (multipart: grid, full, guest, caption)
 *   GET    /api/photos          list, newest first (?limit=&cursor=&guest=)
 *   DELETE /api/photos/:id      delete — requires the admin token
 *   GET    /i/<key>             serve an image from R2
 *   GET    /api/health          liveness
 *
 * Storage layout in R2:
 *   full/<id>.jpg   ~1600px, the lightbox image
 *   grid/<id>.jpg   ~800px,  the tile image
 *
 * Metadata lives in the object's own customMetadata, so there is no
 * database to keep in sync — a single R2 list() returns everything the
 * grid needs. No KV or D1 required.
 *
 * Bindings: PHOTOS (R2 bucket), ADMIN_TOKEN (secret), ALLOWED_ORIGINS (var)
 */

const MAX_UPLOAD = 12 * 1024 * 1024; // 12 MB total for both images
const MAX_GUEST = 60;
const MAX_CAPTION = 200;

/* ---------- helpers ---------- */

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

/** CORS — echo the origin only when it is on the allow-list. */
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = list.includes('*') || (origin && (list.includes(origin) || list.some((p) => p === origin)));
  return ok
    ? {
        'Access-Control-Allow-Origin': list.includes('*') ? '*' : origin,
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type,x-admin-token,x-delete-token',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

/** Reject anything that is not really an image, regardless of what the client claims. */
function sniff(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '') // strip control chars
    .trim()
    .slice(0, max);

/** SHA-256 as lowercase hex — used to store the delete-token hash. */
async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
};

/* ---------- handlers ---------- */

async function upload(req, env, corsHeaders) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared && declared > MAX_UPLOAD) {
    return json({ error: 'too_large', max: MAX_UPLOAD }, 413, corsHeaders);
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'expected multipart/form-data' }, 400, corsHeaders);
  }

  const grid = form.get('grid');
  const full = form.get('full');
  if (!(grid instanceof File) || !(full instanceof File)) {
    return json({ error: 'grid and full files are required' }, 400, corsHeaders);
  }
  if (grid.size + full.size > MAX_UPLOAD) {
    return json({ error: 'too_large', max: MAX_UPLOAD }, 413, corsHeaders);
  }

  const guest = clean(form.get('guest'), MAX_GUEST);
  const caption = clean(form.get('caption'), MAX_CAPTION);

  const gridBytes = new Uint8Array(await grid.arrayBuffer());
  const fullBytes = new Uint8Array(await full.arrayBuffer());
  const gridType = sniff(gridBytes);
  const fullType = sniff(fullBytes);
  if (!gridType || !fullType) {
    return json({ error: 'not_an_image' }, 415, corsHeaders);
  }

  const id = crypto.randomUUID();
  const ts = Date.now();

  // Per-photo delete token: returned ONLY to the uploader, so a guest can
  // remove their own mistake. We store just the hash, so the token cannot be
  // recovered from the bucket. The admin token can always delete.
  const deleteToken = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const dth = await sha256Hex(deleteToken);

  const meta = {
    guest,
    caption,
    ts: String(ts),
    w: clean(form.get('w'), 8),
    h: clean(form.get('h'), 8),
    bytes: String(fullBytes.length),
    dth,
  };

  await Promise.all([
    env.PHOTOS.put(`full/${id}.jpg`, fullBytes, {
      httpMetadata: { contentType: fullType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: meta,
    }),
    env.PHOTOS.put(`grid/${id}.jpg`, gridBytes, {
      httpMetadata: { contentType: gridType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: meta,
    }),
  ]);

  return json(
    { ok: true, id, url: `/i/full/${id}.jpg`, thumb: `/i/grid/${id}.jpg`, guest, caption, ts, deleteToken },
    201,
    corsHeaders
  );
}

async function list(req, env, corsHeaders) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 1000);
  const cursor = url.searchParams.get('cursor') || undefined;
  const guest = (url.searchParams.get('guest') || '').toLowerCase();

  // One list() of full/ carries all the metadata we need.
  const out = await env.PHOTOS.list({ prefix: 'full/', limit, cursor, include: ['customMetadata'] });

  const photos = [];
  const guests = new Set();
  for (const o of out.objects) {
    const m = o.customMetadata || {};
    const id = o.key.slice('full/'.length).replace(/\.jpg$/, '');
    if (guest && String(m.guest || '').toLowerCase() !== guest) continue;
    if (m.guest) guests.add(m.guest);
    photos.push({
      id,
      url: `/i/full/${id}.jpg`,
      thumb: `/i/grid/${id}.jpg`,
      guest: m.guest || '',
      caption: m.caption || '',
      ts: Number(m.ts) || +o.uploaded,
      w: Number(m.w) || 0,
      h: Number(m.h) || 0,
    });
  }
  photos.sort((a, b) => b.ts - a.ts);

  return json(
    {
      photos,
      count: photos.length,
      guests: [...guests].sort((a, b) => a.localeCompare(b, 'mk')),
      cursor: out.truncated ? out.cursor : null,
    },
    200,
    corsHeaders
  );
}

async function remove(req, env, corsHeaders, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_id' }, 400, corsHeaders);

  const admin = req.headers.get('x-admin-token') || '';
  const guest = req.headers.get('x-delete-token') || '';

  let allowed = false;
  if (admin && env.ADMIN_TOKEN) {
    allowed = timingSafeEqual(admin, env.ADMIN_TOKEN);
  }
  if (!allowed && guest) {
    // A guest may delete only the photo they uploaded: compare our hash of
    // their token against the hash stored with the object.
    const head = await env.PHOTOS.head(`full/${id}.jpg`);
    const stored = head?.customMetadata?.dth;
    if (stored) allowed = timingSafeEqual(await sha256Hex(guest), stored);
  }
  if (!allowed) return json({ error: 'forbidden' }, 403, corsHeaders);

  await Promise.all([env.PHOTOS.delete(`full/${id}.jpg`), env.PHOTOS.delete(`grid/${id}.jpg`)]);
  return json({ ok: true, id }, 200, corsHeaders);
}

async function serveImage(env, key, corsHeaders) {
  if (!/^(full|grid)\/[0-9a-f-]{36}\.jpg$/i.test(key)) {
    return new Response('not found', { status: 404, headers: corsHeaders });
  }
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('not found', { status: 404, headers: corsHeaders });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': obj.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
      ...corsHeaders,
    },
  });
}

/* ---------- RSVP + wishes (market contract) ----------
 *   POST /api/rsvp    { ime, prezime, attendance: "yes"|"no", guests, message }
 *   GET  /api/rsvp    admin only (x-admin-token) → rows + counts
 *   GET  /api/wishes  → newest first
 *   POST /api/wishes  { name, message } → the created record
 *
 * Both live in the same R2 bucket as the photos, under their own prefixes, so
 * there is no KV/D1 to provision: one list() returns everything.
 */

const MAX_IME = 40;
const MAX_PREZIME = 40;
const MAX_WISH = 300;
const MAX_RSVP_MSG = 500;
const MAX_GUESTS = 20;

/* Best-effort abuse guard — per isolate, resets on deploy.
   Not a security boundary; it only stops a bored guest hammering POST. */
const writeLog = new Map();

function throttled(req, limit = 30, windowMs = 10 * 60 * 1000) {
  /* Без Cloudflare (локален dev) нема сигурен идентитет — не ограничувај.
     Во продукција limit-от е висок намерно: гостите на свадба често
     делат еден NAT/CGNAT IP, па строг лимит би ги блокирал своите. */
  const ip = req.headers.get('cf-connecting-ip');
  if (!ip) return false;
  const now = Date.now();
  const hits = (writeLog.get(ip) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  writeLog.set(ip, hits);
  if (writeLog.size > 5000) writeLog.clear();
  return hits.length > limit;
}

async function readJson(req) {
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) return null;
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

const newKey = (prefix) =>
  `${prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;

async function postRsvp(req, env, corsHeaders) {
  if (throttled(req)) return json({ message: 'Премногу обиди. Обидете се подоцна.' }, 429, corsHeaders);

  const body = await readJson(req);
  if (!body) return json({ message: 'Очекуван JSON.' }, 400, corsHeaders);

  const ime = clean(body.ime, MAX_IME);
  const prezime = clean(body.prezime, MAX_PREZIME);
  const attendance = body.attendance === 'no' ? 'no' : body.attendance === 'yes' ? 'yes' : '';
  const message = clean(body.message, MAX_RSVP_MSG);

  if (!ime) return json({ message: 'Внесете го Вашето име.' }, 400, corsHeaders);
  if (!attendance) return json({ message: 'Ве молиме изберете дали доаѓате.' }, 400, corsHeaders);

  let guests = Number.parseInt(body.guests, 10);
  if (!Number.isFinite(guests)) guests = 1;
  guests = Math.min(Math.max(guests, 1), MAX_GUESTS);
  if (attendance === 'no') guests = 0;

  const ts = Date.now();
  const id = crypto.randomUUID();
  const record = { id, ime, prezime, attendance, guests, message, createdAt: new Date(ts).toISOString() };

  await env.PHOTOS.put(newKey('rsvp'), JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      ime, prezime, attendance, guests: String(guests), ts: String(ts),
    },
  });

  return json({ ok: true, id }, 200, corsHeaders);
}

async function listRsvp(req, env, corsHeaders) {
  const token = req.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return json({ message: 'Неовластено.' }, 401, corsHeaders);
  }

  const out = await env.PHOTOS.list({ prefix: 'rsvp/', limit: 1000, include: ['customMetadata'] });
  const rows = out.objects
    .map((o) => {
      const m = o.customMetadata || {};
      return {
        id: o.key.slice('rsvp/'.length).replace(/\.json$/, ''),
        ime: m.ime || '', prezime: m.prezime || '',
        attendance: m.attendance || '', guests: Number(m.guests) || 0,
        ts: Number(m.ts) || 0,
      };
    })
    .sort((a, b) => b.ts - a.ts);

  const yes = rows.filter((r) => r.attendance === 'yes');
  return json({
    total: rows.length,
    coming: yes.length,
    declined: rows.filter((r) => r.attendance === 'no').length,
    headcount: yes.reduce((n, r) => n + r.guests, 0),
    rows,
  }, 200, corsHeaders);
}

async function listWishes(env, corsHeaders) {
  const out = await env.PHOTOS.list({ prefix: 'wishes/', limit: 200, include: ['customMetadata'] });
  const wishes = out.objects
    .map((o) => {
      const m = o.customMetadata || {};
      return {
        id: o.key.slice('wishes/'.length).replace(/\.json$/, ''),
        name: m.name || '',
        message: m.message || '',
        createdAt: new Date(Number(m.ts) || Date.now()).toISOString(),
      };
    })
    .filter((w) => w.message)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return json(wishes, 200, corsHeaders);
}

async function postWish(req, env, corsHeaders) {
  if (throttled(req)) return json({ message: 'Премногу обиди. Обидете се подоцна.' }, 429, corsHeaders);

  const body = await readJson(req);
  if (!body) return json({ message: 'Очекуван JSON.' }, 400, corsHeaders);

  const name = clean(body.name, MAX_IME);
  const message = clean(body.message, MAX_WISH);
  if (!name) return json({ message: 'Внесете го Вашето име.' }, 400, corsHeaders);
  if (!message) return json({ message: 'Напишете желба.' }, 400, corsHeaders);

  const ts = Date.now();
  const id = crypto.randomUUID();

  await env.PHOTOS.put(newKey('wishes'), JSON.stringify({ id, name, message }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { name, message, ts: String(ts) },
  });

  return json({ id, name, message, createdAt: new Date(ts).toISOString() }, 201, corsHeaders);
}

/* ---------- entry ---------- */

export default {
  async fetch(req, env) {
    const corsHeaders = cors(req, env);
    const { pathname } = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    try {
      if (pathname === '/api/health') {
        return json({ ok: true, service: 'wedding-invite', routes: ['/api/rsvp', '/api/wishes', '/api/photos'] }, 200, corsHeaders);
      }
      if (pathname === '/api/rsvp' && req.method === 'POST') return await postRsvp(req, env, corsHeaders);
      if (pathname === '/api/rsvp' && req.method === 'GET') return await listRsvp(req, env, corsHeaders);
      if (pathname === '/api/wishes' && req.method === 'GET') return await listWishes(env, corsHeaders);
      if (pathname === '/api/wishes' && req.method === 'POST') return await postWish(req, env, corsHeaders);

      if (pathname === '/api/photos' && req.method === 'POST') return await upload(req, env, corsHeaders);
      if (pathname === '/api/photos' && req.method === 'GET') return await list(req, env, corsHeaders);

      const del = pathname.match(/^\/api\/photos\/([^/]+)$/);
      if (del && req.method === 'DELETE') return await remove(req, env, corsHeaders, del[1]);

      const img = pathname.match(/^\/i\/(full|grid)\/[^/]+\.jpg$/);
      if (img && (req.method === 'GET' || req.method === 'HEAD')) {
        return await serveImage(env, pathname.slice('/i/'.length), corsHeaders);
      }

      return json({ error: 'not_found' }, 404, corsHeaders);
    } catch (err) {
      return json({ error: 'server_error', detail: String(err && err.message) }, 500, corsHeaders);
    }
  },
};
