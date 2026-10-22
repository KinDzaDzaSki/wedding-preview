/* ============================================================
   Свадбена галерија — page logic
   Uploads are resized in the browser before they leave the phone:
   a phone photo is 3-8 MB, and 300 guests would otherwise mean tens
   of GB. Two variants per photo, both from one decode:
     grid  800px  ~80 KB   (tiles)
     full 1600px  ~400 KB  (lightbox + download)
   ============================================================ */

const CONFIG = {
  /* Point this at your deployed Worker, e.g.
     'https://wedding-gallery.YOUR-SUBDOMAIN.workers.dev'
     Leave empty to run against the same origin as this page. */
  apiBase: '',
  /* This page's own public URL — used only for the share/QR text. */
  siteUrl: 'https://wedding-gallery.pages.dev',
  couple: { names: 'Ружица и Дамјан', date: '15 мај 2027' },
  pageSize: 60,
  gridEdge: 800,
  fullEdge: 1600,
};

/* ?api=… overrides the base, so the page can be tested against a local Worker */
const QS = new URLSearchParams(location.search);
if (QS.get('api') !== null) CONFIG.apiBase = QS.get('api');
const API = String(CONFIG.apiBase || '').replace(/\/+$/, '');
/* Idempotent: paths get the API base, absolute URLs pass through untouched.
   (Prefixing twice silently produced http://hosthttp://host/… — always make
   the join safe rather than trusting call sites to remember.) */
const url = (p) => (/^https?:\/\//i.test(p) ? p : (API ? API + p : p));

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const T = {
  choosePhotos: 'Изберете фотографии',
  uploading: 'Прикачување…',
  uploadFailed: 'Прикачувањето не успеа. Обидете се повторно.',
  downloadFailed: 'Преземањето не успеа.',
  needName: 'Внесете го вашето име за да ги прикачите фотографиите.',
  loadFailed: 'Галеријата не може да се вчита. Обидете се повторно.',
  notConfigured: 'Галеријата сè уште не е поврзана со серверот.',
  notAnImage: 'Овој формат не е поддржан.',
  removeConfirm: 'Да се отстрани оваа фотографија?',
  removed: 'Фотографијата е отстранета.',
  uploaded: (n) => (n === 1 ? 'Фотографијата е прикачена.' : `${n} фотографии се прикачени.`),
  badFormat: (n) => `${n} не е поддржан формат.`,
};

/* ---------- local state ---------- */
const LS_NAME = 'wedding.gallery.name';
const LS_MINE = 'wedding.gallery.mine'; // { [photoId]: deleteToken }

const store = {
  get name() { try { return localStorage.getItem(LS_NAME) || ''; } catch { return ''; } },
  set name(v) { try { localStorage.setItem(LS_NAME, v); } catch {} },
  get mine() { try { return JSON.parse(localStorage.getItem(LS_MINE) || '{}'); } catch { return {}; } },
  own(id, token) { try { const m = this.mine; m[id] = token; localStorage.setItem(LS_MINE, JSON.stringify(m)); } catch {} },
  tokenFor(id) { return this.mine[id] || ''; },
  forget(id) { try { const m = this.mine; delete m[id]; localStorage.setItem(LS_MINE, JSON.stringify(m)); } catch {} },
};

let state = { photos: [], cursor: null, filter: '', guest: '', lightboxIdx: -1 };

/* ---------- toasts ---------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' toast--' + kind : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 360); }, 3400);
}

/* ---------- image resize (EXIF-correct) ---------- */
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      // 'from-image' respects EXIF orientation, so portrait phone photos
      // are not uploaded sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode'));
    i.src = URL.createObjectURL(file);
  });
  return img;
}

async function scaleTo(src, maxEdge, quality) {
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));

  if (typeof OffscreenCanvas === 'function') {
    const cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return { blob: await cv.convertToBlob({ type: 'image/jpeg', quality }), w, h };
  }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
  return { blob, w, h };
}

async function variants(file) {
  const src = await decode(file);
  try {
    const grid = await scaleTo(src, CONFIG.gridEdge, 0.8);
    const full = await scaleTo(src, CONFIG.fullEdge, 0.82);
    return { grid, full };
  } finally {
    if (src && typeof src.close === 'function') src.close();
  }
}

/* ---------- upload ---------- */
let busy = 0;

function queueRow(file) {
  const li = document.createElement('li');
  li.innerHTML =
    `<span class="q__thumb"></span>
     <span class="q__name"><b></b><span class="q__bar"><i></i></span></span>
     <span class="q__state">${T.uploading}</span>`;
  $('.q__name b', li).textContent = file.name || 'фотографија';
  $('#queue').appendChild(li);
  return li;
}

function put(li, file, grid, full, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('grid', grid.blob, 'grid.jpg');
    fd.append('full', full.blob, 'full.jpg');
    fd.append('guest', store.name);
    fd.append('caption', '');
    fd.append('w', String(full.w));
    fd.append('h', String(full.h));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url('/api/photos'));
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body.error || 'http'), { status: xhr.status, body }));
    });
    xhr.addEventListener('error', () => reject(new Error('network')));
    xhr.send(fd);
  });
}

async function handleFiles(files) {
  const list = [...files].filter((f) => /^image\//.test(f.type));
  const skipped = files.length - list.length;
  if (!list.length) { toast(T.notAnImage, 'err'); return; }
  if (!store.name.trim()) {
    $('#guestName').focus();
    toast(T.needName, 'err');
    return;
  }

  $('#dropZone').classList.add('is-busy');
  let done = 0, failed = 0;

  for (const file of list) {
    const li = queueRow(file);
    const bar = $('.q__bar i', li);
    const st = $('.q__state', li);
    try {
      const v = await variants(file);
      // show a local preview so the guest sees what they picked
      const thumb = $('.q__thumb', li);
      const tu = URL.createObjectURL(v.grid.blob);
      thumb.style.backgroundImage = `url(${tu})`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
      thumb.addEventListener('animationend', () => URL.revokeObjectURL(tu), { once: true });

      bar.style.width = '35%';
      const res = await put(li, file, v.grid, v.full, (p) => { bar.style.width = (35 + p * 65) + '%'; });
      if (res.deleteToken) store.own(res.id, res.deleteToken);
      bar.style.width = '100%';
      li.classList.add('is-ok');
      st.textContent = 'Готово';
      done++;
      setTimeout(() => li.remove(), 1600);
    } catch (err) {
      failed++;
      li.classList.add('is-err');
      st.textContent = 'Не успеа';
      if (err && err.status === 413) st.textContent = 'Преголема';
      else if (err && err.status === 415) st.textContent = 'Формат';
    }
  }

  $('#dropZone').classList.remove('is-busy');
  if (done) toast(T.uploaded(done), 'ok');
  if (failed) toast(T.uploadFailed, 'err');
  if (skipped) toast(T.badFormat(skipped), 'err');
  await load(true);
}

/* ---------- render ---------- */
function tile(p) {
  const b = document.createElement('button');
  b.className = 'tile';
  b.type = 'button';
  b.dataset.id = p.id;
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = p.guest ? `Фотографија од ${p.guest}` : 'Свадбена фотографија';
  img.src = p.thumb;
  img.addEventListener('load', () => img.setAttribute('data-loaded', ''), { once: true });
  b.appendChild(img);
  if (p.guest) {
    const who = document.createElement('span');
    who.className = 'tile__who';
    who.textContent = p.guest;
    b.appendChild(who);
  }
  if (store.tokenFor(p.id)) {
    const mine = document.createElement('span');
    mine.className = 'tile__mine';
    mine.title = 'Ваша фотографија';
    mine.textContent = '✓';
    b.appendChild(mine);
  }
  return b;
}

function visible() {
  const f = state.filter.trim().toLowerCase();
  const g = state.guest.toLowerCase();
  return state.photos.filter((p) => {
    if (g && (p.guest || '').toLowerCase() !== g) return false;
    if (f && !(p.guest || '').toLowerCase().includes(f)) return false;
    return true;
  });
}

function render() {
  const grid = $('#grid');
  const list = visible();
  const first = grid.childElementCount === 0;
  grid.textContent = '';
  const frag = document.createDocumentFragment();
  list.slice(0, state.shown || CONFIG.pageSize).forEach((p) => frag.appendChild(tile(p)));
  grid.appendChild(frag);
  $('#empty').hidden = list.length > 0;
  $('#moreBtn').hidden = list.length <= (state.shown || CONFIG.pageSize);
  if (first) grid.style.animation = 'none';
}

function renderChips() {
  const box = $('#guestChips');
  const names = [...new Set(state.photos.map((p) => p.guest).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'mk'));
  box.hidden = names.length < 2;
  box.textContent = '';
  const mk = (label, value, count) => {
    const c = document.createElement('button');
    c.className = 'chip' + (state.guest === value ? ' is-on' : '');
    c.type = 'button';
    c.textContent = label;
    if (count != null) {
      const i = document.createElement('i');
      i.textContent = count;
      c.appendChild(i);
    }
    c.addEventListener('click', () => { state.guest = value; state.shown = CONFIG.pageSize; renderChips(); render(); });
    return c;
  };
  box.appendChild(mk('Сите', ''));
  names.forEach((n) => box.appendChild(mk(n, n, state.photos.filter((p) => p.guest === n).length)));
}

/* ---------- data ---------- */
async function load(reset = false) {
  try {
    const r = await fetch(url('/api/photos?limit=1000'), { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json();
    state.photos = (d.photos || []).map((p) => ({ ...p, thumb: url(p.thumb), url: url(p.url) }));
    state.cursor = d.cursor || null;
    $('#photoCount').textContent = state.photos.length
      ? `${state.photos.length} ${state.photos.length === 1 ? 'фотографија' : 'фотографии'}`
      : 'нема';
    if (reset) state.shown = CONFIG.pageSize;
    renderChips();
    render();
    return true;
  } catch (err) {
    $('#photoCount').textContent = '—';
    $('#empty').hidden = false;
    $('#empty').querySelector('h3').textContent = T.notConfigured;
    $('#empty').querySelector('p').textContent =
      API ? T.loadFailed : 'Поставете CONFIG.apiBase во gallery.js на адресата на Worker-от.';
    return false;
  }
}

/* ---------- lightbox ---------- */
function openLb(p) {
  const list = visible();
  state.lightboxIdx = list.findIndex((x) => x.id === p.id);
  const lb = $('#lightbox');
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  paint();
}

function paint() {
  const list = visible();
  const p = list[state.lightboxIdx];
  if (!p) return closeLb();
  const img = $('#lbImg');
  $('#lbSpin').hidden = false;
  img.style.opacity = '0';
  img.src = p.url;
  img.alt = p.guest ? `Фотографија од ${p.guest}` : 'Свадбена фотографија';
  img.onload = () => { $('#lbSpin').hidden = true; img.style.opacity = '1'; img.style.transition = 'opacity .35s'; };
  img.onerror = () => { $('#lbSpin').hidden = true; toast(T.downloadFailed, 'err'); };
  $('#lbGuest').textContent = p.guest || 'Гостин';
  $('#lbCaption').textContent = p.caption || '';
  $('#lbDownload').href = p.url;
  $('#lbDownload').setAttribute('download', `ruzica-damjan-${p.id.slice(0, 8)}.jpg`);
  $('#lbRemove').hidden = !store.tokenFor(p.id);
  $('#lbPrev').hidden = state.lightboxIdx <= 0;
  $('#lbNext').hidden = state.lightboxIdx >= list.length - 1;
}

function closeLb() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
  $('#lbImg').removeAttribute('src');
}

const step = (d) => {
  const list = visible();
  const n = state.lightboxIdx + d;
  if (n >= 0 && n < list.length) { state.lightboxIdx = n; paint(); }
};

/* ---------- download (streams the blob so the filename sticks) ---------- */
async function download() {
  const list = visible();
  const p = list[state.lightboxIdx];
  if (!p) return;
  try {
    const r = await fetch(p.url);
    if (!r.ok) throw new Error('http');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ruzica-damjan-${p.id.slice(0, 8)}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    toast(T.downloadFailed, 'err');
  }
}

async function removeCurrent() {
  const list = visible();
  const p = list[state.lightboxIdx];
  if (!p) return;
  if (!confirm(T.removeConfirm)) return;
  const token = store.tokenFor(p.id);
  if (!token) return;
  try {
    const r = await fetch(url('/api/photos/' + p.id), {
      method: 'DELETE',
      headers: { 'x-delete-token': token },
    });
    if (!r.ok) throw new Error('http ' + r.status);
    store.forget(p.id);
    toast(T.removed, 'ok');
    closeLb();
    await load(true);
  } catch {
    toast(T.uploadFailed, 'err');
  }
}

/* ---------- wire up ---------- */
function init() {
  const dz = $('#dropZone');
  const fi = $('#fileInput');
  const name = $('#guestName');

  $('#coupleNames').textContent = CONFIG.couple.names;
  $('#coupleDate').textContent = CONFIG.couple.date;
  $('#footYear').textContent = new Date().getFullYear();
  document.title = `Галерија со фотографии — ${CONFIG.couple.names}`;
  name.value = store.name;

  name.addEventListener('input', () => { store.name = name.value.trim(); });

  $('#pickBtn').addEventListener('click', () => fi.click());
  dz.addEventListener('click', (e) => { if (e.target === dz) fi.click(); });
  fi.addEventListener('change', () => { handleFiles(fi.files); fi.value = ''; });

  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-drag'); }));
  dz.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });

  $('#grid').addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b) return;
    const p = state.photos.find((x) => x.id === b.dataset.id);
    if (p) openLb(p);
  });

  $('#moreBtn').addEventListener('click', () => {
    state.shown = (state.shown || CONFIG.pageSize) + CONFIG.pageSize;
    render();
  });

  $('#filterInput').addEventListener('input', (e) => {
    state.filter = e.target.value;
    state.shown = CONFIG.pageSize;
    render();
  });

  $('#refreshBtn').addEventListener('click', async () => {
    toast('Освежување…');
    await load(true);
  });

  $('#lbClose').addEventListener('click', closeLb);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLb(); });
  $('#lbPrev').addEventListener('click', () => step(-1));
  $('#lbNext').addEventListener('click', () => step(1));
  $('#lbDownload').addEventListener('click', (e) => { e.preventDefault(); download(); });
  $('#lbRemove').addEventListener('click', removeCurrent);

  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // swipe
  let x0 = null;
  const lb = $('#lightbox');
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 55) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });

  load(true);
  // keep the wall fresh while guests are uploading
  setInterval(() => { if (!$('#lightbox').hidden || document.hidden) return; load(false); }, 45000);
}

document.addEventListener('DOMContentLoaded', init);
