/* ==========================================================================
   Ружица & Дамјан — свадбена покана
   Vanilla JS. No dependencies. Everything below a CONFIG block is generic.
   ========================================================================== */
(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
     CONFIG — change these per event
     ══════════════════════════════════════════════════════════════════════ */
  const CONFIG = {
    // 15 May 2027, 16:00 Europe/Skopje (built from local parts so DST is handled)
    eventStart: new Date(2027, 4, 15, 16, 0, 0),
    ics: {
      title: 'Ружица & Дамјан — свадба',
      location: 'Соборен храм Св. Климент Охридски, Скопје',
      description: 'Венчавка 16:00 · Свадбена прослава 19:30, Ресторан Александрија, Скопје',
      end: new Date(2027, 4, 16, 2, 0, 0)
    },
    // RSVP: set `endpoint` to a Formspree / Netlify / Worker URL to go live.
    // Left empty, the form validates and plays the success state locally (DEMO).
    rsvpEndpoint: '',
    musicVolume: 0.42
  };

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ══════════════════════════════════════════════════════════════════════
     1. PAGE DECK — next / prev / wheel / swipe / keyboard / dots
     ══════════════════════════════════════════════════════════════════════ */
  const pages    = $$('#deck .page');
  const total    = pages.length;
  const dotsHost = $('[data-dots]');
  const bar      = $('[data-progress]');
  const nowEl    = $('[data-page-now]');
  const totalEl  = $('[data-page-total]');
  const prevBtn  = $('[data-nav="prev"]');
  const nextBtn  = $('[data-nav="next"]');
  const DARK     = new Set(['4', '8']);          // dark ("forest") pages

  let current = 1;
  let locked  = false;

  if (totalEl) totalEl.textContent = total;

  // build dots
  pages.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dot';
    b.setAttribute('aria-label', `Страница ${i + 1}`);
    b.addEventListener('click', () => goTo(i + 1));
    dotsHost && dotsHost.appendChild(b);
  });
  const dots = $$('.dot', dotsHost || document);

  function activate(n) {
    const page = pages[n - 1];
    if (!page) return;
    current = n;

    pages.forEach((p, i) => {
      p.classList.toggle('is-active', i === n - 1);
      if (i !== n - 1) { p.classList.remove('is-leaving'); p.setAttribute('aria-hidden', 'true'); }
      else { p.removeAttribute('aria-hidden'); }
    });

    document.body.classList.toggle('on-dark', DARK.has(String(n)));
    document.body.classList.toggle('is-cover', n === 1);

    dots.forEach((d, i) => d.setAttribute('aria-current', i === n - 1 ? 'true' : 'false'));
    if (bar)  bar.style.width = ((n - 1) / (total - 1) * 100) + '%';
    if (nowEl) nowEl.textContent = n;
    if (prevBtn) prevBtn.disabled = n === 1;
    if (nextBtn) nextBtn.disabled = n === total;

    revealIn(page, n);

    const scroller = $('.wrap', page);
    if (scroller) scroller.scrollTop = 0;

    syncHash(n);
  }

  function goTo(n, dir) {
    if (locked || n < 1 || n > total || n === current) return;
    const leaving = pages[current - 1];
    const to = n > current ? 'next' : 'prev';
    locked = true;

    leaving.setAttribute('data-dir', to);
    if (!REDUCED) {
      leaving.classList.add('is-leaving');
      setTimeout(() => { leaving.classList.remove('is-leaving'); activate(n); locked = false; }, 330);
    } else {
      activate(n);
      locked = false;
    }
  }
  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  window.goTo = goTo;
  window.next = next;
  window.prev = prev;

  /* ── deep links: #p1 … #p9 (or #rsvp, #програма…) — shareable per section ── */
  const HASH = {
    cover: 1, date: 2, datum: 2, story: 2 + 1, prikazna: 3, details: 4,
    detali: 4, program: 5, programa: 5, dresscode: 6, dreskod: 6,
    gallery: 7, galerija: 7, rsvp: 8, potvrda: 8, thanks: 9, blagodarime: 9
  };
  function pageFromHash() {
    const h = decodeURIComponent((location.hash || '').replace(/^#/, '')).toLowerCase().trim();
    if (!h) return 0;
    const m = h.match(/^p?(\d)$/);
    if (m) return Math.min(total, Math.max(1, +m[1]));
    return HASH[h] || 0;
  }
  function syncHash(n) {
    if (history.replaceState) history.replaceState(null, '', '#p' + n);
    else location.hash = 'p' + n;
  }

  // arrow buttons
  prevBtn && prevBtn.addEventListener('click', prev);
  nextBtn && nextBtn.addEventListener('click', next);
  $$('[data-nav="next"]:not(.nav-arrow), [data-action="next"]').forEach(b =>
    b.addEventListener('click', next));
  $$('[data-nav="first"]').forEach(b => b.addEventListener('click', () => goTo(1)));

  /* ── wheel: advance only at the scroll boundary ── */
  let wheelAcc = 0, wheelLock = 0;
  window.addEventListener('wheel', (e) => {
    const page = pages[current - 1];
    const sc = $('.wrap', page);
    if (sc) {
      const atTop    = sc.scrollTop <= 1;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
      const canScroll = sc.scrollHeight > sc.clientHeight + 2;
      if (canScroll && ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop))) return;
    }
    const now = Date.now();
    if (now - wheelLock < 780) { e.preventDefault(); return; }
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 42) {
      const dir = wheelAcc > 0 ? next : prev;
      wheelAcc = 0; wheelLock = now;
      e.preventDefault();
      dir();
    }
  }, { passive: false });

  /* ── touch swipe ── */
  let ty0 = 0, tx0 = 0, tracking = false;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    ty0 = e.touches[0].clientY; tx0 = e.touches[0].clientX; tracking = true;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dy = t.clientY - ty0, dx = t.clientX - tx0;
    if (Math.abs(dy) < 58 || Math.abs(dy) < Math.abs(dx)) return;   // ignore horizontal
    const page = pages[current - 1];
    const sc = $('.wrap', page);
    if (sc) {
      const atTop    = sc.scrollTop <= 1;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
      const canScroll = sc.scrollHeight > sc.clientHeight + 2;
      if (canScroll && ((dy < 0 && !atBottom) || (dy > 0 && !atTop))) return;
    }
    dy < 0 ? next() : prev();
  }, { passive: true });

  /* ── keyboard ── */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    switch (e.key) {
      case 'ArrowDown': case 'PageDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowUp':   case 'PageUp':            e.preventDefault(); prev(); break;
      case 'ArrowRight': e.preventDefault(); next(); break;
      case 'ArrowLeft':  e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); goTo(1); break;
      case 'End':  e.preventDefault(); goTo(total); break;
      case 'Escape': closeLightbox(); break;
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     2. REVEAL ON SCROLL (first visit per page only)
     ══════════════════════════════════════════════════════════════════════ */
  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { threshold: 0.10, rootMargin: '0px 0px -5% 0px' })
    : null;

  const visited = new Set();

  function revealIn(page, n) {
    const items = $$('.reveal', page);
    if (visited.has(n)) { items.forEach(el => el.classList.add('is-visible')); return; }
    visited.add(n);
    if (REDUCED || !io) { items.forEach(el => el.classList.add('is-visible')); return; }
    requestAnimationFrame(() => items.forEach(el => io.observe(el)));
    // safety net: content must never stay invisible. If an element is skipped
    // (fast scroll, jump-to-anchor, scrollbar drag) it still becomes visible.
    setTimeout(() => items.forEach(el => el.classList.add('is-visible')), 2600);
  }

  /* ══════════════════════════════════════════════════════════════════════
     3. WAX-SEAL ENVELOPE
     ══════════════════════════════════════════════════════════════════════ */
  const envelope = $('[data-envelope]');
  const interior = $('[data-interior]');
  const trigger  = $('[data-env-trigger]');
  let opened = false;

  function openEnvelope() {
    if (opened || !envelope) return;
    opened = true;
    envelope.classList.add('is-open');
    trigger && trigger.setAttribute('aria-expanded', 'true');
    startMusic();                       // this tap is the autoplay permission
    const wait = REDUCED ? 40 : 820;
    setTimeout(() => {
      if (interior) {
        interior.removeAttribute('inert');
        interior.setAttribute('aria-hidden', 'false');
        interior.classList.add('is-revealed');
      }
      setTimeout(() => envelope.classList.add('is-gone'), REDUCED ? 0 : 700);
    }, wait);
  }
  trigger && trigger.addEventListener('click', (e) => { e.currentTarget.blur(); openEnvelope(); });

  /* ══════════════════════════════════════════════════════════════════════
     4. BACKGROUND MUSIC
     ══════════════════════════════════════════════════════════════════════ */
  const audio = $('#bg-music');
  const musicBtn = $('#music-toggle');
  let fading = null;

  function fadeTo(target, ms = 1400) {
    if (!audio) return;
    if (fading) cancelAnimationFrame(fading);
    const from = audio.volume, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * p));
      if (p < 1) fading = requestAnimationFrame(step);
    };
    fading = requestAnimationFrame(step);
  }

  function startMusic() {
    if (!audio) return;
    if (audio.preload === 'none') audio.preload = 'auto';
    audio.volume = 0;
    audio.play().then(() => {
      fadeTo(CONFIG.musicVolume, 2200);
      musicBtn && musicBtn.setAttribute('aria-pressed', 'true');
      musicBtn && musicBtn.setAttribute('aria-label', 'Паузирај музика во позадина');
    }).catch(() => { /* blocked or no file — the toggle still works */ });
  }

  function stopMusic() {
    fadeTo(0, 700);
    setTimeout(() => audio && audio.pause(), 720);
    musicBtn && musicBtn.setAttribute('aria-pressed', 'false');
    musicBtn && musicBtn.setAttribute('aria-label', 'Пушти музика во позадина');
  }

  musicBtn && musicBtn.addEventListener('click', () => {
    if (!audio) return;
    if (audio.paused) {
      if (audio.preload === 'none') audio.preload = 'auto';
      audio.play().then(() => { fadeTo(CONFIG.musicVolume, 900);
        musicBtn.setAttribute('aria-pressed', 'true');
        musicBtn.setAttribute('aria-label', 'Паузирај музика во позадина');
      }).catch(() => {});
    } else {
      stopMusic();
    }
  });

  // pause the loop when the tab is hidden (considerate, and saves battery)
  document.addEventListener('visibilitychange', () => {
    if (!audio || audio.paused) return;
    if (document.hidden) audio.pause();
    else audio.play().catch(() => {});
  });

  /* ══════════════════════════════════════════════════════════════════════
     5. COUNTDOWN  (Macedonian pluralisation)
     ══════════════════════════════════════════════════════════════════════ */
  // MK: 1 ден · 2 дена · 5 дена — anything other than exactly 1 takes the plural.
  const daysWord = n => (n === 1 ? 'Ден' : 'Дена');
  const pad = n => String(n).padStart(2, '0');

  const cd = {
    days: $('[data-cd-days]'), hours: $('[data-cd-hours]'),
    mins: $('[data-cd-mins]'), secs: $('[data-cd-secs]'),
    daysLabel: $('[data-cd-days-label]')
  };

  function tickCountdown() {
    if (!cd.days) return;
    const s = Math.max(0, Math.floor((CONFIG.eventStart.getTime() - Date.now()) / 1000));
    const d = Math.floor(s / 86400);
    if (cd.days) cd.days.textContent = pad(d);
    if (cd.hours) cd.hours.textContent = pad(Math.floor(s % 86400 / 3600));
    if (cd.mins) cd.mins.textContent = pad(Math.floor(s % 3600 / 60));
    if (cd.secs) cd.secs.textContent = pad(s % 60);
    if (cd.daysLabel) cd.daysLabel.textContent = daysWord(d);
  }

  /* ══════════════════════════════════════════════════════════════════════
     6. ADD TO CALENDAR (.ics, generated in the browser)
     ══════════════════════════════════════════════════════════════════════ */
  const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

  function downloadIcs() {
    const { title, description, location, end } = CONFIG.ics;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//poraka//RuzicaDamjan//MK',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:ruzica-damjan-2027@invitation`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(CONFIG.eventStart)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEsc(title)}`,
      `DESCRIPTION:${icsEsc(description)}`,
      `LOCATION:${icsEsc(location)}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
      `DESCRIPTION:${icsEsc('Утре е големиот ден!')}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'ruzica-damjan-15-05-2027.ics' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  $$('[data-ics]').forEach(b => b.addEventListener('click', downloadIcs));

  /* ══════════════════════════════════════════════════════════════════════
     7. GALLERY LIGHTBOX
     ══════════════════════════════════════════════════════════════════════ */
  const lb = $('[data-lightbox-box]');
  const lbImg = $('[data-lb-img]');
  const lbCap = $('[data-lb-cap]');
  let lastFocus = null;

  function openLightbox(src, caption) {
    if (!lb) return;
    lastFocus = document.activeElement;
    lbImg.src = src;
    lbImg.alt = caption || '';
    lbCap.textContent = caption || '';
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-lb-close]') && $('[data-lb-close]').focus();
  }
  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    lbImg.src = '';
    document.body.style.overflow = '';
    lastFocus && lastFocus.focus();
  }

  $$('[data-lightbox]').forEach(btn => {
    btn.addEventListener('click', () => openLightbox(btn.getAttribute('data-lightbox'), btn.getAttribute('data-caption')));
  });
  $('[data-lb-close]') && $('[data-lb-close]').addEventListener('click', closeLightbox);
  lb && lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });

  /* ══════════════════════════════════════════════════════════════════════
     8. CONFETTI (tiny canvas particle system, palette-matched)
     ══════════════════════════════════════════════════════════════════════ */
  const canvas = $('[data-confetti]');
  let ctx = null, particles = [], raf = null;

  function sizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', sizeCanvas);

  function burst(count = 110) {
    if (!canvas || REDUCED) return;
    if (!ctx) sizeCanvas();
    const colors = ['#c96f80', '#a85566', '#b8905a', '#e8bfc8', '#ecdcc0', '#5c2a38', '#fffdfb'];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: innerWidth * (0.5 + (Math.random() - 0.5) * 0.5),
        y: innerHeight * 0.42 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -12 - 3.5,
        g: 0.24 + Math.random() * 0.14,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.22,
        c: colors[(Math.random() * colors.length) | 0],
        life: 1
      });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }

  function step() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0 && p.y < innerHeight + 80);
    particles.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.995;
      p.rot += p.vr; p.life -= 0.0042;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (particles.length) raf = requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); raf = null; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     9. RSVP FORM
     ══════════════════════════════════════════════════════════════════════ */
  const form = $('.rsvp');
  const guestsField = $('[data-guests-field]');
  const msgEl = $('[data-form-msg]');

  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'form-msg' + (kind ? ' is-' + kind : '');
  }

  function syncGuests() {
    if (!form || !guestsField) return;
    const v = (form.querySelector('input[name="attending"]:checked') || {}).value;
    guestsField.classList.toggle('is-hidden', v !== 'yes');
  }

  form && form.addEventListener('change', syncGuests);
  syncGuests();

  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (!String(data.name || '').trim()) {
      setMsg('Името и презимето се задолжителни.', 'error');
      $('#r-name') && $('#r-name').focus();
      return;
    }
    if (!data.attending) {
      setMsg('Те молам дали ќе присуствувате — избери една опција.', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Се испраќа...';
    setMsg('', '');

    try {
      if (CONFIG.rsvpEndpoint) {
        const res = await fetch(CONFIG.rsvpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } else {
        await new Promise(r => setTimeout(r, 850));   // DEMO — no endpoint configured
        console.info('[RSVP demo]', data);
      }
      setMsg(data.attending === 'yes'
        ? 'Успешно испратено! Се гледаме на 15 мај 2027. 🎉'
        : 'Ти благодариме за одговорот — ќе ни недостигаш. 🤍', 'ok');
      form.reset();
      syncGuests();
      if (data.attending === 'yes') burst(130);
    } catch (err) {
      setMsg('Грешка при испраќање. Обиди се повторно.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     10. BOOT
     ══════════════════════════════════════════════════════════════════════ */
  sizeCanvas();
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // deep link: open straight to a section (and skip the envelope ritual)
  const startPage = pageFromHash() || 1;
  if (startPage > 1) {
    opened = true;
    envelope && envelope.classList.add('is-open', 'is-gone');
    if (interior) {
      interior.removeAttribute('inert');
      interior.setAttribute('aria-hidden', 'false');
      interior.classList.add('is-revealed');
    }
  }
  activate(startPage);

  window.addEventListener('hashchange', () => {
    const n = pageFromHash();
    if (n && n !== current) { locked = false; activate(n); }
  });

  // preload the album art so the gallery never flashes
  window.addEventListener('load', () => {
    ['assets/art-1.svg', 'assets/art-3.svg'].forEach(s => { const i = new Image(); i.src = s; });
  });
})();
