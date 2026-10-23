/* ==========================================================================
   Ружица & Дамјан — покана (v4)
   Скрол-страница: одбројување, мени, reveal при скрол, честитки, RSVP, музика.
   Без зависности — сè е вградено.
   ========================================================================== */

(() => {
  'use strict';

  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const API_BASE = String(window.WEDDING_API || '').replace(/\/+$/, '');
  const apiUrl = (path) => (API_BASE ? API_BASE + path : '');
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------------------------------------------------------- мени */
  const menu = document.querySelector('[data-menu]');
  const menuOpen = document.querySelector('[data-menu-open]');
  const menuClose = document.querySelector('[data-menu-close]');

  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuOpen?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) menuClose?.focus({ preventScroll: true });
  }

  menuOpen?.addEventListener('click', () => setMenu(true));
  menuClose?.addEventListener('click', () => setMenu(false));
  menu?.querySelectorAll('[data-menu-link]').forEach((link) =>
    link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  /* ---------------------------------------------------------------- топбар */
  const topbar = document.querySelector('[data-topbar]');
  const onScroll = () => {
    topbar?.classList.toggle('is-stuck', window.scrollY > 12);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------- reveal */
  const reveals = [...document.querySelectorAll('.reveal')];

  if (motionReduced || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    reveals.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------- одбројување */
  const countdown = document.querySelector('[data-countdown]');

  if (countdown) {
    const target = new Date(countdown.dataset.weddingDate);
    const daysEl = countdown.querySelector('[data-days]');
    const hoursEl = countdown.querySelector('[data-hours]');
    const minutesEl = countdown.querySelector('[data-minutes]');
    const secondsEl = countdown.querySelector('[data-seconds]');
    const summary = document.querySelector('[data-countdown-summary]');

    const daysWord = (n) => (n === 1 ? 'ден' : 'дена');
    let lastDays = null;

    const tick = () => {
      const diff = Math.max(0, target.getTime() - Date.now());
      const day = 86400000;
      const hour = 3600000;
      const minute = 60000;

      const days = Math.floor(diff / day);
      const hours = Math.floor((diff % day) / hour);
      const minutes = Math.floor((diff % hour) / minute);
      const seconds = Math.floor((diff % minute) / 1000);

      if (daysEl) daysEl.textContent = pad(days);
      if (hoursEl) hoursEl.textContent = pad(hours);
      if (minutesEl) minutesEl.textContent = pad(minutes);
      if (secondsEl) secondsEl.textContent = pad(seconds);

      if (summary && days !== lastDays) {
        lastDays = days;
        summary.textContent = diff === 0
          ? 'Денот е тука.'
          : `Остануваат уште ${days} ${daysWord(days)} до 15 мај 2027.`;
      }
    };

    tick();
    window.setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------------- конфети */
  function confettiBurst(count = 80) {
    if (motionReduced) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const colors = ['#b08d57', '#d9c29a', '#5d2231', '#c98a92', '#faf6ef'];
    const parts = Array.from({ length: count }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 140,
      y: window.innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 9 - 3,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const started = performance.now();

    const frame = (now) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of parts) {
        p.vy += 0.22;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;

        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 2300);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (elapsed < 2300) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    };

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- RSVP */
  const rsvpForm = document.querySelector('[data-rsvp-form]');

  if (rsvpForm) {
    const messageEl = rsvpForm.querySelector('[data-form-message]');
    const imeEl = rsvpForm.querySelector('[name="ime"]');
    const prezimeEl = rsvpForm.querySelector('[name="prezime"]');
    const attendanceEl = rsvpForm.querySelector('[name="attendance"]');
    const guestsEl = rsvpForm.querySelector('[name="guests"]');
    const noteEl = rsvpForm.querySelector('[name="message"]');
    const guestsGroup = rsvpForm.querySelector('[data-guests-group]');
    const submit = rsvpForm.querySelector('[type="submit"]');

    const setMessage = (text, isError = false) => {
      if (!messageEl) return;
      messageEl.textContent = text;
      messageEl.classList.toggle('is-error', isError);
    };

    const syncGuests = () => {
      if (guestsGroup && attendanceEl) guestsGroup.hidden = attendanceEl.value === 'no';
    };

    rsvpForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const ime = (imeEl?.value || '').trim();
      const prezime = (prezimeEl?.value || '').trim();
      const attendance = attendanceEl?.value || '';
      const guests = guestsEl?.value || '1';
      const message = (noteEl?.value || '').trim();

      if (!ime) {
        imeEl?.setAttribute('aria-invalid', 'true');
        imeEl?.focus();
        setMessage('Внесете го вашето име.', true);
        return;
      }

      if (!attendance) {
        attendanceEl?.setAttribute('aria-invalid', 'true');
        attendanceEl?.focus();
        setMessage('Ве молиме изберете дали доаѓате.', true);
        return;
      }

      const payload = { ime, prezime, attendance, guests: attendance === 'no' ? '0' : guests, message };

      if (submit) submit.disabled = true;
      setMessage('Се испраќа...');

      if (!API_BASE) {
        console.info('[RSVP] DEMO — не е испратено:', payload);
        finish();
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/rsvp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
        finish();
      } catch (error) {
        const offline = String(error.message || '').includes('Failed to fetch');
        setMessage(offline ? 'Нема врска со серверот. Обидете се повторно.'
          : error.message || 'Грешка при испраќање. Обидете се повторно.', true);
        if (submit) submit.disabled = false;
      }

      function finish() {
        setMessage(attendance === 'yes'
          ? `Ви благодариме, ${ime}. Ве очекуваме на 15 мај! 💌`
          : `Ви благодариме што нè известивте, ${ime}. Ќе ни недостасувате.`);
        confettiBurst();
        rsvpForm.reset();
        syncGuests();
        if (submit) {
          submit.textContent = 'Одговорот е испратен';
          submit.disabled = true;
        }
      }
    });

    attendanceEl?.addEventListener('change', () => {
      syncGuests();
      attendanceEl.removeAttribute('aria-invalid');
    });
    [imeEl, prezimeEl].forEach((el) => el?.addEventListener('input', () => el.removeAttribute('aria-invalid')));

    syncGuests();
  }

  /* ---------------------------------------------------------------- честитки */
  const wishForm = document.querySelector('[data-wish-form]');

  if (wishForm) {
    const list = document.querySelector('[data-wish-list]');
    const empty = document.querySelector('[data-wish-empty]');
    const nameEl = wishForm.querySelector('[name="name"]');
    const messageEl = wishForm.querySelector('[name="message"]');
    const statusEl = wishForm.querySelector('[data-wish-status]');
    const countEl = wishForm.querySelector('[data-wish-count]');
    const suggestEl = wishForm.querySelector('[data-wish-suggest]');
    const submit = wishForm.querySelector('[type="submit"]');

    const SUGGESTIONS = [
      'Ви посакувам љубов што расте со секој изминат ден. Среќен брак!',
      'Нека вашиот дом секогаш биде полн со смеа, топлина и разбирање.',
      'Честитки! Нека ова биде почеток на најубавата авантура во вашиот живот.',
      'Ви посакувам бескрајна среќа, здравје и многу заеднички соништа.',
      'Нека љубовта што ја чувствувате денес ве води низ сите години што доаѓаат.',
    ];

    let lastSuggestion = '';

    const setStatus = (text, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle('is-error', isError);
    };

    const render = (items) => {
      if (!list) return;
      list.querySelectorAll('.wish-card').forEach((el) => el.remove());

      if (!items.length) {
        if (empty) empty.hidden = false;
        return;
      }

      if (empty) empty.hidden = true;

      items.slice(0, 40).forEach((wish) => {
        const li = document.createElement('li');
        li.className = 'wish-card';
        const text = document.createElement('p');
        text.className = 'wish-text';
        text.textContent = wish.message;
        const meta = document.createElement('p');
        meta.className = 'wish-meta';
        meta.textContent = wish.name;
        li.append(text, meta);
        list.append(li);
      });
    };

    const updateCount = () => {
      if (countEl && messageEl) countEl.textContent = `${messageEl.value.length} / 300`;
    };

    const load = async () => {
      if (!API_BASE) {
        render([]);
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Демо режим: желбите ќе се појават кога ќе биде поврзан бекендот.';
        }
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/wishes'), { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        render(Array.isArray(data) ? data : []);
      } catch {
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Желбите не можат да се вчитаат во моментов.';
        }
      }
    };

    suggestEl?.addEventListener('click', () => {
      const pool = SUGGESTIONS.filter((s) => s !== lastSuggestion);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      lastSuggestion = pick;
      if (messageEl) {
        messageEl.value = pick;
        updateCount();
        messageEl.focus();
      }
    });

    messageEl?.addEventListener('input', updateCount);

    wishForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const name = (nameEl?.value || '').trim();
      const message = (messageEl?.value || '').trim();

      if (!name) {
        nameEl?.setAttribute('aria-invalid', 'true');
        nameEl?.focus();
        setStatus('Внесете го вашето име.', true);
        return;
      }

      if (!message) {
        messageEl?.setAttribute('aria-invalid', 'true');
        messageEl?.focus();
        setStatus('Напишете желба.', true);
        return;
      }

      if (submit) submit.disabled = true;
      setStatus('Се испраќа...');

      if (!API_BASE) {
        render([{ name, message }]);
        setStatus('Демо режим: желбата не е зачувана на сервер.');
        wishForm.reset();
        updateCount();
        if (submit) submit.disabled = false;
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/wishes'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, message }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);

        wishForm.reset();
        updateCount();
        setStatus('Ви благодариме за убавите желби ♡');
        confettiBurst(36);
        await load();
      } catch (error) {
        setStatus(error.message || 'Грешка при испраќање. Обидете се повторно.', true);
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    load();
    updateCount();
  }

  /* ---------------------------------------------------------------- музика */
  const musicToggle = document.querySelector('[data-music-toggle]');
  const musicLoop = document.querySelector('[data-music-loop]');

  if (musicToggle && musicLoop) {
    musicToggle.addEventListener('click', async () => {
      if (musicToggle.getAttribute('aria-pressed') === 'true') {
        musicLoop.pause();
        musicToggle.setAttribute('aria-pressed', 'false');
        musicToggle.textContent = '♪';
        musicToggle.setAttribute('aria-label', 'Пушти музика во позадина');
        return;
      }

      try {
        musicLoop.volume = 0.3;
        await musicLoop.play();
        musicToggle.setAttribute('aria-pressed', 'true');
        musicToggle.textContent = '❙❙';
        musicToggle.setAttribute('aria-label', 'Паузирај музика');
      } catch (error) {
        console.info('Музиката не може да се пушти:', error);
      }
    });
  }
})();
