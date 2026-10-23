const body = document.body;
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGsap = typeof window.gsap !== 'undefined';

const previousPage = body.dataset.previous;
const nextPage = body.dataset.next;
const previousNavigationLocked = body.hasAttribute('data-lock-previous');

let navigationLocked = false;
let touchStartY = 0;
let touchStartX = 0;

/* The invitation in reading order. The jump rail and the
  page counter are both built from this, so adding a
   page means editing one array. */
const PAGES = [
  { file: 'index.html', label: 'Поканети сте' },
  { file: 'countdown.html', label: 'Одбројување' },
  { file: 'story.html', label: 'Нашата приказна' },
  { file: 'ceremony.html', label: 'Детали' },
  { file: 'program.html', label: 'Програма' },
  { file: 'details.html', label: 'Дрескод и подароци' },
  { file: 'gallery.html', label: 'Галерија' },
  { file: 'wishes.html', label: 'Честитки' },
  { file: 'rsvp.html', label: 'Потврда на присуство' },
  { file: 'thank-you.html', label: 'Ви благодариме' },
];

/* ======================================================
   HELPERS
====================================================== */

function isFormElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement
  );
}

function isEnvelopePage() {
  return (
    Boolean(document.querySelector('[data-envelope]')) &&
    !body.classList.contains('home-revealed')
  );
}

function pageCanScroll() {
  return document.documentElement.scrollHeight > window.innerHeight + 4;
}

function isAtVerticalScrollBoundary(direction) {
  const scrollTop = window.scrollY || window.pageYOffset || 0;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  if (direction === 'next') {
    return scrollTop <= 4;
  }

  if (direction === 'previous') {
    return scrollTop >= maxScroll - 4;
  }

  return false;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/* ======================================================
   PAGE NAVIGATION
====================================================== */

function navigateTo(url, direction = 'next') {
  if (!url || navigationLocked) {
    return;
  }

  navigationLocked = true;
  body.dataset.navigationDirection = direction;

  if (hasGsap && !motionReduced) {
    let navigated = false;

    const go = () => {
      if (navigated) {
        return;
      }

      navigated = true;
      window.location.href = url;
    };

    window.gsap.to(body, {
      autoAlpha: 0,
      y: direction === 'previous' ? 24 : -24,
      duration: 0.72,
      ease: 'power3.inOut',
      onComplete: go,
    });

    /* Безбедносна мрежа: ако tween-от не заврши (скриен таб,
       throttled rAF), навигацијата сепак се случува. */
    window.setTimeout(go, 1400);

    return;
  }

  body.classList.add('page-leaving');

  window.setTimeout(() => {
    window.location.href = url;
  }, 400);
}

/* The prev/next controls are real links so the invitation
   still works without JavaScript; here we only take them
   over to play the transition first. */
document.querySelectorAll('[data-go-next]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (!nextPage) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateTo(nextPage, 'next');
  });
});

document.querySelectorAll('[data-go-previous]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (previousNavigationLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!previousPage) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateTo(previousPage, 'previous');
  });
});

/* ======================================================
   PROGRESS RAIL
====================================================== */

const progress = document.querySelector('[data-page-progress]');

if (progress) {
  const currentIndex = Number(progress.dataset.pageProgress) - 1;

  const counter = document.createElement('p');
  counter.className = 'page-count';
  counter.innerHTML = `<b>${pad(currentIndex + 1)}</b> <span>/ ${pad(PAGES.length)}</span>`;
  progress.append(counter);

  /* Hidden below 760px / on touch — see .page-dots. */
  const rail = document.createElement('ol');
  rail.className = 'page-dots';

  PAGES.forEach((page, index) => {
    const item = document.createElement('li');
    const link = document.createElement('a');

    link.className = 'page-dot';
    link.href = page.file;
    link.textContent = '';
    link.setAttribute('aria-label', `${index + 1}. ${page.label}`);

    if (index === currentIndex) {
      link.setAttribute('aria-current', 'page');
    }

    link.addEventListener('click', (event) => {
      if (index === currentIndex) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      navigateTo(page.file, index < currentIndex ? 'previous' : 'next');
    });

    item.append(link);
    rail.append(item);
  });

  progress.prepend(rail);
}

/* ======================================================
   WAX-SEAL ENVELOPE OPENING
====================================================== */

const envelope = document.querySelector('[data-envelope]');

if (envelope) {
  const envelopeTrigger = document.querySelector('[data-envelope-trigger]');
  const viewInvitationButton = document.querySelector('[data-view-invitation]');
  const invitationHome = document.querySelector('[data-invitation-home]');
  const envelopeCover = document.querySelector('[data-envelope-cover]');
  const envelopeShell = envelope.querySelector('[data-wax-envelope]');
  const envelopeFlap = envelope.querySelector('[data-wax-envelope-flap]');
  const envelopeBottomFold = envelope.querySelector('.wax-envelope-fold--bottom');
  const scrollInterior = envelope.querySelector('[data-scroll-interior]');
  const seal = envelope.querySelector('.wax-envelope-seal');
  const parchmentContent = scrollInterior?.querySelectorAll(
    '.ornament, .wax-scroll-kicker, .wax-scroll-header, .wax-scroll-divider, .wax-scroll-message, .button'
  ) || [];
  const homeContent = invitationHome?.querySelectorAll('.reveal') || [];

  let hasOpened = false;

  function makeScrollAccessible() {
    scrollInterior?.setAttribute('aria-hidden', 'false');
    scrollInterior?.removeAttribute('inert');
    body.classList.add('scroll-opened');
  }

  function finishInvitationReveal() {
    body.classList.add('home-revealed');
    invitationHome?.classList.add('is-visible');
    invitationHome?.setAttribute('aria-hidden', 'false');
    invitationHome?.removeAttribute('inert');

    if (envelopeCover) {
      envelopeCover.setAttribute('aria-hidden', 'true');
      envelopeCover.hidden = true;
    }

    invitationHome?.querySelector('[data-go-next]')?.focus({ preventScroll: true });
  }

  if (hasGsap && !motionReduced) {
    body.classList.add('gsap-ready');

    window.gsap.set(invitationHome, {
      display: 'none',
      autoAlpha: 0,
      y: 36,
      scale: 0.98,
    });
    window.gsap.set(homeContent, { autoAlpha: 0, y: 22 });
    window.gsap.set(scrollInterior, { autoAlpha: 0, visibility: 'hidden' });
    window.gsap.set(parchmentContent, { autoAlpha: 0, y: 18 });
    window.gsap.set(envelopeFlap, {
      rotationX: 0,
      transformOrigin: '50% 0%',
    });
    window.gsap.set(envelopeBottomFold, {
      rotationX: 0,
      transformOrigin: '50% 100%',
    });
    window.gsap.from(envelopeShell, {
      autoAlpha: 0,
      y: 28,
      scale: 0.9,
      duration: 1,
      ease: 'power3.out',
    });
  }

  function openScrollFallback() {
    scrollInterior.style.visibility = 'visible';
    scrollInterior.style.opacity = '1';
    scrollInterior.style.top = '18px';
    makeScrollAccessible();
    viewInvitationButton?.focus({ preventScroll: true });
  }

  let scrollTimeline = null;

  function openScrollWithGsap() {
    const inset = window.innerWidth <= 600 ? 18 : 50;
    const openHeight = Math.max(320, window.innerHeight - (inset * 2));

    scrollTimeline = window.gsap.timeline({
      onComplete: () => {
        makeScrollAccessible();
        viewInvitationButton?.focus({ preventScroll: true });
      },
    })
      .to(seal, {
        scale: 1.1,
        rotation: 15,
        autoAlpha: 0,
        duration: 0.5,
        ease: 'power2.in',
      }, 0)
      .to(envelopeFlap, {
        rotationX: 180,
        duration: 0.85,
        ease: 'power2.inOut',
      }, 0.25)
      .to(envelopeBottomFold, {
        rotationX: -180,
        duration: 0.75,
        ease: 'power2.inOut',
      }, 0.42)
      .set(envelopeFlap, { zIndex: 1 }, 1.11)
      .set(envelopeBottomFold, { zIndex: 9 }, 1.17)
      .set(scrollInterior, {
        visibility: 'visible',
        top: inset,
        height: openHeight,
        scale: 0.94,
        y: 30,
      }, 1.12)
      .to(scrollInterior, {
        scale: 1,
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power3.out',
      }, 1.12)
      .to(envelopeShell, {
        y: 90,
        scale: 0.94,
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.inOut',
      }, 1.28)
      .to(parchmentContent, {
        autoAlpha: 1,
        y: 0,
        duration: 0.65,
        stagger: 0.055,
        ease: 'power3.out',
      }, 1.45)
      .set(envelopeShell, { display: 'none' }, 2);
  }

  /* Ако GSAP не напредува (скриен таб, throttled rAF, прекинета
     анимација), поканата не смее да остане заклучена: по 3.2 s
     форсирај ја отворената состојба. */
  function forceScrollOpen() {
    if (body.classList.contains('scroll-opened')) {
      return;
    }

    if (scrollTimeline) {
      scrollTimeline.kill();
    }

    /* .wax-scroll е трансформиран предок, а position: fixed внатре во
       трансформиран елемент се врзува за него — затоа интерјериот се
       преместува директно во <body> пред да се фиксира за екранот. */
    if (scrollInterior && scrollInterior.parentElement !== document.body) {
      document.body.appendChild(scrollInterior);
    }

    body.classList.add('forced-open');
    body.classList.add('scroll-opened');

    if (scrollInterior) {
      scrollInterior.removeAttribute('inert');
      scrollInterior.setAttribute('aria-hidden', 'false');
    }

    makeScrollAccessible();

    if (envelopeCover) {
      envelopeCover.hidden = true;
    }

    viewInvitationButton?.focus({ preventScroll: true });
  }

  function revealInvitation() {
    if (!invitationHome || !envelopeCover) {
      navigateTo(nextPage, 'next');
      return;
    }

    if (!hasGsap || motionReduced) {
      finishInvitationReveal();
      return;
    }

    viewInvitationButton.disabled = true;
    window.gsap.set(invitationHome, { display: 'flex', visibility: 'visible' });

    window.gsap.timeline({ onComplete: finishInvitationReveal })
      .to(envelopeCover, {
        autoAlpha: 0,
        scale: 1.03,
        duration: 0.75,
        ease: 'power2.inOut',
      }, 0)
      .to(invitationHome, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.85,
        ease: 'power3.out',
      }, 0.18)
      .to(homeContent, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.06,
        ease: 'power3.out',
      }, 0.32);
  }

  function openScroll() {
    if (hasOpened) {
      return;
    }

    hasOpened = true;
    body.classList.add('scroll-opening');
    envelopeTrigger.setAttribute('aria-expanded', 'true');
    envelopeTrigger.disabled = true;

    if (hasGsap && !motionReduced) {
      openScrollWithGsap();
      window.setTimeout(forceScrollOpen, 3200);
      return;
    }

    openScrollFallback();
  }

  envelopeTrigger?.addEventListener('click', openScroll);
  viewInvitationButton?.addEventListener('click', revealInvitation);
}

if (!envelope && hasGsap && !motionReduced) {
  body.classList.add('gsap-ready');

  const reveals = window.gsap.utils.toArray('.reveal');

  window.gsap.fromTo(reveals, {
    autoAlpha: 0,
    y: 8,
    filter: 'blur(6px)',
  }, {
    autoAlpha: 1,
    y: 0,
    filter: 'blur(0px)',
    duration: 0.55,
    stagger: 0.055,
    ease: 'power2.out',
    clearProps: 'transform,filter',
  });
}

const galleryLightbox = document.querySelector('[data-gallery-lightbox]');
const galleryLightboxImage = document.querySelector('[data-gallery-lightbox-image]');
const galleryLightboxCaption = document.querySelector('[data-gallery-lightbox-caption]');
const galleryClose = document.querySelector('[data-gallery-close]');

function closeGalleryLightbox() {
  if (galleryLightbox?.open) {
    galleryLightbox.close();
  }
}

document.querySelectorAll('[data-gallery-photo]').forEach((photo) => {
  photo.addEventListener('click', () => {
    if (!galleryLightbox || !galleryLightboxImage) {
      return;
    }

    const image = photo.querySelector('img');
    galleryLightboxImage.src = photo.dataset.gallerySrc || image?.src || galleryLightboxImage.src;
    galleryLightboxImage.alt = image?.alt || '';

    if (galleryLightboxCaption) {
      galleryLightboxCaption.textContent = image?.alt || 'Теодора & Никола';
    }

    galleryLightbox.showModal();
  });
});

galleryClose?.addEventListener('click', closeGalleryLightbox);
galleryLightbox?.addEventListener('click', (event) => {
  if (event.target === galleryLightbox) {
    closeGalleryLightbox();
  }
});

/* ======================================================
   MOUSE WHEEL NAVIGATION
====================================================== */

let wheelTimeout = null;

window.addEventListener(
  'wheel',
  (event) => {
    if (isEnvelopePage() || navigationLocked) {
      return;
    }

    const isRsvpPage = Boolean(document.querySelector('[data-rsvp-form]'));

    if (isRsvpPage && previousNavigationLocked) {
      return;
    }

    if (Math.abs(event.deltaY) < 30) {
      return;
    }

    if (pageCanScroll() && !isAtVerticalScrollBoundary(event.deltaY > 0 ? 'next' : 'previous')) {
      return;
    }

    const direction = event.deltaY > 0 ? 'next' : 'previous';

    clearTimeout(wheelTimeout);

    wheelTimeout = window.setTimeout(() => {
      navigateTo(direction === 'next' ? nextPage : previousPage, direction);
    }, 80);
  },
  { passive: true }
);

/* ======================================================
   MOBILE SWIPE NAVIGATION
====================================================== */

window.addEventListener(
  'touchstart',
  (event) => {
    if (!event.touches.length) {
      return;
    }

    touchStartY = event.touches[0].clientY;
    touchStartX = event.touches[0].clientX;
  },
  { passive: true }
);

window.addEventListener(
  'touchend',
  (event) => {
    if (isEnvelopePage()) {
      return;
    }

    if (!event.changedTouches.length || navigationLocked) {
      return;
    }

    const hasInteractiveButtonPage = document.querySelector('.wax-scroll-interior [data-view-invitation]') || document.querySelector('.invitation-home [data-go-next]');
    if (hasInteractiveButtonPage) {
      return;
    }

    const isRsvpPage = Boolean(document.querySelector('[data-rsvp-form]'));
    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - touchStartY;
    const deltaX = touch.clientX - touchStartX;
    const swipeThreshold = 32;

    if (Math.abs(deltaY) < swipeThreshold || Math.abs(deltaY) < Math.abs(deltaX)) {
      return;
    }

    if (isRsvpPage && previousNavigationLocked) {
      return;
    }

    if (pageCanScroll()) {
      const atTop = window.scrollY <= 8;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;

      if (deltaY < 0 && !atBottom) {
        return;
      }

      if (deltaY > 0 && !atTop) {
        return;
      }
    }

    if (deltaY < 0) {
      navigateTo(nextPage, 'next');
      return;
    }

    navigateTo(previousPage, 'previous');
  },
  { passive: true }
);

/* ======================================================
   KEYBOARD NAVIGATION
====================================================== */

window.addEventListener('keydown', (event) => {
  if (isEnvelopePage() || navigationLocked) {
    return;
  }

  if (isFormElement(document.activeElement)) {
    return;
  }

  const nextKeys = ['ArrowDown', 'ArrowRight', 'PageDown'];
  const previousKeys = ['ArrowUp', 'ArrowLeft', 'PageUp'];

  if (nextKeys.includes(event.key)) {
    event.preventDefault();
    navigateTo(nextPage, 'next');
    return;
  }

  if (previousKeys.includes(event.key)) {
    if (previousNavigationLocked) {
      return;
    }

    event.preventDefault();
    navigateTo(previousPage, 'previous');
  }
});

/* ======================================================
   COUNTDOWN
====================================================== */

const countdown = document.querySelector('[data-countdown]');

if (countdown) {
  const weddingDate = new Date(countdown.dataset.weddingDate);

  const daysElement = countdown.querySelector('[data-days]');
  const hoursElement = countdown.querySelector('[data-hours]');
  const minutesElement = countdown.querySelector('[data-minutes]');
  const secondsElement = countdown.querySelector('[data-seconds]');

  /* The four numerals tick every second, so they stay out of
     the accessibility tree; screen readers get one sentence
     that is only rewritten when the day count changes. */
  const summary = document.querySelector('[data-countdown-summary]');
  let announcedDays = null;

  function daysWord(count) {
    return count === 1 ? 'ден' : 'дена';
  }

  function updateCountdown() {
    const difference = Math.max(0, weddingDate.getTime() - Date.now());

    const second = 1000;
    const minute = second * 60;
    const hour = minute * 60;
    const day = hour * 24;

    const days = Math.floor(difference / day);
    const hours = Math.floor((difference % day) / hour);
    const minutes = Math.floor((difference % hour) / minute);
    const seconds = Math.floor((difference % minute) / second);

    if (daysElement) daysElement.textContent = pad(days);
    if (hoursElement) hoursElement.textContent = pad(hours);
    if (minutesElement) minutesElement.textContent = pad(minutes);
    if (secondsElement) secondsElement.textContent = pad(seconds);

    if (summary && days !== announcedDays) {
      announcedDays = days;

      summary.textContent = difference === 0
        ? 'Денот е тука.'
        : `Остануваат уште ${days} ${daysWord(days)} до 15 мај 2027.`;
    }
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

/* ======================================================
   RSVP FORM
====================================================== */

/* ======================================================
   API — RSVP и честитки
   Контракт (ист како платформите во пазарот):
     POST /api/rsvp    { ime, prezime, attendance, guests, message }
     GET  /api/wishes  → [{ name, message, createdAt }]
     POST /api/wishes  { name, message }
====================================================== */

const API_BASE = String(window.WEDDING_API || '').replace(/\/+$/, '');
const apiUrl = (path) => (API_BASE ? API_BASE + path : '');

/* ---------- конфети ---------- */
function confettiBurst(count = 90) {
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

  const colors = ['#b08d57', '#d9c29a', '#512732', '#c98a92', '#f3ede1'];
  const parts = Array.from({ length: count }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 9 - 3,
    size: 4 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1,
  }));

  let frame = 0;
  const started = performance.now();

  function tick(now) {
    const elapsed = now - started;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const p of parts) {
      p.vy += 0.22;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      p.life = Math.max(0, 1 - elapsed / 2400);

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    frame += 1;
    if (elapsed < 2400) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(tick);
}

/* ---------- RSVP ---------- */
const rsvpForm = document.querySelector('[data-rsvp-form]');

if (rsvpForm) {
  const messageElement = rsvpForm.querySelector('[data-form-message]');
  const imeElement = rsvpForm.querySelector('[name="ime"]');
  const prezimeElement = rsvpForm.querySelector('[name="prezime"]');
  const attendanceElement = rsvpForm.querySelector('[name="attendance"]');
  const guestsElement = rsvpForm.querySelector('[name="guests"]');
  const noteElement = rsvpForm.querySelector('[name="message"]');
  const guestsGroup = rsvpForm.querySelector('[data-guests-group]');
  const submitButton = rsvpForm.querySelector('[type="submit"]');

  function setMessage(text, isError = false) {
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.classList.toggle('is-error', Boolean(isError));
  }

  function syncGuestsVisibility() {
    if (!guestsGroup || !attendanceElement) return;
    guestsGroup.hidden = attendanceElement.value === 'no';
  }

  function markInvalid(element) {
    element?.setAttribute('aria-invalid', 'true');
    element?.focus();
  }

  function finishSuccess() {
    setMessage('Ви благодариме! Вашата потврда е испратена 💌');
    confettiBurst();

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Одговорот е испратен';
    }

    rsvpForm.reset();
    window.setTimeout(() => navigateTo('thank-you.html', 'next'), 1800);
  }

  rsvpForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const ime = (imeElement?.value || '').trim();
    const prezime = (prezimeElement?.value || '').trim();
    const attendance = attendanceElement?.value || '';
    const guests = guestsElement?.value || '1';
    const message = (noteElement?.value || '').trim();

    if (!ime) {
      markInvalid(imeElement);
      setMessage('Внесете го Вашето име.', true);
      return;
    }

    if (!attendance) {
      markInvalid(attendanceElement);
      setMessage('Ве молиме изберете дали доаѓате.', true);
      return;
    }

    if (submitButton) submitButton.disabled = true;
    setMessage('Се испраќа...');

    const payload = {
      ime,
      prezime,
      attendance,
      guests: attendance === 'no' ? '0' : guests,
      message,
    };

    if (!API_BASE) {
      /* Демо режим — без бекенд. */
      console.info('[RSVP] DEMO — одговорот не е испратен:', payload);
      finishSuccess();
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/rsvp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      finishSuccess();
    } catch (error) {
      const offline = String(error.message || '').includes('Failed to fetch');
      setMessage(
        offline
          ? 'Нема врска со серверот. Обидете се повторно.'
          : error.message || 'Грешка при испраќање. Обидете се повторно.',
        true,
      );
      if (submitButton) submitButton.disabled = false;
    }
  });

  attendanceElement?.addEventListener('change', () => {
    syncGuestsVisibility();
    attendanceElement.removeAttribute('aria-invalid');
  });

  [imeElement, prezimeElement].forEach((el) =>
    el?.addEventListener('input', () => el.removeAttribute('aria-invalid')),
  );

  syncGuestsVisibility();
}

/* ======================================================
   ЧЕСТИТКИ (wish wall)
====================================================== */

const wishForm = document.querySelector('[data-wish-form]');

if (wishForm) {
  const list = document.querySelector('[data-wish-list]');
  const empty = document.querySelector('[data-wish-empty]');
  const nameElement = wishForm.querySelector('[name="name"]');
  const messageElement = wishForm.querySelector('[name="message"]');
  const statusElement = wishForm.querySelector('[data-wish-message-status]');
  const countElement = wishForm.querySelector('[data-wish-count]');
  const suggestButton = wishForm.querySelector('[data-wish-suggest]');
  const submitButton = wishForm.querySelector('[type="submit"]');

  const SUGGESTIONS = [
    'Ви посакувам љубов што расте со секој изминат ден. Среќен брак!',
    'Нека вашиот дом секогаш биде полн со смеа, топлина и разбирање.',
    'Честитки! Нека ова биде почеток на најубавата авантура во вашиот живот.',
    'Ви посакувам бескрајна среќа, здравје и многу заеднички соништа.',
    'Нека љубовта што ја чувствувате денес ве води низ сите години што доаѓаат.',
  ];

  let lastSuggestion = '';

  function setStatus(text, isError = false) {
    if (!statusElement) return;
    statusElement.textContent = text;
    statusElement.classList.toggle('is-error', Boolean(isError));
  }

  function render(items) {
    if (!list) return;

    list.querySelectorAll('.wish-card').forEach((el) => el.remove());

    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    items.slice(0, 40).forEach((wish) => {
      const item = document.createElement('li');
      item.className = 'wish-card';

      const text = document.createElement('p');
      text.className = 'wish-text';
      text.textContent = wish.message;

      const meta = document.createElement('p');
      meta.className = 'wish-meta';
      meta.textContent = wish.name;

      item.append(text, meta);
      list.append(item);
    });
  }

  function updateCount() {
    if (!countElement || !messageElement) return;
    countElement.textContent = `${messageElement.value.length} / 300`;
  }

  async function loadWishes() {
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
    } catch (error) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Желбите не можат да се вчитаат во моментов.';
      }
    }
  }

  suggestButton?.addEventListener('click', () => {
    const pool = SUGGESTIONS.filter((s) => s !== lastSuggestion);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastSuggestion = pick;
    if (messageElement) {
      messageElement.value = pick;
      updateCount();
      messageElement.focus();
    }
  });

  messageElement?.addEventListener('input', updateCount);

  wishForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = (nameElement?.value || '').trim();
    const message = (messageElement?.value || '').trim();

    if (!name) {
      nameElement?.setAttribute('aria-invalid', 'true');
      nameElement?.focus();
      setStatus('Внесете го Вашето име.', true);
      return;
    }

    if (!message) {
      messageElement?.setAttribute('aria-invalid', 'true');
      messageElement?.focus();
      setStatus('Напишете желба.', true);
      return;
    }

    if (submitButton) submitButton.disabled = true;
    setStatus('Се испраќа...');

    if (!API_BASE) {
      const demo = { id: 'demo', name, message, createdAt: new Date().toISOString() };
      console.info('[WISHES] DEMO — не е испратено:', demo);
      const existing = [...(list?.querySelectorAll('.wish-card') || [])].length;
      render([demo]);
      setStatus('Демо режим: желбата не е зачувана на сервер.');
      wishForm.reset();
      updateCount();
      if (submitButton) submitButton.disabled = false;
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/wishes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      wishForm.reset();
      updateCount();
      setStatus('Ви благодариме за убавите желби ♡');
      confettiBurst(36);
      await loadWishes();
    } catch (error) {
      setStatus(error.message || 'Грешка при испраќање. Обидете се повторно.', true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  loadWishes();
  updateCount();
}

/* ======================================================
   СКРОЛ ЗНАК — само кога страницата е повисока од екранот
====================================================== */

(() => {
  if (!document.querySelector('.page')) return;

  let hint = null;

  function update() {
    const needsHint = document.documentElement.scrollHeight > window.innerHeight + 48;

    if (needsHint && !hint) {
      hint = document.createElement('p');
      hint.className = 'scroll-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Скролувај надолу';
      document.body.appendChild(hint);
    }

    if (!needsHint && hint) {
      hint.remove();
      hint = null;
      return;
    }

    if (hint) {
      hint.classList.toggle('is-hidden', window.scrollY > 40);
    }
  }

  window.addEventListener('load', update);
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('scroll', update, { passive: true });
  update();
})();



/* ======================================================
   BACKGROUND MUSIC
====================================================== */

const musicToggle = document.querySelector('[data-music-toggle]');
const musicLoop = document.querySelector('[data-music-loop]');

if (musicToggle && musicLoop) {
  musicToggle.addEventListener('click', async () => {
    const playing = musicToggle.getAttribute('aria-pressed') === 'true';

    if (playing) {
      musicLoop.pause();
      musicToggle.setAttribute('aria-pressed', 'false');
      musicToggle.setAttribute('aria-label', 'Пушти музика во позадина');
      musicToggle.textContent = '♪';
      return;
    }

    try {
      musicLoop.volume = 0.3;
      await musicLoop.play();
      musicToggle.setAttribute('aria-pressed', 'true');
      musicToggle.setAttribute('aria-label', 'Паузирај музика');
      musicToggle.textContent = '❙❙';
    } catch (error) {
      console.info('Музиката не може да се пушти:', error);
    }
  });
}
